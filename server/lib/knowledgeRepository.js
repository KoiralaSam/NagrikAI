const config = require("./config");
const db = require("./db");
const { embedQuery, toVectorLiteral } = require("./embeddings");

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

const NEGATED_CONSULAR =
  /\b(not|never|without|except)\s+(?:the\s+)?(?:embassy|abroad|consular|foreign country)(?:\s+or\s+(?:the\s+)?(?:embassy|abroad|consular|foreign country))?/gi;

let vectorReady = false;

function isConsularQuery(text) {
  const stripped = String(text ?? "").toLowerCase().replace(NEGATED_CONSULAR, " ");
  return CONSULAR_HINTS.some((hint) => stripped.includes(hint.toLowerCase()));
}

async function ensureVectorSchema() {
  try {
    await db.query("CREATE EXTENSION IF NOT EXISTS vector");
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        checksum TEXT NOT NULL,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        source_url TEXT,
        verified_at DATE,
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${config.embeddingDimensions}),
        source_url TEXT,
        verified_at DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS knowledge_chunks_service_id_idx
      ON knowledge_chunks (service_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
      ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
    `);
    vectorReady = true;
    return true;
  } catch (error) {
    vectorReady = false;
    console.warn(
      `pgvector unavailable; document RAG disabled. ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

async function getKnowledgeSummary() {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM agencies) AS "agencyCount",
      (SELECT COUNT(*)::int FROM services) AS "serviceCount",
      (SELECT COUNT(*)::int FROM sources) AS "verifiedSourceCount",
      (SELECT COUNT(*)::int FROM guardrail_events) AS "guardrailEventCount"
  `);

  let documentCount = 0;
  let chunkCount = 0;
  let verifiedChunkCount = 0;

  if (vectorReady) {
    try {
      const extra = await db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM knowledge_documents) AS "documentCount",
          (SELECT COUNT(*)::int FROM knowledge_chunks) AS "chunkCount",
          (
            SELECT COUNT(*)::int
            FROM knowledge_chunks
            JOIN knowledge_documents ON knowledge_documents.id = knowledge_chunks.document_id
            WHERE knowledge_documents.verification_status = 'verified'
          ) AS "verifiedChunkCount"
      `);
      documentCount = extra.rows[0].documentCount;
      chunkCount = extra.rows[0].chunkCount;
      verifiedChunkCount = extra.rows[0].verifiedChunkCount;
    } catch {
      // Tables may not exist yet on a first boot without pgvector.
    }
  }

  return {
    ...rows[0],
    documentCount,
    chunkCount,
    verifiedChunkCount,
  };
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
  if (!service || Number(service.score) < config.retrievalMinScore) {
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

async function findVerifiedChunks(text, { serviceId } = {}) {
  if (!config.enableChunkRag || !vectorReady || !serviceId) {
    return [];
  }

  let embedding;
  try {
    embedding = await embedQuery(text);
  } catch {
    return [];
  }

  if (!embedding) {
    return [];
  }

  try {
    const { rows } = await db.query(
      `
      SELECT
        knowledge_chunks.content,
        knowledge_chunks.source_url AS "sourceUrl",
        knowledge_chunks.verified_at AS "verifiedAt",
        knowledge_documents.title,
        knowledge_documents.filename,
        1 - (knowledge_chunks.embedding <=> $1::vector) AS score
      FROM knowledge_chunks
      JOIN knowledge_documents
        ON knowledge_documents.id = knowledge_chunks.document_id
      WHERE knowledge_chunks.service_id = $2
        AND knowledge_documents.verification_status = 'verified'
        AND knowledge_chunks.embedding IS NOT NULL
      ORDER BY knowledge_chunks.embedding <=> $1::vector
      LIMIT $3
      `,
      [toVectorLiteral(embedding), serviceId, config.chunkTopK],
    );

    return rows
      .filter((row) => Number(row.score) >= config.chunkMinScore)
      .map((row) => ({
        title: row.title,
        filename: row.filename,
        content: row.content,
        sourceUrl: row.sourceUrl,
        verifiedAt: row.verifiedAt,
        score: Number(row.score),
      }));
  } catch {
    return [];
  }
}

module.exports = {
  ensureVectorSchema,
  findBestService,
  findVerifiedChunks,
  getAgencyContacts,
  getAgencySources,
  getKnowledgeSummary,
  getServiceNotes,
  isConsularQuery,
};
