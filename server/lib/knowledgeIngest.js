const { chunkText } = require("./chunker");
const config = require("./config");
const db = require("./db");
const { loadDocument, loadManifest, walkDocuments } = require("./documentParser");
const { embedTexts, toVectorLiteral } = require("./embeddings");

async function existingDocument(filename) {
  const { rows } = await db.query(
    `
    SELECT
      id,
      checksum,
      (
        SELECT COUNT(*)::int
        FROM knowledge_chunks
        WHERE knowledge_chunks.document_id = knowledge_documents.id
      ) AS chunk_count
    FROM knowledge_documents
    WHERE filename = $1
    LIMIT 1
    `,
    [filename],
  );
  return rows[0] ?? null;
}

async function lookupService(intent) {
  if (!intent) {
    return null;
  }
  const { rows } = await db.query(
    `
    SELECT id, agency_id
    FROM services
    WHERE intent = $1
    LIMIT 1
    `,
    [intent],
  );
  return rows[0] ?? null;
}

async function upsertDocument(doc, service) {
  const { rows } = await db.query(
    `
    INSERT INTO knowledge_documents (
      filename, title, checksum, service_id, agency_id, source_url,
      verified_at, verification_status, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (filename) DO UPDATE SET
      title = EXCLUDED.title,
      checksum = EXCLUDED.checksum,
      service_id = EXCLUDED.service_id,
      agency_id = EXCLUDED.agency_id,
      source_url = EXCLUDED.source_url,
      verified_at = EXCLUDED.verified_at,
      verification_status = EXCLUDED.verification_status,
      updated_at = NOW()
    RETURNING id
    `,
    [
      doc.filename,
      doc.title,
      doc.checksum,
      service?.id ?? null,
      service?.agency_id ?? null,
      doc.sourceUrl || null,
      doc.verifiedAt || null,
      doc.verificationStatus,
    ],
  );
  return rows[0];
}

async function replaceChunks(documentId, chunks, embeddings, doc, service) {
  await db.query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [documentId]);

  for (let index = 0; index < chunks.length; index += 1) {
    await db.query(
      `
      INSERT INTO knowledge_chunks (
        document_id, service_id, agency_id, chunk_index, content,
        embedding, source_url, verified_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)
      `,
      [
        documentId,
        service?.id ?? null,
        service?.agency_id ?? null,
        index,
        chunks[index],
        toVectorLiteral(embeddings[index]),
        doc.sourceUrl || null,
        doc.verifiedAt || null,
      ],
    );
  }
}

async function ingestKnowledgeBase({ dryRun = false } = {}) {
  const rootDir = config.knowledgeBaseDir;
  const files = walkDocuments(rootDir);
  const manifest = loadManifest(rootDir);
  const summary = { scanned: files.length, ingested: 0, skipped: 0, unverified: 0 };

  if (!files.length) {
    return { ...summary, rootDir, message: "No .txt, .md, or .docx files found." };
  }

  for (const filePath of files) {
    const doc = await loadDocument(filePath, rootDir, manifest);
    const service = await lookupService(doc.intent);
    const chunks = chunkText(doc.body);

    if (!chunks.length) {
      summary.skipped += 1;
      console.warn(`skip empty: ${doc.filename}`);
      continue;
    }

    if (doc.verificationStatus !== "verified") {
      summary.unverified += 1;
    }
    if (doc.intent && !service) {
      console.warn(
        `unknown intent '${doc.intent}' in ${doc.filename}; chunks will not be retrieved`,
      );
    }

    if (dryRun) {
      console.log(
        `dry-run ${doc.filename}: chunks=${chunks.length} intent=${doc.intent || "none"} status=${doc.verificationStatus}`,
      );
      summary.ingested += 1;
      continue;
    }

    const previous = await existingDocument(doc.filename);
    const saved = await upsertDocument(doc, service);
    if (previous?.checksum === doc.checksum && Number(previous.chunk_count) > 0) {
      summary.skipped += 1;
      console.log(`unchanged ${doc.filename}`);
      continue;
    }

    const embeddings = await embedTexts(chunks);
    await replaceChunks(saved.id, chunks, embeddings, doc, service);
    summary.ingested += 1;
    console.log(`ingested ${doc.filename} (${chunks.length} chunks, ${doc.verificationStatus})`);
  }

  return { ...summary, rootDir };
}

module.exports = {
  ingestKnowledgeBase,
};
