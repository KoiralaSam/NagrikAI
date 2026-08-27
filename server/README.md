# NagrikAI Server

Separate Node service for the mobile app. It runs on a cloud VM, reads/writes PostgreSQL, applies **fail-closed guardrails**, retrieves government-service knowledge, and returns a grounded assistant response.

The optional local chat model is **[Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B)** in **non-thinking** mode. It only paraphrases retrieved Postgres rows plus verified document chunks. It is not the source of truth and has no tools.

Embeddings use a separate model in the same family: **[Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)** (`qwen3-embedding:0.6b`). Do not embed with the chat model.

## Local Postgres

Postgres must include **pgvector** (`pgvector/pgvector:pg16` in `docker-compose.yml`).

```bash
docker compose up -d
cp .env.example .env
npm install
npm run init-db
ollama pull qwen3-embedding:0.6b
npm run ingest-knowledge
npm start
```

Default local database URL:

```
postgres://nagrikai:nagrikai@localhost:15432/nagrikai
```

## Request pipeline

Here is the path for one question, e.g. “मेरो राहदानी हरायो, कहाँ सम्पर्क गर्ने?”

![Ask pipeline](../docs/ask-pipeline.png)

Fail closed: a gate failure never calls retrieval or the model.

### 1. HTTP

The app posts `{ text, language, deviceId, sessionId }` to `/api/ask`. The server checks IP+device rate limit and body length, then calls `answerRequest`.

### 2. PII, then scope

The stored/logged text is redacted (`[PHONE]`, `[EMAIL]`, `[ID]`). Then guardrails run in order: abuse → jailbreak → blocked topics → must look like a Nepal government-service question.

- **Blocked:** bilingual canned refusal. Stop.
- **Allowed:** log `guardrail_events`, continue.

A joke, medical ask, or “ignore previous instructions” never reaches Postgres or Qwen.

### 3. Pick a service from tables (not vectors)

`findBestService` uses trigram similarity on `services.name` and `service_aliases`.

- Consular words (`abroad`, `दूतावास`, …) force `consular_abroad_help`.
- Otherwise the best row wins, unless it is consular and the query is not.
- Score `< RETRIEVAL_MIN_SCORE` (default `0.08`) → **unknown**, one follow-up, **no LLM**.

That is how “राहदानी हरायो” becomes `passport_problem` / Department of Passports. Embeddings do not choose the office.

### 4. Load facts for that service

In parallel:

| Source | What it is |
|---|---|
| `contacts` | Phones, emails, websites the model may cite |
| `sources` | Official URLs |
| `knowledge_notes` | Short SQL notes (used even if LLM is off) |
| `knowledge_chunks` | Embed the query with Qwen3-Embedding-0.6B, cosine search, `service_id` filter, verified docs only, top 3 above `CHUNK_MIN_SCORE` |

If pgvector or Ollama is down, chunks are `[]`. The structured rows still answer.

### 5. Generate

`buildGroundedReply` builds a template from `summary_ne` / `summary_en` + first note.

- `ENABLE_LLM=false` → that template is the answer.
- LLM on → Qwen gets one JSON blob: user text, service row, contacts, sources, notes, `retrievedChunks`. It may only paraphrase that JSON. Contacts still come from the table, not from Word chunks.

Then output checks: strip `<think>`, length cap, abuse/scope, **every phone/email/URL must appear in retrieved contacts/sources**, no extra PII. Fail → template, no retry.

### 6. Response + session

The app gets `intent`, `answer`, `confidence`, `agency.contacts`, `followUpQuestion`, `messageDraft`. The user turn is stored **redacted**. `redactedUserText` is stripped before it goes to the client.

Document chunks never choose the agency. Phones, emails, and URLs must still appear in `contacts` / `sources`.

## Environment

See `.env.example`.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (8080 locally; 80/443 behind a proxy on the VM) |
| `DATABASE_URL` | Postgres (localhost or private Cloud SQL; never `0.0.0.0:5432`) |
| `ENABLE_LLM` | `false` forces templates. `true` allows a model if configured |
| `LLM_BASE_URL` | OpenAI-compatible local API, e.g. `http://127.0.0.1:11434/v1` |
| `LLM_MODEL` | Default `qwen3:0.6b` (Ollama tag for Qwen3-0.6B chat) |
| `LLM_API_KEY` | Dummy key for Ollama (`ollama` / `EMPTY`) |
| `OPENAI_API_KEY` | Optional cloud fallback if no local base URL |
| `NAGRIKAI_API_KEY` | If set, `/api/*` requires `x-api-key` |
| `RETRIEVAL_MIN_SCORE` | Trigram cutoff for service match (default `0.08`) |
| `ENABLE_CHUNK_RAG` | `false` skips document-vector retrieval |
| `CHUNK_TOP_K` | Max verified chunks per ask (default `3`) |
| `CHUNK_MIN_SCORE` | Cosine similarity cutoff for chunks (default `0.35`) |
| `EMBEDDING_MODEL` | Default `qwen3-embedding:0.6b` |
| `EMBEDDING_BASE_URL` | Embedding API; defaults to `LLM_BASE_URL` |
| `EMBEDDING_DIMENSIONS` | Must match `vector(1024)` in `schema.sql` |
| `KNOWLEDGE_BASE_DIR` | Document drop folder (default repo `knowledge-base/`) |
| `ASK_RATE_MAX` / `ASK_RATE_WINDOW_MS` | `/api/ask` limit per IP + deviceId |
| `CRAWL_DELAY_MS` | Delay between HTTP fetches (default `1500`) |
| `CRAWL_MAX_PAGES_PER_AGENCY` | Per-agency page cap (default `8`) |
| `SOCIAL_MAX_AGE_DAYS` | Max age for social/news items (default `90`) |
| `FACEBOOK_ACCESS_TOKEN` | Optional Graph API token for official page posts |
| `TWITTER_BEARER_TOKEN` | Optional X API token for official account posts |

