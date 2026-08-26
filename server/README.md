# NagrikAI Server

Separate Node service for the mobile app. It runs on a cloud VM, reads/writes PostgreSQL, applies guardrails, retrieves government-service knowledge, and returns the assistant response.

## Local Postgres

```bash
docker compose up -d
cp .env.example .env
npm install
npm run init-db
npm start
```

Default local database URL:

```bash
postgres://nagrikai:nagrikai@localhost:15432/nagrikai
```

## Production VM

Install Node.js and PostgreSQL, create a database, set `DATABASE_URL`, then run:

```bash
npm install --omit=dev
npm run init-db
PORT=8080 npm start
```

Set `OPENAI_API_KEY` only when you want model-generated wording. Without it, the server still returns deterministic grounded responses from PostgreSQL.

Chat sessions and messages are stored in PostgreSQL. The server creates those tables on startup if they are missing.

## Guardrails

Requests are blocked unless they fit Nepal government-service navigation. The server logs every allowed/blocked decision in `guardrail_events`. AI wording, when enabled, is instructed to use only retrieved database rows and refuse unrelated subjects.
