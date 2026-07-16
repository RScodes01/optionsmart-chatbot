/**
 * coachService.js
 * Generates the Morning Market Coach brief using real news + live Nifty/VIX data
 * and stores it in MongoDB, replacing any previous days' briefs.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { fetchMarketHeadlines } = require('./newsService');
const { parseLLMJson } = require('../utils/jsonParser');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Generates the Morning Market Coach brief using real news + live Nifty/VIX data
 * and stores it in MongoDB, keeping ONLY today's brief in the database.
 *
 * @param {import('mongodb').Db} db
 * @param {import('redis').RedisClientType} redis
 * @param {boolean} force - if true, bypasses DB check and regenerates
 * @returns {Promise<object>} - the generated/stored brief data
 */
async function generateAndStoreBrief(db, redis, force = false) {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const hour    = now.getHours();
  const session = hour < 11 ? 'early morning' : hour < 13 ? 'mid-morning' : 'afternoon';
  const today   = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // ── 1. Check MongoDB for today's brief first (unless force is true) ────────
  if (!force) {
    try {
      const existing = await db.collection('morning_briefs').findOne({ date: today });
      if (existing) {
        logger.info(`[Coach] MongoDB hit — returning stored brief for ${today}`);
        return existing.data;
      }
    } catch (err) {
      logger.warn(`[Coach] MongoDB check failed (will generate): ${err.message}`);
    }
  }

  logger.info(`[Coach] Generating fresh morning brief (force=${force})...`);

  // ── 2. Fetch live Nifty/VIX from Redis ──────────────────────────────────────
  let liveData = '';
  try {
    const nifty = await redis.get('zerodha:quote:NIFTY');
    const vix   = await redis.get('zerodha:quote:INDIAVIX');
    if (nifty) { const d = JSON.parse(nifty); liveData += ` Live Nifty: ${d.last_price}.`; }
    if (vix)   { const d = JSON.parse(vix);   liveData += ` Live VIX: ${d.last_price}.`; }
  } catch {}

  // ── 3. Fetch real market news headlines (Redis 30-min cache) ─────────────────
  let headlines = '';
  try {
    headlines = await fetchMarketHeadlines(redis, force); // pass force to skip headlines cache if regenerating forced
  } catch (err) {
    logger.warn(`[Coach] News fetch failed (non-fatal): ${err.message}`);
  }

  const newsSection = headlines
    ? `\n\nTODAY'S REAL MARKET NEWS HEADLINES (use these to make the brief accurate and specific):\n${headlines}`
    : '';

  // ── 4. Build prompt ──────────────────────────────────────────────────────────
  const prompt = `You are OptionSmart's AI Market Coach generating a morning briefing for an Indian algo trader.
Today is ${dayName}, ${dateStr}. It is ${session}.${liveData}${newsSection}

Generate a market briefing in this EXACT JSON format (no markdown, no backticks, pure JSON):
{
  "greeting": "Good morning, Trader",
  "regime": "Trending|Range-Bound|Volatility Expansion",
  "trendProbability": 63,
  "volatility": "Low|Medium|High",
  "vix": "14.2",
  "niftyBias": "Bullish|Bearish|Neutral",
  "niftyLevel": "24,850",
  "recommended": ["Venus","Saturn"],
  "avoid": ["Pluto"],
  "neutral": [],
  "riskLevel": "low|medium|high",
  "keyInsight": "One sharp specific insight about today in 1-2 sentences. Be data-driven.",
  "watchOut": "One specific risk or event to watch today in 1 sentence.",
  "marketBrief": {
    "headline": "One bold sentence summarising today's dominant market theme (e.g. 'Nifty slips 300 pts on FII selling; banks lead decline')",
    "events": [
      { "title": "Event title (5-8 words)", "detail": "2-3 sentence explanation with numbers, direction, and impact. Be specific and data-driven." },
      { "title": "Event title", "detail": "Detail paragraph." },
      { "title": "Event title", "detail": "Detail paragraph." },
      { "title": "Event title", "detail": "Detail paragraph." },
      { "title": "Event title", "detail": "Detail paragraph." }
    ],
    "technicals": "2-3 sentences on Nifty/Sensex technical picture: key levels breached, chart pattern, support/resistance levels for today.",
    "strategy": "2-3 sentences on the preferred trading approach for today: buy dips / sell rallies, levels to watch, recommended stance for day traders."
  }
}
Rules: Use REAL data from the headlines above. Be specific with numbers. Do not hallucinate data not in the headlines.
When displaying live stock/index data, ALWAYS start with: ## [STOCK NAME] — Live Snapshot, then a markdown table with Parameter and Value columns.
${dayName === 'Thursday' ? 'Thursday is weekly expiry — factor in theta burn and IV crush.' : ''} 
${dayName === 'Monday' ? 'Monday often has gap opens — factor in weekend premium.' : ''}`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });
  const result = await model.generateContent(prompt);
  const raw  = result.response.text() || '{}';
  const data = parseLLMJson(raw);

  // ── 5. Save to MongoDB (ONLY keep today's, delete others) ──
  try {
    // Delete any past day's briefs
    const deleteRes = await db.collection('morning_briefs').deleteMany({ date: { $ne: today } });
    if (deleteRes.deletedCount > 0) {
      logger.info(`[Coach] Cleared ${deleteRes.deletedCount} old morning brief records from MongoDB`);
    }

    await db.collection('morning_briefs').updateOne(
      { date: today },
      { $set: { date: today, data, generatedAt: now, dayName, dateStr } },
      { upsert: true }
    );
    logger.info(`[Coach] Brief saved to MongoDB (morning_briefs) for ${today}`);
  } catch (dbErr) {
    logger.warn(`[Coach] MongoDB write failed: ${dbErr.message}`);
  }

  return data;
}

module.exports = { generateAndStoreBrief };
