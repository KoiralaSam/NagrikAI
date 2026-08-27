const { isAllowlistedUrl, isSocialHost } = require("./allowlist");

const robotsCache = new Map();
const lastFetchAt = new Map();

function userAgent() {
  return (
    process.env.CRAWL_USER_AGENT ||
    "NagrikAI/1.0 (Nepal government-service verifier; +https://github.com/KoiralaSam/NagrikAI)"
  );
}

function delayMs() {
  const value = Number(process.env.CRAWL_DELAY_MS || 1500);
  return Number.isFinite(value) ? Math.max(250, value) : 1500;
}

function timeoutMs() {
  const value = Number(process.env.CRAWL_TIMEOUT_MS || 20000);
  return Number.isFinite(value) ? value : 20000;
}

function looksLikeHtml(text) {
  const sample = String(text || "")
    .slice(0, 512)
    .toLowerCase();
  return sample.includes("<html") || sample.includes("<!doctype html");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(hostname) {
  const key = String(hostname || "").toLowerCase();
  const wait = delayMs();
  const last = lastFetchAt.get(key) || 0;
  const remaining = wait - (Date.now() - last);
  if (remaining > 0) {
    await sleep(remaining);
  }
  lastFetchAt.set(key, Date.now());
}

function robotsUrl(pageUrl) {
  const parsed = new URL(pageUrl);
  return `${parsed.origin}/robots.txt`;
}

function pathAllowed(robotsText, pathname) {
  if (!robotsText) {
    return true;
  }
  const lines = String(robotsText)
    .split(/\r?\n/)
    .map((line) => line.trim());
  let inStar = false;
  const disallows = [];
  const allows = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStar = value === "*";
      continue;
    }
    if (!inStar) {
      continue;
    }
    if (key === "disallow") {
      disallows.push(value);
    }
    if (key === "allow") {
      allows.push(value);
    }
  }
  const allowedByAllow = allows.some((rule) => rule && pathname.startsWith(rule));
  if (allowedByAllow) {
    return true;
  }
  return !disallows.some((rule) => rule && pathname.startsWith(rule));
}

async function loadRobots(pageUrl) {
  const origin = new URL(pageUrl).origin;
  if (robotsCache.has(origin)) {
    return robotsCache.get(origin);
  }
  try {
    await throttle(new URL(origin).hostname);
    const response = await fetch(robotsUrl(pageUrl), {
      headers: { "User-Agent": userAgent() },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const text = response.ok ? await response.text() : "";
    const robots = looksLikeHtml(text) ? "" : text;
    robotsCache.set(origin, robots);
    return robots;
  } catch {
    robotsCache.set(origin, "");
    return "";
  }
}

async function fetchPage(url, { catalog, discoveredSocial, allowSocial = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, url, reason: "invalid-url" };
  }

  const socialHost = isSocialHost(parsed.hostname);
  const allowed = socialHost
    ? allowSocial ||
      isAllowlistedUrl(url, catalog, {
        socialMustBeOfficial: true,
        discoveredSocial,
      })
    : isAllowlistedUrl(url, catalog);
  if (!allowed) {
    return { ok: false, url, reason: "not-allowlisted" };
  }

  const robots = await loadRobots(url);
  if (!pathAllowed(robots, parsed.pathname)) {
    return { ok: false, url, reason: "robots-disallow" };
  }

  await throttle(parsed.hostname);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent(),
        Accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/plain;q=0.9",
        "Accept-Language": "ne,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs()),
    });
    const finalUrl = response.url || url;
    if (!isAllowlistedUrl(finalUrl, catalog) && !isAllowlistedUrl(finalUrl, catalog, { discoveredSocial, socialMustBeOfficial: true })) {
      return {
        ok: false,
        url,
        finalUrl,
        status: response.status,
        reason: "redirect-off-allowlist",
      };
    }
    const body = await response.text();
    return {
      ok: response.ok,
      url,
      finalUrl,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      body,
      reason: response.ok ? "ok" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      reason: error instanceof Error ? error.message : "fetch-failed",
    };
  }
}

module.exports = {
  fetchPage,
  loadRobots,
  looksLikeHtml,
  pathAllowed,
  robotsCache,
  userAgent,
};
