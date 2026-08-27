# Crawled official pages

This folder is written by `npm run crawl-knowledge`. Do not put unofficial files here.

Each `{intent}.md` file is generated from allowlisted `.gov.np` pages (and dated official social/RSS items younger than 90 days). Phone numbers and emails are stripped so contacts stay in PostgreSQL `contacts` / `sources` only.

Re-run ingest is included in the crawl command unless you pass `--no-embed`.
