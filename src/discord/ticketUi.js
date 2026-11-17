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
	appeal: { color: () => config.Colors.Appeal, author: "◤ PARA-RAID // DEATH APPEAL ◢", title: "DEATH APPEAL" },
	support: { color: () => config.Colors.Support, author: "◤ SPEARHEAD // GENERAL SUPPORT ◢", title: "SUPPORT" },
	event: { color: () => config.Colors.Event, author: "◤ SPEARHEAD // EVENT REQUEST ◢", title: "EVENT REQUEST" },
	ban: { color: () => config.Colors.Ban, author: "◤ REPUBLIC // DISCIPLINARY REVIEW ◢", title: "BAN APPEAL" },
};

// Decision buttons and result labels per ticket type
const DECIDE = {
	appeal: { accept: "Accept Void", deny: "Deny Void", accepted: "✅ VOID ACCEPTED", denied: "❌ VOID DENIED" },
	ban: { accept: "Accept Unban", deny: "Deny Unban", accepted: "✅ UNBANNED", denied: "❌ BAN UPHELD" },
};

function escapeName(name) {
	return String(name).replace(/([\\_*~|`>])/g, "\\$1");
}

function pad2(n) {
	return String(n).padStart(2, "0");
}

// The ticket panel is four separate cards, one per ticket type
const PANELS = [
	{
		type: "appeal",
		button: "Open death appeal",
		style: ButtonStyle.Danger,
		sheet: ["FILE ......... CONTEST A KIA RECORD", "OUTCOME ...... VOID / UPHELD", "REQUIRES ..... LINKED ROBLOX ACCOUNT"],
		text: "Lost your character to something unfair? Tell us what happened and bring proof. If staff void the death, your character is restored automatically.",
	},
	{
		type: "support",
		button: "Contact staff",
		style: ButtonStyle.Primary,
		sheet: ["CHANNEL ...... DIRECT LINE TO STAFF", "HANDLING ..... CLAIMED BY ONE STAFF MEMBER", "TOPICS ....... QUESTIONS, BUGS, ANYTHING"],
		text: "Questions, problems, bugs or anything else. A staff member claims your ticket and stays with you until it's sorted.",
	},
	{
		type: "event",
		button: "Request event",
		style: ButtonStyle.Secondary,
		sheet: ["SUBMIT ....... EVENT TYPE · INFO · REASONING", "REVIEW ....... BY STAFF", "STATUS ....... OPEN TO ALL PROCESSORS"],
		text: "Got an idea for an operation? Pitch it to staff with the details and why it would be good.",
	},
	{
		type: "ban",
		button: "Appeal ban",
		style: ButtonStyle.Secondary,
		sheet: ["STATUS ....... RESTRICTED ACCESS", "FILE ......... REQUEST REINSTATEMENT", "ELIGIBLE ..... BANNED MEMBERS ONLY"],
		text: "Banned from the server? Explain what happened and why the ban should be lifted.",
	},
];

function ticketPanels() {
	return PANELS.map((panel) => {
		const style = STYLE[panel.type];
		const embed = new EmbedBuilder()
			.setColor(style.color())
			.setAuthor({ name: style.author })
			.setTitle(style.title)
			.setDescription("```\n" + panel.sheet.join("\n") + "\n```" + panel.text)
			.setFooter({ text: `SPEARHEAD SQUADRON · UNANSWERED TICKETS CLOSE AFTER ${config.TicketAutoCloseDays} DAYS` });
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`ticket:open:${panel.type}`).setLabel(panel.button).setStyle(panel.style)
		);
		return { embeds: [embed], components: [row] };
	});
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
function ticketMessage(ticket, { link, kia, operation, ban } = {}) {
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
	if (ticket.type === "ban") {
		embed.addFields({
			name: "BAN ON FILE",
			value: ban
				? `By <@${ban.banned_by}> · <t:${ban.created_at}:f>\nReason: ${clip(ban.reason || "none given", 800)}`
				: "No active ban.",
		});
	}
	for (const question of info.Questions) {
		embed.addFields({ name: question.Label.toUpperCase(), value: clip(ticket.answers[question.Id] || "-", 1024) });
	}

	const done = !["open", "claimed"].includes(ticket.status);
	if (ticket.status === "claimed") {
		embed.addFields({ name: "CLAIMED BY", value: `<@${ticket.claimed_by}>` });
	}
	if (done) {
		const decide = DECIDE[ticket.type] ?? {};
		const label = { accepted: decide.accepted, denied: decide.denied, closed: "■ CLOSED", expired: "■ CLOSED AUTOMATICALLY" }[ticket.status];
		const by = ticket.closed_by ? ` by <@${ticket.closed_by}>` : "";
		embed.addFields({ name: label, value: `${by ? by.trim() : "No staff response in time"}${ticket.reason ? `\nReason: ${clip(ticket.reason, 900)}` : ""}` });
	}
	const footers = {
		appeal: "Accept Void restores the character in game automatically.",
		ban: "Accept Unban removes the Banned role.",
	};
	embed.setFooter({ text: footers[ticket.type] ?? "SPEARHEAD SQUADRON · EIGHTY-SIX" });

	const buttons = [];
	const decide = DECIDE[ticket.type];
	if (!done && decide) {
		buttons.push(
			new ButtonBuilder().setCustomId(`ticket:accept:${ticket.id}`).setLabel(decide.accept).setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId(`ticket:deny:${ticket.id}`).setLabel(decide.deny).setStyle(ButtonStyle.Danger)
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

module.exports = { ticketPanels, ticketModal, reasonModal, ticketMessage, memorial, dossier };
