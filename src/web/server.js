const http = require("node:http");
const crypto = require("node:crypto");

// The door the game knocks on. Every request must carry the shared secret.
// POST /game/<event> with a JSON body. The web server (Caddy/nginx) adds HTTPS in front of this.
const MAX_BODY = 64 * 1024;

function sameSecret(given, expected) {
	if (typeof given !== "string" || !expected) {
		return false;
	}
	const a = crypto.createHash("sha256").update(given).digest();
	const b = crypto.createHash("sha256").update(expected).digest();
	return crypto.timingSafeEqual(a, b);
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(new Error("too large"));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}

function createServer({ secret, handlers, log = console }) {
	return http.createServer(async (request, response) => {
		const reply = (status, body) => {
			response.writeHead(status, { "Content-Type": "application/json" });
			response.end(JSON.stringify(body));
		};

		if (request.method === "GET" && request.url === "/health") {
			reply(200, { ok: true });
			return;
		}
		const match = request.method === "POST" && request.url.match(/^\/game\/([a-z-]+)$/);
		if (!match) {
			reply(404, { ok: false });
			return;
		}
		if (!sameSecret(request.headers["x-spear-key"], secret)) {
			reply(401, { ok: false });
			return;
		}
		const handler = handlers[match[1]];
		if (!handler) {
			reply(404, { ok: false, error: "unknown event" });
			return;
		}

		let body;
		try {
			body = JSON.parse((await readBody(request)) || "{}");
		} catch {
			reply(400, { ok: false, error: "bad json" });
			return;
		}
		try {
			const result = await handler(body);
			reply(200, { ok: true, ...(result || {}) });
		} catch (error) {
			log.error(`[Game] ${match[1]} failed:`, error);
			reply(500, { ok: false });
		}
	});
}

module.exports = { createServer, sameSecret };
