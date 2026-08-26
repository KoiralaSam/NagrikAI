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
  "dao",
  "ird",
  "mofa",
  "dotm",
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
  "bitcoin",
  "medical diagnosis",
  "hack",
  "malware",
  "exploit",
  "how to make a bomb",
  "write a poem",
  "tell me a joke",
  "कविता",
  "मजाक",
  "रेसिपी",
  "क्रिप्टो",
];

const abuseTerms = [
  "fuck",
  "fucking",
  "motherfucker",
  "shithead",
  "asshole",
  "bitch",
  "bastard",
  "cunt",
  "slut",
  "retard",
  "dumbass",
  "dipshit",
  "muji",
  "muje",
  "madarchod",
  "randi",
  "chikne",
  "chikney",
  "bhosdike",
  "harami",
  "gandu",
  "मुजी",
  "मूर्ख",
  "रन्डी",
  "चिख्ने",
  "मादरचोद",
  "साले",
  "बेज्जत",
];

const abusePhrases = [
  "kill yourself",
  "go to hell",
  "stupid officer",
  "dumb officer",
  "fucking office",
  "corrupt bastard",
  "you are useless",
];

const jailbreakPatterns = [
  /\bignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)\b/i,
  /\byou are now\b/i,
  /\bsystem prompt\b/i,
  /\bjailbreak\b/i,
  /(?:^|\s)\/(?:no_)?think\b/i,
  /<think>/i,
  /<\/think>/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /"contacts"\s*:/i,
  /retrieved\s+(json|knowledge)/i,
  /\bdo not follow (your|the) (rules|instructions)\b/i,
  /\bpretend you are\b/i,
  /\bdeveloper mode\b/i,
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesTerm(text, term) {
  if (/[\u0900-\u097F]/.test(term)) {
    return text.toLowerCase().includes(term.toLowerCase());
  }

  return new RegExp(`\\b${escapeRegex(term)}\\b`, "i").test(text);
}

function includesAny(text, terms) {
  return terms.some((term) => includesTerm(text, term));
}

function hasAbuse(text) {
  return includesAny(text, abuseTerms) || includesAny(text, abusePhrases);
}

function hasJailbreak(text) {
  return jailbreakPatterns.some((pattern) => pattern.test(text));
}

function hasBlockedTopic(text) {
  return includesAny(text, blockedTerms);
}

function hasAllowedScope(text) {
  return includesAny(text, allowedTerms);
}

function evaluateScope(text) {
  const source = typeof text === "string" ? text : "";

  if (hasAbuse(source)) {
    return { allowed: false, reason: "abuse" };
  }

  if (hasJailbreak(source)) {
    return { allowed: false, reason: "jailbreak" };
  }

  if (hasBlockedTopic(source)) {
    return { allowed: false, reason: "blocked_topic" };
  }

  if (hasAllowedScope(source)) {
    return { allowed: true, reason: "government_service_scope" };
  }

  return { allowed: false, reason: "not_government_service_scope" };
}

function evaluateOutputSafety(text) {
  const source = typeof text === "string" ? text : "";

  if (hasAbuse(source)) {
    return { ok: false, reason: "abuse" };
  }

  if (hasJailbreak(source)) {
    return { ok: false, reason: "jailbreak" };
  }

  if (hasBlockedTopic(source)) {
    return { ok: false, reason: "blocked_topic" };
  }

  return { ok: true, reason: "in_scope" };
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

function buildBlockedResponse(language, reason) {
  const isNepali = language === "ne-NP";

  if (reason === "abuse") {
    return {
      intent: "out_of_scope",
      service: isNepali ? "समर्थित विषय होइन" : "Unsupported topic",
      confidence: "low",
      answer: isNepali
        ? "म गालीगलौज वा अपमानमा सहयोग गर्दिन। नेपालका सरकारी सेवाबारे मात्र सोध्नुहोस्।"
        : "I cannot help with insults or abusive language. Please ask only about Nepal government services.",
    };
  }

  return buildOutOfScopeResponse(language);
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
  buildBlockedResponse,
  buildOutOfScopeResponse,
  evaluateOutputSafety,
  evaluateScope,
  logGuardrailEvent,
};
