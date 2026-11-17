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

module.exports = { panel, verifyModal, verifyInstructions, applyModal, reviewMessage, denyModal, profileLink, clip };
