const { fetchPage } = require("./fetchPage");
const { extractRssItems, isFreshDate, SOCIAL_MAX_AGE_DAYS } = require("./extract");
const { verifySocialItem } = require("./verify");
const { hostnameOf } = require("./allowlist");

function youtubeChannelId(urlLike) {
  try {
    const url = new URL(urlLike);
    const match = url.pathname.match(/\/channel\/(UC[\w-]+)/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function twitterHandle(urlLike, fallback = "") {
  if (fallback) {
    return String(fallback).replace(/^@/, "");
  }
  try {
    const url = new URL(urlLike);
    const part = url.pathname.split("/").filter(Boolean)[0] || "";
    if (!part || ["intent", "share", "i", "home"].includes(part.toLowerCase())) {
      return "";
    }
    return part.replace(/^@/, "");
  } catch {
    return "";
  }
}

function facebookPageFromUrl(urlLike) {
  try {
    const url = new URL(urlLike);
    const part = url.pathname.split("/").filter(Boolean)[0] || "";
    if (!part || ["profile.php", "pages", "watch", "share"].includes(part.toLowerCase())) {
      return "";
    }
    return part;
  } catch {
    return "";
  }
}

async function fetchFeedItems(feedUrl, { catalog, discoveredSocial } = {}) {
  const page = await fetchPage(feedUrl, { catalog, discoveredSocial, allowSocial: true });
  if (!page.ok) {
    return { ok: false, url: feedUrl, reason: page.reason, items: [] };
  }
  const items = extractRssItems(page.body)
    .map((item) => ({
      ...item,
      url: item.url || feedUrl,
      kind: "rss",
      trustedFeed: true,
    }))
    .filter((item) => verifySocialItem(item, catalog, discoveredSocial).ok);
  return { ok: true, url: page.finalUrl || feedUrl, items, reason: "ok" };
}

async function fetchYoutubeItems(social, context) {
  const channelId = social.channelId || youtubeChannelId(social.url);
  if (!channelId) {
    return { ok: false, items: [], reason: "youtube-channel-id-required" };
  }
  return fetchFeedItems(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, context);
}

async function fetchTwitterItems(social, context) {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return { ok: false, items: [], reason: "twitter-token-missing" };
  }
  const handle = twitterHandle(social.url, social.handle);
  if (!handle) {
    return { ok: false, items: [], reason: "twitter-handle-missing" };
  }
  try {
    const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${handle}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!userRes.ok) {
      return { ok: false, items: [], reason: `twitter-user-${userRes.status}` };
    }
    const user = await userRes.json();
    const userId = user?.data?.id;
    if (!userId) {
      return { ok: false, items: [], reason: "twitter-user-not-found" };
    }
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!tweetsRes.ok) {
      return { ok: false, items: [], reason: `twitter-tweets-${tweetsRes.status}` };
    }
    const payload = await tweetsRes.json();
    const items = (payload.data || [])
      .map((tweet) => ({
        title: String(tweet.text || "").slice(0, 120),
        text: tweet.text || "",
        url: `https://x.com/${handle}/status/${tweet.id}`,
        publishedAt: tweet.created_at ? new Date(tweet.created_at) : null,
        kind: "twitter",
        trustedFeed: true,
      }))
      .filter((item) => verifySocialItem(item, context.catalog, context.discoveredSocial).ok);
    return { ok: true, items, reason: "ok" };
  } catch (error) {
    return {
      ok: false,
      items: [],
      reason: error instanceof Error ? error.message : "twitter-failed",
    };
  }
}

async function fetchFacebookItems(social, context) {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, items: [], reason: "facebook-token-missing" };
  }
  const page = social.pageId || facebookPageFromUrl(social.url);
  if (!page) {
    return { ok: false, items: [], reason: "facebook-page-missing" };
  }
  try {
    const url = new URL(`https://graph.facebook.com/v19.0/${page}/posts`);
    url.searchParams.set("fields", "message,created_time,permalink_url");
    url.searchParams.set("limit", "10");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return { ok: false, items: [], reason: `facebook-${response.status}` };
    }
    const payload = await response.json();
    const items = (payload.data || [])
      .map((post) => ({
        title: String(post.message || "").slice(0, 120),
        text: post.message || "",
        url: post.permalink_url,
        publishedAt: post.created_time ? new Date(post.created_time) : null,
        kind: "facebook",
        trustedFeed: true,
      }))
      .filter((item) => verifySocialItem(item, context.catalog, context.discoveredSocial).ok);
    return { ok: true, items, reason: "ok" };
  } catch (error) {
    return {
      ok: false,
      items: [],
      reason: error instanceof Error ? error.message : "facebook-failed",
    };
  }
}

async function collectSocialUpdates(socials, feeds, context) {
  const collected = [];
  const seen = new Set();

  for (const feedUrl of feeds || []) {
    const result = await fetchFeedItems(feedUrl, context);
    for (const item of result.items || []) {
      if (item.url && !seen.has(item.url)) {
        seen.add(item.url);
        collected.push(item);
      }
    }
  }

  for (const social of socials || []) {
    let result = { items: [] };
    if (social.network === "youtube") {
      result = await fetchYoutubeItems(social, context);
    } else if (social.network === "twitter") {
      result = await fetchTwitterItems(social, context);
    } else if (social.network === "facebook") {
      result = await fetchFacebookItems(social, context);
    }
    for (const item of result.items || []) {
      if (item.url && !seen.has(item.url)) {
        seen.add(item.url);
        collected.push(item);
      }
    }
  }

  return collected
    .filter((item) => isFreshDate(item.publishedAt, SOCIAL_MAX_AGE_DAYS))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 8);
}

module.exports = {
  SOCIAL_MAX_AGE_DAYS,
  collectSocialUpdates,
  facebookPageFromUrl,
  fetchFeedItems,
  hostnameOf,
  twitterHandle,
  youtubeChannelId,
};
