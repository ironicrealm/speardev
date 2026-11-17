const config = require("../config");
const ui = require("../discord/ui");
const { EPHEMERAL, isStaff, dm, log } = require("../discord/helpers");

// Staff Accept / Deny buttons on applications

function appIdOf(interaction) {
	return Number(interaction.customId.split(":")[2]);
}

async function notStaff(interaction) {
	if (isStaff(interaction.member)) {
		return false;
	}
	await interaction.reply({ content: "Only staff can review applications.", flags: EPHEMERAL });
	return true;
}

async function alreadyDone(interaction, ctx, app) {
	const wave = app ? ctx.waves.get(app.wave_id) : null;
	if (app && interaction.message) {
		await interaction.message.edit(ui.reviewMessage(app, wave)).catch(() => {});
	}
	await interaction.followUp({ content: "Someone already reviewed this one.", flags: EPHEMERAL }).catch(() => {});
}

async function accept(interaction, ctx) {
	if (await notStaff(interaction)) {
		return;
	}
	const id = appIdOf(interaction);
	await interaction.deferUpdate();
	const app = ctx.applications.decide(id, "accepted", interaction.user.id);
	if (!app) {
		await alreadyDone(interaction, ctx, ctx.applications.get(id));
		return;
	}
	const wave = ctx.waves.get(app.wave_id);
	await interaction.editReply(ui.reviewMessage(app, wave, "Letting them into the group…"));

	await dm(
		ctx.client,
		app.discord_id,
		[
			`🎉 You've been **accepted** into Spearhead (${wave?.name ?? "this wave"})!`,
			`If you haven't already, request to join the Roblox group: ${config.Group.Link}`,
			"The bot lets you in automatically, usually within a minute.",
		].join("\n")
	);
	await log(ctx.client, `✅ <@${interaction.user.id}> accepted **${app.roblox_name}** (<@${app.discord_id}>), application #${app.id}`);

	let state = "waiting";
	try {
		state = await ctx.groupSync.process(app);
	} catch (error) {
		console.warn(`[Review] Group step for #${app.id} failed, will retry: ${error.message}`);
	}
	const note = state === "joined" ? "In the group" : "Waiting for their group join request";
	await interaction.editReply(ui.reviewMessage(app, wave, note));
}

async function deny(interaction, ctx) {
	if (await notStaff(interaction)) {
		return;
	}
	const app = ctx.applications.get(appIdOf(interaction));
	if (!app || app.status !== "pending") {
		await interaction.reply({ content: "Someone already reviewed this one.", flags: EPHEMERAL });
		return;
	}
	await interaction.showModal(ui.denyModal(app.id));
}

async function denyReason(interaction, ctx) {
	if (await notStaff(interaction)) {
		return;
	}
	const id = appIdOf(interaction);
	await interaction.deferUpdate();
	const reason = interaction.fields.getTextInputValue("reason")?.trim() || null;
	const app = ctx.applications.decide(id, "denied", interaction.user.id, reason);
	if (!app) {
		await alreadyDone(interaction, ctx, ctx.applications.get(id));
		return;
	}
	const wave = ctx.waves.get(app.wave_id);
	await interaction.editReply(ui.reviewMessage(app, wave));

	await dm(
		ctx.client,
		app.discord_id,
		[
			`Your Spearhead application (${wave?.name ?? "this wave"}) wasn't accepted this time.`,
			reason ? `Reason: ${reason}` : null,
			"You're welcome to apply again next wave.",
		]
			.filter(Boolean)
			.join("\n")
	);
	await log(ctx.client, `❌ <@${interaction.user.id}> denied **${app.roblox_name}** (<@${app.discord_id}>), application #${app.id}`);
}

module.exports = {
	"review:accept": accept,
	"review:deny": deny,
	"review:denyreason": denyReason,
};
