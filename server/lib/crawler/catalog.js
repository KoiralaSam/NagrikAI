const fs = require("fs");
const path = require("path");

const DEFAULT_PATH = path.resolve(__dirname, "..", "..", "data", "official-catalog.json");

function loadCatalog(catalogPath = process.env.CRAWL_CATALOG_PATH || DEFAULT_PATH) {
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const agencies = Array.isArray(raw.agencies) ? raw.agencies : [];
  return {
    catalogPath,
    extraHosts: new Set((raw.extraHosts || []).map((host) => host.toLowerCase())),
    emailDomains: new Set((raw.emailDomains || []).map((domain) => domain.toLowerCase())),
    linkPatterns: raw.linkPatterns || ["contact", "notice", "news"],
    agencies,
  };
}

function filterAgencies(catalog, intentFilter) {
  if (!intentFilter) {
    return catalog.agencies;
  }
  const wanted = new Set(
    String(intentFilter)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return catalog.agencies.filter((agency) => wanted.has(agency.intent));
}

module.exports = {
  DEFAULT_PATH,
  filterAgencies,
  loadCatalog,
};
