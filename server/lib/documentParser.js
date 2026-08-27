const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const SKIP_NAMES = new Set(["readme.md", "manifest.json"]);

function parseFrontmatter(raw) {
  const text = String(raw ?? "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: text.trim() };
  }

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return { data, body: match[2].trim() };
}

function loadManifest(rootDir) {
  const manifestPath = path.join(rootDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function loadSidecar(filePath) {
  const sidecarPath = `${filePath}.meta.json`;
  if (!fs.existsSync(sidecarPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
}

function walkDocuments(rootDir) {
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      const basename = entry.name.toLowerCase();
      if (SKIP_NAMES.has(basename) || basename.endsWith(".meta.json")) {
        continue;
      }
      if (TEXT_EXTENSIONS.has(ext) || ext === ".docx") {
        files.push(fullPath);
      }
    }
  }

  if (fs.existsSync(rootDir)) {
    visit(rootDir);
  }
  return files.sort();
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function normalizeMeta(meta) {
  const verificationStatus = String(meta.verification_status || meta.verificationStatus || "")
    .trim()
    .toLowerCase();

  return {
    intent: String(meta.intent || "").trim() || null,
    title: String(meta.title || "").trim() || null,
    sourceUrl: String(meta.source_url || meta.sourceUrl || "").trim() || null,
    verifiedAt: String(meta.verified_at || meta.verifiedAt || "").trim() || null,
    verificationStatus: verificationStatus || "unverified",
  };
}

async function loadDocument(filePath, rootDir, manifest = {}) {
  const relative = path.relative(rootDir, filePath).replace(/\\/g, "/");
  const raw = await extractText(filePath);
  const parsed = parseFrontmatter(raw);
  const meta = normalizeMeta({
    ...(manifest[relative] || {}),
    ...loadSidecar(filePath),
    ...parsed.data,
  });

  return {
    filename: relative,
    title: meta.title || path.parse(filePath).name.replace(/[-_]/g, " "),
    body: parsed.body,
    checksum: require("crypto").createHash("sha256").update(raw).digest("hex"),
    ...meta,
  };
}

module.exports = {
  loadDocument,
  loadManifest,
  parseFrontmatter,
  walkDocuments,
};
