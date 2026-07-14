/**
 * ragService.js
 * MongoDB-backed Retrieval-Augmented Generation service.
 *
 * Storage layout:
 *   MongoDB collection "faq_documents"
 *     → persistent vector store (question, answer, tags, embedding[])
 *
 *   Redis key "chat:cache:{sha256}"
 *     → short-lived answer cache (TTL 1 h) — avoids re-calling Claude
 *
 * Pipeline for each user question:
 *   1. Check Redis exact-match cache → instant hit if found
 *   2. Embed user question  (local MiniLM or OpenAI via embeddingService)
 *   3. Load all docs from MongoDB, compute cosine similarity in-process
 *   4. Return top-K context snippets (always) + direct answer if sim ≥ threshold
 *
 * Why manual cosine instead of Atlas $vectorSearch?
 *   → Works on plain local MongoDB (localhost:27017) without Atlas license.
 *   → FAQ corpus is small (< 500 docs), so O(n) in-process scoring is fast.
 *   → Swap to $vectorSearch later for production scale with zero API changes.
 */

const crypto = require('crypto');
const logger  = require('../utils/logger');
const { embed, cosineSimilarity } = require('./embeddingService');
const faqDoc  = require('../models/faqDocument');

// ── Constants ─────────────────────────────────────────────────────────────────
const CACHE_KEY_PREFIX        = 'chat:cache:';
const CACHE_TTL_SECONDS       = 3600;   // 1 hour
const RAG_SIMILARITY_THRESHOLD = 0.80;  // slightly lower than before for better recall
const TOP_K                   = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────
function cacheKey(question) {
  return CACHE_KEY_PREFIX + crypto
    .createHash('sha256')
    .update(question.toLowerCase().trim())
    .digest('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Index an array of FAQ documents into MongoDB.
 * Embeds each doc and upserts into the faq_documents collection.
 * Safe to call multiple times — uses upsert so existing docs are updated.
 *
 * @param {import('mongodb').Db} db
 * @param {Array<{ id: string, question: string, answer: string, tags?: string[] }>} faqs
 */
async function indexFAQs(db, faqs) {
  logger.info(`[RAG] Indexing ${faqs.length} FAQ documents into MongoDB…`);

  // Create text + tag indexes (idempotent)
  await faqDoc.createIndexes(db);

  for (const doc of faqs) {
    try {
      const embedding = await embed(doc.question + ' ' + doc.answer);
      await faqDoc.upsertDoc(db, { ...doc, embedding });
      logger.info(`[RAG] Indexed: ${doc.id}`);
    } catch (err) {
      logger.error(`[RAG] Failed to index ${doc.id}: ${err.message}`);
    }
  }

  const total = await faqDoc.count(db);
  logger.info(`[RAG] MongoDB indexing complete ✓  (${total} docs in collection)`);
}

/**
 * Query the RAG store for a user question.
 *
 * @param {import('redis').RedisClientType} redisClient  — for answer cache
 * @param {import('mongodb').Db}            db           — for vector store
 * @param {string}                          question
 * @returns {Promise<{
 *   hit:        boolean,
 *   cached?:    boolean,
 *   answer?:    string,
 *   context:    string[],
 *   similarity?: number,
 * }>}
 */
async function query(redisClient, db, question) {
  try {
    // ── 0. Check RAG system status (set by refreshScheduler) ───────────────
    //   'ready'    → normal operation
    //   'scraping' → refresh in progress, skip RAG, let Claude answer alone
    //   'stale'    → KB cleared at midnight, trigger background refresh now
    //   'error'    → both scraping & fallback failed (very rare)
    const { RAG_STATUS_KEY, RAG_STATUS_TTL } = require('./refreshScheduler');
    const status = await redisClient.get(RAG_STATUS_KEY).catch(() => null);

    if (status === 'scraping') {
      logger.info('[RAG] Status: scraping — skipping RAG for this query');
      return { hit: false, context: [], refreshing: true };
    }

    if (status === 'stale') {
      logger.info('[RAG] Status: stale — triggering background refresh');
      // Lazy-require avoids circular dependency at module load time
      const { runRefresh } = require('./refreshScheduler');
      runRefresh(db, redisClient).catch(err =>
        logger.error(`[RAG] Background refresh failed: ${err.message}`)
      );
      return { hit: false, context: [], refreshing: true };
    }

    // ── 1. Exact-match Redis cache ──────────────────────────────────────────
    const key    = cacheKey(question);
    const cached = await redisClient.get(key);
    if (cached) {
      logger.info('[RAG] Redis cache hit');
      return { hit: true, cached: true, context: [], ...JSON.parse(cached) };
    }

    // ── 2. Check MongoDB has data ───────────────────────────────────────────
    const docCount = await faqDoc.count(db);
    if (docCount === 0) {
      logger.warn('[RAG] No documents in MongoDB — run seedMongo.js first');
      return { hit: false, context: [] };
    }

    // ── 3. Embed the user question ──────────────────────────────────────────
    const qVec = await embed(question);

    // ── 4. Load all docs + score cosine similarity in-process ──────────────
    const docs   = await faqDoc.getAllDocs(db);
    const scored = docs
      .filter(d => Array.isArray(d.embedding) && d.embedding.length > 0)
      .map(d => ({
        id:       String(d._id),
        question: d.question,
        answer:   d.answer,
        sim:      cosineSimilarity(qVec, d.embedding),
      }));

    scored.sort((a, b) => b.sim - a.sim);
    const topK = scored.slice(0, TOP_K);

    // ── 5. Build context string for Claude (always returned) ───────────────
    const context = topK.map(d => `Q: ${d.question}\nA: ${d.answer}`);

    // ── 6. Direct answer if top result clears threshold ────────────────────
    const best = topK[0];
    if (best && best.sim >= RAG_SIMILARITY_THRESHOLD) {
      logger.info(`[RAG] MongoDB semantic hit — ${best.id} sim=${best.sim.toFixed(3)}`);
      return { hit: true, cached: false, answer: best.answer, context, similarity: best.sim };
    }

    logger.info(`[RAG] No direct hit — best sim=${best?.sim?.toFixed(3) ?? 'n/a'} (context injected)`);
    return { hit: false, context };

  } catch (err) {
    logger.error('[RAG] Query error:', err.message);
    return { hit: false, context: [] };
  }
}

/**
 * Cache a Claude-generated answer in Redis.
 * The same question will get an instant cache hit next time.
 *
 * @param {import('redis').RedisClientType} redisClient
 * @param {string} question
 * @param {{ answer: string, chips?: string[] }} payload
 */
async function cacheAnswer(redisClient, question, payload) {
  const key = cacheKey(question);
  await redisClient.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(payload));
}

module.exports = { indexFAQs, query, cacheAnswer };
