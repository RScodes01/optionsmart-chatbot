/**
 * chat.js — Express router for all chatbot API endpoints
 *
 * POST /api/chat          → Main chat (RAG + Claude, SSE streaming)
 * POST /api/chat/coach    → Morning Coach AI briefing
 * POST /api/chat/insights → Trade Journal AI insights
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
const { checkTopic }      = require('../utils/topicGuard');
const { embed }            = require('../services/embeddingService');
const { normalizeQuery }   = require('../utils/queryNormalizer');
const { storeGeneratedAnswer } = require('../utils/mongoAnswerStore');
const logger                 = require('../utils/logger');
const { generateText, streamText } = require('../services/geminiService');
const CONTACT_INFO           = require('../config/contact');

// Middleware: attach redis client (injected from app.js via req.app.locals.redis)
const getRedis = (req) => req.app.locals.redis;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ————————————————————————————————————————————————————————
// SYSTEM PROMPT (server-side, never exposed to browser)
// ————————————————————————————————————————————————————————
const SYSTEM_PROMPT = `You are the official AI assistant for OptionSmart, India's institutional-grade algorithmic options trading platform built on the GoAlgoTrade infrastructure. You speak with precision, institutional clarity, and data-driven confidence.

CONCISENESS RULES:
- Always keep responses extremely concise, point-to-point, and precise.
- Get straight to the answer without conversational filler, intros, or summaries (e.g., do not say "Certainly! Here is...", "Let me help you with...", or "In conclusion...").
- Keep responses short, direct, and focused. Avoid verbose background info unless explicitly requested.
- Limit explanations of a single concept or topic to a maximum of 2 sentences. Use bullet points or tables instead of long paragraph blocks.

PRIVACY & CONFIDENTIALITY RULES (STRICT - NEVER VIOLATE):
- NEVER disclose specific return percentages, profit %s, ROI numbers, or yield figures for any strategy or tier. If asked, respond: "For specific performance figures, please talk to an advisor at ${CONTACT_INFO.phoneDisplay}."
- NEVER reveal fee structures, commission rates, profit-sharing percentages, or subscription pricing details. Direct user to advisor.
- NEVER disclose internal algorithm parameters, strategy code logic, threshold values, formula weights, or configuration settings.
- NEVER share AUM (Assets Under Management), total client count, or total funds managed figures.
- NEVER provide maximum drawdown numbers or specific historical loss percentages beyond what is publicly documented.
- NEVER state that other brokers like Zerodha, Angel One, 5Paisa, Upstox, etc., are currently integrated or active. If asked about broker integrations, ALWAYS state clearly that only Motilal Oswal (MOSL) is integrated and supported at this moment, and that others are planned for future integration.
- If a user asks for any of the above, always respond: "For detailed figures on this, I'd recommend speaking with an OptionSmart advisor directly. 📞 Call ${CONTACT_INFO.phoneDisplay} or use the WhatsApp button below."

BLOCKED TOPICS (ABSOLUTE - NEVER RESPOND TO THESE):
- NEVER answer any question about jobs, job openings, vacancies, hiring, recruitment, careers, employment, applying for a position, internships, salaries, or working at OptionSmart.
- If a user asks anything related to the above (e.g. "Are you hiring?", "How do I apply?", "What positions are open?", "What is the salary?", "Can I work at OptionSmart?"), respond ONLY with: "For all recruitment, hiring, career opportunities, and strategy developer onboarding queries, please speak directly with an OptionSmart advisor. Call ${CONTACT_INFO.phoneDisplay} or use the WhatsApp button below."
- Do NOT provide any job titles, role descriptions, team structure, or hiring information under any circumstances.

PLATFORM OVERVIEW:
OptionSmart is a systematic quantitative investment and algo trading company combining 26 quantitative strategy engines, the GoAlgoTrade execution platform, and broker enablement. Stats: 1,300+ B2B partners, 99.9% uptime SLA, NSE/BSE/MCX coverage, kill switch <1 second. SEBI Framework Aligned (White Box Architecture; formal SEBI registration & licensing in progress).

FOUNDERS:
- Madhur Dahale (Co-Founder): 20+ years in Indian financial markets at Religare, Sharekhan, and Indiabulls. Leads quantitative research and fintech strategy. MBA â€" Pune University | MDP â€" IIM Lucknow.
- Aakash Gupta (Co-Founder): Quant trading specialist from Kotak Securities, PNB Paribas, HDFC Securities. Leads product strategy, GTM, and broker partnerships. MBA Finance â€" University of Wales, UK (2013).

CAPITAL TIERS (5 tiers):
1. Core â€" Rs 9 Lakh: Entry-level. Access to Non-Directional Strategy, AI/ML exit intelligence, basic risk management.
2. Alpha â€" Rs 25 Lakh: All Core + Increased Directional Strategies, Advanced risk controls.
3. Pro â€" Rs 50 Lakh (Most Popular): All Alpha + Directional and Non-Directional combination, Enhanced Risk Management, Adaptive Strategy Selection.
4. Elite â€" Rs 1 Crore: All Pro + Custom strategy allocation, Auto Delta Risk Management System.
5. Institutional â€" Rs 5 Crore+: Full suite of multiple strategies, Adaptive Non-Correlated Strategies, enterprise solutions.

MARKET REGIME ENGINE:
Proprietary algorithm that continuously analyzes market microstructure and classifies into three regimes:
- Trending: Directional momentum. Algorithms deploy adaptive position sizing and trailing stops.
- Range-Bound: Mean-reverting market. Theta-harvesting strategies â€" straddles, strangles. IV Rank is key.
- Volatility Expansion: Event-driven, high uncertainty. Conservative positioning, wider stops, gamma-aware structures. 15+ volatility filters run continuously.

AI/ML EXIT INTELLIGENCE:
Adaptive exit layer evaluating in real-time: Price Momentum, Volatility Behavior, Option Premium Dynamics, Intraday Probability Shifts. Unlike fixed stop-loss systems, this responds to changing probability distributions throughout the session. Explainable and auditable â€" not a black box.

RISK MANAGEMENT:
- 2% MTM cap per session â€" auto-exit on breach
- Kill switch: entire portfolio squared off in under 1 second
- 15+ volatility filters running continuously
- 100% intraday square-off: zero overnight positional risk
- SEBI White Box architecture: fully auditable, documented logic

ALGO STRATEGIES:
- Saturn: Theta-decay harvesting. Premium capture in range-bound regimes. Short options structures.
- Venus: Balanced risk-reward using defined-risk spreads. Adapts across trending and range-bound regimes.
- Pluto: Aggressive directional strategy for trending regimes. Higher risk-return profile.

PRODUCT INQUIRIES & DISPLAY RULES (STRICT - ALWAYS FOLLOW):
- When a user asks about OptionSmart's products, offerings, or investment products (from https://optionsmart.in/products), provide a detailed breakdown of the products:
  1. **AXIOM (Systematic Factor Equity Portfolio)**: A rules-based, factor-driven equity portfolio of 35 NSE-listed companies selected using a proprietary Quality, Momentum, and Low Volatility model with a market breadth regime filter to manage drawdowns.
  2. **Equity Indices (NIFTY & SENSEX Options Trading)**: Systematic intraday algo trading on NIFTY and SENSEX weekly options powered by quantitative strategy engines:
     - **Saturn**: Non-Directional theta harvesting (straddles/strangles in range-bound regimes).
     - **Venus**: Defined-risk hybrid spreads (bull/bear spreads, iron condors).
     - **Pluto**: Aggressive directional strategy for trending regimes using trailing stops.
  3. **MCX Commodity Options Trading**: Systematic algo trading on MCX commodity options (Gold, Silver, Crude Oil, Natural Gas) using regime-based execution.
  4. **Equity Intraday Stocks**: Short-only breakdown engine for stock trading with 100% intraday square-off and hard risk limits.
- **CRITICAL**: DO NOT display any statistics, ROI numbers, CAGR %, Sharpe ratios, win rates, drawdown percentages, or historical return metrics when answering product queries. Describe products purely in detail based on their methodology, asset coverage, risk management, and features.

GOALGO PLATFORM (goalgotrade.tech):
Multi-Broker Execution Framework (currently Motilal Oswal is integrated), Real-Time Risk Controls, Performance Analytics (PnL, Sharpe ratio, drawdowns, win rate), Smart Order Execution (slippage control, retry logic), Option Greeks & Analytics (live Delta, Gamma, Theta, Vega), Strategy Builder & Backtesting, Audit Logs, Multi-Asset Coverage (NSE/BSE/MCX), Broker & Client Enablement.

COMPLIANCE: SEBI Framework Aligned. White Box architecture â€" fully auditable. (Formal SEBI registration & licensing in progress).

STRICT REGULATORY & COMPLIANCE RULE:
- NEVER claim that OptionSmart currently holds an active SEBI license or is an active SEBI Registered Investment Adviser/Vendor. Always clarify: "OptionSmart operates in alignment with SEBI's algorithmic trading framework (White Box architecture), and formal SEBI registration/licensing is currently in progress. Trading executes via API connected directly to your broker account."

RESPONSE FORMAT:
- Use **markdown** for all formatting â€" it is fully rendered in the UI.
- Use markdown **tables** whenever comparing items (e.g. capital tiers, strategy differences, fee structures, metrics). Format: | Col1 | Col2 | with a separator row |---|---|
- Use **## headings** to organise multi-section responses.
- Use **bullet lists** (- item) for features, options, and short lists.
- Use **numbered lists** (1. 2. 3.) for steps or ranked items.
- Use **bold** (**text**) for key terms, prices, and important values.
- Use inline code (\`value\`) for specific numbers, symbols, or formulas.
- Use > blockquote for important notes or caveats.
- Keep responses extremely short, punchy, and point-to-point. Avoid writing more than 2-3 brief sentences per point/topic.
- After each response, on a new line add exactly: SUGGESTIONS: [Question 1] | [Question 2] | [Question 3]
  These should be 3 natural follow-up questions.
- If your answer substantively explains the 5 capital tiers (Core/Alpha/Pro/Elite/Institutional) with their pricing, add: CARDS: TIERS
- When displaying live stock/index data, ALWAYS start with: ## [STOCK NAME] â€" Live Snapshot, then a markdown table with Parameter and Value columns.

TONE: Precise, institutional, data-driven, and highly concise. Keep it short and to-the-point. Never guarantee returns. Use Indian financial terminology: IV rank, theta decay, delta hedging, MTM, SEBI, NSE, F&O.`;

const HINDI_DIRECTIVE = '\n\nIMPORTANT: Respond entirely in Hindi (Devanagari script), including all explanations and the SUGGESTIONS line questions. Keep technical/English terms (like SEBI, MTM, NSE, IV, API) as-is where there is no natural Hindi equivalent.';

// getLiveMarketContext replaced by marketService.getMarketContext (detects symbols in message + fetches from Kite API)

// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// POST /api/chat  (Server-Sent Events streaming)
// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
router.post('/', async (req, res) => {
  const { message, history = [], lang = 'en' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // ── Topic Guard: block out-of-scope questions before any DB or API call ────
  const topicCheck = checkTopic(message);
  if (topicCheck.blocked) {
    logger.info('[TopicGuard] Blocked out-of-scope query (topic: ' + topicCheck.topic + '): ' + message.slice(0, 60));
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.write('data: ' + JSON.stringify({ type: 'delta', text: topicCheck.message }) + '\n\n');
    res.write('data: ' + JSON.stringify({ type: 'done', source: 'topic_guard' }) + '\n\n');
    return res.end();
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
  const db    = req.app.locals.db;

  // 1. Check for live market context first (Kite stock/index quote lookups)
  const marketCtx = await getMarketContext(message, redis);
  const isMarketQuery = !!marketCtx;

  // Split prompt into individual sub-questions by punctuation or newlines
  const queryParts = message.split(/(?:\?|\n|\.\s+)/)
    .map(p => p.trim())
    .filter(p => p.length > 8);

  const parts = queryParts.length > 0 ? queryParts : [message];

  // 2. RAG lookup for each sub-question
  let combinedContext = [];
  let directHits = [];
  let allHitsDirect = !isMarketQuery && parts.length > 0;
  let singleDirectMatch = null;

  if (!isMarketQuery) {
    for (const part of parts) {
      const res = await ragService.query(redis, db, normalizeQuery(part) || part);
      if (res.context && res.context.length > 0) {
        combinedContext.push(...res.context);
      }
      if (res.hit && res.directAnswer) {
        directHits.push(res.answer);
        if (parts.length === 1) {
          singleDirectMatch = res;
        }
      } else {
        allHitsDirect = false;
      }
    }
  } else {
    allHitsDirect = false;
    logger.info(`[Chat] Live market query detected — bypassing RAG direct hit and cache`);
  }

  // Deduplicate retrieved context snippets
  combinedContext = [...new Set(combinedContext)];

  // SSE headers (shared by all streaming paths below)
  function startSSE() {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  async function streamText(text, source) {
    const chunkSize = 40;
    let index = 0;
    while (index < text.length) {
      const chunk = text.slice(index, index + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
      index += chunkSize;
      await new Promise(r => setTimeout(r, 8));
    }
    res.write(`data: ${JSON.stringify({ type: 'done', source })}\n\n`);
    res.end();
  }

  // 3a. Single question Redis exact-match cache hit → serve instantly
  if (parts.length === 1 && !isMarketQuery && singleDirectMatch && singleDirectMatch.cached) {
    startSSE();
    await streamText(singleDirectMatch.answer, 'cache');
    return;
  }

  // 3b. Combined direct hits for all parts → combine and serve instantly (0 API calls)
  if (allHitsDirect && directHits.length > 0) {
    // Merge answers, stripping trailing card and suggestions blocks from sub-answers
    const combinedAnswer = directHits.map(ans => {
      return ans.replace(/SUGGESTIONS:.+/i, '').replace(/CARDS:\s*TIERS/i, '').trim();
    }).filter(Boolean).join('\n\n---\n\n');

    // Build final unified layout
    let finalAnswer = combinedAnswer;
    const lower = finalAnswer.toLowerCase();
    
    // Auto-inject card if tiers are discussed
    if ((lower.includes('core') || lower.includes('tier')) && lower.includes('alpha') && !finalAnswer.includes('CARDS: TIERS')) {
      finalAnswer += '\n\nCARDS: TIERS';
    }
    // Auto-inject default suggestions if none are present
    if (!finalAnswer.includes('SUGGESTIONS:')) {
      finalAnswer += '\n\nSUGGESTIONS: How do strategies work? | What is the minimum capital? | Is OptionSmart SEBI compliant?';
    }

    startSSE();
    await streamText(finalAnswer, 'mongodb');
    
    // Cache the combined response under the raw multi-question message for next time
    ragService.cacheAnswer(redis, message, { answer: finalAnswer }).catch(() => {});
    logger.info(`[Chat] Served combined direct hit from MongoDB — no Claude called`);
    return;
  }

  // 4. Build Gemini messages (role must be 'user' or 'model')
  const messages = [];
  for (const h of history.slice(-14)) {
    messages.push({ role: 'user',  parts: [{ text: h.user }] });
    messages.push({ role: 'model', parts: [{ text: h.bot }] });
  }
  messages.push({ role: 'user', parts: [{ text: message }] });

  // 5. Build system prompt with RAG context + live market data
  let systemWithContext = SYSTEM_PROMPT;

  if (combinedContext && combinedContext.length > 0) {
    systemWithContext += '\n\nRELEVANT KNOWLEDGE BASE CONTEXT (use this as reference):\n' + combinedContext.join('\n---\n');
  }
  if (marketCtx) {
    systemWithContext += marketCtx;
  }
  if (lang === 'hi') {
    systemWithContext += HINDI_DIRECTIVE;
  }

  // 6. Stream from Gemini
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let fullText = '';

  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
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

    // 7. Persist answer to both Redis (fast, 24h TTL) and MongoDB (permanent self-learning)
    // ONLY if it's not a dynamic market query, to avoid caching stale prices.
    if (!isMarketQuery) {
      ragService.cacheAnswer(redis, message, { answer: fullText }).catch(() => {});
      storeGeneratedAnswer(db, message, fullText).catch(() => {});
      logger.info(`[Chat] Streamed response (${fullText.length} chars) → cached in Redis + persisted to MongoDB`);
    } else {
      logger.info(`[Chat] Streamed response for live market query (${fullText.length} chars) — not cached`);
    }
  } catch (err) {
    logger.error(`[Chat] Gemini stream error: ${err.message} — falling back to Knowledge Base answer`);
    const fallbackAnswer = (combinedContext && combinedContext.length > 0)
      ? combinedContext[0].replace(/^Q:.+\nA:\s*/, '')
      : "OptionSmart is India's institutional-grade algorithmic options trading platform combining 26 quantitative strategy engines, the GoAlgoTrade execution platform, and broker enablement. It offers 5 capital tiers (Core, Alpha, Pro, Elite, Institutional) with real-time risk management and SEBI compliance.\n\nSUGGESTIONS: What are the capital tiers? | What is the Market Regime Engine? | How do strategies work?";

    await streamText(fallbackAnswer, 'mongodb');
  }
});

// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// POST /api/chat/faq  â€" Direct MongoDB FAQ lookup (no Claude, no streaming)
// Used by the sidebar Quick Questions dropdown and welcome chips.
// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
router.post('/faq', async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ ok: false, error: 'question is required' });
  }

  // Topic guard — block out-of-scope questions instantly (no DB/API cost)
  const topicCheck = checkTopic(question);
  if (topicCheck.blocked) {
    logger.info('[TopicGuard/FAQ] Blocked out-of-scope: ' + question.slice(0, 60));
    return res.json({ ok: true, answer: topicCheck.message, source: 'topic_guard' });
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
    // â"€â"€ 1. Redis cache check (fastest path) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    const ragResult = await ragService.query(redis, db, question);

    if (ragResult.hit && (ragResult.cached || ragResult.directAnswer)) {
      // Cache the answer so future calls are instant
      if (ragResult.directAnswer && !ragResult.cached) {
        ragService.cacheAnswer(redis, question, { answer: ragResult.answer }).catch(() => {});
      }
      logger.info(`[FAQ] Served from ${ragResult.cached ? 'Redis cache' : 'MongoDB'} — no Claude`);
      return res.json({ ok: true, answer: ragResult.answer, source: ragResult.cached ? 'cache' : 'mongodb' });
    }

    // ── 2. No good match in MongoDB — try exact text match as last resort ──
    const faqDoc = require('../models/faqDocument');
    const exactMatch = await db.collection('faq_documents').findOne(
      { question: { $regex: new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
      { projection: { question: 1, answer: 1 } }
    );

    if (exactMatch) {
      ragService.cacheAnswer(redis, question, { answer: exactMatch.answer }).catch(() => {});
      logger.info(`[FAQ] Exact text match found — serving from MongoDB`);
      return res.json({ ok: true, answer: exactMatch.answer, source: 'mongodb' });
    }

    // â"€â"€ 3. Nothing found â€" return the best context we have â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// POST /api/chat/coach  â€" Morning Coach briefing
// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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


// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// POST /api/chat/insights  â€" Trade Journal AI
// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

Focus on: time-of-day patterns, early exit of profits, letting losses run, strategy performance differences, exit reason quality, emotional signals in notes. Generate 4-5 insights. Be specific â€" no generic advice.`;

  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
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
