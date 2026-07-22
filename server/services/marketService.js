/**
 * marketService.js
 * Fetches live stock/index quotes from Zerodha Kite REST API on-demand.
 *
 * HOW IT WORKS:
 * 1. On first use, downloads the full NSE+BSE instruments list from Kite API (~2MB CSV)
 *    and builds a searchable map: company name / tradingsymbol → exchange:tradingsymbol
 *    This list is cached in Redis for 24 hours.
 * 2. User message is processed through a 3-tier detection waterfall:
 *    Tier 1 — Alias dictionary: nicknames like "RIL", "Infy", "banknifty"
 *    Tier 2 — Instruments map: whole-word fuzzy scan of the full NSE/BSE list
 *    Tier 3 — LLM extraction: Claude Haiku parses natural language to identify stocks
 * 3. Fetches live quotes from Kite /quote endpoint and caches results for 15 seconds.
 * 4. Returns a formatted string injected into Claude's system prompt.
 *
 * Covers: All NSE equities, indices, F&O names, BSE stocks — any tradeable instrument.
 */

const axios     = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger    = require('../utils/logger');
const { parseLLMJson } = require('../utils/jsonParser');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const INSTRUMENTS_CACHE_KEY = 'zerodha:instruments:nse';
const INSTRUMENTS_TTL       = 24 * 60 * 60; // 24 hours
const QUOTE_CACHE_TTL       = 15;            // 15 seconds
const SYSTEM_UID            = 'system';
const MAX_SYMBOLS_PER_QUERY = 10;

// In-memory cache of the instruments map (avoids repeated Redis deserialisation)
let _instrumentsMap = null;
let _mapLoadedAt    = 0;

