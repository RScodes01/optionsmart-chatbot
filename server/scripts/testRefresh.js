/**
 * testRefresh.js — Manual trigger for the daily cron refresh.
 * Tests the exact same logic that runs at midnight.
 *
 * Run: npm run test-refresh
 *
 * What it does:
 *   1. Clears all documents from MongoDB faq_documents
 *   2. Clears all Redis answer caches
 *   3. Scrapes optionsmart.in + goalgotrade.tech
 *   4. Embeds + indexes scraped content into MongoDB
 *   5. Falls back to faq.json if websites are unreachable
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const { createClient } = require('redis');
const { runRefresh }   = require('../services/refreshScheduler');

async function main() {
  console.log('\n🔗 Connecting to Redis and MongoDB…');

  const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  redis.on('error', (err) => { console.error('[Redis]', err.message); process.exit(1); });
  await redis.connect();
  console.log('✓ Redis connected');

  const mongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
  await mongo.connect();
  const db = mongo.db(process.env.MONGO_DB_NAME || 'optionsmart_chat');
  console.log('✓ MongoDB connected\n');

  // Run the exact same function the midnight cron calls
  await runRefresh(db, redis);

  await redis.quit();
  await mongo.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Test refresh failed:', err.message);
  process.exit(1);
});
