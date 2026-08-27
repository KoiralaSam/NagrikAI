const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const config = require("../config");
const { todayStamp, stripContactClaims } = require("./extract");

async function ensureCrawlSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS crawl_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running',
      summary JSONB
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS crawl_pages (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES crawl_runs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
      http_status INTEGER,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      content_hash TEXT,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT,
      kind TEXT NOT NULL DEFAULT 'html'
    )
  `);
}

async function startRun() {
  const { rows } = await db.query(
    `INSERT INTO crawl_runs (status) VALUES ('running') RETURNING id`,
  );
  return rows[0].id;
}

async function finishRun(runId, status, summary) {
  await db.query(
    `UPDATE crawl_runs SET finished_at = NOW(), status = $2, summary = $3 WHERE id = $1`,
    [runId, status, summary],
  );
}

async function logPage(runId, { url, agencyId, status, body, verified, reason, kind }) {
  const hash = body
    ? crypto.createHash("sha256").update(body).digest("hex")
    : null;
  await db.query(
    `
    INSERT INTO crawl_pages (
      run_id, url, agency_id, http_status, content_hash, verified, reason, kind
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [runId, url, agencyId || null, status || null, hash, Boolean(verified), reason || null, kind || "html"],
  );
}

async function upsertAgency(entry) {
  const { rows: existing } = await db.query(
    `SELECT id FROM agencies WHERE lower(name) = lower($1) LIMIT 1`,
    [entry.name],
  );
  if (existing[0]) {
    await db.query(
      `
      UPDATE agencies
      SET parent = COALESCE($2, parent),
          address = COALESCE($3, address),
          last_verified_at = $4,
          verification_status = $5
      WHERE id = $1
      `,
      [
        existing[0].id,
        entry.parent || null,
        entry.address || null,
        entry.lastVerifiedAt,
        entry.verificationStatus,
      ],
    );
    return existing[0].id;
  }
  const { rows } = await db.query(
    `
    INSERT INTO agencies (name, parent, address, last_verified_at, verification_status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [entry.name, entry.parent || null, entry.address || null, entry.lastVerifiedAt, entry.verificationStatus],
  );
  return rows[0].id;
}

async function upsertService(agencyId, entry) {
  const { rows: existing } = await db.query(
    `SELECT id FROM services WHERE intent = $1 LIMIT 1`,
    [entry.intent],
  );
  if (existing[0]) {
    await db.query(
      `
      UPDATE services
      SET agency_id = $2, name = $3, summary_ne = $4, summary_en = $5
      WHERE id = $1
      `,
      [existing[0].id, agencyId, entry.serviceName, entry.summary_ne, entry.summary_en],
    );
    return existing[0].id;
  }
  const { rows } = await db.query(
    `
    INSERT INTO services (agency_id, name, intent, summary_ne, summary_en)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [agencyId, entry.serviceName, entry.intent, entry.summary_ne, entry.summary_en],
  );
  return rows[0].id;
}

async function upsertAlias(serviceId, alias) {
  const { rows } = await db.query(
    `
    SELECT id FROM service_aliases
    WHERE service_id = $1 AND lower(alias) = lower($2)
    LIMIT 1
    `,
    [serviceId, alias],
  );
  if (rows[0]) {
    return;
  }
  await db.query(`INSERT INTO service_aliases (service_id, alias) VALUES ($1, $2)`, [
    serviceId,
    alias,
  ]);
}

