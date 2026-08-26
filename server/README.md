# NagrikAI Server

Separate Node service for the mobile app. It runs on a cloud VM, reads/writes PostgreSQL, applies **fail-closed guardrails**, retrieves government-service knowledge, and returns a grounded assistant response.

The optional local model is **[Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B)** in **non-thinking** mode. It only paraphrases retrieved Postgres rows. It is not the source of truth and has no tools.

## Local Postgres

```bash
docker compose up -d
cp .env.example .env
npm install
npm run init-db
npm start
```

Default local database URL:

```
postgres://nagrikai:nagrikai@localhost:15432/nagrikai
```

## Request pipeline

Fail closed. A gate failure returns a canned bilingual refusal (or unknown). The model is not called.

1. HTTP rate limit, body size cap, optional `x-api-key`
2. PII detect + redact (`[PHONE]`, `[EMAIL]`, `[ID]`) — store and log redacted text only
3. Abuse / profanity / insults (English, Nepali, romanized)
4. Jailbreak / prompt-injection patterns (`/think` and `/no_think` are treated as injection)
5. Scope: Nepal government services only
6. Retrieve with `RETRIEVAL_MIN_SCORE` cutoff; **no consular fallback** unless the query is actually consular/abroad
7. Weak match → `unknown` + one follow-up; no LLM
8. Generate: bilingual template, or Qwen/OpenAI wording
9. Strip `<think>` if present; grounding + PII + abuse + still-in-scope checks
10. Failed output → template fallback, no retry

## Environment

See `.env.example`.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (8080 locally; 80/443 behind a proxy on the VM) |
| `DATABASE_URL` | Postgres (localhost or private Cloud SQL; never `0.0.0.0:5432`) |
| `ENABLE_LLM` | `false` forces templates. `true` allows a model if configured |
| `LLM_BASE_URL` | OpenAI-compatible local API, e.g. `http://127.0.0.1:11434/v1` |
| `LLM_MODEL` | Default `qwen3:0.6b` (Ollama tag for Qwen3-0.6B) |
| `LLM_API_KEY` | Dummy key for Ollama (`ollama` / `EMPTY`) |
| `OPENAI_API_KEY` | Optional cloud fallback if no local base URL |
| `NAGRIKAI_API_KEY` | If set, `/api/*` requires `x-api-key` |
| `RETRIEVAL_MIN_SCORE` | Trigram cutoff (default `0.08`) |
| `ASK_RATE_MAX` / `ASK_RATE_WINDOW_MS` | `/api/ask` limit per IP + deviceId |

Priority: `ENABLE_LLM=false` → templates. Else if `LLM_BASE_URL` is set → local Qwen (thinking **off**). Else if `OPENAI_API_KEY` → OpenAI. Else templates.

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
