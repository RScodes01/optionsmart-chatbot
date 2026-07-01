/**
 * ragService.js
 * Redis-backed Retrieval-Augmented Generation service.
 *
 * Redis key schema:
 *   faq:doc:{id}     → Hash { question, answer, vector (JSON string), tags }
 *   chat:cache:{sha} → String (JSON { answer, chips }) — TTL 1h
 *
 * Usage:
 *   await ragService.indexFAQs(faqs);      // one-time seed
 *   const hit = await ragService.query(userQuestion);
 *   if (hit) return hit.answer;            // skip Claude entirely
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { embed, cosineSimilarity } = require('./embeddingService');

const FAQ_KEY_PREFIX = 'faq:doc:';
const CACHE_KEY_PREFIX = 'chat:cache:';
const CACHE_TTL_SECONDS = 3600; // 1 hour
const RAG_SIMILARITY_THRESHOLD = 0.82;
const TOP_K = 3;

/**
 * Index an array of FAQ documents into Redis.
 * Each doc: { id, question, answer, tags[] }
 */
async function indexFAQs(redisClient, faqs) {
  logger.info(`[RAG] Indexing ${faqs.length} FAQ documents…`);

  for (const doc of faqs) {
    const vector = await embed(doc.question + ' ' + doc.answer);
    await redisClient.hSet(`${FAQ_KEY_PREFIX}${doc.id}`, {
      question: doc.question,
      answer: doc.answer,
      tags: JSON.stringify(doc.tags || []),
      vector: JSON.stringify(vector),
    });
    logger.info(`[RAG] Indexed: ${doc.id}`);
  }

  logger.info('[RAG] FAQ indexing complete ✓');
}

/**
 * Query the RAG store for a user question.
 * Returns the best matching FAQ answer if similarity >= threshold,
 * plus top-3 context snippets for Claude augmentation.
 *
 * @param {object} redisClient
 * @param {string} question
 * @returns {Promise<{ hit: boolean, answer?: string, context: string[], similarity?: number }>}
 */
async function query(redisClient, question) {
  try {
    // 1. Check exact-match cache first (SHA-256 of lowercased question)
    const cacheKey = CACHE_KEY_PREFIX + crypto.createHash('sha256').update(question.toLowerCase().trim()).digest('hex');
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.info('[RAG] Exact cache hit');
      return { hit: true, cached: true, ...JSON.parse(cached) };
    }

    // 2. Get all FAQ doc keys
    const keys = await redisClient.keys(`${FAQ_KEY_PREFIX}*`);
    if (!keys.length) {
      return { hit: false, context: [] };
    }

    // 3. Embed the user question
    const qVec = await embed(question);

    // 4. Score all docs
    const scored = [];
    for (const key of keys) {
      const doc = await redisClient.hGetAll(key);
      if (!doc.vector) continue;
      const docVec = JSON.parse(doc.vector);
      const sim = cosineSimilarity(qVec, docVec);
      scored.push({ id: key, question: doc.question, answer: doc.answer, sim });
    }

    scored.sort((a, b) => b.sim - a.sim);
    const topK = scored.slice(0, TOP_K);

    // 5. Build context string for Claude augmentation (always)
    const context = topK.map(d => `Q: ${d.question}\nA: ${d.answer}`);

    // 6. If top result is above threshold → return direct answer
    const best = topK[0];
    if (best && best.sim >= RAG_SIMILARITY_THRESHOLD) {
      logger.info(`[RAG] Semantic hit — ${best.id} sim=${best.sim.toFixed(3)}`);
      return { hit: true, cached: false, answer: best.answer, context, similarity: best.sim };
    }

    logger.info(`[RAG] No hit — best sim=${best?.sim?.toFixed(3) ?? 'n/a'}`);
    return { hit: false, context };
  } catch (err) {
    logger.error('[RAG] Query error:', err.message);
    return { hit: false, context: [] };
  }
}

/**
 * Cache a Claude-generated answer so the same question returns instantly next time.
 * @param {object} redisClient
 * @param {string} question
 * @param {object} payload  { answer, chips }
 */
async function cacheAnswer(redisClient, question, payload) {
  const cacheKey = CACHE_KEY_PREFIX + crypto.createHash('sha256').update(question.toLowerCase().trim()).digest('hex');
  await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(payload));
}

module.exports = { indexFAQs, query, cacheAnswer };