async function upsertContact(agencyId, contact) {
  const { rows } = await db.query(
    `
    SELECT id FROM contacts
    WHERE agency_id = $1 AND type = $2 AND lower(value) = lower($3)
    LIMIT 1
    `,
    [agencyId, contact.type, contact.value],
  );
  if (rows[0]) {
    await db.query(`UPDATE contacts SET label = $1, url = $2 WHERE id = $3`, [
      contact.label,
      contact.url || null,
      rows[0].id,
    ]);
    return "updated";
  }
  await db.query(
    `
    INSERT INTO contacts (agency_id, type, label, value, url)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [agencyId, contact.type, contact.label, contact.value, contact.url || null],
  );
  return "inserted";
}

async function upsertSource(agencyId, source) {
  const { rows } = await db.query(
    `
    SELECT id FROM sources
    WHERE agency_id = $1 AND lower(url) = lower($2)
    LIMIT 1
    `,
    [agencyId, source.url],
  );
  if (rows[0]) {
    await db.query(
      `UPDATE sources SET title = $1, verified_at = $2 WHERE id = $3`,
      [source.title, source.verifiedAt, rows[0].id],
    );
    return;
  }
  await db.query(
    `INSERT INTO sources (agency_id, title, url, verified_at) VALUES ($1, $2, $3, $4)`,
    [agencyId, source.title, source.url, source.verifiedAt],
  );
}

async function upsertNote(serviceId, note) {
  const { rows } = await db.query(
    `
    SELECT id FROM knowledge_notes
    WHERE service_id = $1 AND lower(title) = lower($2)
    LIMIT 1
    `,
    [serviceId, note.title],
  );
  if (rows[0]) {
    await db.query(
      `
      UPDATE knowledge_notes
      SET body = $1, source_url = $2, verified_at = $3
      WHERE id = $4
      `,
      [note.body, note.sourceUrl, note.verifiedAt, rows[0].id],
    );
    return;
  }
  await db.query(
    `
    INSERT INTO knowledge_notes (service_id, title, body, source_url, verified_at)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [serviceId, note.title, note.body, note.sourceUrl, note.verifiedAt],
  );
}

function crawledDir() {
  return path.join(config.knowledgeBaseDir, "crawled");
}

function writeKnowledgeFile({ intent, title, sourceUrl, verifiedAt, body, fallback = "" }) {
  const dir = crawledDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${intent}.md`;
  const target = path.join(dir, filename);
  const primary = stripContactClaims(body);
  const extra = stripContactClaims(fallback);
  const clean = primary.length >= 80 ? primary : [primary, extra].filter(Boolean).join("\n\n").trim();
  if (clean.length < 80) {
    console.warn(`skip crawled file ${filename}: guidance too short after stripping contacts`);
    return null;
  }
  const markdown = `---
intent: ${intent}
title: ${title.replace(/[\n:]/g, " ")}
source_url: ${sourceUrl}
verified_at: ${verifiedAt}
verification_status: verified
---

${clean}
`;
  fs.writeFileSync(target, markdown);
  console.log(`wrote ${path.posix.join("crawled", filename)}`);
  return path.posix.join("crawled", filename);
}

async function persistAgencyResult(runId, agency, result, { dryRun = false } = {}) {
  const verifiedAt = todayStamp();
  const pageOk = result.pages.some((page) => page.verified) || result.pages.length > 0;
  if (dryRun) {
    return { dryRun: true, intent: agency.intent, pageOk };
  }

  const agencyId = await upsertAgency({
    name: agency.name,
    parent: agency.parent,
    address: result.address || agency.address,
    lastVerifiedAt: pageOk ? verifiedAt : null,
    verificationStatus: pageOk ? "verified" : "unverified",
  });
  const serviceId = await upsertService(agencyId, agency);
  for (const alias of agency.aliases || []) {
    await upsertAlias(serviceId, alias);
  }

  const contactCounts = { inserted: 0, updated: 0 };
  for (const contact of result.contacts) {
    const action = await upsertContact(agencyId, contact);
    contactCounts[action] += 1;
  }
  for (const source of result.sources) {
    await upsertSource(agencyId, { ...source, verifiedAt });
  }
  for (const note of result.notes) {
    await upsertNote(serviceId, { ...note, verifiedAt });
  }

  const knowledgeFile =
    result.pages.length || result.guidance
      ? writeKnowledgeFile({
          intent: agency.intent,
          title: `${agency.serviceName} (official crawl)`,
          sourceUrl: result.sources[0]?.url || agency.seeds[0],
          verifiedAt,
          body: result.guidance,
          fallback: [agency.summary_en, agency.summary_ne].filter(Boolean).join("\n\n"),
        })
      : null;

  for (const page of result.pageLogs) {
    await logPage(runId, { ...page, agencyId });
  }

  return { agencyId, serviceId, contactCounts, knowledgeFile, pageOk };
}

module.exports = {
  crawledDir,
  ensureCrawlSchema,
  finishRun,
  persistAgencyResult,
  startRun,
  upsertAgency,
  upsertAlias,
  upsertService,
  upsertSource,
  writeKnowledgeFile,
};
