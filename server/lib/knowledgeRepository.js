const db = require("./db");

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

async function findBestService(text) {
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
    WHERE lower($1) LIKE '%' || lower(service_aliases.alias) || '%'
       OR lower(service_aliases.alias) % lower($1)
       OR lower(services.name) % lower($1)
    GROUP BY services.id, agencies.id
    ORDER BY score DESC NULLS LAST
    LIMIT 1
    `,
    [text],
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const fallback = await db.query(`
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
      0 AS score
    FROM services
    JOIN agencies ON agencies.id = services.agency_id
    WHERE services.intent = 'consular_abroad_help'
    LIMIT 1
  `);

  return fallback.rows[0] ?? null;
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
};
