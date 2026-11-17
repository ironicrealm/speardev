const test = require("node:test");
const assert = require("node:assert/strict");

const database = require("../src/core/database");
const { Links } = require("../src/services/links");
const { Waves } = require("../src/services/waves");
const { Applications } = require("../src/services/applications");
const { GroupSync } = require("../src/services/groupSync");
const { fakeRoblox } = require("./fakeRoblox");

function setup() {
	const db = database.open(":memory:");
	const roblox = fakeRoblox();
	const applications = new Applications(db);
	const joined = [];
	return {
		db,
		roblox,
		applications,
		joined,
		links: new Links(db, roblox),
		waves: new Waves(db),
		sync: new GroupSync(applications, roblox, { wavedRank: 1, onJoined: async (app) => joined.push(app.id), log: { warn() {} } }),
	};
}

test("verification needs the code in the Roblox About", async () => {
	const { roblox, links } = setup();
	roblox.addUser(100, "Shin", "hello");

	assert.equal((await links.start("d1", "nobody")).ok, false);
	const started = await links.start("d1", "shin");
	assert.equal(started.ok, true);

	const early = await links.check("d1");
	assert.equal(early.ok, false);

	roblox.state.users.get(100).description = `I fight. ${started.code.toUpperCase()}`;
	const done = await links.check("d1");
	assert.equal(done.ok, true);
	assert.equal(links.get("d1").roblox_id, 100);
});

test("one Roblox account can't be linked to two Discord accounts", async () => {
	const { roblox, links } = setup();
	roblox.addUser(100, "Shin");
	const first = await links.start("d1", "Shin");
	roblox.state.users.get(100).description = first.code;
	await links.check("d1");

	const second = await links.start("d2", "Shin");
	assert.equal(second.ok, false);
});

test("expired codes are refused", async () => {
	const { db, roblox, links } = setup();
	roblox.addUser(100, "Shin");
	const started = await links.start("d1", "Shin");
	roblox.state.users.get(100).description = started.code;
	db.prepare("UPDATE verifications SET created_at = created_at - 99999").run();
	assert.equal((await links.check("d1")).ok, false);
});

test("only one wave open at a time", () => {
	const { waves } = setup();
	assert.equal(waves.open("Wave 1").ok, true);
	assert.equal(waves.open("Wave 2").ok, false);
	assert.equal(waves.close().ok, true);
	assert.equal(waves.close().ok, false);
	assert.equal(waves.open("Wave 2").ok, true);
	assert.equal(waves.current().name, "Wave 2");
});

test("apply rules: one per wave, none while pending, none once accepted", () => {
	const { waves, applications } = setup();
	const wave1 = waves.open("Wave 1").wave;
	assert.equal(applications.canApply("d1", 100, wave1.id).ok, true);

	const app = applications.create({ waveId: wave1.id, discordId: "d1", robloxId: 100, robloxName: "Shin", answers: { why: "x" } });
	assert.equal(applications.canApply("d1", 100, wave1.id).ok, false);

	applications.decide(app.id, "denied", "staff", "too short");
	assert.equal(applications.canApply("d1", 100, wave1.id).ok, false, "denied this wave, must wait");

	waves.close();
	const wave2 = waves.open("Wave 2").wave;
	assert.equal(applications.canApply("d1", 100, wave2.id).ok, true, "can try again next wave");

	const again = applications.create({ waveId: wave2.id, discordId: "d1", robloxId: 100, robloxName: "Shin", answers: {} });
	applications.decide(again.id, "accepted", "staff");
	waves.close();
	const wave3 = waves.open("Wave 3").wave;
	assert.equal(applications.canApply("d1", 100, wave3.id).ok, false, "already accepted");
});

test("two staff clicking at once: only the first decision counts", () => {
	const { waves, applications } = setup();
	const wave = waves.open("Wave 1").wave;
	const app = applications.create({ waveId: wave.id, discordId: "d1", robloxId: 100, robloxName: "Shin", answers: {} });
	assert.ok(applications.decide(app.id, "accepted", "staffA"));
	assert.equal(applications.decide(app.id, "denied", "staffB"), null);
	assert.equal(applications.get(app.id).status, "accepted");
	assert.equal(applications.get(app.id).group_status, "waiting");
});

test("accepted player is let in once they send a join request", async () => {
	const { waves, applications, roblox, sync, joined } = setup();
	const wave = waves.open("Wave 1").wave;
	const app = applications.decide(
		applications.create({ waveId: wave.id, discordId: "d1", robloxId: 100, robloxName: "Shin", answers: {} }).id,
		"accepted",
		"staff"
	);

	await sync.runOnce();
	assert.equal(applications.get(app.id).group_status, "waiting", "no join request yet");

	roblox.state.requests.set(100, "groups/1/join-requests/555");
	await sync.runOnce();
	assert.equal(applications.get(app.id).group_status, "joined");
	assert.deepEqual(roblox.state.calls[0], ["accept", "groups/1/join-requests/555"]);
	assert.deepEqual(joined, [app.id]);

	await sync.runOnce();
	assert.deepEqual(joined, [app.id], "not processed twice");
});

test("rank goes up to Waved but never down", async () => {
	const { waves, applications, roblox, sync } = setup();
	const wave = waves.open("Wave 1").wave;
	const make = (discordId, robloxId) =>
		applications.decide(
			applications.create({ waveId: wave.id, discordId, robloxId, robloxName: "x", answers: {} }).id,
			"accepted",
			"staff"
		);

	roblox.state.members.set(200, { path: "groups/1/memberships/m200", role: "groups/1/roles/10" });
	roblox.state.members.set(300, { path: "groups/1/memberships/m300", role: "groups/1/roles/12" });
	make("d2", 200);
	make("d3", 300);
	await sync.runOnce();

	assert.equal(roblox.state.members.get(200).role, "groups/1/roles/11", "guest moved up to Waved");
	assert.equal(roblox.state.members.get(300).role, "groups/1/roles/12", "moderator left alone");
});

test("a Roblox error on one player doesn't stop the others", async () => {
	const { waves, applications, roblox, sync } = setup();
	const wave = waves.open("Wave 1").wave;
	const a = applications.decide(applications.create({ waveId: wave.id, discordId: "d1", robloxId: 1, robloxName: "a", answers: {} }).id, "accepted", "s");
	const b = applications.decide(applications.create({ waveId: wave.id, discordId: "d2", robloxId: 2, robloxName: "b", answers: {} }).id, "accepted", "s");
	const original = roblox.getMembership;
	roblox.getMembership = async (id) => {
		if (id === 1) throw new Error("boom");
		return original(id);
	};
	roblox.state.requests.set(2, "groups/1/join-requests/2");
	await sync.runOnce();
	assert.equal(applications.get(a.id).group_status, "waiting");
	assert.equal(applications.get(b.id).group_status, "joined");
});
