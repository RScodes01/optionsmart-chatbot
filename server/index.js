/**
 * index.js — Express server entry point for the OptionSmart Chatbot
 * Run: node server/index.js
 */

require('dotenv').config();

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
redis.on('error', (err) => logger.error('[Redis] Error:', err.message));

// ── MongoDB ─────────────────────────────────────────
let mongoClient;

// ── Routes ──────────────────────────────────────────
const chatRoutes    = require('./routes/chat');
const zerodhaRoutes = require('./routes/zerodha');
const { loadEnvToken } = require('./routes/zerodha');
const { warmInstrumentsCache } = require('./services/marketService');
const journalRoutes = require('./routes/journal');

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
