const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const ticketUi = require("./ticketUi");
const { dm, log } = require("./helpers");

// Opening, updating and closing ticket channels.

const KIA_WINDOW = 7 * 86400;
const DELETE_DELAY = 15 * 1000;

function channelName(prefix, name, id) {
	const clean = String(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
	return `${prefix}-${clean || "ticket"}-${id}`;
}

// What the ticket's first message needs: linked account, and for appeals the death being appealed
function context(ctx, ticket) {
	const link = ctx.links.get(ticket.discord_id);
	const kia = ticket.kia_id ? ctx.operations.getKia(ticket.kia_id) : null;
	const operation = kia?.operation_id ? ctx.operations.get(kia.operation_id) : null;
	const ban = ticket.type === "ban" ? ctx.bans.active(ticket.discord_id) : null;
	return { link, kia, operation, ban };
}

function render(ctx, ticket) {
	return ticketUi.ticketMessage(ticket, context(ctx, ticket));
}

async function open(ctx, guild, user, type, answers) {
	const link = ctx.links.get(user.id);
	const kia = type === "appeal" && link ? ctx.operations.latestKia(link.roblox_id, KIA_WINDOW) : null;
	const ticket = ctx.tickets.create({ type, discordId: user.id, robloxId: link?.roblox_id ?? null, answers, kiaId: kia?.id ?? null });

	const staffRoles = guild.roles.cache.filter((role) => config.StaffRoles.includes(role.name));
	const access = [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.ReadMessageHistory,
		PermissionFlagsBits.AttachFiles,
		PermissionFlagsBits.EmbedLinks,
	];
	const channel = await guild.channels.create({
		name: channelName(config.TicketTypes[type].Prefix, link?.roblox_name ?? user.username, ticket.id),
		type: ChannelType.GuildText,
		parent: config.TicketCategory,
		topic: `${config.TicketTypes[type].Label} #${ticket.id} · ${user.tag ?? user.username}`,
		permissionOverwrites: [
			{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
			{ id: user.id, allow: access },
			{ id: ctx.client.user.id, allow: [...access, PermissionFlagsBits.ManageChannels] },
			...staffRoles.map((role) => ({ id: role.id, allow: access })),
		],
	});
	ctx.tickets.setChannel(ticket.id, channel.id);
	const first = await channel.send(render(ctx, ticket));
	ctx.tickets.setMessage(ticket.id, first.id);
	await log(ctx.client, `🎫 <@${user.id}> opened ${config.TicketTypes[type].Label} #${ticket.id} (<#${channel.id}>)`);
	return { ticket: ctx.tickets.get(ticket.id), channel };
}

// Saves the whole conversation as a text file in the log channel
async function transcript(ctx, ticket, channel) {
	if (!config.Channels.Log || !channel) {
		return;
	}
	try {
		const lines = [];
		let before;
		for (let page = 0; page < 5; page++) {
			const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
			if (batch.size === 0) {
				break;
			}
			for (const message of batch.values()) {
				const files = [...(message.attachments?.values?.() ?? [])].map((a) => ` [file: ${a.url}]`).join("");
				const embeds = message.embeds?.length ? " [embed]" : "";
				const time = new Date(message.createdTimestamp).toISOString().replace("T", " ").slice(0, 16);
				lines.push(`[${time}] ${message.author?.username ?? "?"}: ${message.content ?? ""}${files}${embeds}`);
			}
			before = batch.last()?.id;
			if (batch.size < 100) {
				break;
			}
		}
		const logChannel = await ctx.client.channels.fetch(config.Channels.Log);
		const label = config.TicketTypes[ticket.type].Label;
		await logChannel.send({
			content: `📁 ${label} #${ticket.id} from <@${ticket.discord_id}> · **${ticket.status}**${ticket.closed_by ? ` by <@${ticket.closed_by}>` : ""}${ticket.reason ? `\nReason: ${ticket.reason}` : ""}`,
			files: [{ attachment: Buffer.from(lines.reverse().join("\n") || "(empty)", "utf8"), name: `ticket-${ticket.id}.txt` }],
			allowedMentions: { parse: [] },
		});
	} catch (error) {
		console.warn(`[Tickets] Transcript for #${ticket.id} failed: ${error.message}`);
	}
}

// Shows the result in the channel, DMs the player, saves the transcript, deletes the channel
async function finish(ctx, ticket, dmText) {
	let channel = null;
	try {
		channel = ticket.channel_id ? await ctx.client.channels.fetch(ticket.channel_id) : null;
	} catch {
		channel = null;
	}
	await dm(ctx.client, ticket.discord_id, dmText);
	if (channel) {
		if (ticket.message_id) {
			const message = await channel.messages.fetch(ticket.message_id).catch(() => null);
			await message?.edit(render(ctx, ticket)).catch(() => {});
		}
		await channel.send({ content: "This ticket is closed. The channel will be deleted in a few seconds." }).catch(() => {});
	}
	await transcript(ctx, ticket, channel);
	if (channel) {
		setTimeout(() => channel.delete(`Ticket #${ticket.id} closed`).catch(() => {}), DELETE_DELAY);
	}
}

function reasonText(reason) {
	return reason ? `\nReason: ${reason}` : "";
}

async function closeExpired(ctx) {
	for (const stale of ctx.tickets.stale(config.TicketAutoCloseDays * 86400)) {
		const ticket = ctx.tickets.finish(stale.id, "expired", null);
		if (!ticket) {
			continue;
		}
		const label = config.TicketTypes[ticket.type].Label;
		await finish(
			ctx,
			ticket,
			`Your ${label} ticket (#${ticket.id}) was closed automatically because staff couldn't get to it within ${config.TicketAutoCloseDays} days. You're welcome to open a new one.`
		);
	}
}

function startAutoClose(ctx) {
	const run = () => closeExpired(ctx).catch((error) => console.warn(`[Tickets] Auto close failed: ${error.message}`));
	run();
	return setInterval(run, 60 * 60 * 1000);
}

module.exports = { open, render, finish, reasonText, closeExpired, startAutoClose, channelName };
