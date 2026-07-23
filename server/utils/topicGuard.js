/**
 * topicGuard.js
 * Detects questions that are completely unrelated to OptionSmart, trading,
 * investing, or financial markets — and blocks them before any DB or API call.
 *
 * Strategy:
 *   1. Allow-list: if the message contains OptionSmart / GoAlgoTrade / finance
 *      keywords → pass through immediately.
 *   2. Block-list: if the message matches known off-topic patterns
 *      (general knowledge, coding help, recipes, etc.) → block with a friendly
 *      out-of-scope message.
 *   3. Ambiguous queries (neither matched) → pass through to RAG / Gemini
 *      which will answer with OptionSmart context anyway.
 */

// ── Allow-list: topics that are clearly in scope ─────────────────────────────
// If ANY of these match, the message is immediately passed through.
const IN_SCOPE_PATTERNS = [
  /\boptionsmart\b/i,
  /\bgoalgotrade\b/i,
  /\bsaturn\b|\bvenus\b|\bpluto\b/i,             // strategy names
  /\balgo\s*trad(e|ing)\b/i,
  /\bquant(itative)?\b/i,
  /\bsebi\b/i,
  /\bnse\b|\bbse\b|\bmcx\b/i,
  /\bnifty\b|\bbanknifty\b|\bsensex\b|\bfinnifty\b/i,
  /\bfutures?\b|\boptions?\b|\bf&o\b|\bderivatives?\b/i,
  /\btheta\b|\bdelta\b|\bgamma\b|\bvega\b|\biv rank\b/i,
  /\bstrategy\b|\bstrategies\b/i,
  /\binvest(ment|ing|or|ors)?\b/i,
  /\bcapital\b/i,
  /\bbrokers?\b|\bzerodha\b|\bangel\s*one\b|\bmotilal\b|\bupstox\b/i,
  /\btrading\b/i,
  /\bmarket\s*regime\b|\bmarket\s*regime\s*engine\b/i,
  /\bmtm\b|\bmark.to.market\b/i,
  /\bkill\s*switch\b/i,
  /\bpnl\b|\bp&l\b|\bprofit\b|\bloss(es)?\b/i,
  /\bdrawdown\b/i,
  /\bsharpe\b/i,
  /\bbacktest(ing)?\b/i,
  /\bonboarding\b|\bregistration\b|\bsign\s*up\b/i,
  /\blakh\b|\bcrore\b|\brupee\b|\binr\b/i,
  /\bcommodit(y|ies)\b|\bgold\b|\bsilver\b|\bcrude\b/i,
  /\bsquare\s*off\b|\bintraday\b/i,
  /\bhedge\b|\bhedging\b/i,
  /\bspread\b|\bstraddle\b|\bstrangle\b|\biron\s*condor\b/i,
  /\bmargin\b|\bspan\b|\bcollateral\b|\bpledge\b/i,
  /\bexpiry\b/i,
  /\brisk\b/i,
  /\bfees?\b|\bcharges?\b|\bcosts?\b|\bpricing\b|\bsubscriptions?\b/i,
  /\bfounders?\b|\bteam\b|\bmembers?\b/i,
  /\bmobile\s*app\b|\bapplication\b/i,
  /\bcourse\b|\blearn\b|\beducation\b/i,
  /\breferral\b|\baffiliate\b|\bcommission\b|\bpartner\b/i,
  /\bsupport\b|\bcontact\b|\bwhatsapp\b|\badvisor\b/i,
  /\bdemo\b|\btrial\b|\bpaper\s*trad/i,
  /\bhello\b|\bhi\b|\bhey\b|\bnamaste\b/i,        // greetings always pass
  /\bthank\b|\bthanks\b|\bthank\s*you\b/i,
  /\bwhat\s+is\s+(a\s+)?(put|call)\b/i,           // options basics
  /\bequity\b|\bequities\b|\bindex\b|\bindices\b|\bshare\b|\bshares\b/i,
  // Stock price queries — must pass through so marketService can fetch live data
  /\bstock\s*price\b|\bshare\s*price\b|\blive\s*price\b|\bcurrent\s*price\b|\bprice\s*of\b/i,
  /\bstock\b/i,
  /\bprice\b/i,
  /\bquote\b/i,
  /\breliance\b|\btcs\b|\binfosys\b|\bhdfcbank\b|\bicicibank\b|\bsbin\b|\bwipro\b/i,
  /\bhcl\b|\bkotak\b|\baxis\b|\bajaj\b|\bmaruti\b|\btatamotors\b|\badani\b/i,
  /\bzomato\b|\bpaytm\b|\bairtel\b|\bltimindtree\b|\bmrf\b|\bdlf\b|\bntpc\b/i,
  /\bsunpharma\b|\bcipla\b|\bdrreddy\b|\bbajajfinance\b|\bltimindtree\b/i,
  /\baaj\s*ka\b|\bka\s*price\b|\bka\s*bhav\b|\bkitna\s*chal\b|\bkya\s*chal\b/i,
  /\b(what|whats|what's).*(stock|share|price|trading|worth|value)\b/i,
  /\b(how|where).*(stock|share|price|trading)\b/i,
  /\bgainers?\b|\blosers?\b|\b52\s*week\b|\ball\s*time\s*high\b/i,
  /\bipo\b|\bdividend\b|\bcircuit\b|\bvolume\b/i,
];

// ── Block-list: clear out-of-scope topics ────────────────────────────────────
// Only triggers if NONE of the in-scope patterns matched first.
const OUT_OF_SCOPE_PATTERNS = [
  // General knowledge / trivia
  { pattern: /\b(who is|who was|tell me about)\s+(the\s+)?(president|prime minister|ceo of|founder of\s+(?!optionsmart|goalgo))\b/i,  topic: 'general_knowledge' },
  { pattern: /\b(history of|history lesson|capital of|population of|distance from|how far)\b/i,                                       topic: 'general_knowledge' },
  { pattern: /\b(world war|historical event|biography of)\b/i,                                                                         topic: 'general_knowledge' },

  // Food / recipes
  { pattern: /\b(recipe|cook|cooking|bake|baking|ingredient|cuisine|dish|meal|food|restaurant|eat|taste)\b/i,                          topic: 'food' },

  // Sports
  { pattern: /\b(cricket|football|ipl|world cup|match|player|team|score|wicket|goal|sport)\b(?!.*\b(trade|invest|market)\b)/i,         topic: 'sports' },

  // Entertainment / media
  { pattern: /\b(movie|film|series|netflix|amazon prime|hotstar|song|actor|actress|music|celebrity|bollywood|hollywood)\b/i,            topic: 'entertainment' },

  // Programming / coding (unrelated to trading)
  { pattern: /\b(write\s+(a\s+)?(code|program|function|script|app|website)|debug\s+my|fix\s+(my\s+)?code|python|javascript|java|html|css|react|angular|node\.?js|sql\s+query)\b/i, topic: 'coding' },

  // Medical / health
  { pattern: /\b(doctor|medicine|disease|symptom|diagnosis|hospital|health|medical|drug|prescription|treatment|cure|pain|fever)\b/i,   topic: 'medical' },

  // Homework / exam / essay
  { pattern: /\b(homework|essay|assignment|write\s+(an?\s+)?(essay|report|paragraph)|summarize\s+this|exam|test\s+preparation)\b/i,    topic: 'academic' },

  // Weather
  { pattern: /\b(weather|forecast|temperature|humidity|rain|sunny|cloudy|climate)\b/i,                                                 topic: 'weather' },

  // Jokes / entertainment requests
  { pattern: /\b(tell\s+(me\s+)?(a\s+)?joke|joke about|funny|meme|riddle)\b/i,                                                        topic: 'entertainment' },

  // Travel
  { pattern: /\b(travel|hotel|flight|vacation|holiday|tour|tourism|visa|passport|airport|destination)\b/i,                             topic: 'travel' },

  // Relationships / personal advice
  { pattern: /\b(relationship|girlfriend|boyfriend|marriage|love|dating|family\s+problem|personal\s+advice|breakup)\b/i,               topic: 'personal' },

  // Random AI / chatbot tests
  { pattern: /\b(are you\s+(sentient|conscious|alive|human)|what\s+llm|what\s+model\s+are\s+you|who\s+(made|built|created)\s+you|your\s+(name|purpose))\b/i, topic: 'ai_identity' },

  // Geography / science / general trivia
  { pattern: /\b(photosynthesis|periodic\s+table|element|atom|molecule|gravity|physics|chemistry|biology|geography|planet|solar\s+system)\b/i, topic: 'science' },
];

const CONTACT_INFO = require('../config/contact');

const OUT_OF_SCOPE_MESSAGE = `I'm OptionSmart's AI assistant — I can only answer questions related to **OptionSmart**, algo trading, investment strategies, platform features, and financial markets.

For anything outside this scope, I'm not the right resource. 😊

**Here's what I can help you with:**
- OptionSmart strategies (Saturn, Venus, Pluto)
- Capital tiers and investment plans
- Risk management and safety features
- Platform features and onboarding
- Brokers, markets, and F&O trading
- SEBI compliance and legal queries

**Need to speak to a person?**
📞 **${CONTACT_INFO.phoneDisplay}** | WhatsApp button below

SUGGESTIONS: How do strategies work? | What is minimum capital? | Is OptionSmart SEBI compliant?`;

/**
 * Check if a question is outside OptionSmart's domain.
 *
 * @param {string} question - Raw user message
 * @returns {{ blocked: boolean, topic?: string, message?: string }}
 */
function checkTopic(question) {
  if (!question || typeof question !== 'string') return { blocked: false };

  const q = question.trim();

  // Very short messages (1-2 words, greetings) → always pass through
  if (q.split(/\s+/).length <= 2) return { blocked: false };

  // Always allow queries that explicitly mention OptionSmart or GoAlgoTrade
  if (/\boptionsmart\b/i.test(q) || /\bgoalgotrade\b/i.test(q)) {
    return { blocked: false };
  }

  // Step 1: Check out-of-scope patterns first
  for (const { pattern, topic } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(q)) {
      return { blocked: true, topic, message: OUT_OF_SCOPE_MESSAGE };
    }
  }

  // Step 2: If ANY in-scope keyword matches → not blocked
  for (const pattern of IN_SCOPE_PATTERNS) {
    if (pattern.test(q)) return { blocked: false };
  }

  // Step 3: Strictly domain-restricted: if it didn't match any in-scope keywords, block it
  return { blocked: true, topic: 'out_of_domain', message: OUT_OF_SCOPE_MESSAGE };
}

module.exports = { checkTopic, OUT_OF_SCOPE_MESSAGE };