Priority: `ENABLE_LLM=false` → templates. Else if `LLM_BASE_URL` is set → local Qwen (thinking **off**). Else if `OPENAI_API_KEY` → OpenAI. Else templates.

If the embedding endpoint is down, the ask still returns from SQL service rows; chunks are omitted.

## Knowledge ingest

Drop `.txt`, `.md`, or `.docx` files in `knowledge-base/` with verified frontmatter (`intent`, `source_url`, `verified_at`, `verification_status: verified`). See `knowledge-base/README.md`.

```bash
ollama pull qwen3-embedding:0.6b
npm run ingest-knowledge
npm run ingest-knowledge -- --dry-run
```

`npm run init-db` reseeds agencies/services and truncates document chunks. Re-run ingest after that. Crawl history (`crawl_runs` / `crawl_pages`) is also truncated; run `npm run crawl-knowledge` again to refresh verified contacts.

## Official source crawler

The crawler verifies and updates SQL rows plus embeddings from **allowlisted official sources only**. It does not search the open web.

```bash
npm run crawl-knowledge -- --dry-run
npm run crawl-knowledge -- --intent passport_problem
npm run crawl-knowledge
```

`--dry-run` fetches and extracts but does not write the database or `knowledge-base/crawled/`. `--no-embed` skips re-embedding. `--intent passport_problem,pan_tax_help` limits the catalog.

**Standing pages** (contact / about / service pages on `.gov.np`, plus a few extra hosts in the catalog) can update `agencies`, `services`, `contacts`, `sources`, and `knowledge_notes` when the phone or email actually appears on that page.

**Social / news** (Facebook, X, YouTube, site RSS) is used only if:

- the account was listed in the catalog or linked from that agency’s official website
- the item has a parseable date
- the date is **< 90 days** old (`SOCIAL_MAX_AGE_DAYS`)

Facebook and X **posts** need `FACEBOOK_ACCESS_TOKEN` / `TWITTER_BEARER_TOKEN`. Without those tokens the crawler still stores official profile URLs as `contacts.type = social` and still reads YouTube RSS plus RSS/Atom feeds advertised on the official site. It will not scrape Facebook HTML or ingest undated posts.

Officer mobile directories (for example long IRD information-officer tables) are not stored as citizen hotlines. Landlines, enquiry/hotline numbers, and `@*.gov.np` emails are preferred.

See `data/official-catalog.json` to add another ministry or service. New intents become retrievable after a successful crawl (or a seed insert).

## Local Qwen3-0.6B (non-thinking)

Use **Ollama** or **llama.cpp** on CPU. Do **not** expose 11434/8000, and do **not** run vLLM/SGLang on the e2-standard-4 box.

Hugging Face source: [`Qwen/Qwen3-0.6B`](https://huggingface.co/Qwen/Qwen3-0.6B). GGUF: [`unsloth/Qwen3-0.6B-GGUF`](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF).

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
ollama pull qwen3:0.6b
ollama pull qwen3-embedding:0.6b
```

Confirm the model is localhost-only:

```bash
ss -lntp | grep 11434
curl -s http://127.0.0.1:11434/api/tags
# From another host, this must fail:
# curl http://<PUBLIC_IP>:11434/api/tags
```

Then in `server/.env`:

```
ENABLE_LLM=true
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=qwen3:0.6b
LLM_API_KEY=ollama
```

The server calls Ollama's native `/api/chat` with `think: false` (the OpenAI-compatible `/v1` path still emits a reasoning scratchpad on this model). It also prefixes `/no_think` in the system prompt, caps new tokens at 384, and discards any `<think>` block. Do not give Qwen tools or MCP.

## Host firewall

Ollama (`11434`) and Postgres (`15432`) bind to localhost. The host still rate-limits public ports and drops other inbound traffic:

```bash
sudo chmod +x scripts/vm-firewall.sh
sudo cp scripts/nagrikai-firewall.service /etc/systemd/system/nagrikai-firewall.service
sudo systemctl daemon-reload
sudo systemctl enable --now nagrikai-firewall
```

Allowed from the internet: SSH `:22` (6 new connections/min/IP) and HTTP `:80` (40 new connections/min/IP). New TCP/UDP to every other port is dropped. The Node app also rate-limits HTTP (`HTTP_RATE_MAX`) and `/api/ask` (`ASK_RATE_MAX`).

In GCP, allow only `80` and SSH. Do **not** open `11434`, `8000`, or `5432`.

## Production VM

Install Node.js and PostgreSQL, create a database, set `DATABASE_URL`, then run:

```bash
npm install --omit=dev
npm run init-db
npm run ingest-knowledge
npm run crawl-knowledge
PORT=8080 npm start
```

Bind Postgres to localhost. Keep secrets in the VM env, not in git.

Chat sessions and messages are stored in PostgreSQL. The server creates those tables on startup if they are missing. User turns are stored **after PII redaction**.

## Guardrails

Requests are blocked unless they fit Nepal government-service navigation. Abuse, jailbreaks, and off-topic prompts never reach retrieval or the model. The server logs every allowed/blocked decision in `guardrail_events` using redacted text.

## Eval

```bash
npm run eval
```

This runs unit checks plus `eval/cases.json` (50+ cases: in-scope, weak match, out-of-scope, abuse, PII, grounding traps, jailbreak, mixed language, consular). `ENABLE_LLM` is forced off unless `EVAL_ENABLE_LLM=true`, so the suite is deterministic against templates + gates.

No case may invent a contact. Failures exit non-zero.
