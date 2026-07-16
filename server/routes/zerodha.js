/**
 * zerodha.js — Express router for Zerodha Kite API integration
 *
 * Primary method: paste ZERODHA_ACCESS_TOKEN in .env → loaded automatically on startup.
 * Fallback method: OAuth flow (GET /login-url → POST /token).
 *
 * GET    /api/zerodha/status        → Connection status
 * POST   /api/zerodha/token/manual  → Accept a raw access token directly
 * POST   /api/zerodha/token         → OAuth request_token → access_token exchange
 * GET    /api/zerodha/market-data   → Live quotes from Redis cache
 * DELETE /api/zerodha/disconnect    → Remove stored token
 */

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');
const router  = express.Router();
const logger  = require('../utils/logger');

const TOKEN_KEY  = (uid) => `zerodha:token:${uid}`;
const TOKEN_TTL  = 8 * 60 * 60; // 8 hours
const SYSTEM_UID = 'system'; // key used for the env-based static token

// ─────────────────────────────────────────────
// Called from index.js after Redis connects.
// If ZERODHA_ACCESS_TOKEN is in .env, store it in Redis automatically.
// ─────────────────────────────────────────────
async function loadEnvToken(redis) {
  const token = process.env.ZERODHA_ACCESS_TOKEN?.trim();
  if (!token) {
    logger.info('[Zerodha] No ZERODHA_ACCESS_TOKEN in .env — skipping auto-load.');
    return;
  }

  try {
    await redis.setEx(TOKEN_KEY(SYSTEM_UID), TOKEN_TTL, token);
    logger.info('[Zerodha] ✓ Access token loaded from .env into Redis (8h TTL).');
  } catch (err) {
    logger.warn(`[Zerodha] Could not persist env token to Redis: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// Helper: resolve best available token
// Priority: per-user token → system (env) token
// ─────────────────────────────────────────────
async function resolveToken(redis, uid) {
  if (uid) {
    const userToken = await redis.get(TOKEN_KEY(uid));
    if (userToken) return userToken;
  }
  return redis.get(TOKEN_KEY(SYSTEM_UID));
}

// ─────────────────────────────────────────────
// GET /api/zerodha/status
// ─────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const redis     = req.app.locals.redis;
  const uid       = req.user?.uid || req.headers['x-uid'] || 'dev-user';
  const userToken = await redis.get(TOKEN_KEY(uid));
  const sysToken  = await redis.get(TOKEN_KEY(SYSTEM_UID));
  const active    = userToken || sysToken;
  const ttlKey    = userToken ? TOKEN_KEY(uid) : TOKEN_KEY(SYSTEM_UID);
  const ttl       = active ? await redis.ttl(ttlKey) : 0;

  res.json({
    ok: true,
    connected: !!active,
    source: userToken ? 'user-oauth' : sysToken ? 'env-token' : 'none',
    expiresInSeconds: ttl,
    apiKeyConfigured: !!process.env.ZERODHA_API_KEY,
    envTokenConfigured: !!(process.env.ZERODHA_ACCESS_TOKEN?.trim()),
  });
});

// ─────────────────────────────────────────────
// POST /api/zerodha/token/manual
// Paste an access token directly — no OAuth needed.
// Body: { accessToken: "..." }
// ─────────────────────────────────────────────
router.post('/token/manual', async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length < 10) {
    return res.status(400).json({ error: 'A valid accessToken string is required.' });
  }

  const redis = req.app.locals.redis;
  const uid   = req.user?.uid || req.headers['x-uid'] || SYSTEM_UID;

  await redis.setEx(TOKEN_KEY(uid), TOKEN_TTL, accessToken.trim());
  logger.info(`[Zerodha] Manual access token stored for uid=${uid}`);
  res.json({ ok: true, message: 'Access token stored ✓ (valid for 8h or until market close)' });
});

// ─────────────────────────────────────────────
// POST /api/zerodha/token  (OAuth flow fallback)
// Body: { requestToken: "..." }
// ─────────────────────────────────────────────
router.post('/token', async (req, res) => {
  const { requestToken } = req.body;
  if (!requestToken) {
    return res.status(400).json({ error: 'requestToken is required' });
  }

  const apiKey    = process.env.ZERODHA_API_KEY;
  const apiSecret = process.env.ZERODHA_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Zerodha API credentials not configured on server' });
  }

  try {
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + requestToken + apiSecret)
      .digest('hex');

    const response = await axios.post(
      'https://api.kite.trade/session/token',
      new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
      { headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = response.data?.data?.access_token;
    if (!accessToken) throw new Error('No access_token in response');

    const redis = req.app.locals.redis;
    const uid   = req.user?.uid || req.headers['x-uid'] || SYSTEM_UID;
    await redis.setEx(TOKEN_KEY(uid), TOKEN_TTL, accessToken);

    logger.info(`[Zerodha] OAuth token exchanged for uid=${uid}`);
    res.json({ ok: true, message: 'Connected to Zerodha via OAuth ✓' });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    logger.error('[Zerodha] Token exchange error:', msg);
    res.status(400).json({ ok: false, error: msg });
  }
});

// ─────────────────────────────────────────────
// GET /api/zerodha/market-data
// Returns cached live quotes from Redis.
// ─────────────────────────────────────────────
router.get('/market-data', async (req, res) => {
  const redis = req.app.locals.redis;
  try {
    const symbols = ['NIFTY', 'BANKNIFTY', 'INDIAVIX', 'FINNIFTY'];
    const quotes  = {};

    for (const sym of symbols) {
      const raw = await redis.get(`zerodha:quote:${sym}`);
      if (raw) quotes[sym] = JSON.parse(raw);
    }

    res.json({ ok: true, quotes, ts: Date.now() });
  } catch (err) {
    logger.error('[Zerodha] Market data error:', err.message);
    res.json({ ok: true, quotes: {}, ts: Date.now() });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/zerodha/disconnect
// ─────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  const redis = req.app.locals.redis;
  const uid   = req.user?.uid || req.headers['x-uid'] || SYSTEM_UID;
  await redis.del(TOKEN_KEY(uid));
  await redis.del(TOKEN_KEY(SYSTEM_UID));
  res.json({ ok: true });
});

module.exports = router;
module.exports.loadEnvToken = loadEnvToken;
