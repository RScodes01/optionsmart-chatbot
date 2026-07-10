/**
 * refreshScheduler.js
 * Daily midnight cron job that:
 *   1. Clears the MongoDB faq_documents collection
 *   2. Clears all Redis answer-cache keys
 *   3. Crawls all configured websites and re-indexes content into MongoDB
 *   4. Falls back to static faq.json if scraping fails or returns no data
 *
 * rag:status Redis key (TTL 25h):
 *   "ready"    → RAG is fully operational, query normally
 *   "stale"    → midnight just ran, first query will trigger a background refresh
 *   "scraping" → refresh in progress, skip RAG (let Claude answer alone)
 *   "error"    → scraping + fallback both failed (extremely rare)
 */

const cron        = require('node-cron');
const logger      = require('../utils/logger');
const ragService  = require('./ragService');
const { scrapeAllSites, getSeedUrls } = require('./scraperService');
const { fetchMarketHeadlines } = require('./newsService');
const faqs        = require('../data/faq.json');

// ── Constants ─────────────────────────────────────────────────────────────────
const RAG_STATUS_KEY = 'rag:status';
const RAG_STATUS_TTL = 25 * 60 * 60; // 25 hours (outlasts one full day cycle)

// ── Core Refresh Logic ────────────────────────────────────────────────────────

/**
 * Delete all documents from MongoDB and all cached answers from Redis.
 */
async function clearKnowledgeBase(db, redis) {
  try {
    const { deletedCount } = await db.collection('faq_documents').deleteMany({});
    logger.info(`[Refresh] Cleared ${deletedCount} documents from MongoDB`);
  } catch (err) {
    logger.error('[Refresh] MongoDB clear failed:', err.message);
    throw err;
  }

  try {
    const cacheKeys = await redis.keys('chat:cache:*');
    if (cacheKeys.length > 0) {
      await redis.del(cacheKeys);
      logger.info(`[Refresh] Flushed ${cacheKeys.length} Redis answer-cache entries`);
    }
  } catch (err) {
    logger.warn('[Refresh] Redis cache flush failed (non-fatal):', err.message);
  }
}

/**
 * Full refresh: scrape websites → embed → index into MongoDB.
 * Falls back to static faq.json if scraping fails or returns 0 docs.
 * Updates rag:status throughout so queries can adapt in real-time.
 *
 * @param {import('mongodb').Db}            db
 * @param {import('redis').RedisClientType} redis
 */
async function runRefresh(db, redis) {
  logger.info('[Refresh] ─────────────────────────────────────────');
  logger.info('[Refresh] Starting knowledge base refresh…');
  logger.info(`[Refresh] Target sites: ${getSeedUrls().join(', ')}`);

  // ── Phase 1: Mark as scraping ───────────────────────────────────────────
  await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'scraping');

  // ── Phase 2: Clear old data ─────────────────────────────────────────────
  await clearKnowledgeBase(db, redis);

  // ── Phase 3: Scrape websites ────────────────────────────────────────────
  let webDocs = [];
  try {
    webDocs = await scrapeAllSites();
  } catch (err) {
    logger.error('[Refresh] scrapeAllSites() threw:', err.message);
  }

  // ── Phase 4a: Index scraped docs (success path) ─────────────────────────
  if (webDocs.length > 0) {
    try {
      await ragService.indexFAQs(db, webDocs);
      await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'ready');
      logger.info(`[Refresh] ✓ Knowledge base refreshed — ${webDocs.length} web chunks indexed`);
      logger.info('[Refresh] ─────────────────────────────────────────');
      return;
    } catch (indexErr) {
      logger.error('[Refresh] Indexing web docs failed:', indexErr.message);
    }
  } else {
    logger.warn('[Refresh] Web scraping returned 0 documents — using fallback');
  }

  // ── Phase 4b: Fallback to static faq.json ──────────────────────────────
  logger.info(`[Refresh] Falling back to static faq.json (${faqs.length} entries)…`);
  try {
    await ragService.indexFAQs(db, faqs);
    await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'ready');
    logger.info(`[Refresh] ✓ Fallback complete — ${faqs.length} static FAQ docs indexed`);
  } catch (fallbackErr) {
    logger.error('[Refresh] Fallback indexing failed:', fallbackErr.message);
    await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'error').catch(() => {});
  }

  logger.info('[Refresh] ─────────────────────────────────────────');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Start the daily midnight cron job.
 * At 00:00 IST it marks the KB as stale, then runs the full refresh.
 * The first user query after midnight triggers the background reload
 * (handled in ragService.query).
 *
 * @param {import('mongodb').Db}            db
 * @param {import('redis').RedisClientType} redis
 */
function startScheduler(db, redis) {
  // Cron: 0 0 * * * = every day at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('[Refresh] ⏰ Midnight cron fired — marking knowledge base stale…');
    try {
      await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'stale');
      // Run the full refresh immediately (not waiting for a user query)
      await runRefresh(db, redis);
    } catch (err) {
      logger.error('[Refresh] Cron handler error:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('[Refresh] Daily knowledge refresh scheduled — runs at 00:00 IST every night');

  // Cron: 0 9 * * * = every day at 9:00 AM IST — pre-generate Market Morning brief
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Coach] ⏰ 9 AM cron fired — pre-generating Market Morning brief…');
    try {
      // Bust the news cache so today's freshest headlines are used
      await redis.del('news:headlines:cache').catch(() => {});

      // Fetch fresh headlines (will re-cache them)
      const headlines = await fetchMarketHeadlines(redis);
      logger.info(`[Coach] Fetched ${headlines.split('\n').length} headlines for brief`);

      // The brief itself will be generated on the first /coach call after 9 AM
      // and then cached for the rest of the day. We just warm the news cache here.
      logger.info('[Coach] News cache warmed — brief will generate on first drawer open');
    } catch (err) {
      logger.error('[Coach] 9 AM brief warm-up failed:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('[Refresh] Market Morning news warm-up scheduled — runs at 09:00 IST every morning');
}

// ── Status Helper ─────────────────────────────────────────────────────────────

/**
 * Get the current rag:status from Redis.
 * Returns 'ready' if the key is missing (initial / post-seed state).
 *
 * @param {import('redis').RedisClientType} redis
 * @returns {Promise<string>}
 */
async function getStatus(redis) {
  try {
    return (await redis.get(RAG_STATUS_KEY)) || 'ready';
  } catch {
    return 'ready';
  }
}

module.exports = { startScheduler, runRefresh, getStatus, RAG_STATUS_KEY, RAG_STATUS_TTL };
