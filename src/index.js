const fs = require("node:fs");
const path = require("node:path");
const { Client, Events, GatewayIntentBits } = require("discord.js");

const config = require("./config");
const database = require("./core/database");
const { RobloxApi } = require("./services/roblox");
const { Links } = require("./services/links");
const { Waves } = require("./services/waves");
const { Applications } = require("./services/applications");
const { GroupSync } = require("./services/groupSync");
const { EPHEMERAL, isStaff, giveRole, dm, log } = require("./discord/helpers");

// Starts the bot.

function checkConfig() {
	const missing = [];
	if (!config.Token) missing.push("DISCORD_TOKEN");
	if (!config.GuildId) missing.push("GUILD_ID");
	if (!config.RobloxApiKey) missing.push("ROBLOX_API_KEY");
	if (!config.Channels.Review) missing.push("REVIEW_CHANNEL_ID");
	if (missing.length > 0) {
		console.error(`Missing in .env: ${missing.join(", ")}`);
		process.exit(1);
	}
}

function loadFolder(folder) {
	const dir = path.join(__dirname, folder);
	return fs
		.readdirSync(dir)
		.filter((file) => file.endsWith(".js"))
		.map((file) => require(path.join(dir, file)));
}

checkConfig();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = database.open(config.Database);
const roblox = new RobloxApi({ apiKey: config.RobloxApiKey, groupId: config.Group.Id });
const applications = new Applications(db);

const ctx = {
	client,
	db,
	roblox,
	applications,
	links: new Links(db, roblox, { codeMinutes: config.VerifyCodeMinutes }),
	waves: new Waves(db),
};

// When an accepted player gets into the Roblox group
ctx.groupSync = new GroupSync(applications, roblox, {
	wavedRank: config.Group.WavedRank,
	async onJoined(app) {
		const guild = await client.guilds.fetch(config.GuildId).catch(() => null);
		if (guild) {
			await giveRole(guild, app.discord_id, config.WavedRole);
		}
		await dm(client, app.discord_id, "✅ You're in the Spearhead group. Welcome aboard!");
		await log(client, `👥 **${app.roblox_name}** (<@${app.discord_id}>) is now in the group`);
	},
});

const commands = new Map();
for (const command of loadFolder("commands")) {
	commands.set(command.data.name, command);
}

const handlers = {};
for (const group of loadFolder("interactions")) {
	Object.assign(handlers, group);
}

// Buttons and forms use ids like "review:accept:12". The first two parts pick the handler.
function handlerFor(customId) {
	const [area, action] = customId.split(":");
	return handlers[`${area}:${action}`];
}

client.once(Events.ClientReady, async () => {
	console.log(`Logged in as ${client.user.tag}`);
	await client.application.commands.set(
		[...commands.values()].map((command) => command.data.toJSON()),
		config.GuildId
	);
	console.log(`Registered ${commands.size} commands`);
	ctx.groupSync.start(config.GroupSyncInterval);

	// Roblox expires API keys that go unused for 60 days, so use it once a day
	const keepKeyAlive = () =>
		roblox
			.listRoles(true)
			.then(() => console.log("[Roblox] API key OK"))
			.catch((error) => console.warn(`[Roblox] API key check failed: ${error.message}`));
	keepKeyAlive();
	setInterval(keepKeyAlive, 24 * 60 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
	try {
		if (interaction.isChatInputCommand()) {
			const command = commands.get(interaction.commandName);
			if (!command) {
				return;
			}
			if (command.staff && !isStaff(interaction.member)) {
				await interaction.reply({ content: "Staff only.", flags: EPHEMERAL });
				return;
			}
			await command.run(interaction, ctx);
			return;
		}
		if (interaction.isButton() || interaction.isModalSubmit()) {
			const handler = handlerFor(interaction.customId);
			if (handler) {
				await handler(interaction, ctx);
			}
		}
	} catch (error) {
		console.error(error);
		const reply = { content: "Something went wrong. Staff have been told in the logs.", flags: EPHEMERAL };
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp(reply).catch(() => {});
		} else if (interaction.isRepliable()) {
			await interaction.reply(reply).catch(() => {});
		}
	}
});

process.on("unhandledRejection", (error) => console.error("[Unhandled]", error));

client.login(config.Token);
