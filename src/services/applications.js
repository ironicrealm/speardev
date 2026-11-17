const { now } = require("../core/database");

// Stores applications and their review result.
// group_status: none -> waiting (accepted, not in the group yet) -> joined
class Applications {
	constructor(db) {
		this.db = db;
	}

	get(id) {
		const app = this.db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
		return app ? parse(app) : null;
	}

	// Checks if this person is allowed to apply in this wave
	canApply(discordId, robloxId, waveId) {
		const accepted = this.db
			.prepare("SELECT id FROM applications WHERE (discord_id = ? OR roblox_id = ?) AND status = 'accepted' LIMIT 1")
			.get(discordId, robloxId);
		if (accepted) {
			return { ok: false, reason: "You've already been accepted." };
		}
		const pending = this.db
			.prepare("SELECT id FROM applications WHERE (discord_id = ? OR roblox_id = ?) AND status = 'pending' LIMIT 1")
			.get(discordId, robloxId);
		if (pending) {
			return { ok: false, reason: "Your application is still being reviewed." };
		}
		const thisWave = this.db
			.prepare("SELECT id FROM applications WHERE (discord_id = ? OR roblox_id = ?) AND wave_id = ? LIMIT 1")
			.get(discordId, robloxId, waveId);
		if (thisWave) {
			return { ok: false, reason: "You've already applied this wave. You can try again next wave." };
		}
		return { ok: true };
	}

	create({ waveId, discordId, robloxId, robloxName, robloxCreated = null, answers }) {
		const result = this.db
			.prepare(
				`INSERT INTO applications (wave_id, discord_id, roblox_id, roblox_name, roblox_created, answers, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.run(waveId, discordId, robloxId, robloxName, robloxCreated, JSON.stringify(answers), now());
		return this.get(result.lastInsertRowid);
	}

	setReviewMessage(id, messageId) {
		this.db.prepare("UPDATE applications SET review_message_id = ? WHERE id = ?").run(messageId, id);
	}

	// Accept or deny. Returns null if someone else already decided it.
	decide(id, status, reviewerId, reason = null) {
		const groupStatus = status === "accepted" ? "waiting" : "none";
		const result = this.db
			.prepare(
				`UPDATE applications SET status = ?, reviewer_id = ?, reason = ?, decided_at = ?, group_status = ?
				WHERE id = ? AND status = 'pending'`
			)
			.run(status, reviewerId, reason, now(), groupStatus, id);
		return result.changes > 0 ? this.get(id) : null;
	}

	setGroupStatus(id, groupStatus) {
		this.db.prepare("UPDATE applications SET group_status = ? WHERE id = ?").run(groupStatus, id);
	}

	waitingForGroup() {
		return this.db.prepare("SELECT * FROM applications WHERE group_status = 'waiting' ORDER BY id").all().map(parse);
	}

	latestFor(discordId) {
		const app = this.db.prepare("SELECT * FROM applications WHERE discord_id = ? ORDER BY id DESC LIMIT 1").get(discordId);
		return app ? parse(app) : null;
	}
}

function parse(row) {
	return { ...row, answers: JSON.parse(row.answers) };
}

module.exports = { Applications };
