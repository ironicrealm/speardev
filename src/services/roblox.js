// Talks to Roblox: looks up users and manages the group's join requests and ranks.
const OPEN_CLOUD = "https://apis.roblox.com/cloud/v2";
const USERS = "https://users.roblox.com/v1";

class RobloxError extends Error {
	constructor(status, body) {
		super(`Roblox API ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
		this.status = status;
		this.body = body;
	}
}

class RobloxApi {
	constructor({ apiKey, groupId, fetch = globalThis.fetch }) {
		this.apiKey = apiKey;
		this.groupId = groupId;
		this.fetch = fetch;
		this.roles = null;
	}

	async request(url, { method = "GET", body, cloud = false } = {}) {
		const headers = { Accept: "application/json" };
		if (cloud) {
			headers["x-api-key"] = this.apiKey;
		}
		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
		}
		for (let attempt = 1; attempt <= 2; attempt++) {
			const response = await this.fetch(url, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			// rate limited: wait and try once more
			if (response.status === 429 && attempt === 1) {
				const wait = Number(response.headers?.get?.("retry-after")) || 2;
				await new Promise((resolve) => setTimeout(resolve, wait * 1000));
				continue;
			}
			const text = await response.text();
			const data = text ? safeJson(text) : null;
			if (!response.ok) {
				throw new RobloxError(response.status, data ?? text);
			}
			return data;
		}
	}

	async findUserByName(username) {
		const data = await this.request(`${USERS}/usernames/users`, {
			method: "POST",
			body: { usernames: [username], excludeBannedUsers: true },
		});
		const user = data?.data?.[0];
		return user ? { id: user.id, name: user.name, displayName: user.displayName } : null;
	}

	async getUser(userId) {
		try {
			const user = await this.request(`${USERS}/users/${userId}`);
			return {
				id: user.id,
				name: user.name,
				displayName: user.displayName,
				description: user.description ?? "",
				created: user.created,
				banned: user.isBanned === true,
			};
		} catch (error) {
			if (error.status === 404) {
				return null;
			}
			throw error;
		}
	}

	// Avatar headshot image link (null if Roblox doesn't have one)
	async getHeadshot(userId) {
		try {
			const data = await this.request(
				`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
			);
			const entry = data?.data?.[0];
			return entry?.state === "Completed" ? entry.imageUrl : null;
		} catch {
			return null;
		}
	}

	groupUrl(rest) {
		return `${OPEN_CLOUD}/groups/${this.groupId}/${rest}`;
	}

	async findJoinRequest(userId) {
		const filter = encodeURIComponent(`user == 'users/${userId}'`);
		const data = await this.request(this.groupUrl(`join-requests?maxPageSize=1&filter=${filter}`), { cloud: true });
		return data?.groupJoinRequests?.[0]?.path ?? null;
	}

	async acceptJoinRequest(requestPath) {
		await this.request(`${OPEN_CLOUD}/${requestPath}:accept`, { method: "POST", body: {}, cloud: true });
	}

	async declineJoinRequest(requestPath) {
		await this.request(`${OPEN_CLOUD}/${requestPath}:decline`, { method: "POST", body: {}, cloud: true });
	}

	async getMembership(userId) {
		const filter = encodeURIComponent(`user == 'users/${userId}'`);
		const data = await this.request(this.groupUrl(`memberships?maxPageSize=1&filter=${filter}`), { cloud: true });
		const membership = data?.groupMemberships?.[0];
		return membership ? { path: membership.path, role: membership.role } : null;
	}

	async listRoles(fresh = false) {
		if (this.roles && !fresh) {
			return this.roles;
		}
		const roles = [];
		let pageToken = "";
		do {
			const query = `roles?maxPageSize=20${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
			const data = await this.request(this.groupUrl(query), { cloud: true });
			for (const role of data?.groupRoles ?? []) {
				roles.push({ path: role.path, rank: role.rank, name: role.displayName });
			}
			pageToken = data?.nextPageToken ?? "";
		} while (pageToken);
		this.roles = roles;
		return roles;
	}

	async setRole(membershipPath, rolePath) {
		await this.request(`${OPEN_CLOUD}/${membershipPath}`, { method: "PATCH", body: { role: rolePath }, cloud: true });
	}
}

function safeJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

module.exports = { RobloxApi, RobloxError };
