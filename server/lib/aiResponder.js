const { hasUnexpectedPii } = require("./pii");
const { evaluateOutputSafety } = require("./guardrails");

const MAX_ANSWER_CHARS = 900;
const MAX_NEW_TOKENS = 384;

function systemPrompt(language, { local = false } = {}) {
  const responseLanguage =
    language === "ne-NP" ? "Nepali unless the user mixed English" : "English";

  return [
    local ? "/no_think" : null,
    "You are NagrikAI, a narrow Nepal government-service navigator.",
    "Only answer questions about Nepal government services, offices, contacts, process guidance, and citizen message drafting.",
    "Use only the supplied retrieved JSON. Do not add phone numbers, emails, URLs, offices, fees, or procedures that are not in that JSON.",
    "If retrieved knowledge is incomplete, say what is missing and ask one useful follow-up question.",
    "Do not answer general knowledge, entertainment, shopping, coding, political persuasion, medical, legal strategy, financial, or personal advice requests.",
    "Do not emit <think> tags or hidden scratchpads.",
    `Respond in ${responseLanguage}. Keep the reply concise and practical.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFallbackReply({ service, notes, language }) {
  const isNepali = language === "ne-NP";
  const summary = isNepali ? service.summary_ne : service.summary_en;
  const verified = service.verification_status === "verified";
  const note = notes[0]?.body;

  if (isNepali) {
    return `${summary} ${verified ? "तलको सम्पर्क विवरण आधिकारिक स्रोतबाट राखिएको छ।" : "यो routing result हो; उत्पादनमा प्रयोग गर्नु अघि स्थानीय कार्यालय विवरण verify गर्नुपर्छ।"}${note ? ` नोट: ${note}` : ""}`;
  }

  return `${summary} ${verified ? "The contact details below are stored from official sources." : "This is a routing result; verify the local office details before production use."}${note ? ` Note: ${note}` : ""}`;
}

function extractClaims(text) {
  return {
    emails: text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
    urls: text.match(/https?:\/\/[^\s)]+/gi) ?? [],
    phones: text.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) ?? [],
  };
}

function normalizeClaim(value) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}@.:/-]/gu, "");
}

function allowedValues(contacts = [], sources = []) {
  return [
    ...contacts.flatMap((contact) => [contact.value, contact.url].filter(Boolean)),
    ...sources.map((source) => source.url).filter(Boolean),
  ];
}

function isGroundedReply(reply, contacts, sources) {
  const allowed = new Set(allowedValues(contacts, sources).map(normalizeClaim));
  const claims = extractClaims(reply);
  const extracted = [...claims.emails, ...claims.urls, ...claims.phones].map(
    normalizeClaim,
  );

  return extracted.every((claim) =>
    [...allowed].some(
      (allowedClaim) =>
        allowedClaim.includes(claim) || claim.includes(allowedClaim),
    ),
  );
}

function stripThink(text) {
  let out = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = out.search(/<think>/i);
  if (open >= 0) {
    out = out.slice(0, open);
  }
  return out.replace(/<\/think>/gi, "").trim();
}

function resolveLlm() {
  if (process.env.ENABLE_LLM === "false") {
    return null;
  }

  const baseUrl = (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, "");
  if (baseUrl) {
    return {
      local: true,
      baseUrl,
      model: process.env.LLM_MODEL || "qwen3:0.6b",
      apiKey: process.env.LLM_API_KEY || "ollama",
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      local: false,
      baseUrl: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  return null;
}

async function completeOllamaChat({ messages, baseUrl, model }) {
  const origin = baseUrl.replace(/\/v1\/?$/, "");
  const response = await fetch(`${origin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      options: {
        temperature: 0.3,
        top_p: 0.8,
        num_predict: MAX_NEW_TOKENS,
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const reply = data?.message?.content;
  return typeof reply === "string" ? reply : null;
}

async function completeOpenAiChat({ messages, baseUrl, model, apiKey }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: MAX_NEW_TOKENS,
      messages,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;
  return typeof reply === "string" ? reply : null;
}

async function completeChat(llm) {
  if (llm.local) {
    return completeOllamaChat(llm);
  }

  return completeOpenAiChat(llm);
}

function isSafeReply(reply, contacts, sources) {
  if (!reply || reply.length > MAX_ANSWER_CHARS) {
    return false;
  }

  if (!evaluateOutputSafety(reply).ok) {
    return false;
  }

  if (!isGroundedReply(reply, contacts, sources)) {
    return false;
  }

  if (hasUnexpectedPii(reply, allowedValues(contacts, sources))) {
    return false;
  }

  return true;
}

async function buildGroundedReply({
  userText,
  service,
  contacts,
  sources,
  notes,
  language,
}) {
  const fallback = buildFallbackReply({ service, notes, language });
  const llm = resolveLlm();
  if (!llm) {
    return fallback;
  }

  let raw;
  try {
    raw = await completeChat({
      ...llm,
      messages: [
        { role: "system", content: systemPrompt(language, { local: llm.local }) },
        {
          role: "user",
          content: JSON.stringify({
            userText,
            retrievedService: {
              name: service.name,
              intent: service.intent,
              summary_ne: service.summary_ne,
              summary_en: service.summary_en,
              verification_status: service.verification_status,
              last_verified_at: service.last_verified_at,
            },
            contacts,
            sources,
            notes,
          }),
        },
      ],
    });
  } catch {
    return fallback;
  }

  if (!raw) {
    return fallback;
  }

  const reply = stripThink(raw);
  if (!isSafeReply(reply, contacts, sources)) {
    return fallback;
  }

  return reply;
}

module.exports = {
  buildFallbackReply,
  buildGroundedReply,
  isGroundedReply,
  resolveLlm,
  stripThink,
};
