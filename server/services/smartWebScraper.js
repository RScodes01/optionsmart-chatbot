/**
 * smartWebScraper.js
 * Advanced semantic web scraper that extracts STRUCTURED heading→content pairs
 * instead of raw character chunks. Each heading becomes a "topic" and the
 * content beneath it becomes the "answer". Multiple question phrasings are
 * generated locally (no API) using linguistic templates + entity extraction.
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const crypto  = require('crypto');
const logger  = require('../utils/logger');

const DEFAULT_SEED_URLS    = ['https://optionsmart.in', 'https://goalgotrade.tech'];
const MAX_PAGES_PER_DOMAIN = 30;
const REQUEST_DELAY_MS     = 700;
const REQUEST_TIMEOUT      = 12000;
const MIN_SECTION_LENGTH   = 80;
const MAX_SECTIONS_PER_PAGE = 12;

// Domain-specific entity patterns for contextual question generation
const ENTITY_PATTERNS = [
  { regex: /₹\s*(\d+[\d,.]*\s*(?:lakh|crore|lac))/gi,     type: 'capital' },
  { regex: /(\d+[\d,.]*\s*%)/gi,                             type: 'percentage' },
  { regex: /(\d+[\d,.]*\s*(?:second|sec|ms|minute)s?)/gi,   type: 'time' },
  { regex: /\b(saturn|venus|pluto|axiom|leo|nebula)\b/gi,   type: 'product' },
  { regex: /\b(sebi|nse|bse|mcx|zerodha|angel one|motilal)\b/gi, type: 'entity' },
  { regex: /\b(kill switch|market regime|iv rank|theta|delta|gamma|vega|sharpe)\b/gi, type: 'concept' },
];

/**
 * Generate 5-10 natural question phrasings for a section.
 * Uses templates + extracted entities — ZERO API calls.
 */
function generateQuestions(heading, content, pageTitle) {
  const h = heading.trim().replace(/\s+/g, ' ');
  const pageCtx = pageTitle.replace(/OptionSmart\s*\|?\s*/gi, '').trim();
  const qs = new Set();

  // Set A: Direct question forms
  qs.add(`What is ${h}?`);
  qs.add(`Tell me about ${h}.`);
  qs.add(`How does ${h} work?`);
  qs.add(`Explain ${h}.`);
  qs.add(`What are the details of ${h}?`);
  qs.add(`What does ${h} mean?`);

  // Set B: Context-aware (page title + heading)
  if (pageCtx && pageCtx.toLowerCase() !== h.toLowerCase() && pageCtx.length > 3) {
    qs.add(`What is ${h} in ${pageCtx}?`);
    qs.add(`How does ${pageCtx} handle ${h}?`);
  }

  // Set C: Entity-specific templates from content
  const excerpt = (h + ' ' + content.slice(0, 400)).toLowerCase();

  // Product-specific questions
  const products = [...new Set(
    [...excerpt.matchAll(/\b(saturn|venus|pluto|axiom|leo|nebula)\b/gi)].map(m => m[1])
  )];
  for (const p of products.slice(0, 2)) {
    qs.add(`What is the ${p} strategy?`);
    qs.add(`How does ${p} work in OptionSmart?`);
  }

  // Capital/tier questions
  const capitals = [...new Set(
    [...excerpt.matchAll(/₹?\s*(\d+)\s*(lakh|crore|lac)/gi)].map(m => `${m[1]} ${m[2]}`)
  )];
  for (const c of capitals.slice(0, 2)) {
    qs.add(`What do I get with ${c} investment?`);
    qs.add(`What is the ${c} plan?`);
  }

  // Set D: Content-keyword derived questions
  if (/intraday|square.?off|overnight/i.test(excerpt)) {
    qs.add('Does OptionSmart hold positions overnight?');
    qs.add('Are all trades squared off daily?');
  }
  if (/sebi|regulat|complian|legal/i.test(excerpt)) {
    qs.add('Is OptionSmart SEBI regulated?');
    qs.add('Is algo trading with OptionSmart legal in India?');
  }
  if (/withdraw|lock.?in|exit investment|pull out/i.test(excerpt)) {
    qs.add('Can I withdraw my money anytime?');
    qs.add('Is there a lock-in period with OptionSmart?');
  }
  if (/risk|safeguard|mtm|protect|loss cap/i.test(excerpt)) {
    qs.add('How does risk management work?');
    qs.add('What protects my capital from big losses?');
  }
  if (/broker|zerodha|angel|kite|motilal/i.test(excerpt)) {
    qs.add('Which brokers are supported?');
    qs.add('Can I connect my existing broker account?');
  }
  if (/onboard|get started|sign.?up|how to start|join/i.test(excerpt)) {
    qs.add('How do I get started with OptionSmart?');
    qs.add('What is the onboarding process?');
  }
  if (/b2b|sub.?broker|partner|white.?label/i.test(excerpt)) {
    qs.add('Does OptionSmart have a B2B or partner program?');
    qs.add('Can sub-brokers use OptionSmart for their clients?');
  }
  if (/backtest|historical|strategy builder/i.test(excerpt)) {
    qs.add('Does OptionSmart support backtesting?');
    qs.add('Can I test a strategy on historical data?');
  }
  if (/greek|delta|gamma|theta|vega/i.test(excerpt)) {
    qs.add('How are option greeks monitored?');
    qs.add('Does OptionSmart track delta gamma theta vega?');
  }

  return [...qs].slice(0, 10);
}

