# NagrikAI

Mobile MVP for a Nepal government navigator. The app is Android/iOS only and uses a messenger-style conversation with native speech recognition for Nepali and English. The server is separate and is intended to run on a cloud VM with PostgreSQL.

## Mobile App

```bash
npm install
npm start
```

Native speech recognition requires an Expo development build because it uses iOS and Android native permissions:

```bash
npx expo run:android
npx expo run:ios
```

Set `EXPO_PUBLIC_API_URL` to your server origin for mobile builds:

```bash
EXPO_PUBLIC_API_URL=http://your-server npm start
```

Release builds bake in `EXPO_PUBLIC_API_URL` from `eas.json`. The production API listens on HTTP port 80.

Voice conversation uses turn detection: tap the mic, speak, pause, and NagrikAI replies automatically. Open the ⋯ menu for recent conversations stored in PostgreSQL.

### Auto release (EAS + GitHub Actions)

Pushing to `master` that touches Android/iOS (or app config/assets that ship in the native binary) runs [`.github/workflows/eas-mobile-release.yml`](.github/workflows/eas-mobile-release.yml):

1. EAS Build: Android APK (`preview`) + iOS Simulator (`preview-simulator`)
2. GitHub Release with those artifacts attached

One-time setup:

1. Create an Expo access token: [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens)
2. Add repo secret `EXPO_TOKEN` (GitHub → Settings → Secrets and variables → Actions)
3. Optional: connect the Expo GitHub app under the project’s GitHub settings so [`.eas/workflows/mobile-release.yml`](.eas/workflows/mobile-release.yml) can also run from the EAS dashboard

Manual run: Actions → **EAS Mobile Release** → Run workflow.

If tag `vX.Y.Z` already exists for `app.json`’s version, CI publishes `vX.Y.Z-build.<run>` instead.

## Server

```bash
cd server
npm install
cp .env.example .env
docker compose up -d
npm run init-db
npm run ingest-knowledge
npm start
```

Required environment:

```bash
DATABASE_URL=postgres://user:password@host:5432/nagrikai
PORT=8080
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

Endpoints:

- `GET /health`
- `GET /api/knowledge`
- `GET /api/sessions?deviceId=...`
- `GET /api/sessions/:id?deviceId=...`
- `DELETE /api/sessions/:id?deviceId=...`
- `POST /api/ask` with `{ "text": "...", "language": "ne-NP" | "en-US", "deviceId": "...", "sessionId": "..." }`

## Knowledge Base

Government **contacts and offices** live in PostgreSQL tables (`agencies`, `services`, `aliases`, `contacts`, `sources`). The model may only cite those rows.

Process guidance is ingested from the `knowledge-base/` folder (`.txt`, `.md`, `.docx`). `npm run ingest-knowledge` chunks verified files, embeds them with **Qwen3-Embedding-0.6B**, and stores vectors in `pgvector`. Retrieval is fail-closed: a service must match first, then only that service’s verified chunks are added to the prompt. Unverified files are stored but never retrieved. The mobile app does not own government contact data.

`npm run crawl-knowledge` (from `server/`) refreshes verified contacts, notes, and embeddings from allowlisted official websites. Dated official social/RSS items older than 90 days are ignored.

## Guardrails

The server blocks off-topic requests before retrieval or AI generation. NagrikAI only answers Nepal government-service navigation questions, uses retrieved PostgreSQL knowledge as the source of truth, and refuses general chat or unrelated subjects with a short redirect.

## Ask pipeline

Here is the path for one question, e.g. “मेरो राहदानी हरायो, कहाँ सम्पर्क गर्ने?”

![Ask pipeline](docs/ask-pipeline.png)

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
