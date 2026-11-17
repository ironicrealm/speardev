const { now } = require("../core/database");

// Leaves of absence. pending -> approved (runs until ends_at) / denied, approved -> ended (early)
class Loas {
	constructor(db) {
		this.db = db;
	}

	get(id) {
		return this.db.prepare("SELECT * FROM loas WHERE id = ?").get(id) ?? null;
	}

	pendingFor(discordId) {
		return this.db.prepare("SELECT * FROM loas WHERE discord_id = ? AND status = 'pending' LIMIT 1").get(discordId) ?? null;
	}

	// The leave they're on right now, if any
	activeFor(discordId) {
		return (
			this.db
				.prepare("SELECT * FROM loas WHERE discord_id = ? AND status = 'approved' AND ends_at > ? ORDER BY id DESC LIMIT 1")
				.get(discordId, now()) ?? null
		);
	}

	// When their most recent leave ended (counts as activity, so they aren't removed right after coming back)
	lastEnded(discordId) {
		return (
			this.db
				.prepare("SELECT MAX(ends_at) AS t FROM loas WHERE discord_id = ? AND status IN ('approved', 'ended') AND ends_at <= ?")
				.get(discordId, now()).t ?? null
		);
	}

	allActive() {
		return this.db.prepare("SELECT * FROM loas WHERE status = 'approved' AND ends_at > ? ORDER BY ends_at").all(now());
	}

	request({ discordId, robloxId = null, days, reason }) {
		const result = this.db
			.prepare("INSERT INTO loas (discord_id, roblox_id, days, reason, created_at) VALUES (?, ?, ?, ?, ?)")
			.run(discordId, robloxId, days, reason ?? null, now());
		return this.get(result.lastInsertRowid);
	}

	setReviewMessage(id, messageId) {
		this.db.prepare("UPDATE loas SET review_message_id = ? WHERE id = ?").run(messageId, id);
	}

	// The leave starts when it's approved. Returns null if someone already decided it.
	approve(id, reviewerId) {
		const loa = this.get(id);
		if (!loa || loa.status !== "pending") {
			return null;
		}
		const start = now();
		const result = this.db
			.prepare("UPDATE loas SET status = 'approved', reviewer_id = ?, starts_at = ?, ends_at = ? WHERE id = ? AND status = 'pending'")
			.run(reviewerId, start, start + loa.days * 86400, id);
		return result.changes > 0 ? this.get(id) : null;
	}

	deny(id, reviewerId, reason = null) {
		const result = this.db
			.prepare("UPDATE loas SET status = 'denied', reviewer_id = ?, deny_reason = ? WHERE id = ? AND status = 'pending'")
			.run(reviewerId, reason, id);
		return result.changes > 0 ? this.get(id) : null;
	}

	// End their current leave early
	end(discordId) {
		const loa = this.activeFor(discordId);
		if (!loa) {
			return null;
		}
		this.db.prepare("UPDATE loas SET status = 'ended', ends_at = ? WHERE id = ?").run(now(), loa.id);
		return this.get(loa.id);
	}
}

module.exports = { Loas };
