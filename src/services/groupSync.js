// Lets accepted players into the Roblox group.
// If they haven't sent a join request yet, it keeps checking until they do.
class GroupSync {
	constructor(applications, roblox, { wavedRank, onJoined = async () => {}, log = console } = {}) {
		this.applications = applications;
		this.roblox = roblox;
		this.wavedRank = wavedRank;
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
		if (current && current.rank >= waved.rank) {
			return;
		}
		await this.roblox.setRole(membership.path, waved.path);
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
