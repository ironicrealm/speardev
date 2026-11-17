const activityUi = require("../discord/activityUi");
const inactivity = require("../discord/inactivity");
const { EPHEMERAL, isStaff, dm, log } = require("../discord/helpers");

// Roll call button, removal review buttons, and leave of absence approve / deny

function idOf(interaction) {
	return Number(interaction.customId.split(":")[2]);
}

async function staffOnly(interaction) {
	if (isStaff(interaction.member)) {
		return false;
	}
	await interaction.reply({ content: "Only staff can do that.", flags: EPHEMERAL });
	return true;
}

async function report(interaction, ctx) {
	const check = ctx.activity.getCheck(idOf(interaction));
	if (!check || check.status !== "open") {
		await interaction.reply({ content: "This roll call is closed.", flags: EPHEMERAL });
		return;
	}
	const first = ctx.activity.respond(check.id, interaction.user.id);
	await interaction.reply({ content: first ? "✅ Reported in. Thanks, Processor." : "You already reported in.", flags: EPHEMERAL });
	if (first) {
		await inactivity.refreshRollCall(ctx, check);
	}
}

async function confirm(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const result = await inactivity.confirmRemovals(ctx, idOf(interaction), interaction.user.id);
	if (!result) {
		await interaction.followUp({ content: "This was already handled.", flags: EPHEMERAL });
		return;
	}
	await interaction.editReply(
		activityUi.removalReview(result.check, result.check.missing, `Confirmed by ${interaction.user.username}: moved to Inactive`)
	);
}

async function cancel(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const check = ctx.activity.finishCheck(idOf(interaction), "cancelled");
	if (!check) {
		await interaction.followUp({ content: "This was already handled.", flags: EPHEMERAL });
		return;
	}
	await interaction.editReply(activityUi.removalReview(check, check.missing, `Cancelled by ${interaction.user.username}: nobody removed`));
}

function robloxName(ctx, discordId) {
	return ctx.links.get(discordId)?.roblox_name ?? null;
}

async function approve(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const loa = ctx.loas.approve(idOf(interaction), interaction.user.id);
	if (!loa) {
		await interaction.followUp({ content: "This request was already decided.", flags: EPHEMERAL });
		return;
	}
	await interaction.editReply(activityUi.loaCard(loa, robloxName(ctx, loa.discord_id)));
	await dm(
		ctx.client,
		loa.discord_id,
		`✅ Your leave of absence was **approved** until <t:${loa.ends_at}:f>. Activity checks and the 7-day rule skip you until then. Back early? Use \`/loa end\`.`
	);
	await log(ctx.client, `🏖️ <@${interaction.user.id}> approved LOA ${loa.id} for <@${loa.discord_id}> (${loa.days} days)`);
}

async function deny(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	const loa = ctx.loas.get(idOf(interaction));
	if (!loa || loa.status !== "pending") {
		await interaction.reply({ content: "This request was already decided.", flags: EPHEMERAL });
		return;
	}
	await interaction.showModal(activityUi.loaDenyModal(loa.id));
}

async function denyReason(interaction, ctx) {
	if (await staffOnly(interaction)) {
		return;
	}
	await interaction.deferUpdate();
	const reason = interaction.fields.getTextInputValue("reason")?.trim() || null;
	const loa = ctx.loas.deny(idOf(interaction), interaction.user.id, reason);
	if (!loa) {
		await interaction.followUp({ content: "This request was already decided.", flags: EPHEMERAL });
		return;
	}
	await interaction.editReply(activityUi.loaCard(loa, robloxName(ctx, loa.discord_id)));
	await dm(ctx.client, loa.discord_id, `❌ Your leave of absence was **denied**.${reason ? `\nReason: ${reason}` : ""}`);
	await log(ctx.client, `🏖️ <@${interaction.user.id}> denied LOA ${loa.id} for <@${loa.discord_id}>`);
}

module.exports = {
	"activity:report": report,
	"activity:confirm": confirm,
	"activity:cancel": cancel,
	"loa:approve": approve,
	"loa:deny": deny,
	"loa:denyreason": denyReason,
};
