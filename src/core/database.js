const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Opens the database file and makes sure the tables exist
function open(file) {
	if (file !== ":memory:") {
		fs.mkdirSync(path.dirname(file), { recursive: true });
	}
	const db = new DatabaseSync(file);
	db.exec(`
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS links (
			discord_id TEXT PRIMARY KEY,
			roblox_id INTEGER NOT NULL UNIQUE,
			roblox_name TEXT NOT NULL,
			linked_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS verifications (
			discord_id TEXT PRIMARY KEY,
			roblox_id INTEGER NOT NULL,
			roblox_name TEXT NOT NULL,
			code TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS waves (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			open INTEGER NOT NULL DEFAULT 1,
			opened_at INTEGER NOT NULL,
			closed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS applications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			wave_id INTEGER NOT NULL,
			discord_id TEXT NOT NULL,
			roblox_id INTEGER NOT NULL,
			roblox_name TEXT NOT NULL,
			roblox_created INTEGER,
			answers TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			reviewer_id TEXT,
			reason TEXT,
			review_message_id TEXT,
			group_status TEXT NOT NULL DEFAULT 'none',
			created_at INTEGER NOT NULL,
			decided_at INTEGER
		);

		CREATE INDEX IF NOT EXISTS applications_discord ON applications (discord_id);
		CREATE INDEX IF NOT EXISTS applications_group ON applications (group_status);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT
		);
	`);
	return db;
}

function now() {
	return Math.floor(Date.now() / 1000);
}

module.exports = { open, now };
