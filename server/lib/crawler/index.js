const crypto = require("crypto");
const { filterAgencies, loadCatalog } = require("./catalog");
const { fetchPage } = require("./fetchPage");
const { extractFromHtml, extractGuidance, todayStamp } = require("./extract");
const { verifyContact, verifySocialItem, verifyStandingPage } = require("./verify");
const { collectSocialUpdates } = require("./social");
const { persistAgencyResult, ensureCrawlSchema, startRun, finishRun } = require("./persist");
const { ingestKnowledgeBase } = require("../knowledgeIngest");
const { ensureVectorSchema } = require("../knowledgeRepository");

function maxPages() {
  const value = Number(process.env.CRAWL_MAX_PAGES_PER_AGENCY || 8);
  return Number.isFinite(value) ? Math.max(1, value) : 8;
}

function contactLabel(type, network) {
  if (type === "phone") {
    return "Call enquiry";
  }
  if (type === "email") {
    return "Email office";
  }
  if (type === "social") {
    return network ? `Official ${network}` : "Official social";
  }
  return "Open website";
}

async function crawlAgency(agency, catalog, { dryRun }) {
  const discoveredSocial = new Set((agency.social || []).map((item) => item.url).filter(Boolean));
  const queue = [...(agency.seeds || [])];
  const seen = new Set();
  const pages = [];
  const pageLogs = [];
  const contacts = [];
  const sources = [];
  const notes = [];
  const allFeeds = [];
  let guidanceParts = [];
  let address = agency.address || "";

  while (queue.length && pages.length < maxPages()) {
    const url = queue.shift();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);

    const standing = verifyStandingPage(url, catalog);
    const fetched = await fetchPage(url, { catalog, discoveredSocial });
    pageLogs.push({
      url,
      status: fetched.status,
      body: fetched.body,
      verified: Boolean(fetched.ok && standing.ok),
      reason: fetched.ok ? standing.reason : fetched.reason,
      kind: "html",
    });
    if (!fetched.ok || !standing.ok) {
      continue;
    }

    const extracted = extractFromHtml(fetched.body, fetched.finalUrl || url, catalog);
    pages.push({
      url: fetched.finalUrl || url,
      extracted,
      verified: true,
    });
    if (extracted.address && !address) {
      address = extracted.address;
    }
    if (extracted.guidance) {
      guidanceParts.push(extracted.guidance);
    }
    for (const feed of extracted.feeds) {
      allFeeds.push(feed);
    }
    for (const social of extracted.social) {
      discoveredSocial.add(social.url);
    }
    for (const link of extracted.links) {
      if (!seen.has(link) && pages.length + queue.length < maxPages()) {
        queue.push(link);
      }
    }

    for (const phone of extracted.phones) {
      const check = verifyContact(phone, extracted.text, catalog);
      if (check.ok) {
        contacts.push({
          type: "phone",
          label: contactLabel("phone"),
          value: phone.value,
          url: null,
        });
      }
    }
    for (const email of extracted.emails) {
      const check = verifyContact(email, extracted.text, catalog);
      if (check.ok) {
        contacts.push({
          type: "email",
          label: contactLabel("email"),
          value: email.value,
          url: null,
        });
      }
    }
    contacts.push({
      type: "website",
      label: contactLabel("website"),
      value: fetched.finalUrl || url,
      url: fetched.finalUrl || url,
    });
    sources.push({
      title: `${agency.name} official page`,
      url: fetched.finalUrl || url,
    });
  }

  for (const social of [...(agency.social || []), ...pages.flatMap((page) => page.extracted.social)]) {
    if (!social?.url) {
      continue;
    }
    contacts.push({
      type: "social",
      label: contactLabel("social", social.network),
      value: social.url,
      url: social.url,
    });
  }

  const socialItems = await collectSocialUpdates(
    [...(agency.social || []), ...pages.flatMap((page) => page.extracted.social)],
    allFeeds,
    { catalog, discoveredSocial },
  );

  for (const item of socialItems) {
    const check = verifySocialItem(item, catalog, discoveredSocial);
    pageLogs.push({
      url: item.url,
      status: 200,
      body: item.text,
      verified: check.ok,
      reason: check.reason,
      kind: item.kind || "social",
    });
    if (!check.ok) {
      continue;
    }
    const body = extractGuidance(`${item.title || ""}. ${item.text || ""}`, 700);
    if (body) {
      notes.push({
        title: (item.title || "Official update").slice(0, 120),
        body,
        sourceUrl: item.url,
      });
      sources.push({
        title: (item.title || "Official social update").slice(0, 120),
        url: item.url,
      });
    }
  }

  const uniqueContacts = [];
  const seenContacts = new Set();
  for (const contact of contacts) {
    const key = `${contact.type}:${String(contact.value).toLowerCase()}`;
    if (seenContacts.has(key)) {
      continue;
    }
    seenContacts.add(key);
    uniqueContacts.push(contact);
  }

  const uniqueSources = [];
  const seenSources = new Set();
  for (const source of sources) {
    const key = String(source.url).toLowerCase();
    if (seenSources.has(key)) {
      continue;
    }
    seenSources.add(key);
    uniqueSources.push(source);
  }

  if (guidanceParts[0]) {
    notes.unshift({
      title: `${agency.serviceName} official guidance`,
      body: guidanceParts[0].slice(0, 700),
      sourceUrl: uniqueSources[0]?.url || agency.seeds[0],
    });
  }

  return {
    pages,
    pageLogs,
    contacts: uniqueContacts,
    sources: uniqueSources,
    notes,
    address,
    guidance: [guidanceParts[0], ...notes.map((note) => note.body)]
      .filter(Boolean)
      .join("\n\n"),
    dryRun,
    checksum: crypto
      .createHash("sha256")
      .update(JSON.stringify({ contacts: uniqueContacts, sources: uniqueSources }))
      .digest("hex")
      .slice(0, 12),
  };
}

