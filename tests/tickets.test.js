const test = require("node:test");
const assert = require("node:assert/strict");

const database = require("../src/core/database");
const { Tickets } = require("../src/services/tickets");
const { Actions } = require("../src/services/actions");
const { Operations } = require("../src/services/operations");

test("one open ticket per type, claim once, finish once", () => {
	const tickets = new Tickets(database.open(":memory:"));
	const t = tickets.create({ type: "support", discordId: "d1", answers: { topic: "help" } });
	assert.equal(tickets.openFor("d1", "support").id, t.id);
	assert.equal(tickets.openFor("d1", "event"), null);

	assert.equal(tickets.claim(t.id, "staffA").claimed_by, "staffA");
	assert.equal(tickets.claim(t.id, "staffB"), null, "already claimed");
	assert.equal(tickets.openFor("d1", "support").status, "claimed");

	assert.equal(tickets.finish(t.id, "closed", "staffA", "solved").reason, "solved");
	assert.equal(tickets.finish(t.id, "closed", "staffB"), null, "already closed");
	assert.equal(tickets.openFor("d1", "support"), null);
});

test("only unclaimed, undecided tickets older than the limit are stale", () => {
	const db = database.open(":memory:");
	const tickets = new Tickets(db);
	const old = tickets.create({ type: "support", discordId: "d1", answers: {} });
	const claimed = tickets.create({ type: "event", discordId: "d2", answers: {} });
	tickets.create({ type: "appeal", discordId: "d3", answers: {} });
	tickets.claim(claimed.id, "s");
	db.prepare("UPDATE tickets SET created_at = created_at - 400000 WHERE id IN (?, ?)").run(old.id, claimed.id);
	assert.deepEqual(
		tickets.stale(3 * 86400).map((t) => t.id),
		[old.id]
	);
});

test("actions: pending per player, reported once", () => {
	const actions = new Actions(database.open(":memory:"));
	const a = actions.queue({ robloxId: 100, kind: "void", slot: "Default", ticketId: 4 });
	actions.queue({ robloxId: 200, kind: "void" });
	assert.deepEqual(
		actions.pendingFor([100, 999]).map((x) => x.id),
		[a.id]
	);
	assert.deepEqual(actions.pendingFor([]), []);
	assert.ok(actions.finish(a.id, "restored"));
	assert.equal(actions.finish(a.id, "again"), null);
	assert.deepEqual(actions.pendingFor([100]), []);
});

test("attendance and death stats", () => {
	const ops = new Operations(database.open(":memory:"));
	const { operation } = ops.start({ jobId: "j", placeId: 1, map: "M" });
	ops.attend(operation.id, [1, 2, 2, "bad"]);
	ops.attend(operation.id, [1]);
	assert.equal(ops.eventsAttended(1), 1);
	assert.equal(ops.eventsAttended(3), 0);
	ops.addKia({ operationId: operation.id, robloxId: 1, robloxName: "a" });
	ops.addKia({ operationId: operation.id, robloxId: 1, robloxName: "a" });
	ops.restore(1);
	assert.deepEqual(ops.deathStats(1), { lost: 1, voided: 1 });
	assert.deepEqual(ops.deathStats(5), { lost: 0, voided: 0 });
	assert.equal(ops.latestKia(1, 3600).restored, 0);
});

test("old databases get the new memorial column", () => {
	const { DatabaseSync } = require("node:sqlite");
	const fs = require("node:fs");
	const file = `/tmp/speardev-migrate-${process.pid}.db`;
	fs.rmSync(file, { force: true });
	const old = new DatabaseSync(file);
	old.exec("CREATE TABLE kia (id INTEGER PRIMARY KEY, operation_id INTEGER, roblox_id INTEGER NOT NULL, roblox_name TEXT NOT NULL, slot TEXT, cause TEXT, map TEXT, at INTEGER NOT NULL, restored INTEGER NOT NULL DEFAULT 0, message_id TEXT)");
	old.close();
	const db = database.open(file);
	const columns = db.prepare("PRAGMA table_info(kia)").all().map((c) => c.name);
	assert.ok(columns.includes("memorial_message_id"));
	database.open(file);
	fs.rmSync(file, { force: true });
});

test("soft bans: one active ban at a time, lifting works once", () => {
	const { Bans } = require("../src/services/bans");
	const bans = new Bans(database.open(":memory:"));
	assert.equal(bans.active("d1"), null);
	assert.equal(bans.add("d1", "spam", "staff").reason, "spam");
	assert.equal(bans.add("d1", "again", "staff"), null, "already banned");
	assert.equal(bans.allActive().length, 1);
	assert.equal(bans.lift("d1", "staff2").lifted_by, "staff2");
	assert.equal(bans.lift("d1", "staff2"), null);
	assert.equal(bans.active("d1"), null);
	assert.ok(bans.add("d1", "back again", "staff"), "can be banned again later");
});
