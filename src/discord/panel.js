const ui = require("./ui");

// Keeps the Verify / Apply panel message up to date when waves open or close.
const PANEL_KEY = "panel";

function getStored(db) {
	const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(PANEL_KEY);
	return row ? JSON.parse(row.value) : null;
}

function store(db, channelId, messageId) {
	db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
		PANEL_KEY,
		JSON.stringify({ channelId, messageId })
	);
}

async function post(ctx, channel) {
	const message = await channel.send(ui.panel(ctx.waves.current()));
	store(ctx.db, channel.id, message.id);
	return message;
}

async function refresh(ctx) {
	const stored = getStored(ctx.db);
	if (!stored) {
		return false;
	}
	try {
		const channel = await ctx.client.channels.fetch(stored.channelId);
		const message = await channel.messages.fetch(stored.messageId);
		await message.edit(ui.panel(ctx.waves.current()));
		return true;
	} catch (error) {
		console.warn(`[Panel] Couldn't update the panel: ${error.message}`);
		return false;
	}
}

module.exports = { post, refresh };
