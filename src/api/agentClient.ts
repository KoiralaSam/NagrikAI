import {
  AgentRequest,
  AskResponse,
  ChatMessage,
  ChatSession,
} from "../types/agent";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export async function askAgent(
  apiBaseUrl: string,
  payload: AgentRequest,
): Promise<AskResponse> {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/api/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function listSessions(apiBaseUrl: string, deviceId: string) {
  const response = await fetch(
    `${trimTrailingSlash(apiBaseUrl)}/api/sessions?deviceId=${encodeURIComponent(deviceId)}`,
  );

  if (!response.ok) {
    throw new Error(`Could not load sessions: ${response.status}`);
  }

  const payload = (await response.json()) as { sessions: ChatSession[] };
  return payload.sessions;
}

export async function getSession(
  apiBaseUrl: string,
  deviceId: string,
  sessionId: string,
) {
  const response = await fetch(
    `${trimTrailingSlash(apiBaseUrl)}/api/sessions/${encodeURIComponent(sessionId)}?deviceId=${encodeURIComponent(deviceId)}`,
  );

  if (!response.ok) {
    throw new Error(`Could not load conversation: ${response.status}`);
  }

  return response.json() as Promise<{
    session: ChatSession;
    messages: ChatMessage[];
  }>;
}

export async function deleteSession(
  apiBaseUrl: string,
  deviceId: string,
  sessionId: string,
) {
  const response = await fetch(
    `${trimTrailingSlash(apiBaseUrl)}/api/sessions/${encodeURIComponent(sessionId)}?deviceId=${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`Could not delete conversation: ${response.status}`);
  }
}
