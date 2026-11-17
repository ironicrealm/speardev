const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const config = require("../config");

// Small shared helpers for the Discord side.

const EPHEMERAL = MessageFlags.Ephemeral;

function isStaff(member) {
	if (!member) {
		return false;
	}
	if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) {
		return true;
	}
	return member.roles.cache.some((role) => config.StaffRoles.includes(role.name));
}

async function giveRole(guild, discordId, roleName) {
	if (!roleName) {
		return;
	}
	try {
		const role = guild.roles.cache.find((r) => r.name === roleName);
		const member = await guild.members.fetch(discordId);
		if (role && member && !member.roles.cache.has(role.id)) {
			await member.roles.add(role);
		}
	} catch (error) {
		console.warn(`[Roles] Couldn't give ${roleName} to ${discordId}: ${error.message}`);
	}
}

// DMs can fail if the person has them closed, so never let that break anything
async function dm(client, discordId, content) {
	try {
		await client.users.send(discordId, content);
		return true;
	} catch {
		return false;
	}
}

async function log(client, content) {
	if (!config.Channels.Log) {
		return;
	}
	try {
		const channel = await client.channels.fetch(config.Channels.Log);
		await channel.send({ content, allowedMentions: { parse: [] } });
	} catch (error) {
		console.warn(`[Log] ${error.message}`);
	}
}

module.exports = { EPHEMERAL, isStaff, giveRole, dm, log };
