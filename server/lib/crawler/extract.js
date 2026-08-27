const cheerio = require("cheerio");
const { hostnameOf, isOfficialEmail, isSocialHost, registrableHost } = require("./allowlist");

const SOCIAL_MAX_AGE_DAYS = Number(process.env.SOCIAL_MAX_AGE_DAYS || 90);

const SKIP_PATH =
  /login|logout|wp-admin|wp-login|cart|checkout|comment|trackback|feed\/atom/i;

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(date) {
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

function isFreshDate(date, maxAgeDays = SOCIAL_MAX_AGE_DAYS) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return false;
  }
  return daysAgo(date) <= maxAgeDays;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2})?/);
  if (iso) {
    const date = new Date(`${iso[1]}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function digitsOf(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value) {
  let digits = digitsOf(value);
  if (!digits) {
    return "";
  }
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("977")) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    return `+977${digits.slice(1)}`;
  }
  if (digits.length >= 8 && digits.length <= 10) {
    return `+977${digits}`;
  }
  return digits.length >= 8 ? `+${digits}` : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function visibleText(html) {
  const $ = cheerio.load(String(html || ""));
  $("script, style, noscript, svg, iframe").remove();
  return $("body").text().replace(/\s+/g, " ").trim() || $.root().text().replace(/\s+/g, " ").trim();
}

function contextWindow(text, index, radius = 48) {
  return String(text || "").slice(Math.max(0, index - radius), index + radius);
}

function scorePhone(normalized, context) {
  const digits = digitsOf(normalized);
  const nearby = String(context || "").toLowerCase();
  if (digits.length < 9 || digits.length > 15) {
    return -1;
  }
  let score = 0;
  if (/enquir|hotline|helpline|contact|call|phone|सम्पर्क|होटरलाइन|enquiry/.test(nearby)) {
    score += 5;
  }
  if (/^\+9771/.test(normalized) || /^01/.test(digits) || digits.startsWith("9771")) {
    score += 4;
  }
  if (/^\+9779[6-8]/.test(normalized) || /^9[6-8]/.test(digits.slice(-10))) {
    score -= 3;
  }
  if (/information officer|सूचना अधिकारी/.test(nearby)) {
    score -= 1;
  }
  return score;
}

function extractPhones(text) {
  const found = [];
  const seen = new Set();
  const source = String(text || "");
  const patterns = [
    /\+?977[\s.-]?[1-9]\d[\s.-]?\d{5,8}/g,
    /\b0[1-9][\s.-]?\d{6,8}\b/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const normalized = normalizePhone(match[0]);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      const score = scorePhone(normalized, contextWindow(source, match.index));
      if (score < 3) {
        continue;
      }
      seen.add(normalized);
      found.push({ type: "phone", value: normalized, score, raw: match[0] });
    }
  }
  return found.sort((a, b) => b.score - a.score).slice(0, 6);
}

function extractEmails(text, catalog) {
  const found = [];
  const seen = new Set();
  const source = String(text || "").replace(/\+?977[\s.-]?\d[\d\s.-]{6,}\d/g, " ");
  const pattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let match;
  while ((match = pattern.exec(source))) {
    const value = normalizeEmail(match[0]);
    if (!value || seen.has(value) || !isOfficialEmail(value, catalog)) {
      continue;
    }
    seen.add(value);
    found.push({ type: "email", value });
  }
  return found.slice(0, 6);
}

function extractSocialLinks(html) {
  const $ = cheerio.load(String(html || ""));
  const links = [];
  const seen = new Set();
  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    if (!href) {
      return;
    }
    try {
      const url = new URL(href, "https://placeholder.local");
      if (!isSocialHost(url.hostname) || url.hostname === "placeholder.local") {
        return;
      }
      const clean = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
      if (seen.has(clean)) {
        return;
      }
      seen.add(clean);
      const host = registrableHost(url.hostname);
      let network = "social";
      if (host.includes("facebook")) {
        network = "facebook";
      } else if (host.includes("youtube") || host === "youtu.be") {
        network = "youtube";
      } else if (host === "x.com" || host.includes("twitter")) {
        network = "twitter";
      }
      links.push({ network, url: `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "") });
    } catch {
      // ignore invalid hrefs
    }
  });
  return links;
}