async function runCrawl({ dryRun = false, intent = "", embed = true } = {}) {
  const catalog = loadCatalog();
  const agencies = filterAgencies(catalog, intent);
  const summary = {
    startedAt: todayStamp(),
    dryRun,
    agencies: agencies.length,
    verified: 0,
    failed: 0,
    contacts: 0,
    notes: 0,
    files: [],
    errors: [],
  };

  if (!agencies.length) {
    return { ...summary, message: "No catalog agencies matched." };
  }

  if (!dryRun) {
    await ensureCrawlSchema();
  }
  const runId = dryRun ? null : await startRun();

  try {
    for (const agency of agencies) {
      try {
        const result = await crawlAgency(agency, catalog, { dryRun });
        const persisted = await persistAgencyResult(runId, agency, result, { dryRun });
        if (result.pages.length) {
          summary.verified += 1;
        } else {
          summary.failed += 1;
        }
        summary.contacts += result.contacts.length;
        summary.notes += result.notes.length;
        if (persisted.knowledgeFile) {
          summary.files.push(persisted.knowledgeFile);
        }
        console.log(
          `${dryRun ? "dry-run" : "crawled"} ${agency.intent}: pages=${result.pages.length} contacts=${result.contacts.length} notes=${result.notes.length}`,
        );
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          intent: agency.intent,
          error: error instanceof Error ? error.message : String(error),
        });
        console.warn(`crawl failed ${agency.intent}: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (!dryRun && embed && summary.files.length) {
      await ensureVectorSchema();
      const ingested = await ingestKnowledgeBase({ dryRun: false });
      summary.ingest = ingested;
    }

    if (!dryRun) {
      await finishRun(runId, summary.errors.length ? "completed_with_errors" : "completed", summary);
    }
    return summary;
  } catch (error) {
    if (!dryRun && runId) {
      await finishRun(runId, "failed", {
        ...summary,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

module.exports = {
  crawlAgency,
  runCrawl,
};
