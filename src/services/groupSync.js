// Lets accepted players into the Roblox group.
// If they haven't sent a join request yet, it keeps checking until they do.
class GroupSync {
	constructor(applications, roblox, { wavedRank, inactiveRank = null, onJoined = async () => {}, log = console } = {}) {
		this.applications = applications;
		this.roblox = roblox;
		this.wavedRank = wavedRank;
		this.inactiveRank = inactiveRank;
		this.onJoined = onJoined;
		this.log = log;
		this.running = false;
	}

	// Returns "joined" or "waiting"
	async process(app) {
		let membership = await this.roblox.getMembership(app.roblox_id);
		if (!membership) {
			const request = await this.roblox.findJoinRequest(app.roblox_id);
			if (!request) {
				return "waiting";
			}
			await this.roblox.acceptJoinRequest(request);
			membership = await this.roblox.getMembership(app.roblox_id);
		}
		if (membership) {
			await this.ensureRank(membership);
		}
		this.applications.setGroupStatus(app.id, "joined");
		await this.onJoined(app);
		return "joined";
	}

	// Moves them up to the Waved rank, never down
	async ensureRank(membership) {
		const roles = await this.roblox.listRoles();
		const waved = roles.find((role) => role.rank === this.wavedRank);
		if (!waved) {
			this.log.warn(`[GroupSync] No group role with rank ${this.wavedRank}`);
			return;
		}
		const current = roles.find((role) => role.path === membership.role);
		// Inactive sits above Waved, so it's checked by number: returning players move back to Waved
		const inactive = current && current.rank === this.inactiveRank;
		if (current && current.rank >= waved.rank && !inactive) {
			return;
		}
		await this.roblox.setRole(membership.path, waved.path);
	}

	// Moves a Waved member to the Inactive rank. Never touches anyone on another rank.
	async demote(robloxId) {
		const membership = await this.roblox.getMembership(robloxId);
		if (!membership) {
			return "not in the group";
		}
		const roles = await this.roblox.listRoles();
		const current = roles.find((role) => role.path === membership.role);
		const inactive = roles.find((role) => role.rank === this.inactiveRank);
		if (!inactive) {
			throw new Error(`No group role with rank ${this.inactiveRank}`);
		}
		if (current?.rank === this.inactiveRank) {
			return "already Inactive";
		}
		if (current?.rank !== this.wavedRank) {
			return `skipped (rank ${current?.name ?? "unknown"})`;
		}
		await this.roblox.setRole(membership.path, inactive.path);
		return "moved to Inactive";
	}

	async runOnce() {
		if (this.running) {
			return;
		}
		this.running = true;
		try {
			for (const app of this.applications.waitingForGroup()) {
				try {
					await this.process(app);
				} catch (error) {
					this.log.warn(`[GroupSync] Application #${app.id} (${app.roblox_name}): ${error.message}`);
				}
			}
		} finally {
			this.running = false;
		}
	}

	start(intervalSeconds) {
		this.timer = setInterval(() => this.runOnce(), intervalSeconds * 1000);
		this.runOnce();
	}

	stop() {
		clearInterval(this.timer);
	}
}

module.exports = { GroupSync };