function sameHostLinks(html, pageUrl, patterns) {
  const $ = cheerio.load(String(html || ""));
  const originHost = hostnameOf(pageUrl);
  const links = [];
  const seen = new Set();
  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    if (!href) {
      return;
    }
    try {
      const url = new URL(href, pageUrl);
      if (registrableHost(url.hostname) !== registrableHost(originHost)) {
        return;
      }
      if (SKIP_PATH.test(url.pathname)) {
        return;
      }
      const hay = `${url.pathname} ${$(node).text()}`.toLowerCase();
      if (!patterns.some((pattern) => hay.includes(String(pattern).toLowerCase()))) {
        return;
      }
      const clean = url.href.split("#")[0];
      if (seen.has(clean)) {
        return;
      }
      seen.add(clean);
      links.push(clean);
    } catch {
      // ignore
    }
  });
  return links;
}

function extractRssItems(xml) {
  const $ = cheerio.load(String(xml || ""), { xmlMode: true });
  const items = [];
  $("item, entry").each((_, node) => {
    const title = $(node).find("title").first().text().trim();
    const link =
      $(node).find("link[href]").attr("href") ||
      $(node).find("link").first().text().trim() ||
      $(node).find("id").first().text().trim();
    const dateRaw =
      $(node).find("pubDate, published, updated, dc\\:date").first().text() ||
      $(node).find("published").attr("datetime");
    const summary = $(node).find("description, summary, content, media\\:description").first().text();
    items.push({
      title,
      url: link,
      publishedAt: parseDate(dateRaw),
      text: cheerio.load(summary).text().replace(/\s+/g, " ").trim(),
    });
  });
  return items;
}

function discoverFeedUrls(html, pageUrl) {
  const $ = cheerio.load(String(html || ""));
  const feeds = [];
  $('link[rel="alternate"]').each((_, node) => {
    const type = String($(node).attr("type") || "").toLowerCase();
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) {
      return;
    }
    const href = $(node).attr("href");
    if (!href) {
      return;
    }
    try {
      feeds.push(new URL(href, pageUrl).href);
    } catch {
      // ignore
    }
  });
  return feeds;
}

function extractAddress(text) {
  const match = String(text || "").match(
    /(?:Department|Ministry|Office)[^.]{0,80}(?:Kathmandu|Lalitpur|Bhaktapur|Pokhara)[^.]{0,40}/i,
  );
  return match ? match[0].replace(/\s+/g, " ").trim().slice(0, 180) : "";
}

function stripContactClaims(text) {
  return String(text || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\+?977[\s.-]?\d[\d\s.-]{6,}\d/g, "")
    .replace(/\b0[1-9][\s.-]?\d{6,8}\b/g, "")
    .replace(/\b9[6-8]\d{8}\b/g, "")
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGuidance(text, limit = 1400) {
  const clean = stripContactClaims(text);
  if (clean.length < 80) {
    return "";
  }
  return clean.slice(0, limit).trim();
}

function extractFromHtml(html, pageUrl, catalog) {
  const text = visibleText(html);
  return {
    text,
    phones: extractPhones(text),
    emails: extractEmails(text, catalog),
    social: extractSocialLinks(html),
    links: sameHostLinks(html, pageUrl, catalog.linkPatterns || []),
    feeds: discoverFeedUrls(html, pageUrl),
    address: extractAddress(text),
    guidance: extractGuidance(text),
  };
}

module.exports = {
  SOCIAL_MAX_AGE_DAYS,
  discoverFeedUrls,
  extractEmails,
  extractFromHtml,
  extractGuidance,
  extractPhones,
  extractRssItems,
  extractSocialLinks,
  isFreshDate,
  normalizeEmail,
  normalizePhone,
  parseDate,
  sameHostLinks,
  stripContactClaims,
  todayStamp,
  visibleText,
};
