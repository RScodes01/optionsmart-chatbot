/**
 * flushCache.js — Flushes all chat cache keys from Redis and invalidates RAG memory cache.
 */
const redisClient = require('../utils/redisClient');
const ragService  = require('../services/ragService');

async function main() {
  try {
    const keys = await redisClient.keys('chat:cache:*');
    if (keys && keys.length > 0) {
      for (const k of keys) {
        await redisClient.del(k);
      }
      console.log(`✅ Flushed ${keys.length} cached chat responses from Redis.`);
    } else {
      console.log('ℹ️ No cached chat responses found in Redis.');
    }
    ragService.invalidateCaches();
    console.log('✅ RAG in-memory doc caches invalidated.');
    process.exit(0);
  } catch (err) {
    console.log('Note:', err.message);
    process.exit(0);
  }
}

main();
