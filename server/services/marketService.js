/**
 * marketService.js
 * Fetches live stock/index quotes from Zerodha Kite REST API on-demand.
 *
 * HOW IT WORKS:
 * 1. On first use, downloads the full NSE+BSE instruments list from Kite API (~2MB CSV)
 *    and builds a searchable map: company name / tradingsymbol → exchange:tradingsymbol
 *    This list is cached in Redis for 24 hours.
 * 2. When a user asks about any stock, we fuzzy-match their message against the
 *    full instruments index to find the right symbol.
 * 3. Fetches live quotes from Kite /quote endpoint and caches results for 15 seconds.
 * 4. Returns a formatted string injected into Claude's system prompt.
 *
 * Covers: All NSE equities, indices, F&O names, BSE stocks — any tradeable instrument.
 */

const axios  = require('axios');
const logger = require('../utils/logger');

const INSTRUMENTS_CACHE_KEY = 'zerodha:instruments:nse';
const INSTRUMENTS_TTL       = 24 * 60 * 60; // 24 hours
const QUOTE_CACHE_TTL       = 15;            // 15 seconds
const SYSTEM_UID            = 'system';
const MAX_SYMBOLS_PER_QUERY = 10;            // Kite allows up to 500, we cap at 10 per chat message

// In-memory cache of the instruments map (avoids repeated Redis deserialisation)
let _instrumentsMap = null; // { 'RELIANCE': 'NSE:RELIANCE', 'RELIANCE INDUSTRIES': 'NSE:RELIANCE', ... }
let _mapLoadedAt    = 0;

// ─────────────────────────────────────────────
// Parse Kite instruments CSV into a lookup map
// CSV columns: instrument_token,exchange_token,tradingsymbol,name,...,instrument_type,segment,exchange
// We only keep EQ (equity) and INDEX rows from NSE and BSE
// ─────────────────────────────────────────────
function parseInstrumentsCSV(csvText) {
  const lines = csvText.split('\n');
  const map   = {}; // key (lowercase) → 'EXCHANGE:TRADINGSYMBOL'

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 12) continue;

    const tradingsymbol  = cols[2]?.trim();
    const name           = cols[3]?.trim();
    const instrumentType = cols[9]?.trim();  // EQ, FUT, CE, PE, INDEX
    const exchange       = cols[11]?.trim(); // NSE, BSE, NFO, ...

    if (!tradingsymbol || !exchange) continue;

    // Only equities and indices from NSE/BSE (skip derivatives)
    const isEquity = instrumentType === 'EQ';
    const isIndex  = instrumentType === 'INDEX';
    const isNSEBSE = exchange === 'NSE' || exchange === 'BSE';

    if (!(isEquity || isIndex) || !isNSEBSE) continue;

    const key = `${exchange}:${tradingsymbol}`;

    // Map by tradingsymbol (e.g. "reliance" → NSE:RELIANCE)
    map[tradingsymbol.toLowerCase()] = key;

    // Map by full company name (e.g. "reliance industries" → NSE:RELIANCE)
    if (name) {
      map[name.toLowerCase()] = key;
      // Also map significant words in the name
      const words = name.toLowerCase().split(/\s+/);
      if (words.length >= 2) {
        // Map first two words together e.g. "reliance industries"
        map[words.slice(0, 2).join(' ')] = key;
      }
    }
  }

  return map;
}

// ─────────────────────────────────────────────
// Load instruments map from Redis or fetch fresh from Kite
// ─────────────────────────────────────────────
async function getInstrumentsMap(apiKey, accessToken, redis) {
  // Return in-memory cache if fresh (< 6 hours old)
  if (_instrumentsMap && Date.now() - _mapLoadedAt < 6 * 60 * 60 * 1000) {
    return _instrumentsMap;
  }

  // Try Redis cache
  try {
    const cached = await redis.get(INSTRUMENTS_CACHE_KEY);
    if (cached) {
      _instrumentsMap = JSON.parse(cached);
      _mapLoadedAt    = Date.now();
      logger.info(`[Market] Instruments map loaded from Redis (${Object.keys(_instrumentsMap).length} entries)`);
      return _instrumentsMap;
    }
  } catch (e) {
    logger.warn('[Market] Redis instruments cache read failed:', e.message);
  }

  // Fetch fresh from Kite API
  try {
    logger.info('[Market] Downloading full instruments list from Kite API…');
    const response = await axios.get('https://api.kite.trade/instruments', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      timeout: 15000,
      responseType: 'text',
    });

    const map = parseInstrumentsCSV(response.data);
    logger.info(`[Market] Instruments parsed: ${Object.keys(map).length} entries`);

    // Cache in Redis for 24h
    await redis.setEx(INSTRUMENTS_CACHE_KEY, INSTRUMENTS_TTL, JSON.stringify(map));

    _instrumentsMap = map;
    _mapLoadedAt    = Date.now();
    return map;
  } catch (err) {
    logger.warn('[Market] Failed to download instruments list:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Detect which instruments are mentioned in a user message
// Uses the full instruments map for any NSE/BSE stock
// ─────────────────────────────────────────────
function detectSymbolsFromMap(message, instrumentsMap) {
  const lower = message.toLowerCase()
    .replace(/[?!.,;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const found = new Set();

  // Sort keys by length descending (longer matches first to avoid partial matches)
  const keys = Object.keys(instrumentsMap).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (key.length < 2) continue; // skip single-letter keys

    // Match whole word or phrase
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);

    if (regex.test(lower) || lower === key) {
      found.add(instrumentsMap[key]);
      if (found.size >= MAX_SYMBOLS_PER_QUERY) break;
    }
  }

  return [...found];
}

// ─────────────────────────────────────────────
// Fetch live quotes from Kite REST API
// Caches each quote in Redis for 15 seconds
// ─────────────────────────────────────────────
async function fetchQuotes(instruments, apiKey, accessToken, redis) {
  if (!instruments.length) return {};

  const results = {};
  const toFetch = [];

  for (const inst of instruments) {
    const cacheKey = `zerodha:quote:${inst.replace(/[: ]/g, '_')}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        results[inst] = JSON.parse(cached);
      } else {
        toFetch.push(inst);
      }
    } catch {
      toFetch.push(inst);
    }
  }

  if (toFetch.length === 0) return results;

  try {
    const params = toFetch.map(i => `i=${encodeURIComponent(i)}`).join('&');
    const response = await axios.get(`https://api.kite.trade/quote?${params}`, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      timeout: 6000,
    });

    const data = response.data?.data || {};

    for (const [inst, quote] of Object.entries(data)) {
      results[inst] = quote;
      const cacheKey = `zerodha:quote:${inst.replace(/[: ]/g, '_')}`;
      redis.setEx(cacheKey, QUOTE_CACHE_TTL, JSON.stringify(quote)).catch(() => {});
    }

    logger.info(`[Market] Live quotes fetched for: ${Object.keys(data).join(', ')}`);
  } catch (err) {
    logger.warn(`[Market] Kite quote fetch failed: ${err.message}`);
  }

  return results;
}

