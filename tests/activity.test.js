const test = require("node:test");
const assert = require("node:assert/strict");

const database = require("../src/core/database");
const { Loas } = require("../src/services/loas");
const { Activity } = require("../src/services/activity");
const { Applications } = require("../src/services/applications");
const { Waves } = require("../src/services/waves");
const { GroupSync } = require("../src/services/groupSync");
const { fakeRoblox } = require("./fakeRoblox");

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

// Makes an accepted, in-group member who was accepted `daysAgo` days ago
function member(db, discordId, robloxId, daysAgo) {
	const apps = new Applications(db);
	const waves = new Waves(db);
	const wave = waves.current() ?? waves.open("Wave 1").wave;
	db.prepare("INSERT INTO links (discord_id, roblox_id, roblox_name, linked_at) VALUES (?, ?, ?, ?)").run(discordId, robloxId, `R${robloxId}`, now());
	const app = apps.create({ waveId: wave.id, discordId, robloxId, robloxName: `R${robloxId}`, answers: {} });
	apps.decide(app.id, "accepted", "staff");
	apps.setGroupStatus(app.id, "joined");
	db.prepare("UPDATE applications SET decided_at = ? WHERE id = ?").run(now() - daysAgo * DAY, app.id);
	return app;
}

function lookups({ seen = {}, loa = {}, lastLoa = {}, staff = [] } = {}) {
	return {
		lastSeen: (id) => seen[id] ?? null,
		onLoa: (id) => Boolean(loa[id]),
		lastLoa: (id) => lastLoa[id] ?? null,
		skip: (id) => staff.includes(id),
	};
}

test("warn at 5 days, remove at 7, counting from the last time they played", () => {
	const db = database.open(":memory:");
	const activity = new Activity(db, { warnDays: 5, removeDays: 7 });
	member(db, "fresh", 1, 2);
	member(db, "warnme", 2, 6);
	member(db, "gone", 3, 30);
	member(db, "played", 4, 30);
	const { warn, remove } = activity.review(lookups({ seen: { 4: now() - 1 * DAY } }));
	assert.deepEqual(warn.map((e) => e.discord_id), ["warnme"]);
	assert.deepEqual(remove.map((e) => e.discord_id), ["gone"]);
});

test("a warning is sent once per absence, again after they play and go quiet", () => {
	const db = database.open(":memory:");
	const activity = new Activity(db, { warnDays: 5, removeDays: 7 });
	member(db, "a", 1, 6);
	let { warn } = activity.review(lookups());
	assert.equal(warn.length, 1);
	activity.markWarned(1, warn[0].baseline);
	assert.equal(activity.review(lookups()).warn.length, 0, "not warned twice");
	const played = now() - 6 * DAY + 3600;
	assert.equal(activity.review(lookups({ seen: { 1: played } })).warn.length, 1, "new absence, new warning");
});

test("people on leave, just back from leave, and staff are never touched", () => {
	const db = database.open(":memory:");
	const activity = new Activity(db, { warnDays: 5, removeDays: 7 });
	member(db, "onleave", 1, 30);
	member(db, "justback", 2, 30);
	member(db, "staff", 3, 30);
	const { warn, remove } = activity.review(
		lookups({ loa: { onleave: true }, lastLoa: { justback: now() - DAY }, staff: ["staff"] })
	);
	assert.equal(warn.length + remove.length, 0);
});

test("removed players drop out of the check and can apply again", () => {
	const db = database.open(":memory:");
	const activity = new Activity(db, { warnDays: 5, removeDays: 7 });
	const apps = new Applications(db);
	member(db, "gone", 1, 30);
	activity.markInactive("gone");
	assert.equal(activity.review(lookups()).remove.length, 0);
	const waves = new Waves(db);
	waves.close();
	const wave2 = waves.open("Wave 2").wave;
	assert.equal(apps.canApply("gone", 1, wave2.id).ok, true);
});

test("the 7-day rule is off until switched on", () => {
	const activity = new Activity(database.open(":memory:"), { warnDays: 5, removeDays: 7 });
	assert.equal(activity.isEnabled(), false);
	activity.setEnabled(true);
	assert.equal(activity.isEnabled(), true);
	activity.setEnabled(false);
	assert.equal(activity.isEnabled(), false);
});

test("leave of absence: approve starts it, one at a time, end early, deny", () => {
	const loas = new Loas(database.open(":memory:"));
	const req = loas.request({ discordId: "d1", days: 10, reason: "holiday" });
	assert.equal(loas.pendingFor("d1").id, req.id);
	assert.equal(loas.activeFor("d1"), null, "not active until approved");
	const approved = loas.approve(req.id, "staff");
	assert.equal(approved.ends_at - approved.starts_at, 10 * DAY);
	assert.equal(loas.approve(req.id, "staff2"), null, "already decided");
	assert.equal(loas.activeFor("d1").id, req.id);
	assert.equal(loas.allActive().length, 1);
	assert.ok(loas.end("d1"));
	assert.equal(loas.activeFor("d1"), null);
	assert.ok(loas.lastEnded("d1") > 0, "coming back counts as activity");
	const second = loas.request({ discordId: "d1", days: 3, reason: "x" });
	assert.equal(loas.deny(second.id, "staff", "busy period").deny_reason, "busy period");
	assert.equal(loas.activeFor("d1"), null);
});

test("roll calls: one response each, close once, confirm once", () => {
	const activity = new Activity(database.open(":memory:"), { warnDays: 5, removeDays: 7 });
	const check = activity.startCheck({ channelId: "c", createdBy: "s", hours: 24 });
	assert.equal(activity.openCheck().id, check.id);
	assert.equal(activity.respond(check.id, "a"), true);
	assert.equal(activity.respond(check.id, "a"), false);
	assert.deepEqual(activity.responses(check.id), ["a"]);
	assert.equal(activity.dueChecks().length, 0);
	const closed = activity.closeCheck(check.id, [{ discordId: "b" }]);
	assert.deepEqual(closed.missing, [{ discordId: "b" }]);
	assert.equal(activity.closeCheck(check.id, []), null);
	assert.ok(activity.finishCheck(check.id, "done"));
	assert.equal(activity.finishCheck(check.id, "cancelled"), null);
});

test("demote only moves Waved members, and re-accepting moves Inactive back to Waved", async () => {
	const roblox = fakeRoblox();
	roblox.state.roles = [
		{ path: "groups/1/roles/10", rank: 0, name: "Guest" },
		{ path: "groups/1/roles/11", rank: 1, name: "Waved" },
		{ path: "groups/1/roles/12", rank: 2, name: "Inactive" },
		{ path: "groups/1/roles/13", rank: 200, name: "Moderator" },
	];
	const db = database.open(":memory:");
	const sync = new GroupSync(new Applications(db), roblox, { wavedRank: 1, inactiveRank: 2, log: { warn() {} } });
	roblox.state.members.set(1, { path: "m1", role: "groups/1/roles/11" });
	roblox.state.members.set(2, { path: "m2", role: "groups/1/roles/13" });

	assert.equal(await sync.demote(1), "moved to Inactive");
	assert.equal(roblox.state.members.get(1).role, "groups/1/roles/12");
	assert.equal(await sync.demote(1), "already Inactive");
	assert.match(await sync.demote(2), /skipped/);
	assert.equal(roblox.state.members.get(2).role, "groups/1/roles/13", "moderator untouched");
	assert.equal(await sync.demote(3), "not in the group");

	await sync.ensureRank(roblox.state.members.get(1));
	assert.equal(roblox.state.members.get(1).role, "groups/1/roles/11", "back to Waved");
});
