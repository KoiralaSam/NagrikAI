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

Set the VM API URL for mobile builds:

```bash
EXPO_PUBLIC_API_URL=http://34.30.50.212 npm start
```

Release builds bake in `http://34.30.50.212` (see `eas.json`). The production API listens on HTTP port 80.

Voice conversation uses turn detection: tap the mic, speak, pause, and NagrikAI replies automatically. Open the ⋯ menu for recent conversations stored in PostgreSQL.

## Server

```bash
cd server
npm install
cp .env.example .env
npm run init-db
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

The PostgreSQL schema stores agencies, services, aliases, contacts, sources, knowledge notes, and chat sessions. Add verified government information through SQL migrations or an admin tool later; the mobile app does not own government contact data.

## Guardrails

The server blocks off-topic requests before retrieval or AI generation. NagrikAI only answers Nepal government-service navigation questions, uses retrieved PostgreSQL knowledge as the source of truth, and refuses general chat or unrelated subjects with a short redirect.
