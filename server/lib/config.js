const path = require("path");

function numberEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return fallback;
  }
  return raw !== "false" && raw !== "0";
}

function originFrom(baseUrl) {
  return String(baseUrl ?? "")
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "");
}

const llmBaseUrl = (process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(
  /\/+$/,
  "",
);
const embeddingBaseUrl = (
  process.env.EMBEDDING_BASE_URL ||
  process.env.LLM_BASE_URL ||
  "http://127.0.0.1:11434/v1"
).replace(/\/+$/, "");

module.exports = {
  retrievalMinScore: numberEnv("RETRIEVAL_MIN_SCORE", 0.08),
  chunkTopK: numberEnv("CHUNK_TOP_K", 3),
  chunkMinScore: numberEnv("CHUNK_MIN_SCORE", 0.35),
  chunkSize: numberEnv("CHUNK_SIZE", 700),
  chunkOverlap: numberEnv("CHUNK_OVERLAP", 120),
  embeddingDimensions: numberEnv("EMBEDDING_DIMENSIONS", 1024),
  embeddingModel: process.env.EMBEDDING_MODEL || "qwen3-embedding:0.6b",
  embeddingBaseUrl,
  embeddingOrigin: originFrom(embeddingBaseUrl),
  embeddingQueryInstruct:
    process.env.EMBEDDING_QUERY_INSTRUCT ||
    "Given a Nepal government service question, retrieve official process guidance that answers it.",
  enableChunkRag: boolEnv("ENABLE_CHUNK_RAG", true),
  knowledgeBaseDir:
    process.env.KNOWLEDGE_BASE_DIR ||
    path.resolve(__dirname, "..", "..", "knowledge-base"),
  maxAnswerChars: numberEnv("MAX_ANSWER_CHARS", 900),
  maxNewTokens: numberEnv("MAX_NEW_TOKENS", 384),
  ollamaTemperature: numberEnv("OLLAMA_TEMPERATURE", 0.3),
  openaiTemperature: numberEnv("OPENAI_TEMPERATURE", 0.2),
  llmBaseUrl,
};
