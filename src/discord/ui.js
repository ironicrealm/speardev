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

// Everything the bot shows: panels, forms, embeds and buttons.

function profileLink(robloxId) {
	return `https://www.roblox.com/users/${robloxId}/profile`;
}

function clip(text, max) {
	text = String(text ?? "").trim() || "-";
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function panel(wave) {
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Main)
		.setTitle("Spearhead — Applications")
		.setDescription(
			[
				"**1.** Press **Verify** and link your Roblox account.",
				"**2.** Press **Apply** while a wave is open.",
				`**3.** If you're accepted, request to join the [Roblox group](${config.Group.Link}). The bot lets you in automatically.`,
			].join("\n")
		)
		.addFields({ name: "Current wave", value: wave ? `🟢 **${wave.name}** is open` : "🔴 Applications are closed" });
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("verify:start").setLabel("Verify").setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId("apply:start").setLabel("Apply").setStyle(ButtonStyle.Primary).setDisabled(!wave)
	);
	return { embeds: [embed], components: [row] };
}

function verifyModal() {
	return new ModalBuilder()
		.setCustomId("verify:username")
		.setTitle("Link your Roblox account")
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId("username")
					.setLabel("Roblox username")
					.setStyle(TextInputStyle.Short)
					.setMinLength(3)
					.setMaxLength(20)
					.setRequired(true)
			)
		);
}

function verifyInstructions(user, code) {
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Pending)
		.setTitle(`Verify ${user.name}`)
		.setDescription(
			[
				"Put this code in your Roblox profile **About** section and save:",
				`\`\`\`${code}\`\`\``,
				`Then press **Check**. You can remove it afterwards. The code works for ${config.VerifyCodeMinutes} minutes.`,
				`[Open your profile](${profileLink(user.id)})`,
			].join("\n")
		);
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("verify:check").setLabel("Check").setStyle(ButtonStyle.Success)
	);
	return { embeds: [embed], components: [row] };
}

function applyModal(waveName) {
	const modal = new ModalBuilder().setCustomId("apply:submit").setTitle(clip(`Spearhead — ${waveName}`, 45));
	for (const question of config.Questions) {
		modal.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId(question.Id)
					.setLabel(clip(question.Label, 45))
					.setStyle(question.Style === "Paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
					.setMaxLength(question.Max)
					.setRequired(true)
			)
		);
	}
	return modal;
}

function reviewMessage(app, wave, decision) {
	const created = app.roblox_created ? `<t:${app.roblox_created}:D> (<t:${app.roblox_created}:R>)` : "unknown";
	const embed = new EmbedBuilder()
		.setTitle(`Application #${app.id} — ${wave?.name ?? "Wave"}`)
		.addFields(
			{ name: "Discord", value: `<@${app.discord_id}>`, inline: true },
			{ name: "Roblox", value: `[${app.roblox_name}](${profileLink(app.roblox_id)})`, inline: true },
			{ name: "Account created", value: created, inline: true }
		)
		.setTimestamp(app.created_at * 1000);
	for (const question of config.Questions) {
		embed.addFields({ name: question.Label, value: clip(app.answers[question.Id], 1024) });
	}

	if (app.status === "pending") {
		embed.setColor(config.Colors.Pending).setFooter({ text: "Waiting for review" });
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`review:accept:${app.id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId(`review:deny:${app.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
		);
		return { embeds: [embed], components: [row] };
	}

	const accepted = app.status === "accepted";
	embed.setColor(accepted ? config.Colors.Accepted : config.Colors.Denied);
	embed.addFields({
		name: accepted ? "✅ Accepted" : "❌ Denied",
		value: `by <@${app.reviewer_id}>${app.reason ? `\nReason: ${clip(app.reason, 900)}` : ""}`,
	});
	if (decision) {
		embed.setFooter({ text: decision });
	}
	return { embeds: [embed], components: [] };
}

