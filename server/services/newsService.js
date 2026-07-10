/**
 * newsService.js
 * Fetches real market news headlines from free RSS feeds:
 *   - Economic Times Markets
 *   - Moneycontrol Top News
 *   - Business Standard Markets
 *   - Livemint Markets
 *
 * Results are cached in Redis for 30 minutes to avoid hammering RSS endpoints.
 */

const axios  = require('axios');
const logger = require('../utils/logger');

// RSS feed URLs (no API key required)
const RSS_FEEDS = [
  {
    name: 'ET Markets',
    url : 'https://economictimes.indiatimes.com/markets/rss.cms',
  },
  {
    name: 'Moneycontrol',
    url : 'https://www.moneycontrol.com/rss/MCtopnews.xml',
  },
  {
    name: 'Business Standard',
    url : 'https://www.business-standard.com/rss/markets-106.rss',
  },
  {
    name: 'Livemint',
    url : 'https://www.livemint.com/rss/markets',
  }
];

const NEWS_CACHE_KEY = 'news:headlines:cache';
const NEWS_CACHE_TTL = 30 * 60; // 30 minutes

// ── RSS Parser (no external library — pure regex on XML) ──────────────────────

/**
 * Parse <item> blocks from an RSS XML string.
 * Returns array of { title, description } objects.
 */
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch  = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

    let title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim() : '';
    let desc  = descMatch  ? descMatch[1].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim() : '';

    // Clean up XML escapes
    title = title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
    desc = desc.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");

    if (title && title.length > 10) {
      items.push({ title, description: desc.slice(0, 300) });
    }
  }

  return items;
}

// ── Main Fetch ─────────────────────────────────────────────────────────────────

/**
 * Fetch top market headlines from all RSS feeds.
 * Returns up to 15 combined headlines as a plain-text string.
 *
 * @param {import('redis').RedisClientType} redis
 * @param {boolean} skipCache
 * @returns {Promise<string>}
 */
async function fetchMarketHeadlines(redis, skipCache = false) {
  // Check Redis cache first (unless skipCache is true)
  if (!skipCache) {
    try {
      const cached = await redis.get(NEWS_CACHE_KEY);
      if (cached) {
        logger.info('[News] Returning cached headlines');
        return cached;
      }
    } catch {
      // Redis miss — proceed to fetch
    }
  }

  const allItems = [];

  for (const feed of RSS_FEEDS) {
    try {
      const response = await axios.get(feed.url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept'    : 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        responseType: 'text',
      });

      const items = parseRSS(response.data);
      const top   = items.slice(0, 5); // top 5 per feed to get a diverse mix of 15-20 total
      allItems.push(...top);
      logger.info(`[News] ${feed.name}: fetched ${items.length} items, using ${top.length}`);
    } catch (err) {
      logger.warn(`[News] Failed to fetch ${feed.name}: ${err.message}`);
    }
  }

  if (allItems.length === 0) {
    logger.warn('[News] All RSS feeds failed — returning empty string');
    return '';
  }

  // Format as numbered list for Claude's prompt
  const headlineText = allItems
    .slice(0, 20)
    .map((item, i) => {
      const desc = item.description ? ` — ${item.description}` : '';
      return `${i + 1}. ${item.title}${desc}`;
    })
    .join('\n');

  // Cache result
  try {
    await redis.setEx(NEWS_CACHE_KEY, NEWS_CACHE_TTL, headlineText);
  } catch {
    // Non-fatal
  }

  return headlineText;
}

module.exports = { fetchMarketHeadlines };
