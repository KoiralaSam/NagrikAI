const db = require("./db");

const CONSULAR_HINTS = [
  "consular",
  "embassy",
  "abroad",
  "foreign country",
  "mission abroad",
  "outside nepal",
  "विदेश",
  "दूतावास",
  "नियोग",
  "नेपाल बाहिर",
];

function minScore() {
  const value = Number(process.env.RETRIEVAL_MIN_SCORE ?? 0.08);
  return Number.isFinite(value) ? value : 0.08;
}

const NEGATED_CONSULAR =
  /\b(not|never|without|except)\s+(?:the\s+)?(?:embassy|abroad|consular|foreign country)(?:\s+or\s+(?:the\s+)?(?:embassy|abroad|consular|foreign country))?/gi;

function isConsularQuery(text) {
  const stripped = String(text ?? "").toLowerCase().replace(NEGATED_CONSULAR, " ");
  return CONSULAR_HINTS.some((hint) => stripped.includes(hint.toLowerCase()));
}

async function getKnowledgeSummary() {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM agencies) AS "agencyCount",
      (SELECT COUNT(*)::int FROM services) AS "serviceCount",
      (SELECT COUNT(*)::int FROM sources) AS "verifiedSourceCount",
      (SELECT COUNT(*)::int FROM guardrail_events) AS "guardrailEventCount"
  `);

  return rows[0];
}

async function queryBestService(text, { intent } = {}) {
  const params = [text];
  const intentClause = intent ? "AND services.intent = $2" : "";
  if (intent) {
    params.push(intent);
  }

  const { rows } = await db.query(
    `
    SELECT
      services.id,
      services.name,
      services.intent,
      services.summary_ne,
      services.summary_en,
      agencies.id AS agency_id,
      agencies.name AS agency_name,
      agencies.parent,
      agencies.address,
      agencies.last_verified_at,
      agencies.verification_status,
      MAX(
        GREATEST(
          similarity(lower(service_aliases.alias), lower($1)),
          similarity(lower(services.name), lower($1))
        )
      ) AS score
    FROM services
    JOIN agencies ON agencies.id = services.agency_id
    JOIN service_aliases ON service_aliases.service_id = services.id
    WHERE (
        lower($1) LIKE '%' || lower(service_aliases.alias) || '%'
        OR lower(service_aliases.alias) % lower($1)
        OR lower(services.name) % lower($1)
      )
      ${intentClause}
    GROUP BY services.id, agencies.id
    ORDER BY score DESC NULLS LAST
    LIMIT 1
    `,
    params,
  );

  const service = rows[0];
  if (!service || Number(service.score) < minScore()) {
    return null;
  }

  return service;
}

async function findBestService(text) {
  if (isConsularQuery(text)) {
    const consular = await queryBestService(text, {
      intent: "consular_abroad_help",
    });
    if (consular) {
      return consular;
    }
  }

  const service = await queryBestService(text);
  if (service?.intent === "consular_abroad_help" && !isConsularQuery(text)) {
    return null;
  }

  return service;
}

async function getAgencyContacts(agencyId) {
  const { rows } = await db.query(
    `
    SELECT type, label, value, url
    FROM contacts
    WHERE agency_id = $1
    ORDER BY id ASC
    `,
    [agencyId],
  );

  return rows;
}

async function getAgencySources(agencyId) {
  const { rows } = await db.query(
    `
    SELECT title, url, verified_at AS "verifiedAt"
    FROM sources
    WHERE agency_id = $1
    ORDER BY verified_at DESC, id ASC
    `,
    [agencyId],
  );

  return rows;
}

async function getServiceNotes(serviceId) {
  const { rows } = await db.query(
    `
    SELECT title, body, source_url, verified_at
    FROM knowledge_notes
    WHERE service_id = $1
    ORDER BY id ASC
    `,
    [serviceId],
  );

  return rows;
}

module.exports = {
  findBestService,
  getAgencyContacts,
  getAgencySources,
  getKnowledgeSummary,
  getServiceNotes,
  isConsularQuery,
};
