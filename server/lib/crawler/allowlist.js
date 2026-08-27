const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

function hostnameOf(urlLike) {
  try {
    return new URL(urlLike).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function registrableHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  return host;
}

function isGovNp(hostname) {
  const host = registrableHost(hostname);
  return host === "gov.np" || host.endsWith(".gov.np");
}

function isSocialHost(hostname) {
  return SOCIAL_HOSTS.has(String(hostname || "").toLowerCase());
}

function officialSocialKeys(catalog) {
  const keys = new Set();
  for (const agency of catalog.agencies || []) {
    for (const item of agency.social || []) {
      const host = hostnameOf(item.url);
      if (!host) {
        continue;
      }
      keys.add(`${registrableHost(host)}${pathnameKey(item.url)}`);
    }
  }
  return keys;
}

function pathnameKey(urlLike) {
  try {
    return new URL(urlLike).pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function isAllowlistedHost(hostname, catalog) {
  const host = String(hostname || "").toLowerCase();
  if (!host) {
    return false;
  }
  if (isGovNp(host)) {
    return true;
  }
  if (catalog?.extraHosts?.has(host) || catalog?.extraHosts?.has(registrableHost(host))) {
    return true;
  }
  return isSocialHost(host);
}

function isAllowlistedUrl(urlLike, catalog, { socialMustBeOfficial = false, discoveredSocial = new Set() } = {}) {
  let parsed;
  try {
    parsed = new URL(urlLike);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (!isAllowlistedHost(parsed.hostname, catalog)) {
    return false;
  }
  if (!isSocialHost(parsed.hostname)) {
    return true;
  }
  if (!socialMustBeOfficial) {
    return true;
  }
  const key = `${registrableHost(parsed.hostname)}${pathnameKey(parsed.href)}`;
  if (officialSocialKeys(catalog).has(key)) {
    return true;
  }
  return [...discoveredSocial].some((known) => {
    try {
      const other = new URL(known);
      return (
        registrableHost(other.hostname) === registrableHost(parsed.hostname) &&
        pathnameKey(other.href) === pathnameKey(parsed.href)
      );
    } catch {
      return false;
    }
  });
}

function isOfficialEmail(email, catalog) {
  const domain = String(email || "")
    .split("@")[1]
    ?.toLowerCase();
  if (!domain) {
    return false;
  }
  if (domain.endsWith(".gov.np")) {
    return true;
  }
  return Boolean(catalog?.emailDomains?.has(domain));
}

module.exports = {
  SOCIAL_HOSTS,
  hostnameOf,
  isAllowlistedHost,
  isAllowlistedUrl,
  isGovNp,
  isOfficialEmail,
  isSocialHost,
  officialSocialKeys,
  pathnameKey,
  registrableHost,
};
