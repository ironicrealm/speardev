const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const ticketUi = require("../discord/ticketUi");
const manager = require("../discord/ticketManager");
const bans = require("../discord/bans");
const { EPHEMERAL, isStaff, log } = require("../discord/helpers");

// Ticket panel buttons, forms, and the staff buttons inside ticket channels

function part(interaction, index) {
	return interaction.customId.split(":")[index];
}

function ticketOf(interaction, ctx) {
	return ctx.tickets.get(Number(part(interaction, 2)));
}

async function staffOnly(interaction) {
	if (isStaff(interaction.member)) {
		return false;
	}
	await interaction.reply({ content: "Only staff can do that.", flags: EPHEMERAL });
	return true;
}

async function openButton(interaction, ctx) {
	const type = part(interaction, 2);
	if (!config.TicketTypes[type]) {
		return;
	}
	if (type === "appeal" && !ctx.links.get(interaction.user.id)) {
		await interaction.reply({
			content: "Link your Roblox account first, so staff can find your death and restore you.",
			components: [
				new ActionRowBuilder().addComponents(
					new ButtonBuilder().setCustomId("verify:start").setLabel("Verify").setStyle(ButtonStyle.Secondary)
				),
			],
			flags: EPHEMERAL,
		});
		return;
	}
	const banned = ctx.bans.active(interaction.user.id);
	if (type === "ban" && !banned) {
		await interaction.reply({ content: "You're not banned, so there's nothing to appeal.", flags: EPHEMERAL });
		return;
	}
	if (type !== "ban" && banned) {
		await interaction.reply({ content: "You're banned. Use **Appeal ban** instead.", flags: EPHEMERAL });
		return;
	}
	const existing = ctx.tickets.openFor(interaction.user.id, type);
	if (existing) {
		await interaction.reply({ content: `You already have one open: <#${existing.channel_id}>`, flags: EPHEMERAL });
		return;
	}
	await interaction.showModal(ticketUi.ticketModal(type));
}

async function submit(interaction, ctx) {
	const type = part(interaction, 2);
	const info = config.TicketTypes[type];
	if (!info) {
		return;
	}
	await interaction.deferReply({ flags: EPHEMERAL });
	const existing = ctx.tickets.openFor(interaction.user.id, type);
	if (existing) {
		await interaction.editReply({ content: `You already have one open: <#${existing.channel_id}>` });
		return;
	}
	const answers = {};
	for (const question of info.Questions) {
		answers[question.Id] = interaction.fields.getTextInputValue(question.Id) || "";
	}
	const { channel } = await manager.open(ctx, interaction.guild, interaction.user, type, answers);
	await interaction.editReply({ content: `Ticket opened: <#${channel.id}>` });
}

async function claim(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const ticket = ctx.tickets.claim(Number(part(interaction, 2)), interaction.user.id);
	if (!ticket) {
		await interaction.followUp({ content: "Someone already claimed or closed this ticket.", flags: EPHEMERAL });
		return;
	}
	await interaction.editReply(manager.render(ctx, ticket));
	await interaction.followUp({ content: `<@${interaction.user.id}> claimed this ticket.`, allowedMentions: { parse: [] } });
}

async function closeButton(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	const ticket = ticketOf(interaction, ctx);
	if (!ticket || !["open", "claimed"].includes(ticket.status)) {
		await interaction.reply({ content: "This ticket is already closed.", flags: EPHEMERAL });
		return;
	}
	const admin = interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
	if (ticket.claimed_by && ticket.claimed_by !== interaction.user.id && !admin) {
		await interaction.reply({ content: `This ticket is claimed by <@${ticket.claimed_by}>.`, flags: EPHEMERAL });
		return;
	}
	await interaction.showModal(ticketUi.reasonModal(`ticket:closereason:${ticket.id}`, `Close ticket #${ticket.id}`, "Reason (sent to them, optional)"));
}

async function closeReason(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const reason = interaction.fields.getTextInputValue("reason")?.trim() || null;
	const ticket = ctx.tickets.finish(Number(part(interaction, 2)), "closed", interaction.user.id, reason);
	if (!ticket) {
		await interaction.followUp({ content: "This ticket is already closed.", flags: EPHEMERAL });
		return;
	}
	const label = config.TicketTypes[ticket.type].Label;
	await log(ctx.client, `🎫 <@${interaction.user.id}> closed ${label} #${ticket.id}`);
	await manager.finish(ctx, ticket, `Your ${label} ticket (#${ticket.id}) was closed.${manager.reasonText(reason)}`);
}

async function accept(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const ticket = ctx.tickets.finish(Number(part(interaction, 2)), "accepted", interaction.user.id);
	if (!ticket) {
		await interaction.followUp({ content: "This appeal was already decided.", flags: EPHEMERAL });
		return;
	}
	if (ticket.type === "ban") {
		await bans.unban(ctx, interaction.guild, ticket.discord_id, interaction.user.id, { notify: false });
		await manager.finish(ctx, ticket, `✅ Your ban appeal (#${ticket.id}) was **accepted**. The ban is lifted, welcome back.`);
		return;
	}
	const kia = ticket.kia_id ? ctx.operations.getKia(ticket.kia_id) : null;
	ctx.actions.queue({ robloxId: ticket.roblox_id, kind: "void", slot: kia?.slot ?? null, since: kia?.at ?? null, ticketId: ticket.id });
	await log(ctx.client, `✅ <@${interaction.user.id}> accepted death appeal #${ticket.id} from <@${ticket.discord_id}>, void queued`);
	await manager.finish(
		ctx,
		ticket,
		[
			`✅ Your death appeal (#${ticket.id}) was **accepted**. Your death has been voided.`,
			"Your character is restored as soon as you're in a Spearhead server, right away if you're already in one.",
		].join("\n")
	);
}

async function denyButton(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	const ticket = ticketOf(interaction, ctx);
	if (!ticket || ticket.status !== "open") {
		await interaction.reply({ content: "This appeal was already decided.", flags: EPHEMERAL });
		return;
	}
	await interaction.showModal(ticketUi.reasonModal(`ticket:denyreason:${ticket.id}`, `Deny appeal #${ticket.id}`, "Message to them (optional)"));
}

async function denyReason(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const reason = interaction.fields.getTextInputValue("reason")?.trim() || null;
	const ticket = ctx.tickets.finish(Number(part(interaction, 2)), "denied", interaction.user.id, reason);
	if (!ticket) {
		await interaction.followUp({ content: "This appeal was already decided.", flags: EPHEMERAL });
		return;
	}
	if (ticket.type === "ban") {
		await log(ctx.client, `❌ <@${interaction.user.id}> denied ban appeal #${ticket.id} from <@${ticket.discord_id}>`);
		await manager.finish(ctx, ticket, `❌ Your ban appeal (#${ticket.id}) was **denied**. The ban stays.${manager.reasonText(reason)}`);
		return;
	}
	await log(ctx.client, `❌ <@${interaction.user.id}> denied death appeal #${ticket.id} from <@${ticket.discord_id}>`);
	await manager.finish(ctx, ticket, `❌ Your death appeal (#${ticket.id}) was **denied**.${manager.reasonText(reason)}`);
}

module.exports = {
	"ticket:open": openButton,
	"ticket:submit": submit,
	"ticket:claim": claim,
	"ticket:close": closeButton,
	"ticket:closereason": closeReason,
	"ticket:accept": accept,
	"ticket:deny": denyButton,
	"ticket:denyreason": denyReason,
};
