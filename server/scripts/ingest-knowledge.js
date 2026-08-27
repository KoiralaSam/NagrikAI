#!/usr/bin/env node

require("dotenv").config();

const db = require("../lib/db");
const { ingestKnowledgeBase } = require("../lib/knowledgeIngest");
const { ensureVectorSchema } = require("../lib/knowledgeRepository");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const ready = await ensureVectorSchema();
  if (!ready && !dryRun) {
    throw new Error(
      "pgvector is not available. Use the pgvector/pgvector:pg16 image and rerun.",
    );
  }

  const summary = await ingestKnowledgeBase({ dryRun });
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
