const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const config = require("../config");
const { clip } = require("./ui");

// Roll calls, removal reviews and leave of absence cards.

function pad2(n) {
	return String(n).padStart(2, "0");
}

function rollCall(check, responded, pingRoleId) {
	const open = check.status === "open";
	const embed = new EmbedBuilder()
		.setColor(open ? config.Colors.RollCall : config.Colors.Concluded)
		.setAuthor({ name: "◤ PARA-RAID // ROLL CALL ◢" })
		.setTitle(`ACTIVITY CHECK ${pad2(check.id)}`)
		.setDescription(
			[
				"```",
				`STATUS ....... ${open ? "OPEN ●" : "CLOSED ■"}`,
				`REPORTED ..... ${responded} PROCESSOR${responded === 1 ? "" : "S"}`,
				"```",
				check.note ? `${clip(check.note, 1500)}\n` : "",
				open
					? `All Processors report in before <t:${check.ends_at}:f> (<t:${check.ends_at}:R>). Anyone who doesn't may be moved to Inactive.`
					: `Roll call closed <t:${check.ends_at}:R>.`,
				"On leave? You're excused.",
			]
				.filter(Boolean)
				.join("\n")
		)
		.setFooter({ text: "SPEARHEAD SQUADRON · EIGHTY-SIX" })
		.setTimestamp(check.created_at * 1000);
	const components = open
		? [
				new ActionRowBuilder().addComponents(
					new ButtonBuilder().setCustomId(`activity:report:${check.id}`).setLabel("Report in").setStyle(ButtonStyle.Success)
				),
			]
		: [];
	return {
		content: open && pingRoleId ? `<@&${pingRoleId}>` : "",
		embeds: [embed],
		components,
		allowedMentions: { roles: open && pingRoleId ? [pingRoleId] : [] },
	};
}

// Staff confirm or cancel removals after a roll call
function removalReview(check, missing, result) {
	const list = missing.map((m) => `<@${m.discordId}>${m.robloxName ? ` · ${m.robloxName}` : ""}`);
	let shown = "";
	for (let i = 0; i < list.length; i++) {
		if (shown.length + list[i].length > 3500) {
			shown += `\n*+${list.length - i} more*`;
			break;
		}
		shown += `${shown ? "\n" : ""}${list[i]}`;
	}
	const embed = new EmbedBuilder()
		.setColor(result ? config.Colors.Concluded : config.Colors.Pending)
		.setAuthor({ name: "◤ PARA-RAID // ROLL CALL REVIEW ◢" })
		.setTitle(`ACTIVITY CHECK ${pad2(check.id)} · ${missing.length} DID NOT REPORT`)
		.setDescription(shown || "Everyone reported in.")
		.setFooter({
			text: result ?? "Confirm moves them to Inactive and removes their Waved role. Staff and people on leave are already left out.",
		});
	const components =
		!result && missing.length > 0
			? [
					new ActionRowBuilder().addComponents(
						new ButtonBuilder().setCustomId(`activity:confirm:${check.id}`).setLabel("Confirm removals").setStyle(ButtonStyle.Danger),
						new ButtonBuilder().setCustomId(`activity:cancel:${check.id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
					),
				]
			: [];
	return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function loaCard(loa, robloxName) {
	const labels = {
		pending: "Waiting for staff",
		approved: `✅ Approved by <@${loa.reviewer_id}> · until <t:${loa.ends_at}:f>`,
		denied: `❌ Denied by <@${loa.reviewer_id}>${loa.deny_reason ? `\nReason: ${clip(loa.deny_reason, 800)}` : ""}`,
		ended: `■ Ended <t:${loa.ends_at}:R>`,
	};
	const embed = new EmbedBuilder()
		.setColor(loa.status === "pending" ? config.Colors.Loa : loa.status === "denied" ? config.Colors.Denied : config.Colors.Concluded)
		.setAuthor({ name: "◤ SPEARHEAD // LEAVE OF ABSENCE ◢" })
		.setTitle(`LOA REQUEST ${pad2(loa.id)}`)
		.addFields(
			{ name: "PROCESSOR", value: `<@${loa.discord_id}>${robloxName ? ` · ${robloxName}` : ""}`, inline: true },
			{ name: "DURATION", value: `${loa.days} day${loa.days === 1 ? "" : "s"}`, inline: true },
			{ name: "REASON", value: clip(loa.reason || "-", 1024) },
			{ name: "STATUS", value: labels[loa.status] }
		)
		.setFooter({ text: "While on leave they're skipped by activity checks and the 7-day rule." })
		.setTimestamp(loa.created_at * 1000);
	const components =
		loa.status === "pending"
			? [
					new ActionRowBuilder().addComponents(
						new ButtonBuilder().setCustomId(`loa:approve:${loa.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
						new ButtonBuilder().setCustomId(`loa:deny:${loa.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
					),
				]
			: [];
	return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function loaDenyModal(id) {
	return new ModalBuilder()
		.setCustomId(`loa:denyreason:${id}`)
		.setTitle(`Deny LOA ${pad2(id)}`)
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId("reason")
					.setLabel("Reason (sent to them, optional)")
					.setStyle(TextInputStyle.Paragraph)
					.setMaxLength(800)
					.setRequired(false)
			)
		);
}

module.exports = { rollCall, removalReview, loaCard, loaDenyModal };
