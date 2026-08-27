# Knowledge base

Drop verified Nepal government-service documents here. The ingest script chunks them, embeds them with **Qwen3-Embedding-0.6B**, and stores vectors in PostgreSQL (`pgvector`).

The chat model (`qwen3:0.6b`) is not used for embeddings. Phone numbers, emails, and office URLs still come from the `contacts` / `sources` tables, not from these files.

## Supported files

- `.txt`, `.md` (UTF-8)
- `.docx` (Word). Optional sidecar: `filename.docx.meta.json`

`README.md` and `manifest.json` are not ingested.

## Make a document citable

Verified frontmatter is required. Unverified files are stored but never retrieved.

```
---
intent: passport_problem
title: Lost passport guidance
source_url: https://nepalpassport.gov.np/en
verified_at: 2026-08-26
verification_status: verified
---
```

`intent` must match a row in `services.intent`. You can also map filenames in `manifest.json`.

Do not put unofficial phone numbers or emails in documents. Grounding will reject an answer that cites a contact not stored in Postgres.

## Ingest

```bash
cd server
ollama pull qwen3-embedding:0.6b
npm run ingest-knowledge
npm run ingest-knowledge -- --dry-run
```

Re-run ingest after adding or editing files. Unchanged checksums are skipped.
