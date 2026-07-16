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
const { generateAndStoreBrief } = require('./coachService');
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
    logger.error(`[Refresh] MongoDB clear failed: ${err.message}`);
    throw err;
  }

  try {
    const toDelete = [];
    for await (const key of redis.scanIterator({ MATCH: 'chat:cache:*', COUNT: 100 })) {
      toDelete.push(key);
    }
    if (toDelete.length > 0) {
      await redis.del(toDelete);
      logger.info(`[Refresh] Flushed ${toDelete.length} Redis answer-cache entries`);
    }
  } catch (err) {
    logger.warn(`[Refresh] Redis cache flush failed (non-fatal): ${err.message}`);
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
    logger.error(`[Refresh] scrapeAllSites() threw: ${err.message}`);
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
      logger.error(`[Refresh] Indexing web docs failed: ${indexErr.message}`);
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
    logger.error(`[Refresh] Fallback indexing failed: ${fallbackErr.message}`);
    await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'error').catch(() => {});
  }

  logger.info('[Refresh] ─────────────────────────────────────────');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Check for news updates and refresh the morning brief if new headlines are found.
 * Runs on a 15-minute polling interval during market hours (Mon-Fri, 9:15 AM - 4:00 PM IST).
 */
async function checkForNewsUpdates(db, redis) {
  const now = new Date();
  
  // Skip weekends (0 = Sunday, 6 = Saturday)
  const day = now.getDay();
  if (day === 0 || day === 6) return;

  // Skip non-market hours (market runs 9:15 AM - 4:00 PM)
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeValue = hour * 100 + minute;
  if (timeValue < 915 || timeValue > 1600) return;

  logger.info('[Coach] Checking for new market news updates (15m poll)...');
  try {
    // Fetch fresh headlines (skipping news cache)
    const currentHeadlines = await fetchMarketHeadlines(redis, true);
    if (!currentHeadlines) {
      logger.info('[Coach] No headlines fetched, skipping update check');
      return;
    }

    const LAST_HEADLINES_KEY = 'news:headlines:last_seen';
    const lastSeen = await redis.get(LAST_HEADLINES_KEY);

    if (currentHeadlines !== lastSeen) {
      logger.info('[Coach] New headlines detected! Regenerating brief in MongoDB...');
      // Save new headlines text as last seen
      await redis.set(LAST_HEADLINES_KEY, currentHeadlines);

      // Force regenerate today's brief in MongoDB
      await generateAndStoreBrief(db, redis, true);
      logger.info('[Coach] Morning brief updated with fresh news ✓');
    } else {
      logger.info('[Coach] No news updates (headlines unchanged)');
    }
  } catch (err) {
    logger.warn(`[Coach] News update check failed: ${err.message}`);
  }
}

/**
 * Start the daily midnight cron job and the 9 AM proactive brief generator.
 *
 * @param {import('mongodb').Db}            db
 * @param {import('redis').RedisClientType} redis
 */
function startScheduler(db, redis) {
  // Cron: 0 0 * * * = every day at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('[Refresh] ⏰ Midnight cron fired — marking knowledge base stale and cleaning old briefs…');
    try {
      // Clear past briefs from MongoDB morning_briefs
      const today = new Date().toISOString().slice(0, 10);
      await db.collection('morning_briefs').deleteMany({ date: { $ne: today } });
      logger.info('[Refresh] Cleared all old morning briefs from MongoDB');

      await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'stale');
      // Run the full refresh immediately (not waiting for a user query)
      await runRefresh(db, redis);
    } catch (err) {
      logger.error(`[Refresh] Cron handler error: ${err.message}`);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('[Refresh] Daily knowledge refresh scheduled — runs at 00:00 IST every night');

  // Cron: 0 9 * * * = every day at 9:00 AM IST — pre-generate Market Morning brief proactively
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Coach] ⏰ 9 AM cron fired — pre-generating today\'s Market Morning brief…');
    try {
      // Bust the news cache so today's freshest headlines are used
      await redis.del('news:headlines:cache').catch(() => {});
      
      // Proactively generate today's brief and store in MongoDB
      await generateAndStoreBrief(db, redis, true);
      logger.info('[Coach] Proactive brief generated successfully ✓');
    } catch (err) {
      logger.error(`[Coach] 9 AM proactive brief generation failed: ${err.message}`);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('[Refresh] Proactive Market Morning brief generator scheduled — runs at 09:00 IST every morning');

  // Cron: */15 9-16 * * 1-5 = Every 15 minutes, from 9:00 AM to 4:45 PM, Monday to Friday (Indian Market Hours)
  cron.schedule('*/15 9-16 * * 1-5', async () => {
    try {
      await checkForNewsUpdates(db, redis);
    } catch (err) {
      logger.error(`[Coach] News update check scheduler error: ${err.message}`);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('[Refresh] News update checker scheduled — runs every 15 minutes during market hours (Mon-Fri 09:00-16:00 IST)');
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
