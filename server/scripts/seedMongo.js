/**
 * seedMongo.js — One-shot script to index all FAQ documents into MongoDB.
 *
 * Run once after server setup:
 *   node server/scripts/seedMongo.js
 *
 * Safe to re-run — uses upsert so existing documents are updated in place.
 * The local MiniLM embedding model (~25 MB) will be downloaded on first run
 * if EMBEDDING_PROVIDER=local (the default).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const faqs       = require('../data/faq.json');
const ragService = require('../services/ragService');

async function main() {
  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName   = process.env.MONGO_DB_NAME || 'optionsmart_chat';

  console.log(`\n🔗 Connecting to MongoDB at ${mongoUrl} …`);
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);
  console.log(`✓ Connected  (db: ${dbName})\n`);

  console.log(`📚 Embedding and indexing ${faqs.length} FAQ documents…`);
  console.log('   (first run downloads the ~25 MB MiniLM model — takes ~30 s)\n');

  await ragService.indexFAQs(db, faqs);

  console.log(`\n✅ Done! ${faqs.length} documents seeded into MongoDB collection "faq_documents".`);
  console.log('   Start or restart the server — RAG will now use MongoDB.\n');

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