// ─────────────────────────────────────────────
// TIER 1: ALIAS DICTIONARY
// Common nicknames, abbreviations, and colloquial names for Indian stocks.
// Users rarely type the exact NSE trading symbol.
// Format: 'what user says' → 'EXCHANGE:SYMBOL'
// ─────────────────────────────────────────────
const STOCK_ALIASES = {
  // ── Indices ──────────────────────────────────
  'nifty':              'NSE:NIFTY 50',
  'nifty50':            'NSE:NIFTY 50',
  'nifty 50':           'NSE:NIFTY 50',
  'nifty bank':         'NSE:NIFTY BANK',
  'banknifty':          'NSE:NIFTY BANK',
  'bank nifty':         'NSE:NIFTY BANK',
  'sensex':             'BSE:SENSEX',
  'india vix':          'NSE:INDIA VIX',
  'indiavix':           'NSE:INDIA VIX',
  'vix':                'NSE:INDIA VIX',
  'finnifty':           'NSE:NIFTY FIN SERVICE',
  'fin nifty':          'NSE:NIFTY FIN SERVICE',
  'midcap nifty':       'NSE:NIFTY MIDCAP 50',
  'nifty midcap':       'NSE:NIFTY MIDCAP 50',
  'nifty it':           'NSE:NIFTY IT',
  'nifty auto':         'NSE:NIFTY AUTO',
  'nifty pharma':       'NSE:NIFTY PHARMA',
  'nifty fmcg':         'NSE:NIFTY FMCG',
  'nifty metal':        'NSE:NIFTY METAL',
  'nifty realty':       'NSE:NIFTY REALTY',
  'nifty energy':       'NSE:NIFTY ENERGY',
  'nifty psu bank':     'NSE:NIFTY PSU BANK',
  'nifty infra':        'NSE:NIFTY INFRA',

  // ── IT / Tech ─────────────────────────────────
  'ril':                'NSE:RELIANCE',
  'reliance':           'NSE:RELIANCE',
  'tcs':                'NSE:TCS',
  'tata consultancy':   'NSE:TCS',
  'infy':               'NSE:INFY',
  'infosys':            'NSE:INFY',
  'wipro':              'NSE:WIPRO',
  'hcl':                'NSE:HCLTECH',
  'hcltech':            'NSE:HCLTECH',
  'hcl tech':           'NSE:HCLTECH',
  'tech mahindra':      'NSE:TECHM',
  'techm':              'NSE:TECHM',
  'ltimindtree':        'NSE:LTIM',
  'lti':                'NSE:LTIM',
  'mphasis':            'NSE:MPHASIS',
  'persistent':         'NSE:PERSISTENT',
  'coforge':            'NSE:COFORGE',
  'hexaware':           'NSE:HEXAWARE',
  'kpit':               'NSE:KPITTECH',
  'tata elxsi':         'NSE:TATAELXSI',

  // ── Banking ───────────────────────────────────
  'hdfc bank':          'NSE:HDFCBANK',
  'hdfcbank':           'NSE:HDFCBANK',
  'hdfc':               'NSE:HDFCBANK',
  'icici bank':         'NSE:ICICIBANK',
  'icici':              'NSE:ICICIBANK',
  'sbi':                'NSE:SBIN',
  'state bank':         'NSE:SBIN',
  'sbin':               'NSE:SBIN',
  'axis bank':          'NSE:AXISBANK',
  'axis':               'NSE:AXISBANK',
  'kotak bank':         'NSE:KOTAKBANK',
  'kotak':              'NSE:KOTAKBANK',
  'yes bank':           'NSE:YESBANK',
  'indusind':           'NSE:INDUSINDBK',
  'pnb':                'NSE:PNB',
  'bank of baroda':     'NSE:BANKBARODA',
  'bob':                'NSE:BANKBARODA',
  'canara bank':        'NSE:CANBK',
  'canara':             'NSE:CANBK',
  'federal bank':       'NSE:FEDERALBNK',
  'bandhan bank':       'NSE:BANDHANBNK',
  'au bank':            'NSE:AUBANK',
  'idfc first':         'NSE:IDFCFIRSTB',
  'idfcfirst':          'NSE:IDFCFIRSTB',
  'rbl bank':           'NSE:RBLBANK',

  // ── Auto ──────────────────────────────────────
  'maruti':             'NSE:MARUTI',
  'maruti suzuki':      'NSE:MARUTI',
  'tata motors':        'NSE:TATAMOTORS',
  'tatamotors':         'NSE:TATAMOTORS',
  'mahindra':           'NSE:M&M',
  'mm':                 'NSE:M&M',
  'bajaj auto':         'NSE:BAJAJ-AUTO',
  'hero moto':          'NSE:HEROMOTOCO',
  'hero motocorp':      'NSE:HEROMOTOCO',
  'ashok leyland':      'NSE:ASHOKLEY',
  'eicher motors':      'NSE:EICHERMOT',
  'royal enfield':      'NSE:EICHERMOT',
  'tvs motor':          'NSE:TVSMOTOR',

  // ── Oil & Gas ─────────────────────────────────
  'ongc':               'NSE:ONGC',
  'bpcl':               'NSE:BPCL',
  'iocl':               'NSE:IOC',
  'indian oil':         'NSE:IOC',
  'hpcl':               'NSE:HPCL',
  'gail':               'NSE:GAIL',

  // ── Tata Group ────────────────────────────────
  'tata steel':         'NSE:TATASTEEL',
  'tata power':         'NSE:TATAPOWER',
  'tata comm':          'NSE:TATACOMM',
  'tata chemicals':     'NSE:TATACHEM',

  // ── FMCG ──────────────────────────────────────
  'hindustan unilever': 'NSE:HINDUNILVR',
  'hul':                'NSE:HINDUNILVR',
  'itc':                'NSE:ITC',
  'nestle':             'NSE:NESTLEIND',
  'dabur':              'NSE:DABUR',
  'marico':             'NSE:MARICO',
  'britannia':          'NSE:BRITANNIA',
  'godrej consumer':    'NSE:GODREJCP',
  'emami':              'NSE:EMAMILTD',

  // ── Pharma ────────────────────────────────────
  'sun pharma':         'NSE:SUNPHARMA',
  'sunpharma':          'NSE:SUNPHARMA',
  'dr reddy':           'NSE:DRREDDY',
  'drl':                'NSE:DRREDDY',
  'cipla':              'NSE:CIPLA',
  'divis':              'NSE:DIVISLAB',
  'divi labs':          'NSE:DIVISLAB',
  'biocon':             'NSE:BIOCON',
  'aurobindo':          'NSE:AUROPHARMA',
  'lupin':              'NSE:LUPIN',
  'torrent pharma':     'NSE:TORNTPHARM',
  'alkem':              'NSE:ALKEM',
  'ipca':               'NSE:IPCALAB',
  'zydus':              'NSE:ZYDUSLIFE',

  // ── Finance / NBFC ────────────────────────────
  'bajaj finance':      'NSE:BAJFINANCE',
  'bajajfinance':       'NSE:BAJFINANCE',
  'bfl':                'NSE:BAJFINANCE',
  'bajaj finserv':      'NSE:BAJAJFINSV',
  'muthoot':            'NSE:MUTHOOTFIN',
  'cholafin':           'NSE:CHOLAFIN',
  'shriram finance':    'NSE:SHRIRAMFIN',
  'pfc':                'NSE:PFC',
  'rec':                'NSE:RECLTD',
  'irfc':               'NSE:IRFC',
  'lic':                'NSE:LICI',
  'lici':               'NSE:LICI',
  'sbi life':           'NSE:SBILIFE',
  'hdfc life':          'NSE:HDFCLIFE',
  'icici pru':          'NSE:ICICIPRULI',
  'star health':        'NSE:STARHEALTH',

  // ── Cement ────────────────────────────────────
  'ultratech':          'NSE:ULTRACEMCO',
  'shree cement':       'NSE:SHREECEM',
  'ambuja':             'NSE:AMBUJACEM',
  'acc':                'NSE:ACC',
  'dalmia bharat':      'NSE:DALBHARAT',

  // ── Metal ─────────────────────────────────────
  'jswsteel':           'NSE:JSWSTEEL',
  'jsw steel':          'NSE:JSWSTEEL',
  'hindalco':           'NSE:HINDALCO',
  'vedanta':            'NSE:VEDL',
  'coalindia':          'NSE:COALINDIA',
  'coal india':         'NSE:COALINDIA',
  'nmdc':               'NSE:NMDC',
  'sail':               'NSE:SAIL',
  'jindal steel':       'NSE:JINDALSTEL',

  // ── Power & Defence ───────────────────────────
  'ntpc':               'NSE:NTPC',
  'powergrid':          'NSE:POWERGRID',
  'power grid':         'NSE:POWERGRID',
  'bhel':               'NSE:BHEL',
  'bel':                'NSE:BEL',
  'hal':                'NSE:HAL',
  'hindustan aeronautics': 'NSE:HAL',
  'bharat electronics': 'NSE:BEL',
  'bharat dynamics':    'NSE:BDL',
  'mazagon dock':       'NSE:MAZDOCK',
  'cochin shipyard':    'NSE:COCHINSHIP',

  // ── Adani Group ───────────────────────────────
  'adani ports':        'NSE:ADANIPORTS',
  'adani enterprises':  'NSE:ADANIENT',
  'adani green':        'NSE:ADANIGREEN',
  'adani power':        'NSE:ADANIPOWER',
  'adani':              'NSE:ADANIENT',

  // ── Telecom ───────────────────────────────────
  'airtel':             'NSE:BHARTIARTL',
  'bharti airtel':      'NSE:BHARTIARTL',
  'vodafone idea':      'NSE:IDEA',
  'vi':                 'NSE:IDEA',
  'idea':               'NSE:IDEA',

  // ── Infra / L&T ───────────────────────────────
  'larsen':             'NSE:LT',
  'l&t':                'NSE:LT',
  'lt':                 'NSE:LT',
  'abb':                'NSE:ABB',
  'siemens':            'NSE:SIEMENS',
  'havells':            'NSE:HAVELLS',

  // ── Realty ────────────────────────────────────
  'dlf':                'NSE:DLF',
  'godrej properties':  'NSE:GODREJPROP',
  'prestige':           'NSE:PRESTIGE',
  'oberoi realty':      'NSE:OBEROIRLTY',

  // ── Consumer / Retail ─────────────────────────
  'dmart':              'NSE:DMART',
  'avenue supermart':   'NSE:DMART',
  'titan':              'NSE:TITAN',
  'tanishq':            'NSE:TITAN',
  'asian paints':       'NSE:ASIANPAINT',
  'pidilite':           'NSE:PIDILITIND',
  'berger paints':      'NSE:BERGEPAINT',
  'page industries':    'NSE:PAGEIND',
  'jockey':             'NSE:PAGEIND',
  'mrf':                'NSE:MRF',
  'apollo tyres':       'NSE:APOLLOTYRE',
  'polycab':            'NSE:POLYCAB',
  'voltas':             'NSE:VOLTAS',

  // ── New Age / Tech ────────────────────────────
  'zomato':             'NSE:ZOMATO',
  'swiggy':             'NSE:SWIGGY',
  'paytm':              'NSE:PAYTM',
  'nykaa':              'NSE:NYKAA',
  'ola electric':       'NSE:OLAELEC',
  'info edge':          'NSE:NAUKRI',
  'naukri':             'NSE:NAUKRI',
  'just dial':          'NSE:JUSTDIAL',
  'indiamart':          'NSE:INDIAMART',
  'policybazaar':       'NSE:POLICYBZR',

  // ── Travel / Hospitality ──────────────────────
  'irctc':              'NSE:IRCTC',
  'indian hotel':       'NSE:INDHOTEL',
  'taj hotel':          'NSE:INDHOTEL',
  'lemon tree':         'NSE:LEMONTREE',
  'jubilant food':      'NSE:JUBLFOOD',
  'dominos':            'NSE:JUBLFOOD',

  // ── Healthcare ────────────────────────────────
  'apollo hospital':    'NSE:APOLLOHOSP',
  'apollo':             'NSE:APOLLOHOSP',
  'fortis':             'NSE:FORTIS',
  'max healthcare':     'NSE:MAXHEALTH',
  'medanta':            'NSE:MEDANTA',

  // ── Exchanges ─────────────────────────────────
  'cdsl':               'NSE:CDSL',
  'angel one':          'NSE:ANGELONE',
  'motilal oswal':      'NSE:MOTILALOFS',
};

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

    const isEquity = instrumentType === 'EQ';
    const isIndex  = instrumentType === 'INDEX';
    const isNSEBSE = exchange === 'NSE' || exchange === 'BSE';

    if (!(isEquity || isIndex) || !isNSEBSE) continue;

    const key = `${exchange}:${tradingsymbol}`;

    // Map by trading symbol
    map[tradingsymbol.toLowerCase()] = key;

    // Map by full company name
    if (name) {
      map[name.toLowerCase()] = key;
      const words = name.toLowerCase().split(/\s+/);
      if (words.length >= 2) {
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
  if (_instrumentsMap && Date.now() - _mapLoadedAt < 6 * 60 * 60 * 1000) {
    return _instrumentsMap;
  }

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
// TIER 1: Scan the hardcoded alias dictionary
// Handles nicknames, abbreviations, partial names, colloquial terms
// e.g. "RIL", "Infy", "banknifty", "itc ka price"
// ─────────────────────────────────────────────
function detectFromAliases(message) {
  const lower = message.toLowerCase()
    .replace(/[?!.,;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const found = new Set();

  // Sort by length descending so multi-word aliases match before single words
  const aliasKeys = Object.keys(STOCK_ALIASES).sort((a, b) => b.length - a.length);

  for (const alias of aliasKeys) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-boundary aware: allow common Hindi/English connectors around the alias
    const regex = new RegExp(`(?:^|[\\s,'"\`]|ka |ki |ke |ka|ki|ke)${escaped}(?:[\\s,'"\`]|ka |ki |ke |$|'s)`, 'i');
    if (regex.test(lower) || lower === alias || lower.startsWith(alias + ' ') || lower.endsWith(' ' + alias)) {
      found.add(STOCK_ALIASES[alias]);
      if (found.size >= MAX_SYMBOLS_PER_QUERY) break;
    }
  }

  return [...found];
}

const GENERIC_BLOCKLIST = new Set([
  'internet', 'power', 'key', 'day', 'line', 'cap', 'home', 'best', 'good', 
  'free', 'news', 'trade', 'live', 'mind', 'rate', 'value', 'price', 'plan', 
  'core', 'pro', 'elite', 'lakh', 'crore', 'rupee', 'hold', 'money', 'stock', 
  'share', 'account', 'cash', 'loan', 'pledge', 'broker', 'tax', 'fees', 'cost',
  'loss', 'profit', 'charge', 'charges', 'trial', 'demo', 'setup', 'timings'
]);

// ─────────────────────────────────────────────
// TIER 2: Scan the full NSE/BSE instruments map
// Whole-word fuzzy scan — catches any stock not in the alias dict
// ─────────────────────────────────────────────
function detectFromInstrumentsMap(message, instrumentsMap) {
  const lower = message.toLowerCase()
    .replace(/[?!.,;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const found = new Set();

  // Longer keys first to prevent short keys from eating long names
  const keys = Object.keys(instrumentsMap).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (key.length < 3) continue; // skip noise like "of", "in"
    if (GENERIC_BLOCKLIST.has(key)) continue; // skip generic terms to avoid false-positives

    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i');

    if (regex.test(lower)) {
      found.add(instrumentsMap[key]);
      if (found.size >= MAX_SYMBOLS_PER_QUERY) break;
    }
  }

  return [...found];
}

// ─────────────────────────────────────────────
// TIER 3: LLM-powered NLP extraction
// Claude Haiku reads the user's message and extracts which stocks they're
// asking about, even in indirect phrasing like:
// "aaj reliance kaisi chal rahi hai?"
// "what's happening with that Tata car company?"
// ─────────────────────────────────────────────

// Keywords that suggest the user is asking about a stock/market
const MARKET_INTENT_KEYWORDS = [
  'price', 'stock', 'share', 'rate', 'trading', 'market', 'quote', 'worth',
  'value', 'nse', 'bse', 'equity', 'invest', 'buy', 'sell', 'scrip',
  'ka price', 'ka bhav', 'bhav', 'kitna', 'kya chal', 'current price',
  'live price', 'aaj ka', 'today', 'chart', 'performance', 'ipo', 'dividend',
  '52 week', 'all time high', 'gainers', 'losers', 'volume', 'circuit',
  'chal rahi', 'kya ho raha', 'ka rate', 'mein invest', 'kharidna',
];

function looksLikeStockQuery(message) {
  const lower = message.toLowerCase();
  return MARKET_INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

async function extractStocksViaLLM(message, instrumentsMap) {
  // Only call LLM when the message actually seems stock-related
  if (!looksLikeStockQuery(message)) return [];

  try {
    const prompt = `You are a stock symbol extractor for Indian markets (NSE/BSE).

User message: "${message}"

Extract ALL Indian stocks, indices, or companies the user is asking about.
Even if the user uses nicknames, abbreviations, partial names, or Hindi phrases, identify the stock.
Examples: "reliance ka price" → RELIANCE | "Infy" → INFY | "that IT giant from Pune" → INFOSYS

Return ONLY a valid JSON array of NSE/BSE trading symbols or company names.
Examples of correct output: ["RELIANCE"] or ["TCS", "INFY"] or ["NIFTY 50"]
If no specific stock is mentioned, return: []
Return ONLY the JSON array — no explanation, no markdown.`;

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);

    const raw   = result.response.text()?.trim() || '[]';
    const names = parseLLMJson(raw, []);

    if (!Array.isArray(names) || names.length === 0) return [];

    const results = new Set();

    for (const name of names) {
      const lower = name.toLowerCase().trim();

      // Check alias dict first
      if (STOCK_ALIASES[lower]) {
        results.add(STOCK_ALIASES[lower]);
        continue;
      }

      // Check instruments map
      if (instrumentsMap && instrumentsMap[lower]) {
        results.add(instrumentsMap[lower]);
        continue;
      }

      // Partial match — find the closest key in instruments map
      if (instrumentsMap) {
        const keys    = Object.keys(instrumentsMap);
        const partial = keys.find(k => k.includes(lower) || lower.includes(k));
        if (partial) {
          results.add(instrumentsMap[partial]);
          continue;
        }
      }
    }

    logger.info(`[Market] LLM extracted: ${[...results].join(', ')} from: "${message.slice(0, 60)}"`);
    return [...results].slice(0, MAX_SYMBOLS_PER_QUERY);
  } catch (err) {
    logger.warn('[Market] LLM stock extraction failed:', err.message);
    return [];
  }
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
    const params   = toFetch.map(i => `i=${encodeURIComponent(i)}`).join('&');
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
// 3-tier waterfall: aliases → instruments map → LLM extraction
// ─────────────────────────────────────────────
async function getMarketContext(message, redis) {
  try {
    const apiKey      = process.env.ZERODHA_API_KEY?.trim();
    const accessToken = await redis.get(`zerodha:token:${SYSTEM_UID}`)
                     || await redis.get(`zerodha:token:dev-user`);

    if (!accessToken || !apiKey) return '';

    // Load instruments map (from in-memory cache, Redis, or fresh from Kite)
    const instrumentsMap = await getInstrumentsMap(apiKey, accessToken, redis);

    // ── TIER 1: Alias dictionary (fast path, covers 150+ popular stocks)
    let instruments = detectFromAliases(message);
    logger.info(`[Market] Tier1 aliases found: ${instruments.join(', ') || 'none'}`);

    // ── TIER 2: Full instruments map scan (catches anything not in aliases)
    if (instruments.length < MAX_SYMBOLS_PER_QUERY && instrumentsMap) {
      const fromMap = detectFromInstrumentsMap(message, instrumentsMap);
      for (const sym of fromMap) {
        if (!instruments.includes(sym)) instruments.push(sym);
        if (instruments.length >= MAX_SYMBOLS_PER_QUERY) break;
      }
      if (fromMap.length > 0) logger.info(`[Market] Tier2 map found: ${fromMap.join(', ')}`);
    }

    // ── TIER 3: LLM NLP extraction (fallback for natural language)
    if (instruments.length === 0) {
      logger.info('[Market] Falling back to LLM stock extraction…');
      instruments = await extractStocksViaLLM(message, instrumentsMap);
    }

    if (!instruments.length) return '';

    // Fetch live quotes
    const quotes = await fetchQuotes(instruments, apiKey, accessToken, redis);
    if (!Object.keys(quotes).length) return '';

    const lines = Object.entries(quotes)
      .map(([inst, q]) => formatQuote(inst, q))
      .filter(Boolean);

    if (!lines.length) return '';

    const ts = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

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
    const apiKey      = process.env.ZERODHA_API_KEY?.trim();
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
