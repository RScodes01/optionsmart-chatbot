/**
 * ragService.js
 * MongoDB-backed Retrieval-Augmented Generation service.
 *
 * Storage layout:
 *   MongoDB collection "faq_documents"
 *     â†’ persistent vector store (question, answer, tags, embedding[])
 *
 *   Redis key "chat:cache:{sha256}"
 *     â†’ short-lived answer cache (TTL 1 h) â€” avoids re-calling Claude
 *
 * Pipeline for each user question:
 *   1. Check Redis exact-match cache â†’ instant hit if found
 *   2. Embed user question  (local MiniLM or OpenAI via embeddingService)
 *   3. Load all docs from MongoDB, compute cosine similarity in-process
 *   4. Return top-K context snippets (always) + direct answer if sim â‰¥ threshold
 *
 * Why manual cosine instead of Atlas $vectorSearch?
 *   â†’ Works on plain local MongoDB (localhost:27017) without Atlas license.
 *   â†’ FAQ corpus is small (< 500 docs), so O(n) in-process scoring is fast.
 *   â†’ Swap to $vectorSearch later for production scale with zero API changes.
 */

const crypto = require('crypto');
const logger  = require('../utils/logger');
const { embed, cosineSimilarity } = require('./embeddingService');
const faqDoc  = require('../models/faqDocument');
const { normalizeQuery }  = require('../utils/queryNormalizer');
const scrapedModel       = require('../models/scrapedKnowledge');

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CACHE_KEY_PREFIX         = 'chat:cache:';
const CACHE_TTL_SECONDS        = 3600;   // 1 hour
const CURATED_THRESHOLD        = 0.70;   // hand-written curated FAQs threshold
const SCRAPED_THRESHOLD        = 0.65;   // crawled website content threshold
const CONTEXT_THRESHOLD        = 0.38;   // Gemini context injection band
const TOP_K                    = 7;      // more candidates for richer context      // increased for richer context on Claude fallback

// ── In-process memory caches (avoids repeated MongoDB reads on each query) ──
// FAQ docs are small (<300 docs × 384 floats ≈ 450 KB) — safe to keep in RAM
let _faqCache     = null;   // Array of curated FAQ docs with embeddings
let _scrapedCache = null;   // Array of scraped_knowledge docs with embeddings

/** Warm both in-memory caches from MongoDB. Called once at server startup. */
async function warmCaches(db) {
  logger.info('[RAG] Warming in-memory doc caches…');
  _faqCache     = await faqDoc.getAllDocs(db);
  _scrapedCache = await scrapedModel.getAllDocs(db);
  logger.info(`[RAG] Caches warm — FAQ: ${_faqCache.length} docs, Scraped: ${_scrapedCache.length} docs`);
}

