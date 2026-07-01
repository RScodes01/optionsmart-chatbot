/**
 * seedFaq.js — One-shot script to index all FAQ documents into Redis.
 *
 * Run once after server setup:
 *   node server/scripts/seedFaq.js
 *
 * Safe to re-run — it overwrites existing vectors with fresh ones.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { createClient } = require('redis');
const faqs = require('../data/faq.json');
const ragService = require('../services/ragService');

async function main() {
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  redis.on('error', (err) => { console.error('[Redis]', err.message); process.exit(1); });
  await redis.connect();
  console.log('✓ Connected to Redis');

  await ragService.indexFAQs(redis, faqs);

  console.log(`\n✓ Seeded ${faqs.length} FAQ documents into Redis`);
  console.log('  Keys written: faq:doc:faq_001 … faq:doc:faq_0XX');
  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
