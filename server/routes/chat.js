/**
 * chat.js — Express router for all chatbot API endpoints
 *
 * POST /api/chat          → Main chat (RAG + Claude, SSE streaming)
 * POST /api/chat/coach    → Morning Coach AI briefing
 * POST /api/chat/insights → Trade Journal AI insights
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

const ragService     = require('../services/ragService');
const { getMarketContext } = require('../services/marketService');
const logger         = require('../utils/logger');

// Middleware: attach redis client (injected from app.js via req.app.locals.redis)
const getRedis = (req) => req.app.locals.redis;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
// SYSTEM PROMPT (server-side, never exposed to browser)
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the official AI assistant for OptionSmart, India's institutional-grade algorithmic options trading platform built on the GoAlgoTrade infrastructure. You speak with precision, institutional clarity, and data-driven confidence.

PLATFORM OVERVIEW:
OptionSmart is a systematic quantitative investment and algo trading company combining 26 quantitative strategy engines, the GoAlgoTrade execution platform, and broker enablement. Stats: 1,300+ B2B partners, 99.9% uptime SLA, NSE/BSE/MCX coverage, kill switch <1 second. SEBI Framework Aligned, NSE & BSE Registered, SEBI Algo Vendor.

FOUNDERS:
- Madhur Dahale (Co-Founder): 20+ years in Indian financial markets at Religare, Sharekhan, and Indiabulls. Leads quantitative research and fintech strategy. MBA – Pune University | MDP – IIM Lucknow.
- Aakash Gupta (Co-Founder): Quant trading specialist from Kotak Securities, PNB Paribas, HDFC Securities. Leads product strategy, GTM, and broker partnerships. MBA Finance – University of Wales, UK (2013).

CAPITAL TIERS (5 tiers):
1. Core – Rs 9 Lakh: Entry-level. Access to Non-Directional Strategy, AI/ML exit intelligence, basic risk management.
2. Alpha – Rs 25 Lakh: All Core + Increased Directional Strategies, Advanced risk controls.
3. Pro – Rs 50 Lakh (Most Popular): All Alpha + Directional and Non-Directional combination, Enhanced Risk Management, Adaptive Strategy Selection.
4. Elite – Rs 1 Crore: All Pro + Custom strategy allocation, Auto Delta Risk Management System.
5. Institutional – Rs 5 Crore+: Full suite of multiple strategies, Adaptive Non-Correlated Strategies, enterprise solutions.

MARKET REGIME ENGINE:
Proprietary algorithm that continuously analyzes market microstructure and classifies into three regimes:
- Trending: Directional momentum. Algorithms deploy adaptive position sizing and trailing stops.
- Range-Bound: Mean-reverting market. Theta-harvesting strategies — straddles, strangles. IV Rank is key.
- Volatility Expansion: Event-driven, high uncertainty. Conservative positioning, wider stops, gamma-aware structures. 15+ volatility filters run continuously.

AI/ML EXIT INTELLIGENCE:
Adaptive exit layer evaluating in real-time: Price Momentum, Volatility Behavior, Option Premium Dynamics, Intraday Probability Shifts. Unlike fixed stop-loss systems, this responds to changing probability distributions throughout the session. Explainable and auditable — not a black box.

RISK MANAGEMENT:
- 2% MTM cap per session — auto-exit on breach
- Kill switch: entire portfolio squared off in under 1 second
- 15+ volatility filters running continuously
- 100% intraday square-off: zero overnight positional risk
- SEBI White Box architecture: fully auditable, documented logic

ALGO STRATEGIES:
- Saturn: Theta-decay harvesting. Premium capture in range-bound regimes. Short options structures.
- Venus: Balanced risk-reward using defined-risk spreads. Adapts across trending and range-bound regimes.
- Pluto: Aggressive directional strategy for trending regimes. Higher risk-return profile.

GOALGO PLATFORM (goalgotrade.tech):
Multi-Broker Execution (Zerodha, Angel One, Motilal Oswal, and more), Real-Time Risk Controls, Performance Analytics (PnL, Sharpe ratio, drawdowns, win rate), Smart Order Execution (slippage control, retry logic), Option Greeks & Analytics (live Delta, Gamma, Theta, Vega), Strategy Builder & Backtesting, Compliance-Ready Audit Logs, Multi-Asset Coverage (NSE/BSE/MCX), Broker & Client Enablement.

COMPLIANCE: SEBI Framework Aligned. White Box architecture — fully auditable. NSE & BSE Registered. SEBI Algo Vendor.

RESPONSE FORMAT:
After each response, on a new line add exactly: SUGGESTIONS: [short q 1] | [short q 2] | [short q 3]
These should be 3 natural follow-up questions (under 8 words each) the user might ask next. Do not include brackets in the actual output.
If your answer substantively explains the 5 capital tiers (Core/Alpha/Pro/Elite/Institutional) with their pricing, add one more line: CARDS: TIERS

TONE: Precise, institutional, data-driven. Use specific numbers. Never guarantee returns. Use Indian financial terminology: IV rank, theta decay, delta hedging, MTM, SEBI, NSE, F&O. Keep responses scannable — use bullet points for feature lists.`;

const HINDI_DIRECTIVE = '\n\nIMPORTANT: Respond entirely in Hindi (Devanagari script), including all explanations and the SUGGESTIONS line questions. Keep technical/English terms (like SEBI, MTM, NSE, IV, API) as-is where there is no natural Hindi equivalent.';

// getLiveMarketContext replaced by marketService.getMarketContext (detects symbols in message + fetches from Kite API)

// ─────────────────────────────────────────────
// POST /api/chat  (Server-Sent Events streaming)
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { message, history = [], lang = 'en' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const redis = getRedis(req);

  // 1. RAG lookup
  const ragResult = await ragService.query(redis, message);

  // 2. If strong RAG hit → stream it directly (zero Claude tokens)
  if (ragResult.hit && ragResult.cached) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const payload = typeof ragResult.answer === 'string' ? ragResult.answer : ragResult.answer;
    const chunks = payload.match(/.{1,40}/g) || [payload];
    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
      await new Promise(r => setTimeout(r, 8));
    }
    res.write(`data: ${JSON.stringify({ type: 'done', source: 'cache' })}\n\n`);
    res.end();
    return;
  }

  // 3. Build Claude messages
  const messages = [];
  for (const h of history.slice(-14)) {
    messages.push({ role: 'user',      content: h.user });
    messages.push({ role: 'assistant', content: h.bot  });
  }
  messages.push({ role: 'user', content: message });

  // 4. Build system prompt with RAG context + live market data
  // marketService detects which stocks/indices the user asked about and fetches live Kite quotes
  const marketCtx = await getMarketContext(message, redis);
  let systemWithContext = SYSTEM_PROMPT;

  if (ragResult.context && ragResult.context.length > 0) {
    systemWithContext += '\n\nRELEVANT KNOWLEDGE BASE CONTEXT (use this as reference):\n' + ragResult.context.join('\n---\n');
  }
  if (marketCtx) {
    systemWithContext += marketCtx;
  }
  if (lang === 'hi') {
    systemWithContext += HINDI_DIRECTIVE;
  }

  // 5. Stream from Claude
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let fullText = '';

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemWithContext,
      messages,
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
    });

    await stream.finalMessage();

    res.write(`data: ${JSON.stringify({ type: 'done', source: 'claude' })}\n\n`);
    res.end();

    // 6. Cache the result for future identical questions
    ragService.cacheAnswer(redis, message, { answer: fullText }).catch(() => {});
    logger.info(`[Chat] Streamed response (${fullText.length} chars) for: "${message.slice(0, 60)}"`);
  } catch (err) {
    logger.error('[Chat] Claude stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ─────────────────────────────────────────────
// POST /api/chat/coach  — Morning Coach briefing
// ─────────────────────────────────────────────
router.post('/coach', async (req, res) => {
  const redis = getRedis(req);
  const now = new Date();
  const dayName = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const hour = now.getHours();
  const session = hour < 11 ? 'early morning' : hour < 13 ? 'mid-morning' : 'afternoon';

  // Try to inject live Nifty/VIX from Redis
  let liveData = '';
  try {
    const nifty = await redis.get('zerodha:quote:NIFTY');
    const vix   = await redis.get('zerodha:quote:INDIAVIX');
    if (nifty) { const d = JSON.parse(nifty); liveData += ` Live Nifty: ${d.last_price}.`; }
    if (vix)   { const d = JSON.parse(vix);   liveData += ` Live VIX: ${d.last_price}.`; }
  } catch {}

  const prompt = `You are OptionSmart's AI Market Coach generating a morning briefing for an Indian algo trader.
Today is ${dayName}, ${dateStr}. It is ${session}.${liveData}

Generate a realistic market briefing in this EXACT JSON format (no markdown, no backticks, pure JSON):
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
  "keyInsight": "One sharp specific insight about today in 1-2 sentences. Be data-driven and specific to the day of week.",
  "watchOut": "One specific risk or event to watch today in 1 sentence."
}
Use realistic NSE/F&O market context. ${dayName === 'Thursday' ? 'Thursday is weekly expiry — factor in theta burn and IV crush.' : ''} ${dayName === 'Monday' ? 'Monday often has gap opens — factor in weekend premium.' : ''}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content?.[0]?.text || '{}';
    const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ ok: true, data });
  } catch (err) {
    logger.error('[Coach] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/chat/insights  — Trade Journal AI
// ─────────────────────────────────────────────
router.post('/insights', async (req, res) => {
  const { trades } = req.body;
  if (!trades || trades.length < 3) {
    return res.status(400).json({ error: 'At least 3 trades required for insights.' });
  }

  const summary = trades.slice(0, 30).map(t =>
    `${t.date} ${t.time} | ${t.instrument} | ${t.strategy} | Entry:${t.entry} Exit:${t.exit} | PnL:₹${t.pnl} | Exit:${t.exitReason || '?'} | Notes:${t.notes || '-'}`
  ).join('\n');

  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const wins     = trades.filter(t => t.pnl > 0).length;
  const losses   = trades.filter(t => t.pnl < 0).length;

  const prompt = `You are OptionSmart's AI Trade Journal analyst. Analyse this trader's log and generate sharp specific behavioral insights.

TRADE LOG:
${summary}

STATS: ${trades.length} trades | ${wins} wins | ${losses} losses | Total PnL: ₹${totalPnl.toFixed(2)}

Return ONLY this JSON (no markdown):
{"insights":[{"type":"alert|positive|neutral","label":"SHORT CAPS LABEL","text":"Specific insight with actual numbers. Use ₹ and %. Be blunt and precise."}]}

Focus on: time-of-day patterns, early exit of profits, letting losses run, strategy performance differences, exit reason quality, emotional signals in notes. Generate 4-5 insights. Be specific — no generic advice.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw  = msg.content?.[0]?.text || '{}';
    const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ ok: true, data, stats: { totalPnl, wins, losses, total: trades.length } });
  } catch (err) {
    logger.error('[Insights] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
