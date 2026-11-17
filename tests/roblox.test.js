const test = require("node:test");
const assert = require("node:assert/strict");
const { RobloxApi } = require("../src/services/roblox");

// Checks the bot sends the right requests to Roblox

function recorder(responses) {
	const calls = [];
	const fetch = async (url, options) => {
		calls.push({ url, ...options });
		const next = responses.shift() ?? { status: 200, body: {} };
		return {
			status: next.status,
			ok: next.status >= 200 && next.status < 300,
			headers: { get: () => "0" },
			text: async () => (next.body === undefined ? "" : JSON.stringify(next.body)),
		};
	};
	return { fetch, calls };
}

test("finds a join request with the user filter and API key", async () => {
	const { fetch, calls } = recorder([{ status: 200, body: { groupJoinRequests: [{ path: "groups/9/join-requests/77", user: "users/5" }] } }]);
	const api = new RobloxApi({ apiKey: "KEY", groupId: 9, fetch });
	assert.equal(await api.findJoinRequest(5), "groups/9/join-requests/77");
	assert.match(calls[0].url, /^https:\/\/apis\.roblox\.com\/cloud\/v2\/groups\/9\/join-requests\?/);
	assert.match(decodeURIComponent(calls[0].url), /filter=user == 'users\/5'/);
	assert.equal(calls[0].headers["x-api-key"], "KEY");
});

test("accepts a join request at the right address", async () => {
	const { fetch, calls } = recorder([{ status: 200, body: {} }]);
	const api = new RobloxApi({ apiKey: "KEY", groupId: 9, fetch });
	await api.acceptJoinRequest("groups/9/join-requests/77");
	assert.equal(calls[0].url, "https://apis.roblox.com/cloud/v2/groups/9/join-requests/77:accept");
	assert.equal(calls[0].method, "POST");
});

test("public user lookups don't send the API key", async () => {
	const { fetch, calls } = recorder([{ status: 200, body: { data: [{ id: 5, name: "Shin", displayName: "Shin" }] } }]);
	const api = new RobloxApi({ apiKey: "KEY", groupId: 9, fetch });
	assert.deepEqual(await api.findUserByName("shin"), { id: 5, name: "Shin", displayName: "Shin" });
	assert.equal(calls[0].headers["x-api-key"], undefined);
});

test("retries once when rate limited, and reports errors", async () => {
	const { fetch, calls } = recorder([{ status: 429, body: {} }, { status: 200, body: { groupMemberships: [] } }]);
	const api = new RobloxApi({ apiKey: "KEY", groupId: 9, fetch });
	assert.equal(await api.getMembership(5), null);
	assert.equal(calls.length, 2);

	const failing = recorder([{ status: 403, body: { message: "Forbidden" } }]);
	const api2 = new RobloxApi({ apiKey: "KEY", groupId: 9, fetch: failing.fetch });
	await assert.rejects(api2.getMembership(5), /403/);
});

test("missing users come back as null", async () => {
	const { fetch } = recorder([{ status: 404, body: { errors: [] } }]);
	const api = new RobloxApi({ apiKey: "KEY", groupId: 9, fetch });
	assert.equal(await api.getUser(1), null);
});