// ─────────────────────────────────────────────
// Format a quote into a readable line for Claude
// ─────────────────────────────────────────────
function formatQuote(instrument, quote) {
  if (!quote) return null;

  const sym       = instrument.split(':')[1] || instrument;
  const price     = quote.last_price?.toFixed(2);
  const prevClose = quote.ohlc?.close;
  const change    = prevClose ? (quote.last_price - prevClose) : null;
  const changePct = (prevClose && change != null) ? ((change / prevClose) * 100).toFixed(2) : null;
  const sign      = (change ?? 0) >= 0 ? '+' : '';
  const high      = quote.ohlc?.high?.toFixed(2);
  const low       = quote.ohlc?.low?.toFixed(2);
  const vol       = quote.volume ? `Vol: ${Number((quote.volume / 1000).toFixed(0)).toLocaleString('en-IN')}K` : '';

  let line = `${sym}: ₹${price}`;
  if (change != null) {
    line += ` (${sign}${change.toFixed(2)}`;
    if (changePct) line += ` / ${sign}${changePct}%`;
    line += ')';
  }
  if (high && low) line += ` | Day H/L: ₹${high} / ₹${low}`;
  if (vol) line += ` | ${vol}`;
  return line;
}

// ─────────────────────────────────────────────
// Main entry point — called from chat.js before Claude
// ─────────────────────────────────────────────
async function getMarketContext(message, redis) {
  try {
    const apiKey     = process.env.ZERODHA_API_KEY?.trim();
    const accessToken = await redis.get(`zerodha:token:${SYSTEM_UID}`)
                     || await redis.get(`zerodha:token:dev-user`);

    if (!accessToken || !apiKey) return '';

    // Load the full instruments map
    const instrumentsMap = await getInstrumentsMap(apiKey, accessToken, redis);
    if (!instrumentsMap) return '';

    // Detect which stocks are mentioned
    const instruments = detectSymbolsFromMap(message, instrumentsMap);
    if (!instruments.length) return '';

    // Fetch live quotes
    const quotes = await fetchQuotes(instruments, apiKey, accessToken, redis);
    if (!Object.keys(quotes).length) return '';

    const lines = Object.entries(quotes)
      .map(([inst, q]) => formatQuote(inst, q))
      .filter(Boolean);

    if (!lines.length) return '';

    const ts = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `\n\nLIVE MARKET DATA (real-time from Zerodha Kite at ${ts} IST):\n${lines.map(l => `• ${l}`).join('\n')}\nIMPORTANT: Use these exact real-time figures in your response. Do not estimate or approximate prices.`;
  } catch (err) {
    logger.warn('[Market] getMarketContext error:', err.message);
    return '';
  }
}

/**
 * Pre-warm the instruments map on server startup.
 * Call this once after Redis connects so the first user query isn't slow.
 */
async function warmInstrumentsCache(redis) {
  try {
    const apiKey     = process.env.ZERODHA_API_KEY?.trim();
    const accessToken = await redis.get(`zerodha:token:${SYSTEM_UID}`);
    if (!apiKey || !accessToken) {
      logger.info('[Market] Skipping instruments pre-warm (no Zerodha token yet).');
      return;
    }
    await getInstrumentsMap(apiKey, accessToken, redis);
    logger.info('[Market] Instruments cache warmed ✓');
  } catch (err) {
    logger.warn('[Market] Instruments pre-warm failed:', err.message);
  }
}

module.exports = { getMarketContext, warmInstrumentsCache };
