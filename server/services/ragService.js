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
const { normalizeQuery } = require('../utils/queryNormalizer');
const scrapedModel       = require('../models/scrapedKnowledge');
const { frameAnswer }    = require('../utils/answerFramer');

// ────────────────────────────────────────────────────────────────────────────────────────────────
const CACHE_KEY_PREFIX         = 'chat:cache:';
const CACHE_TTL_SECONDS        = 86400;  // 24 hours — FAQs are stable, cache aggressively
const CURATED_THRESHOLD        = 0.40;   // curated FAQs (extremely generous for natural question variations)
const SCRAPED_THRESHOLD        = 0.40;   // crawled website content
const GENERATED_THRESHOLD      = 0.60;   // AI-generated answers
const CONTEXT_THRESHOLD        = 0.25;   // Gemini context injection band (wider coverage)
const TOP_K                    = 7;      // more candidates for richer context

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
  logger.info(`[RAG] Indexing ${faqs.length} FAQ documents into MongoDB…`);

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
    // ── Stage 0: Check RAG system status (set by refreshScheduler) ────────────
    //   'ready'    → normal operation
    //   'scraping' → refresh in progress, skip RAG, let Gemini answer alone
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
      const { runRefresh } = require('./refreshScheduler');
      runRefresh(db, redisClient).catch(err =>
        logger.error(`[RAG] Background refresh failed: ${err.message}`)
      );
      return { hit: false, context: [], refreshing: true };
    }

    // ── Stage 1a: Redis exact-match cache ─────────────────────────────────────
    const key    = cacheKey(question);
    const cached = await redisClient.get(key);
    if (cached) {
      logger.info('[RAG] Stage 1a: Redis cache hit');
      return { hit: true, cached: true, context: [], ...JSON.parse(cached) };
    }

    // ── Stage 1b: Guard — MongoDB must have data ───────────────────────────────
    const docCount = await faqDoc.count(db);
    if (docCount === 0) {
      logger.warn('[RAG] No documents in MongoDB — run seedMongo.js first');
      return { hit: false, context: [] };
    }

    // Auto-reload RAM cache if DB count differs (keeps multiple running processes in sync)
    if (!_faqCache || _faqCache.length !== docCount) {
      logger.info(`[RAG] Cache count out of sync (RAM: ${_faqCache ? _faqCache.length : 0}, DB: ${docCount}) — reloading...`);
      await warmCaches(db);
    }

    // ── Stage 1c: Normalize question before embedding ─────────────────────────
    const normalized = normalizeQuery(question);
    const qVec      = await embed(normalized || question);

    // ── Stage 1d: FAQ cosine similarity (in-memory, ~0 latency) ──────────────
    const docs = _faqCache;
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

    // Build context array from FAQ results above CONTEXT_THRESHOLD
    const contextDocs = topK.filter(d => d.sim >= CONTEXT_THRESHOLD);
    const context     = contextDocs.map(d => `Q: ${d.question}\nA: ${d.answer}`);

    // Direct FAQ hit — apply type-specific threshold
    const best = topK[0];
    if (best) {
      const threshold = best.type === 'generated'
        ? GENERATED_THRESHOLD
        : best.type === 'curated'
          ? CURATED_THRESHOLD
          : SCRAPED_THRESHOLD;

      if (best.sim >= threshold) {
        logger.info(`[RAG] Stage 1 hit (${best.type}) — sim=${best.sim.toFixed(3)} → skipping Gemini`);
        const framed = frameAnswer(best, 'faq');
        return { hit: true, cached: false, directAnswer: true, answer: framed, context, similarity: best.sim, source: 'faq' };
      }
    }

    // ── Stage 2: Scraped knowledge dual-embedding (in-memory, ~0 latency) ─────
    // Compares query against BOTH question and answer vectors — max score wins.
    const scrapedResult = await queryScraped(db, qVec, SCRAPED_THRESHOLD);
    if (scrapedResult && scrapedResult.hit) {
      logger.info(`[RAG] Stage 2 hit (scraped) — sim=${scrapedResult.similarity?.toFixed(3)} → skipping Gemini`);
      const mergedContext = [...context, ...(scrapedResult.context || [])];
      // Adapt the scraped structure to match the framer expectations
      const docToFrame = {
        pageTitle: scrapedResult.pageTitle || scrapedResult.section,
        section: scrapedResult.section,
        answer: scrapedResult.answer,
        tags: scrapedResult.tags || []
      };
      const framed = frameAnswer(docToFrame, 'scraped');
      return { hit: true, cached: false, directAnswer: true, answer: framed, context: mergedContext, similarity: scrapedResult.similarity, source: 'scraped' };
    }

    // Merge scraped context snippets even when no direct hit
    if (scrapedResult && Array.isArray(scrapedResult.context)) {
      context.push(...scrapedResult.context);
    }

    // ── Stage 3: MongoDB $text search fallback (Disabled) ───────────────────
    // Disabled to prevent low-relevance keyword collisions from bypassing vector thresholds and Gemini reasoning.

    // ── Stage 4: No DB match — return context for Gemini ─────────────────────
    logger.info(`[RAG] All stages missed — best FAQ sim=${best?.sim?.toFixed(3) ?? 'n/a'} — injecting context for Gemini`);
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
          pageTitle: d.pageTitle,
          sourceUrl: d.sourceUrl,
          tags:      d.tags || [],
          sim, simQ, simA,
        };
      });

    scored.sort((a, b) => b.sim - a.sim);
    const best = scored[0];

    if (best && best.sim >= threshold) {
      logger.info('[RAG] Scraped KB hit — ' + best.id + ' sim=' + best.sim.toFixed(3) + ' (Q:' + best.simQ.toFixed(3) + ' A:' + best.simA.toFixed(3) + ')');
      return { hit: true, answer: best.answer, section: best.section, pageTitle: best.pageTitle, sourceUrl: best.sourceUrl, tags: best.tags, similarity: best.sim };
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

