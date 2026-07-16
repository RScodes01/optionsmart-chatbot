/**
 * chat.js â€” Express router for all chatbot API endpoints
 *
 * POST /api/chat          â†’ Main chat (RAG + Claude, SSE streaming)
 * POST /api/chat/coach    â†’ Morning Coach AI briefing
 * POST /api/chat/insights â†’ Trade Journal AI insights
 */

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();

const ragService             = require('../services/ragService');
const { getMarketContext }   = require('../services/marketService');
const { fetchMarketHeadlines } = require('../services/newsService');
const { generateAndStoreBrief } = require('../services/coachService');
const { parseLLMJson } = require('../utils/jsonParser');
const { checkPrivacy }    = require('../utils/privacyGuard');
const { embed }            = require('../services/embeddingService');
const { normalizeQuery }   = require('../utils/queryNormalizer');
const logger                 = require('../utils/logger');
const { generateText, streamText } = require('../services/geminiService');

// Middleware: attach redis client (injected from app.js via req.app.locals.redis)
const getRedis = (req) => req.app.locals.redis;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─────────────────────────────────────────────
// SYSTEM PROMPT (server-side, never exposed to browser)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SYSTEM_PROMPT = `You are the official AI assistant for OptionSmart, India's institutional-grade algorithmic options trading platform built on the GoAlgoTrade infrastructure. You speak with precision, institutional clarity, and data-driven confidence.

CONCISENESS RULES:
- Always keep responses extremely concise, point-to-point, and precise.
- Get straight to the answer without conversational filler, intros, or summaries (e.g., do not say "Certainly! Here is...", "Let me help you with...", or "In conclusion...").
- Keep responses short, direct, and focused. Avoid verbose background info unless explicitly requested.
- Limit explanations of a single concept or topic to a maximum of 2 sentences. Use bullet points or tables instead of long paragraph blocks.

PRIVACY & CONFIDENTIALITY RULES (STRICT - NEVER VIOLATE):
- NEVER disclose specific return percentages, profit %s, ROI numbers, or yield figures for any strategy or tier. If asked, respond: "For specific performance figures, please talk to an advisor at +91 8779328028."
- NEVER reveal fee structures, commission rates, profit-sharing percentages, or subscription pricing details. Direct user to advisor.
- NEVER disclose internal algorithm parameters, strategy code logic, threshold values, formula weights, or configuration settings.
- NEVER share AUM (Assets Under Management), total client count, or total funds managed figures.
- NEVER provide maximum drawdown numbers or specific historical loss percentages beyond what is publicly documented.
- If a user asks for any of the above, always respond: "For detailed figures on this, I'd recommend speaking with an OptionSmart advisor directly. 📞 Call +91 8779328028 or use the WhatsApp button below."

PLATFORM OVERVIEW:
OptionSmart is a systematic quantitative investment and algo trading company combining 26 quantitative strategy engines, the GoAlgoTrade execution platform, and broker enablement. Stats: 1,300+ B2B partners, 99.9% uptime SLA, NSE/BSE/MCX coverage, kill switch <1 second. SEBI Framework Aligned, NSE & BSE Registered, SEBI Algo Vendor.

FOUNDERS:
- Madhur Dahale (Co-Founder): 20+ years in Indian financial markets at Religare, Sharekhan, and Indiabulls. Leads quantitative research and fintech strategy. MBA â€“ Pune University | MDP â€“ IIM Lucknow.
- Aakash Gupta (Co-Founder): Quant trading specialist from Kotak Securities, PNB Paribas, HDFC Securities. Leads product strategy, GTM, and broker partnerships. MBA Finance â€“ University of Wales, UK (2013).

CAPITAL TIERS (5 tiers):
1. Core â€“ Rs 9 Lakh: Entry-level. Access to Non-Directional Strategy, AI/ML exit intelligence, basic risk management.
2. Alpha â€“ Rs 25 Lakh: All Core + Increased Directional Strategies, Advanced risk controls.
3. Pro â€“ Rs 50 Lakh (Most Popular): All Alpha + Directional and Non-Directional combination, Enhanced Risk Management, Adaptive Strategy Selection.
4. Elite â€“ Rs 1 Crore: All Pro + Custom strategy allocation, Auto Delta Risk Management System.
5. Institutional â€“ Rs 5 Crore+: Full suite of multiple strategies, Adaptive Non-Correlated Strategies, enterprise solutions.

MARKET REGIME ENGINE:
Proprietary algorithm that continuously analyzes market microstructure and classifies into three regimes:
- Trending: Directional momentum. Algorithms deploy adaptive position sizing and trailing stops.
- Range-Bound: Mean-reverting market. Theta-harvesting strategies â€” straddles, strangles. IV Rank is key.
- Volatility Expansion: Event-driven, high uncertainty. Conservative positioning, wider stops, gamma-aware structures. 15+ volatility filters run continuously.

