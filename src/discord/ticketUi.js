const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require("discord.js");
const config = require("../config");
const { clip, profileLink } = require("./ui");

// Tickets, memorial wall and dossier: how they look.

const STYLE = {
	appeal: { color: () => config.Colors.Appeal, author: "◤ PARA-RAID // DEATH APPEAL ◢", title: "APPEAL" },
	support: { color: () => config.Colors.Support, author: "◤ SPEARHEAD // GENERAL SUPPORT ◢", title: "SUPPORT" },
	event: { color: () => config.Colors.Event, author: "◤ SPEARHEAD // EVENT REQUEST ◢", title: "EVENT REQUEST" },
};

function escapeName(name) {
	return String(name).replace(/([\\_*~|`>])/g, "\\$1");
}

function pad2(n) {
	return String(n).padStart(2, "0");
}

function ticketPanel() {
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Main)
		.setAuthor({ name: "◤ SPEARHEAD // SUPPORT ◢" })
		.setTitle("Open a ticket")
		.setDescription(
			[
				"**Death Appeal**: you think your death was unfair. Staff can void it and restore your character.",
				"**General Support**: questions, problems, anything else.",
				"**Event Request**: pitch an event to staff.",
				"",
				`Tickets nobody has picked up within ${config.TicketAutoCloseDays} days close by themselves.`,
			].join("\n")
		);
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("ticket:open:appeal").setLabel("Death Appeal").setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId("ticket:open:support").setLabel("General Support").setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId("ticket:open:event").setLabel("Event Request").setStyle(ButtonStyle.Secondary)
	);
	return { embeds: [embed], components: [row] };
}

function ticketModal(type) {
	const info = config.TicketTypes[type];
	const modal = new ModalBuilder().setCustomId(`ticket:submit:${type}`).setTitle(info.Label);
	for (const question of info.Questions) {
		modal.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId(question.Id)
					.setLabel(clip(question.Label, 45))
					.setStyle(question.Style === "Paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
					.setMaxLength(question.Max)
					.setRequired(!question.Optional)
			)
		);
	}
	return modal;
}

function reasonModal(customId, title, label) {
	return new ModalBuilder()
		.setCustomId(customId)
		.setTitle(clip(title, 45))
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId("reason")
					.setLabel(clip(label, 45))
					.setStyle(TextInputStyle.Paragraph)
					.setMaxLength(800)
					.setRequired(false)
			)
		);
}

function deathLine(kia, operation) {
	if (!kia) {
		return "No recorded death in the last 7 days.";
	}
	const where = clip(kia.map || "Unknown sector", 60);
	const event = operation ? ` · Event ${pad2(operation.id)}` : " · no event";
	return `**${where}**${event}\n${clip(kia.cause || "unknown", 40)} · <t:${kia.at}:f> (<t:${kia.at}:R>)`;
}

// The first message in a ticket channel. Changes as the ticket is claimed or decided.
function ticketMessage(ticket, { link, kia, operation } = {}) {
	const style = STYLE[ticket.type];
	const info = config.TicketTypes[ticket.type];
	const embed = new EmbedBuilder()
		.setColor(style.color())
		.setAuthor({ name: style.author })
		.setTitle(`${style.title} #${pad2(ticket.id)}`)
		.addFields({
			name: "FROM",
			value: link
				? `<@${ticket.discord_id}> · [${escapeName(link.roblox_name)}](${profileLink(link.roblox_id)})`
				: `<@${ticket.discord_id}>`,
		})
		.setTimestamp(ticket.created_at * 1000);

	if (ticket.type === "appeal") {
		embed.addFields({ name: "DEATH", value: deathLine(kia, operation) });
	}
	for (const question of info.Questions) {
		embed.addFields({ name: question.Label.toUpperCase(), value: clip(ticket.answers[question.Id] || "-", 1024) });
	}

	const done = !["open", "claimed"].includes(ticket.status);
	if (ticket.status === "claimed") {
		embed.addFields({ name: "CLAIMED BY", value: `<@${ticket.claimed_by}>` });
	}
	if (done) {
		const label = { accepted: "✅ VOID ACCEPTED", denied: "❌ VOID DENIED", closed: "■ CLOSED", expired: "■ CLOSED AUTOMATICALLY" }[ticket.status];
		const by = ticket.closed_by ? ` by <@${ticket.closed_by}>` : "";
		embed.addFields({ name: label, value: `${by ? by.trim() : "No staff response in time"}${ticket.reason ? `\nReason: ${clip(ticket.reason, 900)}` : ""}` });
	}
	embed.setFooter({
		text: ticket.type === "appeal" ? "Accept Void restores the character in game automatically." : "SPEARHEAD SQUADRON · EIGHTY-SIX",
	});

	const buttons = [];
	if (!done && ticket.type === "appeal") {
		buttons.push(
			new ButtonBuilder().setCustomId(`ticket:accept:${ticket.id}`).setLabel("Accept Void").setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId(`ticket:deny:${ticket.id}`).setLabel("Deny Void").setStyle(ButtonStyle.Danger)
		);
	} else if (!done) {
		if (ticket.status === "open") {
			buttons.push(new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel("Claim").setStyle(ButtonStyle.Primary));
		}
		buttons.push(new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel("Close").setStyle(ButtonStyle.Secondary));
	}
	return {
		content: done ? "" : `<@${ticket.discord_id}>`,
		embeds: [embed],
		components: buttons.length > 0 ? [new ActionRowBuilder().addComponents(...buttons)] : [],
		allowedMentions: { users: done ? [] : [ticket.discord_id] },
	};
}

function memorial({ kia, operation, avatar, servedSince, events }) {
	const where = clip(kia.map || "an unknown sector", 60);
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Memorial)
		.setAuthor({ name: "86TH SECTOR // MEMORIAL" })
		.setTitle(escapeName(kia.roblox_name))
		.setURL(profileLink(kia.roblox_id))
		.setDescription(operation ? `Fell at **${where}** during Event ${pad2(operation.id)}.` : `Fell at **${where}**.`)
		.addFields(
			{ name: "SERVED", value: servedSince ? `<t:${servedSince}:D> to <t:${kia.at}:D>` : `Until <t:${kia.at}:D>`, inline: true },
			{ name: "EVENTS", value: String(events), inline: true },
			{ name: "CAUSE", value: clip(kia.cause || "unknown", 40), inline: true }
		)
		.setFooter({ text: "THEIR NAME IS CARRIED FORWARD" })
		.setTimestamp(kia.at * 1000);
	if (avatar) {
		embed.setThumbnail(avatar);
	}
	return { embeds: [embed], allowedMentions: { parse: [] } };
}

function dossier({ link, accepted, wave, avatar, events, lastSeen, deaths }) {
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Main)
		.setAuthor({ name: "◤ PARA-RAID // PROCESSOR DOSSIER ◢" })
		.setTitle(escapeName(link.roblox_name))
		.setURL(profileLink(link.roblox_id))
		.addFields(
			{ name: "DISCORD", value: `<@${link.discord_id}>`, inline: true },
			{ name: "ENLISTED", value: accepted ? `<t:${accepted}:D>${wave ? ` · ${clip(wave, 30)}` : ""}` : "Not enlisted", inline: true },
			{ name: "LINKED", value: `<t:${link.linked_at}:D>`, inline: true },
			{ name: "EVENTS ATTENDED", value: String(events), inline: true },
			{ name: "LAST IN THE FIELD", value: lastSeen ? `<t:${lastSeen}:R>` : "Never", inline: true },
			{ name: "KIA · VOIDED", value: `${deaths.lost} · ${deaths.voided}`, inline: true }
		)
		.setFooter({ text: "SPEARHEAD SQUADRON · EIGHTY-SIX" });
	if (avatar) {
		embed.setThumbnail(avatar);
	}
	return { embeds: [embed], allowedMentions: { parse: [] } };
}

module.exports = { ticketPanel, ticketModal, reasonModal, ticketMessage, memorial, dossier };