// ── HTML Structural Extraction ────────────────────────────────────────────────

function cleanCheerioText($el, $) {
  let result = '';
  $el.contents().each((_, child) => {
    if (child.type === 'text') {
      result += child.data;
    } else if (child.type === 'tag') {
      const tagName = child.name.toLowerCase();
      const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'td', 'br', 'section', 'article'].includes(tagName);
      const childText = cleanCheerioText($(child), $);
      if (isBlock) {
        result += '\n' + childText + '\n';
      } else {
        result += childText;
      }
    }
  });
  return result;
}

function getCleanText($el, $) {
  const raw = cleanCheerioText($el, $);
  return raw
    .replace(/[ \t]+/g, ' ')                        // collapse spaces/tabs
    .replace(/\n{3,}/g, '\n\n')                     // max 2 consecutive newlines
    .replace(/\n /g, '\n')                          // trim line starts
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')         // add space between lowercase/digit and uppercase
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')       // add space between consecutive uppercase and a capitalized word
    .trim();
}

function extractSections(html, pageUrl) {
  const $ = cheerio.load(html);

  $('script, style, noscript, iframe, form, button, input, nav, footer, header').remove();
  $('.cookie, .popup, .modal, .nav, .menu, .footer, .header, .breadcrumb, .sidebar').remove();
  $('[aria-hidden="true"], [role="navigation"], [role="banner"]').remove();

  const rawTitle = getCleanText($('title'), $) || getCleanText($('h1').first(), $) || 'Untitled';
  const cleanTitle = rawTitle.replace(/OptionSmart\s*\|?\s*/gi, '').trim() || rawTitle;

  const sections  = [];
  const seenTexts = new Set();

  // Extract heading → body pairs
  $('h1, h2, h3, h4').each((_, headingEl) => {
    const $h = $(headingEl);
    const headingText = getCleanText($h, $);
    if (!headingText || headingText.length < 3 || headingText.length > 150) return;

    const contentParts = [];

    // Collect siblings until next heading
    let $next = $h.next();
    let depth = 0;
    while ($next.length && depth < 20) {
      const tag = $next.prop('tagName')?.toLowerCase();
      if (tag && /^h[1-4]$/.test(tag)) break;
      const text = getCleanText($next, $);
      if (text) contentParts.push(text);
      $next = $next.next();
      depth++;
    }

    // Fallback: grab parent's next siblings
    if (!contentParts.length) {
      let $pNext = $h.parent().next();
      let ps = 0;
      while ($pNext.length && ps < 8) {
        if ($pNext.find('h1,h2,h3,h4').length) break;
        const text = getCleanText($pNext, $);
        if (text) contentParts.push(text);
        $pNext = $pNext.next();
        ps++;
      }
    }

    const content = contentParts.join('\n').trim();
    if (content.length < MIN_SECTION_LENGTH) return;

    const sig = content.slice(0, 100);
    if (seenTexts.has(sig)) return;
    seenTexts.add(sig);

    sections.push({ heading: headingText, content, pageTitle: cleanTitle });
  });

  // Fallback to paragraph-based chunking if heading extraction yields too little
  if (sections.length < 2) {
    const bodyEl = $('main, article, .content, #content, [role="main"], body').first();
    const bodyText = getCleanText(bodyEl, $);

    if (bodyText.length > MIN_SECTION_LENGTH) {
      const sentences = bodyText.split(/(?<=[.!?])\s+/);
      let buffer = '';
      for (const sentence of sentences) {
        buffer += ' ' + sentence;
        if (buffer.length > 700) {
          const sig = buffer.trim().slice(0, 100);
          if (!seenTexts.has(sig)) {
            seenTexts.add(sig);
            sections.push({ heading: cleanTitle, content: buffer.trim(), pageTitle: cleanTitle });
          }
          buffer = '';
          if (sections.length >= MAX_SECTIONS_PER_PAGE) break;
        }
      }
      if (buffer.trim().length > MIN_SECTION_LENGTH && sections.length < MAX_SECTIONS_PER_PAGE) {
        sections.push({ heading: cleanTitle, content: buffer.trim(), pageTitle: cleanTitle });
      }
    }
  }

  return { title: cleanTitle, sections: sections.slice(0, MAX_SECTIONS_PER_PAGE) };
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    headers: { 'User-Agent': 'OptionSmartKnowledgeBot/1.0', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IN,en;q=0.9' },
    maxRedirects: 5,
  });
  return res.data;
}

function extractLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const links = new Set();
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const resolved = new URL(href, pageUrl);
      if (resolved.hostname !== base.hostname) return;

      const pathname = resolved.pathname.toLowerCase();
      const skipExts = ['.pdf', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4', '.avi', '.mov', '.zip', '.rar', '.gz', '.tar'];
      if (skipExts.some(ext => pathname.endsWith(ext))) return;

      resolved.hash = ''; resolved.search = '';
      links.add(resolved.toString().replace(/\/$/, ''));
    } catch { /* ignore */ }
  });
  return [...links];
}

function contentHash(str) {
  return crypto.createHash('md5').update(str.slice(0, 200)).digest('hex').slice(0, 12);
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Crawl websites and return richly structured documents with multiple question phrasings.
 * Each document: { id, sourceUrl, pageTitle, section, content, questions[], tags[] }
 */
async function scrapeStructured() {
  const rawUrls  = (process.env.SCRAPE_URLS || '').trim();
  const seedUrls = rawUrls ? rawUrls.split(',').map(u => u.trim()).filter(Boolean) : DEFAULT_SEED_URLS;

  logger.info(`[SmartScraper] Starting — seeds: ${seedUrls.join(', ')}`);

  const allDocs    = [];
  const seenHashes = new Set();
  let   docIdx     = 0;

  for (const seedUrl of seedUrls) {
    const cleanSeed = seedUrl.replace(/\/$/, '');
    const hostname  = new URL(cleanSeed).hostname.replace(/^www\./, '');
    const visited   = new Set();
    const queue     = [cleanSeed];
    let   pagesDone = 0;

    logger.info(`[SmartScraper] ── ${hostname} ──`);

    while (queue.length > 0 && pagesDone < MAX_PAGES_PER_DOMAIN) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        logger.info(`[SmartScraper] (${pagesDone + 1}) ${url}`);
        const html = await fetchPage(url);

        for (const link of extractLinks(html, url)) {
          const clean = link.replace(/\/$/, '');
          if (!visited.has(clean) && !queue.includes(clean)) queue.push(clean);
        }

        const { title, sections } = extractSections(html, url);
        if (!sections.length) { logger.info(`[SmartScraper] Skip — no sections`); continue; }

        pagesDone++;
        let added = 0;

        for (const { heading, content, pageTitle } of sections) {
          const hash = contentHash(content);
          if (seenHashes.has(hash)) continue;
          seenHashes.add(hash);

          docIdx++;
          const questions = generateQuestions(heading, content, pageTitle);

          allDocs.push({
            id:        `sk_${String(docIdx).padStart(4, '0')}`,
            sourceUrl:  url,
            pageTitle:  title,
            section:    heading,
            content,
            questions,
            tags:      [hostname, heading.toLowerCase().slice(0, 40)],
          });
          added++;
        }

        logger.info(`[SmartScraper] "${title}" → ${added} sections (${allDocs.length} total)`);
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));

      } catch (err) {
        logger.warn(`[SmartScraper] Failed: ${url} — ${err.message}`);
      }
    }

    logger.info(`[SmartScraper] ${hostname} done — ${pagesDone} pages`);
  }

  logger.info(`[SmartScraper] ✓ Complete — ${allDocs.length} structured sections`);
  return allDocs;
}

module.exports = { scrapeStructured };
