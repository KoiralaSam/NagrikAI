const db = require("./db");

const allowedTerms = [
  "government",
  "office",
  "ministry",
  "department",
  "passport",
  "citizenship",
  "certificate",
  "pan",
  "tax",
  "license",
  "licence",
  "consular",
  "embassy",
  "complaint",
  "contact",
  "phone",
  "email",
  "website",
  "नेपाल",
  "सरकार",
  "कार्यालय",
  "मन्त्रालय",
  "विभाग",
  "राहदानी",
  "पासपोर्ट",
  "नागरिकता",
  "प्रमाणपत्र",
  "कर",
  "लाइसेन्स",
  "सम्पर्क",
  "फोन",
  "गुनासो",
  "विदेश",
  "दूतावास",
];

const blockedTerms = [
  "poem",
  "joke",
  "recipe",
  "dating",
  "homework",
  "investment",
  "stock",
  "crypto",
  "medical diagnosis",
  "hack",
  "malware",
  "कविता",
  "मजाक",
  "रेसिपी",
  "क्रिप्टो",
];

function includesAny(text, terms) {
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term.toLowerCase()));
}

function evaluateScope(text) {
  if (includesAny(text, blockedTerms)) {
    return {
      allowed: false,
      reason: "blocked_topic",
    };
  }

  if (includesAny(text, allowedTerms)) {
    return {
      allowed: true,
      reason: "government_service_scope",
    };
  }

  return {
    allowed: false,
    reason: "not_government_service_scope",
  };
}

function buildOutOfScopeResponse(language) {
  const isNepali = language === "ne-NP";

  return {
    intent: "out_of_scope",
    service: isNepali ? "समर्थित विषय होइन" : "Unsupported topic",
    confidence: "low",
    answer: isNepali
      ? "म नेपालका सरकारी सेवा, कार्यालय, सम्पर्क विवरण, प्रक्रिया र निवेदन सन्देशमा मात्र सहयोग गर्न सक्छु। कृपया सरकारी सेवासम्बन्धी प्रश्न सोध्नुहोस्।"
      : "I can only help with Nepal government services, offices, contact details, process guidance, and message drafting. Please ask a government-service question.",
  };
}

async function logGuardrailEvent({ text, language, decision, reason }) {
  await db.query(
    `
    INSERT INTO guardrail_events (user_text, language, decision, reason)
    VALUES ($1, $2, $3, $4)
    `,
    [text, language, decision, reason],
  );
}

module.exports = {
  buildOutOfScopeResponse,
  evaluateScope,
  logGuardrailEvent,
};
