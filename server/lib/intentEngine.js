const {
  findBestService,
  findVerifiedChunks,
  getAgencyContacts,
  getAgencySources,
  getServiceNotes,
} = require("./knowledgeRepository");
const { buildGroundedReply } = require("./aiResponder");
const config = require("./config");
const {
  buildBlockedResponse,
  evaluateScope,
  logGuardrailEvent,
} = require("./guardrails");
const { buildMessageDraft } = require("./messageTemplates");
const { piiTypes, redactPii } = require("./pii");

function normalizeLanguage(language) {
  return language === "en-US" ? "en-US" : "ne-NP";
}

function confidenceFrom(service) {
  if (!service || Number(service.score) < config.retrievalMinScore) {
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

function buildUnknownResponse(language) {
  const isNepali = language === "ne-NP";

  return {
    intent: "unknown",
    service: isNepali ? "अज्ञात सेवा" : "Unknown service",
    confidence: "low",
    answer: isNepali
      ? "मैले यो समस्या मिल्ने verified government service भेटिनँ। कृपया सेवा वा कार्यालयको नाम थप्नुहोस्।"
      : "I could not match this to a verified government service. Please name the service or office.",
    followUpQuestion: isNepali
      ? "कुन सरकारी सेवा वा कार्यालयबारे सोध्न खोज्नुभएको हो?"
      : "Which government service or office is this about?",
  };
}

function withRedactedMeta(result, redactedUserText) {
  return { ...result, redactedUserText };
}

function reasonWithPii(reason, findings) {
  const types = piiTypes(findings);
  return types.length ? `${reason};pii:${types.join(",")}` : reason;
}

async function answerRequest({ text, language }) {
  const selectedLanguage = normalizeLanguage(language);
  const { redactedText, findings } = redactPii(text);
  const scope = evaluateScope(redactedText);

  if (!scope.allowed) {
    await logGuardrailEvent({
      text: redactedText,
      language: selectedLanguage,
      decision: "blocked",
      reason: reasonWithPii(scope.reason, findings),
    });

    return withRedactedMeta(
      buildBlockedResponse(selectedLanguage, scope.reason),
      redactedText,
    );
  }

  await logGuardrailEvent({
    text: redactedText,
    language: selectedLanguage,
    decision: "allowed",
    reason: reasonWithPii(scope.reason, findings),
  });

  const service = await findBestService(redactedText);

  if (!service) {
    return withRedactedMeta(buildUnknownResponse(selectedLanguage), redactedText);
  }

  const [contacts, sources, notes, chunks] = await Promise.all([
    getAgencyContacts(service.agency_id),
    getAgencySources(service.agency_id),
    getServiceNotes(service.id),
    findVerifiedChunks(redactedText, { serviceId: service.id }),
  ]);
  const answer = await buildGroundedReply({
    userText: redactedText,
    service,
    contacts,
    sources,
    notes,
    chunks,
    language: selectedLanguage,
  });

  return withRedactedMeta(
    {
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
    },
    redactedText,
  );
}

module.exports = { answerRequest };
