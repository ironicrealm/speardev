const config = require("../config");
const ui = require("./ui");
const ticketUi = require("./ticketUi");
const { dm, log } = require("./helpers");

// Turns what happens in the game into Discord posts:
// deaths -> PD log + timeout, revives -> "link restored", alerts -> deployment post, last seen -> activity.

function text(value, max) {
	return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : null;
}

function number(value) {
	return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function idList(value) {
	return Array.isArray(value) ? value.filter((id) => Number.isInteger(id)).slice(0, 200) : [];
}

function server(body) {
	const jobId = text(body.jobId, 100);
	const placeId = number(body.placeId);
	if (!jobId || !placeId) {
		throw new Error("missing jobId / placeId");
	}
	return {
		jobId,
		placeId,
		map: text(body.map, 80) || "Unknown sector",
		players: number(body.players),
		maxPlayers: number(body.maxPlayers),
	};
}

function createGameFeed(ctx) {
	const { client, operations, links, actions, db } = ctx;
	const chains = new Map();

	// Runs updates to the same Discord message one after another, so edits never clash
	function serial(key, task) {
		const next = (chains.get(key) || Promise.resolve()).then(task, task);
		chains.set(
			key,
			next.catch(() => {})
		);
		return next;
	}

	async function channel(id) {
		return client.channels.fetch(id);
	}

	function refreshLog(operationId) {
		return serial(`op:${operationId}`, async () => {
			const operation = operations.get(operationId);
			const payload = ui.pdLog(operation, operations.kiaFor(operationId));
			const logs = await channel(config.Channels.PdLogs);
			if (operation.log_message_id) {
				const message = await logs.messages.fetch(operation.log_message_id);
				await message.edit(payload);
			} else {
				const message = await logs.send(payload);
				operations.setMessage(operationId, "log", message.id);
			}
		});
	}

	// Times them out (or lifts it with null) in every Discord server the bot is in
	async function timeoutEverywhere(robloxId, milliseconds, reason) {
		const link = links.getByRoblox(robloxId);
		if (!link) {
			return 0;
		}
		let count = 0;
		for (const guild of client.guilds.cache.values()) {
			try {
				const member = await guild.members.fetch(link.discord_id);
				await member.timeout(milliseconds, reason);
				count += 1;
			} catch {
				// not in that server, or ranked above the bot
			}
		}
		return count;
	}

	// Event over: grey out the alert (no Deploy button) and reply to it so nobody joins by mistake
	function closeAlert(operationId) {
		return serial(`alert:${operationId}`, async () => {
			const operation = operations.get(operationId);
			if (!operation?.alert_message_id) {
				return;
			}
			const alerts = await channel(config.Channels.Alerts);
			const alert = await alerts.messages.fetch(operation.alert_message_id);
			await alert.edit(ui.alertMessage(operation, null));
			const guildId = alerts.guildId ?? alerts.guild?.id;
			const logUrl =
				operation.log_message_id && guildId
					? `https://discord.com/channels/${guildId}/${config.Channels.PdLogs}/${operation.log_message_id}`
					: null;
			await alerts.send({
				...ui.linkEnded(operation, operations.kiaFor(operationId), logUrl),
				reply: { messageReference: operation.alert_message_id, failIfNotExists: false },
			});
		});
	}

	// When their service started: accepted into Spearhead, or else when they linked
	function servedSince(robloxId) {
		const accepted = db
			.prepare("SELECT decided_at FROM applications WHERE roblox_id = ? AND status = 'accepted' ORDER BY id DESC LIMIT 1")
			.get(robloxId);
		return accepted?.decided_at ?? links.getByRoblox(robloxId)?.linked_at ?? null;
	}

	async function postMemorial(kia, operation) {
		if (!config.Channels.Memorial) {
			return;
		}
		try {
			const wall = await channel(config.Channels.Memorial);
			const message = await wall.send(
				ticketUi.memorial({
					kia,
					operation,
					avatar: await ctx.roblox.getHeadshot(kia.roblox_id),
					servedSince: servedSince(kia.roblox_id),
					events: operations.eventsAttended(kia.roblox_id),
				})
			);
			operations.setMemorial(kia.id, message.id);
		} catch (error) {
			console.warn(`[Memorial] ${error.message}`);
		}
	}

	async function removeMemorial(kia) {
		if (!kia.memorial_message_id) {
			return;
		}
		try {
			const wall = await channel(config.Channels.Memorial);
			const message = await wall.messages.fetch(kia.memorial_message_id);
			await message.delete();
		} catch (error) {
			console.warn(`[Memorial] ${error.message}`);
		}
	}

	async function pingRoleId() {
		if (!config.AlertPingRole) {
			return null;
		}
		const alerts = await channel(config.Channels.Alerts);
		const role = alerts.guild?.roles.cache.find((r) => r.name === config.AlertPingRole);
		return role?.id ?? null;
	}

	return {
		async death(body) {
			const where = server(body);
			const robloxId = number(body.userId);
			if (!robloxId) {
				throw new Error("missing userId");
			}
			const operation = operations.active(where.jobId);
			if (operation) {
				operations.notePlayers(operation.id, where.players);
				operations.attend(operation.id, [robloxId]);
			}
			const kia = operations.addKia({
				operationId: operation?.id,
				robloxId,
				robloxName: text(body.name, 40) || links.getByRoblox(robloxId)?.roblox_name || String(robloxId),
				slot: text(body.slot, 30),
				cause: text(body.cause, 40),
				map: where.map,
			});
			if (operation) {
				await refreshLog(operation.id);
			} else {
				const logs = await channel(config.Channels.PdLogs);
				const message = await logs.send(ui.kiaSolo(kia));
				operations.setKiaMessage(kia.id, message.id);
			}
			const timedOut = await timeoutEverywhere(robloxId, config.DeathTimeout * 1000, "KIA");
			await postMemorial(kia, operation);
			return { event: operation?.id ?? null, timedOut };
		},

		async revive(body) {
			const robloxId = number(body.userId);
			if (!robloxId) {
				throw new Error("missing userId");
			}
			const kia = operations.restore(robloxId);
			await timeoutEverywhere(robloxId, null, "Link restored");
			if (!kia) {
				return { found: false };
			}
			await removeMemorial(kia);
			if (kia.operation_id) {
				await refreshLog(kia.operation_id);
			} else if (kia.message_id) {
				await serial(`kia:${kia.id}`, async () => {
					const logs = await channel(config.Channels.PdLogs);
					const message = await logs.messages.fetch(kia.message_id);
					await message.edit(ui.kiaSolo(kia));
				});
			}
			return { found: true };
		},

		async alert(body) {
			const where = server(body);
			const header = text(body.header, 200);
			if (!header) {
				throw new Error("missing header");
			}
			const { operation, previous } = operations.start({
				...where,
				header,
				message: text(body.message, 1500) || "",
				handler: text(body.handler, 40),
			});
			operations.attend(operation.id, idList(body.userIds));
			if (previous) {
				await refreshLog(previous.id);
				await closeAlert(previous.id);
			}
			const alerts = await channel(config.Channels.Alerts);
			const message = await alerts.send(ui.alertMessage(operation, await pingRoleId()));
			operations.setMessage(operation.id, "alert", message.id);
			await refreshLog(operation.id);
			return { event: operation.id };
		},

		async "event-end"(body) {
			const where = server(body);
			const running = operations.active(where.jobId);
			if (running) {
				operations.attend(running.id, idList(body.userIds));
			}
			const operation = operations.end(where.jobId);
			if (!operation) {
				return { ended: false };
			}
			await refreshLog(operation.id);
			await closeAlert(operation.id);
			return { ended: true, event: operation.id };
		},

		async seen(body) {
			const robloxId = number(body.userId);
			if (!robloxId) {
				throw new Error("missing userId");
			}
			operations.seen(robloxId);
			const jobId = text(body.jobId, 100);
			const operation = jobId ? operations.active(jobId) : null;
			if (operation) {
				operations.notePlayers(operation.id, number(body.players));
				operations.attend(operation.id, [robloxId]);
			}
			return {};
		},

		// Game servers ask every few seconds: anything to do for my players?
		async poll(body) {
			const pending = actions.pendingFor(idList(body.userIds));
			return { actions: pending.map((a) => ({ id: a.id, userId: a.roblox_id, kind: a.kind, slot: a.slot, since: a.since })) };
		},

		// Game reports an action as done
		async ack(body) {
			const id = number(body.id);
			if (!id) {
				throw new Error("missing id");
			}
			const action = actions.finish(id, text(body.result, 200));
			if (!action) {
				return { duplicate: true };
			}
			const link = links.getByRoblox(action.roblox_id);
			const ok = body.ok === true;
			if (action.kind === "void" && link) {
				await dm(
					client,
					link.discord_id,
					ok ? "✅ Your death was voided in game. Your character is back." : "Staff voided your death, but the game couldn't restore your character. Staff have been told."
				);
			}
			await log(
				client,
				`${ok ? "🛡️" : "⚠️"} ${action.kind} for **${link?.roblox_name ?? action.roblox_id}**${action.ticket_id ? ` (appeal #${action.ticket_id})` : ""}: ${text(body.result, 200) ?? (ok ? "done" : "failed")}`
			);
			return {};
		},
	};
}

module.exports = { createGameFeed };