AI/ML EXIT INTELLIGENCE:
Adaptive exit layer evaluating in real-time: Price Momentum, Volatility Behavior, Option Premium Dynamics, Intraday Probability Shifts. Unlike fixed stop-loss systems, this responds to changing probability distributions throughout the session. Explainable and auditable â€” not a black box.

RISK MANAGEMENT:
- 2% MTM cap per session â€” auto-exit on breach
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

COMPLIANCE: SEBI Framework Aligned. White Box architecture â€” fully auditable. NSE & BSE Registered. SEBI Algo Vendor.

RESPONSE FORMAT:
- Use **markdown** for all formatting â€” it is fully rendered in the UI.
- Use markdown **tables** whenever comparing items (e.g. capital tiers, strategy differences, fee structures, metrics). Format: | Col1 | Col2 | with a separator row |---|---|
- Use **## headings** to organise multi-section responses.
- Use **bullet lists** (- item) for features, options, and short lists.
- Use **numbered lists** (1. 2. 3.) for steps or ranked items.
- Use **bold** (**text**) for key terms, prices, and important values.
- Use inline code (\`value\`) for specific numbers, symbols, or formulas.
- Use > blockquote for important notes or caveats.
- Keep responses extremely short, punchy, and point-to-point. Avoid writing more than 2-3 brief sentences per point/topic.
- After each response, on a new line add exactly: SUGGESTIONS: [short q 1] | [short q 2] | [short q 3]
  These should be 3 natural follow-up questions (under 8 words each). Do not include brackets.
- If your answer substantively explains the 5 capital tiers (Core/Alpha/Pro/Elite/Institutional) with their pricing, add: CARDS: TIERS
- When displaying live stock/index data, ALWAYS start with: ## [STOCK NAME] â€” Live Snapshot, then a markdown table with Parameter and Value columns.

TONE: Precise, institutional, data-driven, and highly concise. Keep it short and to-the-point. Never guarantee returns. Use Indian financial terminology: IV rank, theta decay, delta hedging, MTM, SEBI, NSE, F&O.`;

const HINDI_DIRECTIVE = '\n\nIMPORTANT: Respond entirely in Hindi (Devanagari script), including all explanations and the SUGGESTIONS line questions. Keep technical/English terms (like SEBI, MTM, NSE, IV, API) as-is where there is no natural Hindi equivalent.';

// getLiveMarketContext replaced by marketService.getMarketContext (detects symbols in message + fetches from Kite API)

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/chat  (Server-Sent Events streaming)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/', async (req, res) => {
  const { message, history = [], lang = 'en' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // ── Privacy Guard: block sensitive data queries ─────────────────────────
  const privacyCheck = checkPrivacy(message);
  if (privacyCheck.blocked) {
    logger.info('[Privacy] Blocked sensitive query (topic: ' + privacyCheck.topic + '): ' + message.slice(0, 60));
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const privMsg = privacyCheck.message;
    res.write('data: ' + JSON.stringify({ type: 'delta', text: privMsg }) + '\n\n');
    res.write('data: ' + JSON.stringify({ type: 'done', source: 'privacy_guard' }) + '\n\n');
    return res.end();
  }

  const redis = getRedis(req);

  // 1. RAG lookup (Redis = answer cache, db = MongoDB vector store)
  const db = req.app.locals.db;
  const ragResult = await ragService.query(redis, db, message);

  // SSE headers (shared by all streaming paths below)
  function startSSE() {
    res.setHeader(‘Content-Type’, ‘text/event-stream’);
    res.setHeader(‘Cache-Control’, ‘no-cache’);
    res.setHeader(‘Connection’, ‘keep-alive’);
    res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
  }

  async function streamText(text, source) {
    const chunks = text.match(/.{1,40}/g) || [text];
    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ type: ‘delta’, text: chunk })}\n\n`);
      await new Promise(r => setTimeout(r, 8));
    }
    res.write(`data: ${JSON.stringify({ type: ‘done’, source })}\n\n`);
    res.end();
  }

  // 2a. Redis exact-match cache hit → serve instantly (zero Claude tokens)
  if (ragResult.hit && ragResult.cached) {
    startSSE();
    await streamText(ragResult.answer, ‘cache’);
    return;
  }

  // 2b. MongoDB direct hit (similarity â‰¥ 0.72) â†’ serve from DB (zero Claude tokens)
  if (ragResult.hit && ragResult.directAnswer) {
    startSSE();
    await streamText(ragResult.answer, 'mongodb');
    // Cache for next time so it comes from Redis
    ragService.cacheAnswer(redis, message, { answer: ragResult.answer }).catch(() => {});
    logger.info(`[Chat] Served from MongoDB directly â€” no Claude called`);
    return;
  }

  // 3. Build Gemini messages (role must be 'user' or 'model')
  const messages = [];
  for (const h of history.slice(-14)) {
    messages.push({ role: 'user',  parts: [{ text: h.user }] });
    messages.push({ role: 'model', parts: [{ text: h.bot }] });
  }
  messages.push({ role: 'user', parts: [{ text: message }] });

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

  // 5. Stream from Gemini
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let fullText = '';

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: systemWithContext,
      generationConfig: { maxOutputTokens: 1024 },
    });

    const result = await model.generateContentStream({
      contents: messages,
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done', source: 'gemini' })}\n\n`);
    res.end();

    // 6. Cache the result for future identical questions
    ragService.cacheAnswer(redis, message, { answer: fullText }).catch(() => {});
    logger.info(`[Chat] Streamed response (${fullText.length} chars) for: "${message.slice(0, 60)}"`);
  } catch (err) {
    logger.error(`[Chat] Gemini stream error: ${err.message}`);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/chat/faq  â€” Direct MongoDB FAQ lookup (no Claude, no streaming)
// Used by the sidebar Quick Questions dropdown and welcome chips.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/faq', async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ ok: false, error: 'question is required' });
  }

  // Privacy guard — redirect sensitive queries to advisor
  const privacyCheck = checkPrivacy(question);
  if (privacyCheck.blocked) {
    logger.info('[Privacy/FAQ] Blocked sensitive query: ' + question.slice(0, 60));
    return res.json({ ok: true, answer: privacyCheck.message, source: 'privacy_guard' });
  }

  const db    = req.app.locals.db;
  const redis = getRedis(req);

  try {
    // â”€â”€ 1. Redis cache check (fastest path) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const ragResult = await ragService.query(redis, db, question);

    if (ragResult.hit && (ragResult.cached || ragResult.directAnswer)) {
      // Cache the answer so future calls are instant
      if (ragResult.directAnswer && !ragResult.cached) {
        ragService.cacheAnswer(redis, question, { answer: ragResult.answer }).catch(() => {});
      }
      logger.info(`[FAQ] Served from ${ragResult.cached ? 'Redis cache' : 'MongoDB'} â€” no Claude`);
      return res.json({ ok: true, answer: ragResult.answer, source: ragResult.cached ? 'cache' : 'mongodb' });
    }

    // â”€â”€ 2. No good match in MongoDB â€” try exact text match as last resort â”€â”€
    const faqDoc = require('../models/faqDocument');
    const exactMatch = await db.collection('faq_documents').findOne(
      { question: { $regex: new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
      { projection: { question: 1, answer: 1 } }
    );

    if (exactMatch) {
      ragService.cacheAnswer(redis, question, { answer: exactMatch.answer }).catch(() => {});
      logger.info(`[FAQ] Exact text match found â€” serving from MongoDB`);
      return res.json({ ok: true, answer: exactMatch.answer, source: 'mongodb' });
    }

    // â”€â”€ 3. Nothing found â€” return the best context we have â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    logger.info(`[FAQ] No strong match in MongoDB for: "${question.slice(0, 60)}"`);
    return res.json({
      ok: false,
      answer: null,
      context: ragResult.context || [],
      message: 'No direct answer found in knowledge base',
    });

  } catch (err) {
    logger.error(`[FAQ] Error: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/chat/coach  â€” Morning Coach briefing
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/coach', async (req, res) => {
  const redis = getRedis(req);
  const db    = req.app.locals.db;

  try {
    const data = await generateAndStoreBrief(db, redis);
    res.json({ ok: true, data });
  } catch (err) {
    logger.error(`[Coach] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/chat/insights  â€” Trade Journal AI
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/insights', async (req, res) => {
  const { trades } = req.body;
  if (!trades || trades.length < 3) {
    return res.status(400).json({ error: 'At least 3 trades required for insights.' });
  }

  const summary = trades.slice(0, 30).map(t =>
    `${t.date} ${t.time} | ${t.instrument} | ${t.strategy} | Entry:${t.entry} Exit:${t.exit} | PnL:â‚¹${t.pnl} | Exit:${t.exitReason || '?'} | Notes:${t.notes || '-'}`
  ).join('\n');

  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const wins     = trades.filter(t => t.pnl > 0).length;
  const losses   = trades.filter(t => t.pnl < 0).length;

  const prompt = `You are OptionSmart's AI Trade Journal analyst. Analyse this trader's log and generate sharp specific behavioral insights.

TRADE LOG:
${summary}

STATS: ${trades.length} trades | ${wins} wins | ${losses} losses | Total PnL: â‚¹${totalPnl.toFixed(2)}

Return ONLY this JSON (no markdown):
{"insights":[{"type":"alert|positive|neutral","label":"SHORT CAPS LABEL","text":"Specific insight with actual numbers. Use â‚¹ and %. Be blunt and precise."}]}

Focus on: time-of-day patterns, early exit of profits, letting losses run, strategy performance differences, exit reason quality, emotional signals in notes. Generate 4-5 insights. Be specific â€” no generic advice.`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const raw  = result.response.text() || '{}';
    const data = parseLLMJson(raw);
    res.json({ ok: true, data, stats: { totalPnl, wins, losses, total: trades.length } });
  } catch (err) {
    logger.error(`[Insights] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
