require("dotenv").config();

const http = require("http");
const { answerRequest } = require("./lib/intentEngine");
const { getKnowledgeSummary } = require("./lib/knowledgeRepository");
const { createRateLimiter } = require("./lib/rateLimit");
const {
  createSession,
  deleteSession,
  ensureSessionSchema,
  getSessionWithMessages,
  listSessions,
  persistTurn,
} = require("./lib/sessionRepository");

const port = Number(process.env.PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN || "*";
const askLimiter = createRateLimiter({
  windowMs: Number(process.env.ASK_RATE_WINDOW_MS ?? 60_000),
  max: Number(process.env.ASK_RATE_MAX ?? 20),
});
const httpLimiter = createRateLimiter({
  windowMs: Number(process.env.HTTP_RATE_WINDOW_MS ?? 60_000),
  max: Number(process.env.HTTP_RATE_MAX ?? 60),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    ...corsHeaders(),
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseUrl(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  return {
    pathname: url.pathname.replace(/\/+$/, "") || "/",
    searchParams: url.searchParams,
  };
}

function readDeviceId(body, searchParams) {
  const value = body?.deviceId ?? searchParams?.get("deviceId");
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "unknown";
}

function isAuthorized(request) {
  const expected = process.env.NAGRIKAI_API_KEY;
  if (!expected) {
    return true;
  }
  return request.headers["x-api-key"] === expected;
}

function publicResult(result) {
  const { redactedUserText, ...visible } = result;
  return visible;
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (!httpLimiter.allow(clientIp(request))) {
      sendJson(response, 429, { error: "Too many requests." });
      return;
    }

    const { pathname, searchParams } = parseUrl(request);

    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname.startsWith("/api/") && !isAuthorized(request)) {
      sendJson(response, 401, { error: "Unauthorized." });
      return;
    }

    if (request.method === "GET" && pathname === "/api/knowledge") {
      sendJson(response, 200, await getKnowledgeSummary());
      return;
    }

    if (request.method === "GET" && pathname === "/api/sessions") {
      const deviceId = readDeviceId(null, searchParams);
      if (!deviceId) {
        sendJson(response, 400, { error: "deviceId is required." });
        return;
      }

      sendJson(response, 200, { sessions: await listSessions(deviceId) });
      return;
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);

      if (request.method === "GET") {
        const deviceId = readDeviceId(null, searchParams);
        if (!deviceId) {
          sendJson(response, 400, { error: "deviceId is required." });
          return;
        }

        const payload = await getSessionWithMessages(sessionId, deviceId);
        if (!payload) {
          sendJson(response, 404, { error: "Session not found." });
          return;
        }

        sendJson(response, 200, payload);
        return;
      }

      if (request.method === "DELETE") {
        const body = await readJson(request).catch(() => ({}));
        const deviceId = readDeviceId(body, searchParams);
        if (!deviceId) {
          sendJson(response, 400, { error: "deviceId is required." });
          return;
        }

        const deleted = await deleteSession(sessionId);
        sendJson(response, deleted ? 200 : 404, deleted ? { ok: true } : { error: "Session not found." });
        return;
      }
    }

    if (request.method === "POST" && pathname === "/api/sessions") {
      const body = await readJson(request);
      const deviceId = readDeviceId(body);
      const language = body.language === "en-US" ? "en-US" : "ne-NP";

      if (!deviceId) {
        sendJson(response, 400, { error: "deviceId is required." });
        return;
      }

      sendJson(response, 201, {
        session: await createSession({ deviceId, language }),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/ask") {
      const body = await readJson(request);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const language = body.language === "en-US" ? "en-US" : "ne-NP";
      const deviceId = readDeviceId(body);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const rateKey = `${clientIp(request)}:${deviceId || "anon"}`;

      if (!askLimiter.allow(rateKey)) {
        sendJson(response, 429, { error: "Too many requests." });
        return;
      }

      if (text.length < 3) {
        sendJson(response, 400, { error: "Text is required." });
        return;
      }

      if (text.length > 4000) {
        sendJson(response, 400, { error: "Text is too long." });
        return;
      }

      const result = await answerRequest({ text, language });
      const persisted = await persistTurn({
        deviceId,
        sessionId,
        language,
        userText: result.redactedUserText,
        result: publicResult(result),
      });

      sendJson(response, 200, {
        ...publicResult(result),
        session: persisted.session,
        startedNewSession: persisted.startedNewSession,
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch {
    sendJson(response, 500, {
      error: "Internal server error",
    });
  }
});

ensureSessionSchema()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`NagrikAI server listening on port ${port}`);
    });
  })
  .catch(() => {
    console.error("Failed to initialize session tables.");
    process.exit(1);
  });
