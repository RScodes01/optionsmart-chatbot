/**
 * newsService.js
 * Fetches real market news headlines from free RSS feeds:
 *   - Economic Times Markets
 *   - Moneycontrol Top News
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

    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim() : '';
    const desc  = descMatch  ? descMatch[1].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim() : '';

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
 * @returns {Promise<string>}
 */
async function fetchMarketHeadlines(redis) {
  // Check Redis cache first
  try {
    const cached = await redis.get(NEWS_CACHE_KEY);
    if (cached) {
      logger.info('[News] Returning cached headlines');
      return cached;
    }
  } catch {
    // Redis miss — proceed to fetch
  }

  const allItems = [];

  for (const feed of RSS_FEEDS) {
    try {
      const response = await axios.get(feed.url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OptionSmart-Bot/1.0)',
          'Accept'    : 'application/rss+xml, application/xml, text/xml',
        },
        responseType: 'text',
      });

      const items = parseRSS(response.data);
      const top   = items.slice(0, 8); // top 8 per feed
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
    .slice(0, 15)
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
