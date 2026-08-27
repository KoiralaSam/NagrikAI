const config = require("./config");

function toVectorLiteral(values) {
  return `[${values.map((value) => Number(value)).join(",")}]`;
}

function formatQuery(text) {
  return `Instruct: ${config.embeddingQueryInstruct}\nQuery:${text}`;
}

function pickEmbeddings(payload) {
  if (Array.isArray(payload?.embeddings) && payload.embeddings.length) {
    return payload.embeddings;
  }
  if (Array.isArray(payload?.data) && payload.data.length) {
    return payload.data
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding);
  }
  if (Array.isArray(payload?.embedding)) {
    return [payload.embedding];
  }
  return [];
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Embedding request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return response.json();
}

async function embedWithOllama(inputs) {
  try {
    const payload = await postJson(`${config.embeddingOrigin}/api/embed`, {
      model: config.embeddingModel,
      input: inputs,
    });
    return pickEmbeddings(payload);
  } catch {
    const embeddings = [];
    for (const input of inputs) {
      const payload = await postJson(`${config.embeddingOrigin}/api/embeddings`, {
        model: config.embeddingModel,
        prompt: input,
      });
      const [embedding] = pickEmbeddings(payload);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}

async function embedWithOpenAi(inputs) {
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || "ollama";
  const payload = await postJson(
    `${config.embeddingBaseUrl}/embeddings`,
    { model: config.embeddingModel, input: inputs },
    { Authorization: `Bearer ${apiKey}` },
  );
  return pickEmbeddings(payload);
}

function assertDimensions(embeddings) {
  for (const embedding of embeddings) {
    if (!Array.isArray(embedding) || embedding.length !== config.embeddingDimensions) {
      throw new Error(
        `Expected ${config.embeddingDimensions}-d embeddings, got ${embedding?.length ?? 0}.`,
      );
    }
  }
  return embeddings;
}

async function embedTexts(texts, { isQuery = false } = {}) {
  const inputs = texts
    .map((text) => String(text ?? "").trim())
    .filter(Boolean)
    .map((text) => (isQuery ? formatQuery(text) : text));

  if (!inputs.length) {
    return [];
  }

  let embeddings;
  try {
    embeddings = await embedWithOllama(inputs);
  } catch {
    embeddings = await embedWithOpenAi(inputs);
  }

  if (embeddings.length !== inputs.length) {
    throw new Error("Embedding count did not match input count.");
  }

  return assertDimensions(embeddings);
}

async function embedQuery(text) {
  const [embedding] = await embedTexts([text], { isQuery: true });
  return embedding ?? null;
}

module.exports = {
  embedQuery,
  embedTexts,
  formatQuery,
  toVectorLiteral,
};
