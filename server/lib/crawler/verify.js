const {
  hostnameOf,
  isAllowlistedHost,
  isAllowlistedUrl,
  isOfficialEmail,
  isSocialHost,
} = require("./allowlist");
const { isFreshDate, SOCIAL_MAX_AGE_DAYS } = require("./extract");

function officialSocialUrls(catalog, discoveredSocial = []) {
  const urls = [...discoveredSocial];
  for (const agency of catalog?.agencies || []) {
    for (const item of agency.social || []) {
      if (item.url) {
        urls.push(item.url);
      }
    }
  }
  return urls.map((value) => String(value).replace(/\/+$/, "").toLowerCase());
}

function socialBelongsToOfficial(urlLike, catalog, discoveredSocial) {
  let parsed;
  try {
    parsed = new URL(urlLike);
  } catch {
    return false;
  }
  if (!isSocialHost(parsed.hostname) && isAllowlistedUrl(parsed.href, catalog)) {
    return true;
  }
  const href = parsed.href.replace(/\/+$/, "").toLowerCase();
  return officialSocialUrls(catalog, discoveredSocial).some(
    (profile) => href === profile || href.startsWith(`${profile}/`) || href.startsWith(`${profile}?`),
  );
}

function verifyStandingPage(url, catalog) {
  if (!isAllowlistedUrl(url, catalog)) {
    return { ok: false, reason: "not-allowlisted" };
  }
  if (isSocialHost(new URL(url).hostname)) {
    return { ok: false, reason: "social-is-not-standing-source" };
  }
  return { ok: true, reason: "official-html" };
}

function verifyContact(contact, pageText, catalog) {
  const text = String(pageText || "").toLowerCase();
  if (contact.type === "email") {
    if (!isOfficialEmail(contact.value, catalog)) {
      return { ok: false, reason: "email-domain" };
    }
    if (!text.includes(String(contact.value).toLowerCase())) {
      return { ok: false, reason: "email-not-on-page" };
    }
    return { ok: true, reason: "email-on-official-page" };
  }
  if (contact.type === "phone") {
    const digits = String(contact.value).replace(/\D/g, "");
    const pageDigits = text.replace(/\D/g, "");
    const needle = digits.startsWith("977") ? digits.slice(3) : digits;
    if (!needle || needle.length < 8 || !pageDigits.includes(needle.slice(-8))) {
      return { ok: false, reason: "phone-not-on-page" };
    }
    return { ok: true, reason: "phone-on-official-page" };
  }
  if (contact.type === "website" || contact.type === "social") {
    const target = contact.url || contact.value;
    if (!isAllowlistedUrl(target, catalog)) {
      return { ok: false, reason: "url-not-allowlisted" };
    }
    return { ok: true, reason: "url-allowlisted" };
  }
  return { ok: false, reason: "unknown-contact-type" };
}

function verifySocialItem(item, catalog, discoveredSocial) {
  if (!item?.url) {
    return { ok: false, reason: "missing-url" };
  }
  if (!item.publishedAt) {
    return { ok: false, reason: "social-missing-date" };
  }
  if (!isFreshDate(item.publishedAt, SOCIAL_MAX_AGE_DAYS)) {
    return { ok: false, reason: `older-than-${SOCIAL_MAX_AGE_DAYS}-days` };
  }
  const host = hostnameOf(item.url);
  if (!isAllowlistedHost(host, catalog)) {
    return { ok: false, reason: "social-not-allowlisted" };
  }
  if (item.trustedFeed && (isSocialHost(host) || isAllowlistedUrl(item.url, catalog))) {
    return { ok: true, reason: "fresh-official-social" };
  }
  if (!socialBelongsToOfficial(item.url, catalog, discoveredSocial)) {
    return { ok: false, reason: "social-account-not-official" };
  }
  return { ok: true, reason: "fresh-official-social" };
}

module.exports = {
  verifyContact,
  verifySocialItem,
  verifyStandingPage,
};
