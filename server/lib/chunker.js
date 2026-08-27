const config = require("./config");

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function breakIndex(window, size) {
  const min = Math.floor(size * 0.45);
  const candidates = [
    window.lastIndexOf("\n\n"),
    window.lastIndexOf("। "),
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("\n"),
    window.lastIndexOf(" "),
  ];
  return candidates.find((index) => index >= min) ?? -1;
}

function chunkText(text, size = config.chunkSize, overlap = config.chunkOverlap) {
  const clean = normalizeText(text);
  if (!clean) {
    return [];
  }
  if (clean.length <= size) {
    return [clean];
  }

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const splitAt = breakIndex(clean.slice(start, end), size);
      if (splitAt >= 0) {
        end = start + splitAt + 1;
      }
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end >= clean.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

module.exports = {
  chunkText,
  normalizeText,
};
