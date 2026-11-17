const test = require("node:test");
const assert = require("node:assert/strict");

const database = require("../src/core/database");
const { Operations } = require("../src/services/operations");
const { createServer } = require("../src/web/server");

test("an operation tracks KIA, the most players seen, and ends", () => {
	const ops = new Operations(database.open(":memory:"));
	const { operation } = ops.start({ jobId: "job1", placeId: 5, map: "Wilderness 1", header: "h", message: "m", handler: "x", players: 10 });
	ops.notePlayers(operation.id, 14);
	ops.notePlayers(operation.id, 9);
	assert.equal(ops.get(operation.id).deployed, 14);

	ops.addKia({ operationId: operation.id, robloxId: 1, robloxName: "Shin", cause: "on foot", map: "Wilderness 1" });
	ops.addKia({ operationId: operation.id, robloxId: 2, robloxName: "Raiden", cause: "Juggernaut lost", map: "Wilderness 1" });
	assert.equal(ops.kiaFor(operation.id).length, 2);

	assert.equal(ops.restore(2).roblox_name, "Raiden");
	assert.equal(ops.restore(2), null, "nothing left to restore");
	assert.equal(ops.kiaFor(operation.id).filter((k) => k.restored).length, 1);

	assert.equal(ops.end("job1").id, operation.id);
	assert.equal(ops.active("job1"), null);
	assert.equal(ops.end("job1"), null);
});

test("a new alert in the same server ends the previous operation", () => {
	const ops = new Operations(database.open(":memory:"));
	const first = ops.start({ jobId: "job1", placeId: 5, map: "A" }).operation;
	const { operation, previous } = ops.start({ jobId: "job1", placeId: 5, map: "A" });
	assert.equal(previous.id, first.id);
	assert.notEqual(ops.get(first.id).ended_at, null);
	assert.equal(ops.active("job1").id, operation.id);
});

test("last seen is stored", () => {
	const ops = new Operations(database.open(":memory:"));
	assert.equal(ops.lastSeen(7), null);
	ops.seen(7);
	assert.ok(ops.lastSeen(7) > 0);
});

async function withServer(handlers, fn) {
	const server = createServer({ secret: "s3cret", handlers, log: { error() {} } });
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		await fn(base);
	} finally {
		server.close();
	}
}

test("the game endpoint needs the secret and passes the body on", async () => {
	const received = [];
	await withServer({ death: async (body) => received.push(body) && { event: 3 } }, async (base) => {
		const send = (key, path = "/game/death", body = '{"userId":1}') =>
			fetch(base + path, { method: "POST", headers: key ? { "x-spear-key": key } : {}, body });

		assert.equal((await send(null)).status, 401);
		assert.equal((await send("wrong")).status, 401);
		assert.equal((await send("s3cret", "/game/nope")).status, 404);
		assert.equal((await send("s3cret", "/game/death", "{bad")).status, 400);

		const ok = await send("s3cret");
		assert.equal(ok.status, 200);
		assert.deepEqual(await ok.json(), { ok: true, event: 3 });
		assert.deepEqual(received, [{ userId: 1 }]);

		assert.equal((await fetch(base + "/health")).status, 200);
	});
});

test("a failing handler returns 500 without crashing", async () => {
	await withServer({ death: async () => { throw new Error("boom"); } }, async (base) => {
		const res = await fetch(base + "/game/death", { method: "POST", headers: { "x-spear-key": "s3cret" }, body: "{}" });
		assert.equal(res.status, 500);
	});
});
