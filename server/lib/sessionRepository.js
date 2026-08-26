const crypto = require("crypto");
const db = require("./db");

function createId() {
  return crypto.randomUUID();
}

function titleFrom(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 48) {
    return compact;
  }

  return `${compact.slice(0, 45).trim()}...`;
}

function isConcreteSubject(intent) {
  return Boolean(intent) && intent !== "out_of_scope" && intent !== "unknown";
}

async function ensureSessionSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New chat',
      subject TEXT,
      language TEXT NOT NULL DEFAULT 'ne-NP',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      text TEXT NOT NULL,
      result_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS chat_sessions_device_updated_idx
      ON chat_sessions (device_id, updated_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
      ON chat_messages (session_id, created_at)
  `);
}

function mapSession(row) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    language: row.language,
    preview: row.preview ?? undefined,
    messageCount: row.message_count === undefined ? undefined : Number(row.message_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    result: row.result_json ?? undefined,
    createdAt: row.created_at,
  };
}

async function createSession({ deviceId, language, title, subject }) {
  const id = createId();
  const { rows } = await db.query(
    `
    INSERT INTO chat_sessions (id, device_id, title, subject, language)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, title, subject, language, created_at, updated_at
    `,
    [id, deviceId, title || "New chat", subject ?? null, language],
  );

  return mapSession(rows[0]);
}

async function getSession(sessionId, deviceId) {
  const { rows } = await db.query(
    `
    SELECT id, title, subject, language, created_at, updated_at
    FROM chat_sessions
    WHERE id = $1
    `,
    [sessionId],
  );

  if (!rows[0]) {
    return null;
  }

  if (deviceId) {
    await db.query(`UPDATE chat_sessions SET device_id = $2 WHERE id = $1 AND device_id <> $2`, [
      sessionId,
      deviceId,
    ]);
  }

  return mapSession(rows[0]);
}

async function listSessions(deviceId) {
  const { rows } = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.subject,
      s.language,
      s.created_at,
      s.updated_at,
      (
        SELECT m.text
        FROM chat_messages m
        WHERE m.session_id = s.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS preview,
      (
        SELECT COUNT(*)::int
        FROM chat_messages m
        WHERE m.session_id = s.id
      ) AS message_count
    FROM chat_sessions s
    ORDER BY (s.device_id = $1) DESC, s.updated_at DESC
    LIMIT 80
    `,
    [deviceId],
  );

  return rows
    .filter((row) => Number(row.message_count) > 0)
    .map(mapSession);
}

async function getSessionWithMessages(sessionId, deviceId) {
  const session = await getSession(sessionId, deviceId);
  if (!session) {
    return null;
  }

  const { rows } = await db.query(
    `
    SELECT id, role, text, result_json, created_at
    FROM chat_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
    `,
    [sessionId],
  );

  return {
    session,
    messages: rows.map(mapMessage),
  };
}

async function updateSession(sessionId, { title, subject, language }) {
  const { rows } = await db.query(
    `
    UPDATE chat_sessions
    SET
      title = COALESCE($2, title),
      subject = COALESCE($3, subject),
      language = COALESCE($4, language),
      updated_at = NOW()
    WHERE id = $1
    RETURNING id, title, subject, language, created_at, updated_at
    `,
    [sessionId, title ?? null, subject ?? null, language ?? null],
  );

  return rows[0] ? mapSession(rows[0]) : null;
}

async function addMessage(sessionId, role, text, result) {
  const id = createId();
  const { rows } = await db.query(
    `
    INSERT INTO chat_messages (id, session_id, role, text, result_json)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, role, text, result_json, created_at
    `,
    [id, sessionId, role, text, result ?? null],
  );

  await db.query(`UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`, [sessionId]);
  return mapMessage(rows[0]);
}

async function deleteSession(sessionId) {
  const { rowCount } = await db.query(`DELETE FROM chat_sessions WHERE id = $1`, [sessionId]);
  return rowCount > 0;
}

async function persistTurn({ deviceId, sessionId, language, userText, result }) {
  if (!deviceId) {
    return { session: null, startedNewSession: false };
  }

  const subject = isConcreteSubject(result.intent) ? result.intent : null;
  let session = sessionId ? await getSession(sessionId, deviceId) : null;
  let startedNewSession = false;

  if (!session) {
    session = await createSession({
      deviceId,
      language,
      title: titleFrom(userText),
      subject,
    });
    startedNewSession = true;
  } else if (subject && session.subject && session.subject !== subject) {
    session = await createSession({
      deviceId,
      language,
      title: titleFrom(userText),
      subject,
    });
    startedNewSession = true;
  } else {
    const nextTitle = session.title === "New chat" ? titleFrom(userText) : session.title;
    session = await updateSession(session.id, {
      title: nextTitle,
      subject: subject ?? session.subject,
      language,
    });
  }

  await addMessage(session.id, "user", userText);
  await addMessage(session.id, "assistant", result.answer, result);

  return { session, startedNewSession };
}

module.exports = {
  createSession,
  deleteSession,
  ensureSessionSchema,
  getSessionWithMessages,
  listSessions,
  persistTurn,
};
