#!/usr/bin/env node

require("dotenv").config();

const db = require("../lib/db");
const { runCrawl } = require("../lib/crawler");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return "";
  }
  return process.argv[index + 1] || "";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const embed = !process.argv.includes("--no-embed");
  const intent = argValue("--intent") || process.env.CRAWL_INTENT || "";

  const summary = await runCrawl({ dryRun, embed, intent });
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
