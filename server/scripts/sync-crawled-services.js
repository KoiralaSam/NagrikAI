#!/usr/bin/env node

/**
 * Ensure every verified crawled/*.md intent has a services row so RAG can retrieve it.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const db = require("../lib/db");
const config = require("../lib/config");
const { loadCatalog } = require("../lib/crawler/catalog");
const { parseFrontmatter } = require("../lib/documentParser");
const {
  upsertAgency,
  upsertService,
  upsertAlias,
  upsertSource,
} = require("../lib/crawler/persist");

async function main() {
  const crawled = path.join(config.knowledgeBaseDir, "crawled");
  const catalog = loadCatalog();
  const byIntent = new Map(catalog.agencies.map((a) => [a.intent, a]));
  const files = fs
    .readdirSync(crawled)
    .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md")
    .sort();

  const summary = { files: files.length, upserted: 0, skipped: 0 };

  for (const name of files) {
    const raw = fs.readFileSync(path.join(crawled, name), "utf8");
    const { data } = parseFrontmatter(raw);
    const intent = String(data.intent || name.replace(/\.md$/, "")).trim();
    const catalogEntry = byIntent.get(intent);
    const title = String(data.title || intent).replace(/\s*\(official crawl\)\s*$/i, "").trim();
    const sourceUrl = String(data.source_url || catalogEntry?.seeds?.[0] || "").trim();
    const verifiedAt = String(data.verified_at || new Date().toISOString().slice(0, 10));

    if (!intent) {
      summary.skipped += 1;
      continue;
    }

    const agencyId = await upsertAgency({
      name: catalogEntry?.name || title,
      parent: catalogEntry?.parent || "Government of Nepal",
      address: catalogEntry?.address || null,
      lastVerifiedAt: verifiedAt,
      verificationStatus: "verified",
    });
    const serviceId = await upsertService(agencyId, {
      intent,
      serviceName: catalogEntry?.serviceName || title,
      summary_en: catalogEntry?.summary_en || `${title} is a Nepal government service office.`,
      summary_ne:
        catalogEntry?.summary_ne || `${title} नेपाल सरकारको सेवा कार्यालय हो।`,
    });
    for (const alias of catalogEntry?.aliases || [intent.replace(/_/g, " ")]) {
      await upsertAlias(serviceId, alias);
    }
    if (sourceUrl) {
      await upsertSource(agencyId, {
        title: `${title} official page`,
        url: sourceUrl,
        verifiedAt,
      });
    }
    summary.upserted += 1;
    console.log(`synced ${intent}`);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.pool?.end === "function") {
      await db.pool.end();
    }
  });
