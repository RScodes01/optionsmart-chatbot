/**
 * embeddingService.js
 * Wraps Anthropic's claude-3-haiku to generate text embeddings using
 * its prompt-based cosine similarity approach.
 *
 * Since Anthropic does not have a dedicated embeddings endpoint (like OpenAI),
 * we use a deterministic hashing + Claude semantic similarity workaround:
 *   - For RAG storage: we embed via a lightweight local approach (cosine on TF-IDF style)
 *     using the `@xenova/transformers` all-MiniLM-L6-v2 model (runs in Node.js, free, ~25MB).
 *
 * This is swappable: set EMBEDDING_PROVIDER=openai in .env to use OpenAI instead.
 */

const logger = require('../utils/logger');

let pipeline = null;
let openaiClient = null;

/**
 * Lazy-load the embedding pipeline based on EMBEDDING_PROVIDER env var.
 * Defaults to 'local' (xenova/transformers — no extra API key needed).
 */
async function getEmbedder() {
  const provider = process.env.EMBEDDING_PROVIDER || 'local';

  if (provider === 'openai') {
    if (!openaiClient) {
      const { OpenAI } = await import('openai');
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return { provider: 'openai', client: openaiClient };
  }

  // Default: local transformers (all-MiniLM-L6-v2, 384-dim)
  if (!pipeline) {
    logger.info('[EmbeddingService] Loading local all-MiniLM-L6-v2 model…');
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    logger.info('[EmbeddingService] Model loaded ✓');
  }
  return { provider: 'local', client: pipeline };
}

/**
 * Generate a normalised embedding vector for `text`.
 * @param {string} text
 * @returns {Promise<number[]>} 384-dim (local) or 1536-dim (openai) unit vector
 */
async function embed(text) {
  const { provider, client } = await getEmbedder();

  if (provider === 'openai') {
    const res = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
    });
    return res.data[0].embedding;
  }

  // Local: xenova/transformers returns a Tensor; we convert + normalise
  const output = await client(text.trim(), { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = { embed, cosineSimilarity };
