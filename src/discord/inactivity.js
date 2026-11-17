const config = require("../config");
const activityUi = require("./activityUi");
const { dm, isStaff, log } = require("./helpers");

// Roll calls closing, the 7-day rule, and moving people to Inactive.

async function mainGuild(ctx) {
	return ctx.client.guilds.fetch(config.GuildId).catch(() => null);
}

// Moves someone to the Inactive rank and takes their Waved role
async function removeMember(ctx, { discordId, robloxId, robloxName }, why) {
	let group = "not linked";
	if (robloxId) {
		group = await ctx.groupSync.demote(robloxId).catch((error) => `group error: ${error.message}`);
	}
	const guild = await mainGuild(ctx);
	const role = guild?.roles.cache.find((r) => r.name === config.WavedRole);
	const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
	if (role && member?.roles.cache.has(role.id)) {
		await member.roles.remove(role, why).catch(() => {});
	}
	ctx.activity.markInactive(discordId);
	await dm(
		ctx.client,
		discordId,
		[
			`You've been moved to **Inactive** in Spearhead (${why}).`,
			"You're welcome back any time: apply again in the next wave.",
		].join("\n")
	);
	return `<@${discordId}>${robloxName ? ` (${robloxName})` : ""}: ${group}`;
}

// Who is staff right now (they're never warned or removed)
async function staffIds(guild) {
	if (!guild) {
		return new Set();
	}
	const members = await guild.members.fetch().catch(() => null);
	const ids = new Set();
	for (const member of members?.values?.() ?? []) {
		if (isStaff(member)) {
			ids.add(member.id);
		}
	}
	return ids;
}

function lookups(ctx, staff) {
	return {
		lastSeen: (robloxId) => ctx.operations.lastSeen(robloxId),
		lastLoa: (discordId) => ctx.loas.lastEnded(discordId),
		onLoa: (discordId) => ctx.loas.activeFor(discordId) != null,
		skip: (discordId) => staff.has(discordId),
	};
}

// The 7-day rule. dryRun just reports who would be warned / removed.
async function runInactivity(ctx, { dryRun = false } = {}) {
	if (!dryRun && !ctx.activity.isEnabled()) {
		return { warn: [], remove: [], skipped: true };
	}
	const guild = await mainGuild(ctx);
	const { warn, remove } = ctx.activity.review(lookups(ctx, await staffIds(guild)));
	if (dryRun) {
		return { warn, remove };
	}
	const left = config.Activity.RemoveDays - config.Activity.WarnDays;
	for (const entry of warn) {
		await dm(
			ctx.client,
			entry.discord_id,
			[
				`⚠️ You haven't been in game for ${Math.floor(entry.days)} days.`,
				`Play within the next ${left} day${left === 1 ? "" : "s"} or you'll be moved to **Inactive**.`,
				"Taking a break? Ask for a leave of absence with `/loa request`.",
			].join("\n")
		);
		ctx.activity.markWarned(entry.roblox_id, entry.baseline);
	}
	const lines = [];
	for (const entry of remove) {
		lines.push(
			await removeMember(
				ctx,
				{ discordId: entry.discord_id, robloxId: entry.roblox_id, robloxName: entry.roblox_name },
				`${config.Activity.RemoveDays} days without playing`
			)
		);
	}
	if (warn.length > 0 || lines.length > 0) {
		await log(
			ctx.client,
			[`🕒 Inactivity check: ${warn.length} warned, ${lines.length} moved to Inactive`, ...lines].join("\n").slice(0, 1900)
		);
	}
	return { warn, remove };
}

// ---- roll calls ----

async function pingRoleId(guild) {
	return guild?.roles.cache.find((r) => r.name === config.WavedRole)?.id ?? null;
}

async function refreshRollCall(ctx, check) {
	try {
		const channel = await ctx.client.channels.fetch(check.channel_id);
		const message = await channel.messages.fetch(check.message_id);
		await message.edit(activityUi.rollCall(check, ctx.activity.responses(check.id).length, await pingRoleId(channel.guild)));
	} catch (error) {
		console.warn(`[Activity] Couldn't update roll call ${check.id}: ${error.message}`);
	}
}

// Ends a roll call and asks staff to confirm who goes
async function closeCheck(ctx, id) {
	const guild = await mainGuild(ctx);
	const role = guild?.roles.cache.find((r) => r.name === config.WavedRole);
	const members = guild ? await guild.members.fetch().catch(() => null) : null;
	const responded = new Set(ctx.activity.responses(id));
	const missing = [];
	for (const member of members?.values?.() ?? []) {
		if (!role || !member.roles.cache.has(role.id) || responded.has(member.id) || isStaff(member) || ctx.loas.activeFor(member.id)) {
			continue;
		}
		const link = ctx.links.get(member.id);
		missing.push({ discordId: member.id, robloxId: link?.roblox_id ?? null, robloxName: link?.roblox_name ?? null });
	}
	const check = ctx.activity.closeCheck(id, missing);
	if (!check) {
		return null;
	}
	await refreshRollCall(ctx, check);
	const review = await ctx.client.channels.fetch(config.Channels.Review);
	const message = await review.send(activityUi.removalReview(check, missing));
	ctx.activity.setCheckMessage(check.id, "review", message.id);
	return check;
}

async function closeDue(ctx) {
	for (const check of ctx.activity.dueChecks()) {
		await closeCheck(ctx, check.id).catch((error) => console.warn(`[Activity] Closing check ${check.id}: ${error.message}`));
	}
}

async function confirmRemovals(ctx, checkId, staffId) {
	const check = ctx.activity.finishCheck(checkId, "done");
	if (!check) {
		return null;
	}
	const lines = [];
	for (const entry of check.missing) {
		// skip anyone who went on leave or became staff since the roll call closed
		if (ctx.loas.activeFor(entry.discordId)) {
			lines.push(`<@${entry.discordId}>: skipped (on leave)`);
			continue;
		}
		lines.push(await removeMember(ctx, entry, `missed activity check ${check.id}`));
	}
	await log(ctx.client, [`🧹 <@${staffId}> confirmed activity check ${check.id} removals`, ...lines].join("\n").slice(0, 1900));
	return { check, lines };
}

function start(ctx) {
	const every = (minutes, task, name) => {
		const run = () => task().catch((error) => console.warn(`[${name}] ${error.message}`));
		run();
		return setInterval(run, minutes * 60 * 1000);
	};
	every(1, () => closeDue(ctx), "Activity");
	every(60, () => runInactivity(ctx), "Inactivity");
}

module.exports = { removeMember, runInactivity, closeCheck, closeDue, confirmRemovals, refreshRollCall, pingRoleId, start };