function denyModal(appId) {
	return new ModalBuilder()
		.setCustomId(`review:denyreason:${appId}`)
		.setTitle(`Deny application #${appId}`)
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId("reason")
					.setLabel("Reason (sent to them, optional)")
					.setStyle(TextInputStyle.Paragraph)
					.setMaxLength(500)
					.setRequired(false)
			)
		);
}

// ---- PD logs and deployment alerts (86 / Para-RAID look) ----

const FOOTER = "REPUBLIC OF SAN MAGNOLIA · EASTERN FRONT · 86TH SECTOR";

// Text from the game is cleaned so it can't break the code blocks or markdown
function plain(text, max) {
	return clip(String(text ?? "").replace(/[`\u001b]/g, ""), max);
}

function escapeName(name) {
	return String(name).replace(/([\\_*~|`>])/g, "\\$1");
}

function pad2(n) {
	return String(n).padStart(2, "0");
}

function duration(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function tidesHeader(map) {
	return "```ansi\n\u001b[1;31mTHE WORLD CHANGES ITS TIDES AT " + plain(map, 80).toUpperCase() + "\u001b[0m\n```";
}

function kiaLine(kia, index) {
	const name = escapeName(kia.roblox_name);
	if (kia.restored) {
		return `\`${pad2(index)}\` ~~${name}~~ · link restored`;
	}
	return `\`${pad2(index)}\` **${name}** · ${plain(kia.cause || "unknown", 40)} · <t:${kia.at}:t>`;
}

function kiaList(kias) {
	const lines = [];
	let length = 0;
	for (let i = 0; i < kias.length; i++) {
		const line = kiaLine(kias[i], i + 1);
		if (length + line.length + 30 > 1024) {
			lines.push(`*+${kias.length - i} more*`);
			break;
		}
		lines.push(line);
		length += line.length + 1;
	}
	return lines.join("\n") || "No losses.";
}

function pdLog(operation, kias) {
	const lost = kias.filter((kia) => !kia.restored).length;
	const deployed = Math.max(operation.deployed || 0, kias.length);
	const rate = deployed > 0 ? Math.max(0, (deployed - lost) / deployed) : 1;
	const filled = Math.round(rate * 10);
	const ended = operation.ended_at != null;

	const sheet = [
		`SECTOR ........ ${plain(operation.map, 40).toUpperCase()}`,
		`STATUS ........ ${ended ? "CONCLUDED ■" : "ENGAGED ●"}`,
		`DEPLOYED ...... ${deployed} PROCESSOR${deployed === 1 ? "" : "S"}`,
	].join("\n");
	const timing = ended
		? `Started <t:${operation.started_at}:t> · Duration ${duration(operation.ended_at - operation.started_at)}`
		: `Started <t:${operation.started_at}:R>`;

	const embed = new EmbedBuilder()
		.setColor(ended ? config.Colors.Concluded : config.Colors.Kia)
		.setAuthor({ name: "SPEARHEAD SQUADRON // PARA-RAID LOG" })
		.setTitle(`EVENT ${pad2(operation.id)}`)
		.setDescription("```\n" + sheet + "\n```" + timing)
		.addFields(
			{ name: `KIA ▸ ${lost}`, value: kiaList(kias) },
			{ name: "SURVIVAL RATE", value: `\`${"▰".repeat(filled)}${"▱".repeat(10 - filled)}\` ${Math.round(rate * 100)}%` }
		)
		.setFooter({ text: FOOTER })
		.setTimestamp(operation.started_at * 1000);
	return { content: tidesHeader(operation.map), embeds: [embed], allowedMentions: { parse: [] } };
}

// A death while no event is running
function kiaSolo(kia) {
	const embed = new EmbedBuilder()
		.setColor(kia.restored ? config.Colors.Concluded : config.Colors.Kia)
		.setAuthor({ name: "SPEARHEAD SQUADRON // PARA-RAID LOG" })
		.setTitle("UNSCHEDULED")
		.setDescription("```\n" + `SECTOR ........ ${plain(kia.map || "UNKNOWN", 40).toUpperCase()}\nSTATUS ........ NO ACTIVE OPERATION` + "\n```")
		.addFields({ name: "KIA", value: kiaLine(kia, 1) })
		.setFooter({ text: FOOTER })
		.setTimestamp(kia.at * 1000);
	// no "tides" header here, that's only for events
	return { embeds: [embed], allowedMentions: { parse: [] } };
}

function joinLink(operation) {
	return `https://www.roblox.com/games/start?placeId=${operation.place_id}&gameInstanceId=${encodeURIComponent(operation.job_id)}`;
}

function alertMessage(operation, pingRoleId) {
	const ended = operation.ended_at != null;
	const players = operation.max_players ? `${operation.deployed} / ${operation.max_players}` : `${operation.deployed}`;
	const embed = new EmbedBuilder()
		.setColor(ended ? config.Colors.Concluded : config.Colors.Alert)
		.setAuthor({ name: ended ? "◤ PARA-RAID // TRANSMISSION CLOSED ◢" : "◤ PARA-RAID // PRIORITY TRANSMISSION ◢" })
		.setTitle(plain(operation.header, 256))
		.setDescription(plain(operation.message, 2000))
		.addFields(
			{ name: "SECTOR", value: plain(operation.map, 100), inline: true },
			{ name: "IN SECTOR", value: players, inline: true },
			{ name: "TIME", value: `<t:${operation.started_at}:t> · <t:${operation.started_at}:R>`, inline: true },
			{ name: "HANDLER", value: `${escapeName(operation.handler || "Unknown")} · Event ${pad2(operation.id)}` }
		)
		.setFooter({ text: "SPEARHEAD SQUADRON · EIGHTY-SIX" })
		.setTimestamp(operation.started_at * 1000);
	if (ended) {
		embed.addFields({ name: "STATUS", value: `■ CONNECTION ENDED <t:${operation.ended_at}:R>. Do not deploy.` });
		return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
	}
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setLabel("Deploy").setStyle(ButtonStyle.Link).setURL(joinLink(operation))
	);
	return {
		content: pingRoleId ? `<@&${pingRoleId}>` : "",
		embeds: [embed],
		components: [row],
		allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
	};
}

