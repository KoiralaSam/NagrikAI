const {
  findBestService,
  getAgencyContacts,
  getAgencySources,
  getServiceNotes,
} = require("./knowledgeRepository");
const { buildGroundedReply } = require("./aiResponder");
const {
  buildOutOfScopeResponse,
  evaluateScope,
  logGuardrailEvent,
} = require("./guardrails");
const { buildMessageDraft } = require("./messageTemplates");

function normalizeLanguage(language) {
  return language === "en-US" ? "en-US" : "ne-NP";
}

function confidenceFrom(service) {
  if (!service || Number(service.score) < 0.08) {
    return "low";
  }

  if (service.verification_status !== "verified") {
    return "medium";
  }

  return "high";
}

function buildFollowUp(intent, language) {
  const isNepali = language === "ne-NP";

  if (intent === "citizenship_certificate_help") {
    return isNepali
      ? "तपाईं कुन जिल्ला प्रशासन कार्यालय अन्तर्गत पर्नुहुन्छ?"
      : "Which district administration office applies to you?";
  }

  if (intent === "consular_abroad_help") {
    return isNepali
      ? "तपाईं अहिले कुन देश वा राज्यमा हुनुहुन्छ?"
      : "Which country or state are you currently in?";
  }

  return undefined;
}

async function answerRequest({ text, language }) {
  const selectedLanguage = normalizeLanguage(language);
  const scope = evaluateScope(text);

  if (!scope.allowed) {
    await logGuardrailEvent({
      text,
      language: selectedLanguage,
      decision: "blocked",
      reason: scope.reason,
    });

    return buildOutOfScopeResponse(selectedLanguage);
  }

  await logGuardrailEvent({
    text,
    language: selectedLanguage,
    decision: "allowed",
    reason: scope.reason,
  });

  const service = await findBestService(text);

  if (!service) {
    return {
      intent: "unknown",
      service: "Unknown service",
      confidence: "low",
      answer:
        selectedLanguage === "ne-NP"
          ? "मैले यो समस्या मिल्ने verified government service भेटिनँ। कृपया थप विवरण दिनुहोस्।"
          : "I could not match this to a verified government service. Please add more detail.",
    };
  }

  const [contacts, sources, notes] = await Promise.all([
    getAgencyContacts(service.agency_id),
    getAgencySources(service.agency_id),
    getServiceNotes(service.id),
  ]);
  const answer = await buildGroundedReply({
    userText: text,
    service,
    contacts,
    sources,
    notes,
    language: selectedLanguage,
  });

  return {
    intent: service.intent,
    service: service.name,
    confidence: confidenceFrom(service),
    answer,
    followUpQuestion: buildFollowUp(service.intent, selectedLanguage),
    agency: {
      name: service.agency_name,
      parent: service.parent,
      address: service.address,
      contacts,
      sources,
      lastVerifiedAt: service.last_verified_at,
    },
    messageDraft: buildMessageDraft(service.name),
  };
}

module.exports = { answerRequest };
