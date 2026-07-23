require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const { createClient } = require('redis');
const ragService = require('../services/ragService');

async function test() {
  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName   = process.env.MONGO_DB_NAME || 'optionsmart_chat';
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);

  const redis = createClient();
  redis.on('error', () => {});
  await redis.connect().catch(() => {});

  // Warm RAG cache
  await ragService.warmCaches(db);

  const queries = [
    'Is OptionSmart SEBI registered?',
    'What are the SEBI registration details of OptionSmart?'
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`QUERY: "${q}"`);
    const res = await ragService.query(redis, db, q);
    console.log(`HIT: ${res.hit} (directAnswer: ${res.directAnswer}, source: ${res.source})`);
    console.log(`ANSWER:\n${res.answer}`);
  }

  await client.close();
  await redis.disconnect().catch(() => {});
  process.exit(0);
}

test();
