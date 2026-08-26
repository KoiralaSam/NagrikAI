const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const PHONE_RE =
  /(?:\+977[\s-]?(?:9[78]\d{8}|[1-9]\d{7,9})|\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\b9[78]\d{8}\b|\b0\d{1,2}[\s-]?\d{6,8}\b)/g;
const FORMATTED_ID_RE = /\b\d{2,5}[-/]\d{2,5}[-/]\d{2,5}(?:[-/]\d{2,8})+\b/g;
const LONG_DIGIT_RE = /\b\d{8,}\b/g;

const TOKENS = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  id: "[ID]",
};

function pushMatches(text, regex, type, bucket) {
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    const raw = match[0];
    if (raw) {
      const value = raw.replace(/[ -]+$/g, "");
      bucket.push({
        type,
        value,
        start: match.index,
        end: match.index + value.length,
      });
    }
    if (match.index === regex.lastIndex) {
      regex.lastIndex += 1;
    }
    match = regex.exec(text);
  }
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function pickNonOverlapping(matches) {
  const ranked = [...matches].sort((a, b) => {
    const lengthDelta = b.value.length - a.value.length;
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return a.start - b.start;
  });
  const chosen = [];

  for (const candidate of ranked) {
    if (!chosen.some((existing) => overlaps(existing, candidate))) {
      chosen.push(candidate);
    }
  }

  return chosen.sort((a, b) => a.start - b.start);
}

function extractPiiMatches(text) {
  if (!text) {
    return [];
  }

  const matches = [];
  pushMatches(text, EMAIL_RE, "email", matches);
  pushMatches(text, CARD_RE, "id", matches);
  pushMatches(text, PHONE_RE, "phone", matches);
  pushMatches(text, FORMATTED_ID_RE, "id", matches);
  pushMatches(text, LONG_DIGIT_RE, "id", matches);

  return pickNonOverlapping(matches).filter((item) => {
    if (item.type !== "id") {
      return true;
    }
    const digits = item.value.replace(/\D/g, "");
    return digits.length >= 8;
  });
}

function redactPii(text) {
  const source = typeof text === "string" ? text : "";
  const findings = extractPiiMatches(source);
  let redactedText = source;

  for (const finding of [...findings].sort((a, b) => b.start - a.start)) {
    redactedText =
      redactedText.slice(0, finding.start) +
      TOKENS[finding.type] +
      redactedText.slice(finding.end);
  }

  return {
    redactedText,
    findings: findings.map(({ type, start, end }) => ({ type, start, end })),
  };
}

function normalizeComparable(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.:/+-]/gu, "");
}

function isCoveredByAllowed(value, allowedValues) {
  const normalized = normalizeComparable(value);
  if (!normalized) {
    return false;
  }

  return allowedValues.some((allowed) => {
    const allowedNorm = normalizeComparable(allowed);
    return (
      allowedNorm &&
      (allowedNorm.includes(normalized) || normalized.includes(allowedNorm))
    );
  });
}

function hasUnexpectedPii(text, allowedValues = []) {
  return extractPiiMatches(text).some(
    (finding) => !isCoveredByAllowed(finding.value, allowedValues),
  );
}

function piiTypes(findings) {
  return [...new Set((findings ?? []).map((finding) => finding.type))];
}

module.exports = {
  extractPiiMatches,
  hasUnexpectedPii,
  piiTypes,
  redactPii,
};
