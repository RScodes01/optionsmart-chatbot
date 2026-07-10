/**
 * scraperService.js
 * Web crawler that visits OptionSmart and GoAlgoTrade websites,
 * extracts clean text, chunks it, and returns embedding-ready documents.
 *
 * Seed URLs are read from SCRAPE_URLS env var (comma-separated).
 * Crawls up to MAX_PAGES_PER_DOMAIN pages per domain.
 * Each page is chunked into ~1200-char pieces (richer context, fewer docs).
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const logger  = require('../utils/logger');

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_SEED_URLS = [
  'https://optionsmart.in',
  'https://goalgotrade.tech',
];

const MAX_PAGES_PER_DOMAIN = 20;   // max pages crawled per website
const CHUNK_SIZE           = 1200; // chars per chunk — richer context, fewer docs
const CHUNK_OVERLAP        = 150;  // overlap to preserve sentence continuity
const REQUEST_DELAY_MS     = 800;  // polite delay between requests (ms)
const REQUEST_TIMEOUT      = 12000;// per-request timeout (ms)
const MIN_TEXT_LENGTH      = 200;  // skip pages with less than this many chars
const MAX_CHUNKS_PER_PAGE  = 8;    // cap chunks per page (prevents huge pages flooding DB)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse seed URLs from env or use defaults */
function getSeedUrls() {
  const raw = process.env.SCRAPE_URLS || '';
  if (raw.trim()) {
    return raw.split(',').map(u => u.trim()).filter(Boolean);
  }
  return DEFAULT_SEED_URLS;
}

/** Fetch a page with polite headers */
async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      'User-Agent':      'OptionSmartKnowledgeBot/1.0 (daily refresh)',
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'en-IN,en;q=0.9',
    },
    maxRedirects: 5,
  });
  return response.data;
}

/** Extract all same-domain links from an HTML page */
function extractLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const links = new Set();

  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const resolved = new URL(href, pageUrl);
      if (resolved.hostname !== base.hostname) return; // same domain only
      resolved.hash   = '';  // strip fragment
      resolved.search = '';  // strip query params
      const clean = resolved.toString().replace(/\/$/, ''); // strip trailing slash
      links.add(clean);
    } catch { /* ignore malformed hrefs */ }
  });

  return [...links];
}

/** Extract clean readable text from HTML */
function extractText(html) {
  const $ = cheerio.load(html);

  // Remove noise elements aggressively
  $('script, style, noscript, iframe, form, button, input, select, textarea').remove();
  $('nav, footer, header, .nav, .footer, .header, .menu, .sidebar').remove();
  $('.cookie, .popup, .modal, .advertisement, .banner, .breadcrumb').remove();
  $('[aria-hidden="true"], [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

  const title = $('title').text().trim()
    || $('h1').first().text().trim()
    || 'Untitled';

  // Prefer main content containers; fall back to body
  const contentEl = $('main, article, .content, #content, .main, #main, [role="main"], .page-content, .entry-content');
  const text = (contentEl.length ? contentEl : $('body'))
    .text()
    .replace(/[\t ]+/g, ' ')        // collapse whitespace
    .replace(/\n{3,}/g, '\n\n')     // max 2 consecutive newlines
    .replace(/\n /g, '\n')           // trim line starts
    .trim();

  return { title, text };
}

/** Split long text into overlapping chunks, capped at MAX_CHUNKS_PER_PAGE */
function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length && chunks.length < MAX_CHUNKS_PER_PAGE) {
    let end = start + size;

    // Prefer breaking at sentence boundary
    if (end < text.length) {
      const sentenceBreak = text.lastIndexOf('. ', end);
      const newlineBreak  = text.lastIndexOf('\n', end);
      const breakAt = Math.max(sentenceBreak, newlineBreak);
      if (breakAt > start + size * 0.5) {
        end = breakAt + 1;
      }
    }

    const chunk = text.slice(start, Math.min(end, text.length)).trim();
    if (chunk.length > 100) chunks.push(chunk);

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/** Simple content hash to detect duplicate pages (nav/footer heavy pages) */
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 300); i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Crawl all configured websites and return an array of embedding-ready docs.
 * Limits to MAX_PAGES_PER_DOMAIN per domain to keep doc count reasonable.
 * @returns {Promise<Array<{ id, question, answer, tags }>>}
 */
async function scrapeAllSites() {
  const seedUrls = getSeedUrls();
  logger.info(`[Scraper] Starting crawl — seed URLs: ${seedUrls.join(', ')}`);
  logger.info(`[Scraper] Limits: ${MAX_PAGES_PER_DOMAIN} pages/domain, ${CHUNK_SIZE}-char chunks, max ${MAX_CHUNKS_PER_PAGE} chunks/page`);

  const docs        = [];
  const seenHashes  = new Set();  // detect duplicate content across pages
  let   docIdx      = 0;

  for (const seedUrl of seedUrls) {
    const cleanSeed = seedUrl.replace(/\/$/, '');
    const hostname  = new URL(cleanSeed).hostname.replace(/^www\./, '');
    const visited   = new Set();
    const queue     = [cleanSeed];
    let   pagesDone = 0;

    logger.info(`[Scraper] ── Domain: ${hostname} (max ${MAX_PAGES_PER_DOMAIN} pages) ──`);

    while (queue.length > 0 && pagesDone < MAX_PAGES_PER_DOMAIN) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        logger.info(`[Scraper] (${pagesDone + 1}/${MAX_PAGES_PER_DOMAIN}) ${url}`);
        const html = await fetchPage(url);

        // Discover and enqueue internal links
        const links = extractLinks(html, url);
        for (const link of links) {
          const clean = link.replace(/\/$/, '');
          if (!visited.has(clean) && !queue.includes(clean)) {
            queue.push(clean);
          }
        }

        // Extract content
        const { title, text } = extractText(html);

        if (text.length < MIN_TEXT_LENGTH) {
          logger.info(`[Scraper] Skip — too little text (${text.length} chars)`);
          continue;
        }

        // Skip duplicate pages (same content fingerprint)
        const hash = simpleHash(text);
        if (seenHashes.has(hash)) {
          logger.info(`[Scraper] Skip — duplicate content: ${title}`);
          continue;
        }
        seenHashes.add(hash);
        pagesDone++;

        const chunks = chunkText(text);
        logger.info(`[Scraper] "${title}" → ${chunks.length} chunk(s)`);

        for (let i = 0; i < chunks.length; i++) {
          docIdx++;
          docs.push({
            id:       `web_${docIdx.toString().padStart(4, '0')}`,
            question: `${title} — ${hostname} (part ${i + 1})`,
            answer:   chunks[i],
            tags:     ['web', hostname, title.toLowerCase().slice(0, 40)],
          });
        }

        // Polite delay between requests
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));

      } catch (err) {
        logger.warn(`[Scraper] Failed: ${url} — ${err.message}`);
      }
    }

    logger.info(`[Scraper] ${hostname} done — ${pagesDone} pages, ${docIdx} total chunks so far`);
  }

  logger.info(`[Scraper] ✓ Complete — ${docs.length} total chunks from ${seenHashes.size} unique pages`);
  return docs;
}

module.exports = { scrapeAllSites, getSeedUrls };