// Posted as a reply to the alert when the event ends
function linkEnded(operation, kias, logUrl) {
	const lost = kias.filter((kia) => !kia.restored).length;
	const deployed = Math.max(operation.deployed || 0, kias.length);
	const rate = deployed > 0 ? Math.round((Math.max(0, deployed - lost) / deployed) * 100) : 100;
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Kia)
		.setAuthor({ name: "◤ PARA-RAID // LINK TERMINATED ◢" })
		.setTitle("PARA-RAID CONNECTION ENDED")
		.setDescription(
			[
				"```ansi",
				`\u001b[1;31m■ SYNCHRONISATION LOST — EVENT ${pad2(operation.id)} IS OVER\u001b[0m`,
				"```",
				`Operations in **${plain(operation.map, 80)}** have concluded. **Do not deploy.**`,
				"Return to base and stand by for the next transmission.",
			].join("\n")
		)
		.addFields(
			{ name: "DURATION", value: duration((operation.ended_at ?? operation.started_at) - operation.started_at), inline: true },
			{ name: "KIA", value: String(lost), inline: true },
			{ name: "SURVIVAL", value: `${rate}%`, inline: true }
		)
		.setFooter({ text: "SPEARHEAD SQUADRON · EIGHTY-SIX" })
		.setTimestamp((operation.ended_at ?? operation.started_at) * 1000);
	if (logUrl) {
		embed.addFields({ name: "REPORT", value: `[Open the PD log](${logUrl})` });
	}
	return { embeds: [embed], allowedMentions: { parse: [] } };
}

module.exports = {
	panel,
	verifyModal,
	verifyInstructions,
	applyModal,
	reviewMessage,
	denyModal,
	profileLink,
	clip,
	pdLog,
	kiaSolo,
	alertMessage,
	linkEnded,
	tidesHeader,
};
