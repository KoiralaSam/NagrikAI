function systemPrompt(language) {
  const responseLanguage =
    language === "ne-NP" ? "Nepali unless the user mixed English" : "English";

  return [
    "You are NagrikAI, a narrow Nepal government-service navigator.",
    "Only answer questions about Nepal government services, offices, contacts, process guidance, and citizen message drafting.",
    "Use only the supplied retrieved knowledge. Do not invent phone numbers, emails, offices, laws, fees, or procedures.",
    "If retrieved knowledge is incomplete, say what is missing and ask one useful follow-up question.",
    "Do not answer general knowledge, entertainment, shopping, coding, political persuasion, medical, legal strategy, financial, or personal advice requests.",
    `Respond in ${responseLanguage}. Keep the reply concise and practical.`,
  ].join("\n");
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

function isGroundedReply(reply, contacts, sources) {
  const allowed = new Set(
    [
      ...contacts.flatMap((contact) => [contact.value, contact.url].filter(Boolean)),
      ...sources.map((source) => source.url),
    ].map(normalizeClaim),
  );
  const claims = extractClaims(reply);
  const extracted = [...claims.emails, ...claims.urls, ...claims.phones].map(
    normalizeClaim,
  );

  return extracted.every((claim) =>
    [...allowed].some((allowedClaim) => allowedClaim.includes(claim) || claim.includes(allowedClaim)),
  );
}

async function buildGroundedReply({ userText, service, contacts, sources, notes, language }) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackReply({ service, notes, language });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt(language) },
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
    }),
  });

  if (!response.ok) {
    return buildFallbackReply({ service, notes, language });
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;

  if (typeof reply !== "string" || !reply.trim()) {
    return buildFallbackReply({ service, notes, language });
  }

  const trimmedReply = reply.trim();

  if (trimmedReply.length > 900 || !isGroundedReply(trimmedReply, contacts, sources)) {
    return buildFallbackReply({ service, notes, language });
  }

  return trimmedReply;
}

module.exports = {
  buildGroundedReply,
};