/** Invalidate caches so next query re-loads from MongoDB (used after re-seed). */
function invalidateCaches() {
  _faqCache     = null;
  _scrapedCache = null;
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cacheKey(question) {
  return CACHE_KEY_PREFIX + crypto
    .createHash('sha256')
    .update(question.toLowerCase().trim())
    .digest('hex');
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Index an array of FAQ documents into MongoDB.
 * Embeds each doc and upserts into the faq_documents collection.
 * Safe to call multiple times â€” uses upsert so existing docs are updated.
 *
 * @param {import('mongodb').Db} db
 * @param {Array<{ id: string, question: string, answer: string, tags?: string[] }>} faqs
 */
async function indexFAQs(db, faqs) {
  logger.info(`[RAG] Indexing ${faqs.length} FAQ documents into MongoDBâ€¦`);

  // Create text + tag indexes (idempotent)
  await faqDoc.createIndexes(db);

  for (const doc of faqs) {
    try {
      // CRITICAL FIX: Only embed the question string (not question + answer)
      // to keep vectors clean and maximize user query matches.
      const embedding = await embed(doc.question);
      await faqDoc.upsertDoc(db, { ...doc, embedding });
      logger.info(`[RAG] Indexed: ${doc.id}`);
    } catch (err) {
      logger.error(`[RAG] Failed to index ${doc.id}: ${err.message}`);
    }
  }

  const total = await faqDoc.count(db);
  logger.info(`[RAG] MongoDB indexing complete âœ“  (${total} docs in collection)`);
}

/**
 * Query the RAG store for a user question.
 *
 * @param {import('redis').RedisClientType} redisClient  â€” for answer cache
 * @param {import('mongodb').Db}            db           â€” for vector store
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
    // â”€â”€ 0. Check RAG system status (set by refreshScheduler) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //   'ready'    â†’ normal operation
    //   'scraping' â†’ refresh in progress, skip RAG, let Claude answer alone
    //   'stale'    â†’ KB cleared at midnight, trigger background refresh now
    //   'error'    â†’ both scraping & fallback failed (very rare)
    const { RAG_STATUS_KEY, RAG_STATUS_TTL } = require('./refreshScheduler');
    const status = await redisClient.get(RAG_STATUS_KEY).catch(() => null);

    if (status === 'scraping') {
      logger.info('[RAG] Status: scraping â€” skipping RAG for this query');
      return { hit: false, context: [], refreshing: true };
    }

    if (status === 'stale') {
      logger.info('[RAG] Status: stale â€” triggering background refresh');
      // Lazy-require avoids circular dependency at module load time
      const { runRefresh } = require('./refreshScheduler');
      runRefresh(db, redisClient).catch(err =>
        logger.error(`[RAG] Background refresh failed: ${err.message}`)
      );
      return { hit: false, context: [], refreshing: true };
    }

    // â”€â”€ 1. Exact-match Redis cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const key    = cacheKey(question);
    const cached = await redisClient.get(key);
    if (cached) {
      logger.info('[RAG] Redis cache hit');
      return { hit: true, cached: true, context: [], ...JSON.parse(cached) };
    }

    // â”€â”€ 2. Check MongoDB has data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const docCount = await faqDoc.count(db);
    if (docCount === 0) {
      logger.warn('[RAG] No documents in MongoDB â€” run seedMongo.js first');
      logger.warn('[RAG] No documents in MongoDB — run seedMongo.js first');
      return { hit: false, context: [] };
    }

    // ──────────────── 3. Embed the user question ──────────────────────────────────────────
    const qVec = await embed(question);

    // ── 4. Load docs from in-memory cache (or MongoDB if cache is cold) ────────
    const docs = _faqCache || await faqDoc.getAllDocs(db);
    const scored = docs
      .filter(d => Array.isArray(d.embedding) && d.embedding.length > 0)
      .map(d => ({
        id:       String(d._id),
        question: d.question,
        answer:   d.answer,
        type:     d.type || 'curated',
        sim:      cosineSimilarity(qVec, d.embedding),
      }));

    scored.sort((a, b) => b.sim - a.sim);
    const topK = scored.slice(0, TOP_K);

    // â”€â”€ 5. Build context string â€” only include chunks above CONTEXT_THRESHOLD â”€â”€
    const contextDocs = topK.filter(d => d.sim >= CONTEXT_THRESHOLD);
    const context = contextDocs.map(d => `Q: ${d.question}\nA: ${d.answer}`);

    // â”€â”€ 6. Direct answer if top result clears threshold â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const best = topK[0];
    if (best) {
      const threshold = best.type === 'curated' ? CURATED_THRESHOLD : SCRAPED_THRESHOLD;
      if (best.sim >= threshold) {
        logger.info(`[RAG] MongoDB direct hit (${best.type}) â€” ${best.id} sim=${best.sim.toFixed(3)} â†’ skipping API`);
        return { hit: true, cached: false, directAnswer: true, answer: best.answer, context, similarity: best.sim };
      }
    }

    logger.info(`[RAG] No direct hit â€” best sim=${best?.sim?.toFixed(3) ?? 'n/a'} (context injected for API fallback)`);
    return { hit: false, directAnswer: false, context };

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

/**
 * Query the scraped_knowledge collection using DUAL-EMBEDDING similarity.
 * Compares user query vector against BOTH question embedding AND answer embedding,
 * taking the maximum score. This means "how does theta work?" can match
 * an answer about "Saturn theta-decay" even if phrased differently.
 *
 * @param {import('mongodb').Db} db
 * @param {number[]} qVec - embedding of the normalized user question
 * @param {number} threshold - minimum similarity to return a direct answer
 */
async function queryScraped(db, qVec, threshold = 0.58) {
  try {
    // Use in-memory cache (populated at startup) — zero MongoDB I/O per query
    const docs = _scrapedCache || await scrapedModel.getAllDocs(db);
    if (!docs.length) return null;

    const scored = docs
      .filter(d => Array.isArray(d.embedding) && d.embedding.length > 0)
      .map(d => {
        // Similarity against: question embedding, answer embedding
        const simQ = cosineSimilarity(qVec, d.embedding);
        const simA = Array.isArray(d.answerEmbedding) && d.answerEmbedding.length > 0
          ? cosineSimilarity(qVec, d.answerEmbedding)
          : 0;
        // max of both — this is the dual-embedding advantage
        const sim = Math.max(simQ, simA);
        return {
          id:        String(d._id),
          question:  (d.questions && d.questions[0]) || d.section,
          answer:    d.content,
          section:   d.section,
          sourceUrl: d.sourceUrl,
          sim, simQ, simA,
        };
      });

    scored.sort((a, b) => b.sim - a.sim);
    const best = scored[0];

    if (best && best.sim >= threshold) {
      logger.info('[RAG] Scraped KB hit — ' + best.id + ' sim=' + best.sim.toFixed(3) + ' (Q:' + best.simQ.toFixed(3) + ' A:' + best.simA.toFixed(3) + ')');
      return { hit: true, answer: best.answer, section: best.section, sourceUrl: best.sourceUrl, similarity: best.sim };
    }

    // Return top context docs for Gemini fallback (inject into system prompt)
    const contextDocs = scored.slice(0, 5).filter(d => d.sim >= 0.33);
    return {
      hit:     false,
      context: contextDocs.map(d => '[' + d.section + ']\n' + d.answer),
      bestSim: best ? best.sim : 0,
    };
  } catch (err) {
    logger.error('[RAG] queryScraped error: ' + err.message);
    return null;
  }
}

module.exports = { indexFAQs, query, queryScraped, cacheAnswer, warmCaches, invalidateCaches };

