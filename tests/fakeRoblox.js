// A pretend Roblox for tests: users, a group with roles, join requests and members.
function fakeRoblox() {
	const state = {
		users: new Map(),
		requests: new Map(),
		members: new Map(),
		roles: [
			{ path: "groups/1/roles/10", rank: 0, name: "Guest" },
			{ path: "groups/1/roles/11", rank: 1, name: "Waved" },
			{ path: "groups/1/roles/12", rank: 200, name: "Moderator" },
		],
		calls: [],
	};
	const api = {
		state,
		addUser(id, name, description = "") {
			state.users.set(id, { id, name, displayName: name, description, created: "2020-01-01T00:00:00Z", banned: false });
		},
		async findUserByName(name) {
			for (const user of state.users.values()) {
				if (user.name.toLowerCase() === name.toLowerCase()) return { id: user.id, name: user.name, displayName: user.name };
			}
			return null;
		},
		async getUser(id) {
			return state.users.get(id) ?? null;
		},
		async findJoinRequest(userId) {
			return state.requests.get(userId) ?? null;
		},
		async acceptJoinRequest(path) {
			state.calls.push(["accept", path]);
			for (const [userId, requestPath] of state.requests) {
				if (requestPath === path) {
					state.requests.delete(userId);
					state.members.set(userId, { path: `groups/1/memberships/m${userId}`, role: "groups/1/roles/11" });
				}
			}
		},
		async getMembership(userId) {
			return state.members.get(userId) ?? null;
		},
		async listRoles() {
			return state.roles;
		},
		async setRole(membershipPath, rolePath) {
			state.calls.push(["setRole", membershipPath, rolePath]);
			for (const member of state.members.values()) {
				if (member.path === membershipPath) member.role = rolePath;
			}
		},
	};
	return api;
}

module.exports = { fakeRoblox };
