const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const { dm, log } = require("./helpers");

// Soft bans. Banned members keep their place in the server but can only read the tickets channel
// (and their own ticket channels, which give them access directly).

const LOCKED = ["ViewChannel", "SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads", "AddReactions", "Connect", "Speak"];
const TICKETS_READ_ONLY = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads", "AddReactions"];

function bits(names) {
	return names.reduce((total, name) => total | PermissionFlagsBits[name], 0n);
}

// What the Banned role should have in this channel
function wanted(channel) {
	if (channel.id === config.Channels.Tickets) {
		return { allow: ["ViewChannel", "ReadMessageHistory"], deny: TICKETS_READ_ONLY };
	}
	return { allow: [], deny: LOCKED };
}

async function bannedRole(guild) {
	const role = guild.roles.cache.get(config.BannedRoleId) ?? (await guild.roles.fetch(config.BannedRoleId).catch(() => null));
	if (!role) {
		throw new Error(`Banned role ${config.BannedRoleId} not found`);
	}
	return role;
}

async function applyTo(channel, role) {
	if (!channel.permissionOverwrites || channel.isThread?.()) {
		return false;
	}
	const want = wanted(channel);
	const current = channel.permissionOverwrites.cache.get(role.id);
	if (current && current.allow.bitfield === bits(want.allow) && current.deny.bitfield === bits(want.deny)) {
		return false;
	}
	const options = {};
	for (const name of Object.keys(PermissionFlagsBits)) {
		if (want.allow.includes(name)) {
			options[name] = true;
		} else if (want.deny.includes(name)) {
			options[name] = false;
		}
	}
	// create() replaces whatever was there, so old settings don't linger
	await channel.permissionOverwrites.create(role, options, { reason: "Soft ban rules" });
	return true;
}

// Puts the Banned rules on every channel. Safe to run any time.
async function syncAll(guild) {
	const role = await bannedRole(guild);
	let changed = 0;
	for (const channel of guild.channels.cache.values()) {
		if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) {
			continue;
		}
		try {
			if (await applyTo(channel, role)) {
				changed += 1;
			}
		} catch (error) {
			console.warn(`[Bans] Couldn't set rules on #${channel.name}: ${error.message}`);
		}
	}
	return changed;
}

async function onChannelCreate(channel) {
	if (!channel.guild || channel.guild.id !== config.GuildId) {
		return;
	}
	try {
		await applyTo(channel, await bannedRole(channel.guild));
	} catch (error) {
		console.warn(`[Bans] New channel #${channel.name}: ${error.message}`);
	}
}

async function ban(ctx, guild, user, reason, bannedBy) {
	const record = ctx.bans.add(user.id, reason, bannedBy);
	if (!record) {
		return { ok: false, message: `<@${user.id}> is already banned.` };
	}
	const role = await bannedRole(guild);
	const member = await guild.members.fetch(user.id).catch(() => null);
	await member?.roles.add(role, reason || "Banned");
	await dm(
		ctx.client,
		user.id,
		[
			"⛔ You've been **banned** from Spearhead.",
			reason ? `Reason: ${reason}` : null,
			`You can only see <#${config.Channels.Tickets}> now. Open a **Ban Appeal** there if you think it should be lifted.`,
		]
			.filter(Boolean)
			.join("\n")
	);
	await log(ctx.client, `⛔ <@${bannedBy}> banned <@${user.id}>${reason ? `: ${reason}` : ""}`);
	return { ok: true, message: `Banned <@${user.id}>.` };
}

async function unban(ctx, guild, discordId, liftedBy, { notify = true } = {}) {
	const record = ctx.bans.lift(discordId, liftedBy);
	if (!record) {
		return { ok: false, message: `<@${discordId}> isn't banned.` };
	}
	const role = await bannedRole(guild).catch(() => null);
	const member = await guild.members.fetch(discordId).catch(() => null);
	if (role && member) {
		await member.roles.remove(role, "Unbanned");
	}
	if (notify) {
		await dm(ctx.client, discordId, "✅ Your Spearhead ban has been **lifted**. Welcome back.");
	}
	await log(ctx.client, `✅ <@${liftedBy}> unbanned <@${discordId}>`);
	return { ok: true, message: `Unbanned <@${discordId}>.` };
}

// Leaving and rejoining doesn't get rid of a ban
async function onMemberJoin(ctx, member) {
	if (member.guild.id !== config.GuildId || !ctx.bans.active(member.id)) {
		return;
	}
	try {
		await member.roles.add(await bannedRole(member.guild), "Still banned");
		await log(ctx.client, `⛔ <@${member.id}> rejoined while banned, Banned role put back`);
	} catch (error) {
		console.warn(`[Bans] Rejoin ${member.id}: ${error.message}`);
	}
}

module.exports = { ban, unban, syncAll, onChannelCreate, onMemberJoin, bannedRole, wanted };
