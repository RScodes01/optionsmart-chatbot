/**
 * index.js — Express server entry point for the OptionSmart Chatbot
 * Run: node server/index.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { createClient } = require('redis');
const { MongoClient }  = require('mongodb');
const logger     = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 8001;

// ── Middleware ──────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5174', credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Simple uid passthrough for dev (replace with your Firebase middleware in prod)
app.use((req, res, next) => {
  req.uid = req.headers['x-uid'] || 'dev-user';
  next();
});

// ── Redis ───────────────────────────────────────────
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (err) => logger.error(`[Redis] Error: ${err.message || err}`));

// ── MongoDB ─────────────────────────────────────────
let mongoClient;

// ── Routes ──────────────────────────────────────────
const chatRoutes    = require('./routes/chat');
const zerodhaRoutes = require('./routes/zerodha');
const { loadEnvToken } = require('./routes/zerodha');
const { warmInstrumentsCache } = require('./services/marketService');
const journalRoutes = require('./routes/journal');
const ragService         = require('./services/ragService');
const faqDoc             = require('./models/faqDocument');
const { startScheduler, runRefresh, RAG_STATUS_KEY, RAG_STATUS_TTL } = require('./services/refreshScheduler');

app.use('/api/chat',    chatRoutes);
app.use('/api/zerodha', zerodhaRoutes);
app.use('/api/journal', journalRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Start ────────────────────────────────────────────
async function start() {
  try {
    // Connect Redis
    await redis.connect();
    app.locals.redis = redis;
    logger.info('[Redis] Connected ✓');

    // Auto-load Zerodha access token from .env (if set)
    await loadEnvToken(redis);

    // Pre-warm instruments cache (downloads all NSE/BSE stocks from Kite in background)
    warmInstrumentsCache(redis).catch(() => {});

    // Connect MongoDB (optional — journal features need it)
    const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    app.locals.db = mongoClient.db(process.env.MONGO_DB_NAME || 'optionsmart_chat');
    logger.info('[MongoDB] Connected ✓');

    // Pre-warm in-memory RAG caches (FAQ + scraped KB loaded into RAM once at startup)
    // This ensures every query scores against embeddings without hitting MongoDB per request
    ragService.warmCaches(app.locals.db).catch(err =>
      logger.warn('[RAG] warmCaches failed (non-fatal):', err.message)
    );


    // ── RAG Initialisation ──────────────────────────────────────────────
    // Runs in background — server starts immediately, seeding/scraping happens async.
    (async () => {
      try {
        const existing = await faqDoc.count(app.locals.db);

        if (existing === 0) {
          // Fresh install or post-midnight clear: run full scrape → fallback to FAQ
          logger.info('[RAG] faq_documents is empty — running initial knowledge base load…');
          logger.info('[RAG] (First run may download the ~25 MB MiniLM model — allow ~30 s)');
          await runRefresh(app.locals.db, redis);
        } else {
          // Collection already has data: mark ready and let the cron handle nightly refresh
          logger.info(`[RAG] MongoDB ready ✓  (${existing} docs indexed)`);
          try {
            await redis.setEx(RAG_STATUS_KEY, RAG_STATUS_TTL, 'ready');
          } catch (redisErr) {
            logger.warn(`[RAG] Could not persist status to Redis: ${redisErr.message}`);
          }
        }
      } catch (initErr) {
        logger.error('[RAG] Initialisation failed:', initErr.message);
      }
    })();

    // ── Daily Midnight Refresh Scheduler ───────────────────────────────────
    startScheduler(app.locals.db, redis);

    app.listen(PORT, () => {
      logger.info(`[Server] OptionSmart Chatbot API running on http://localhost:${PORT}`);
      logger.info(`[Server] Health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    logger.error('[Server] Startup failed:', err.message);
    process.exit(1);
  }
}

start();
