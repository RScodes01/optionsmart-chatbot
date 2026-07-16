/**
 * seedScraped.js
 * One-shot script: scrapes optionsmart.in websites, generates dual embeddings
 * (question + answer), and indexes everything into the `scraped_knowledge` collection.
 *
 * Run with:
 *   node server/scripts/seedScraped.js
 *
 * Safe to re-run — uses upsert so existing documents are updated.
 * The dual-embedding approach means:
 *   - If user asks "how does theta decay work?" → matches via ANSWER embedding
 *   - If user asks "what is the Saturn strategy?" → matches via QUESTION embedding
 *   - Both map to the same answer → zero Gemini API tokens used.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient }    = require('mongodb');
const { scrapeStructured } = require('../services/smartWebScraper');
const { embed }           = require('../services/embeddingService');
const scrapedModel        = require('../models/scrapedKnowledge');
const logger              = require('../utils/logger');

const BATCH_SIZE = 5; // embed N docs at a time (keeps memory stable)

async function main() {
  const mongoUrl = process.env.MONGODB_URI    || 'mongodb://localhost:27017';
  const dbName   = process.env.MONGO_DB_NAME  || 'optionsmart_chat';

  console.log('\n🔗 Connecting to MongoDB at', mongoUrl, '...');
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);
  console.log('✓ Connected (db:', dbName, ')\n');

  // 1. Scrape all structured sections from websites
  console.log('🕷️  Scraping websites for structured Q&A content...\n');
  const docs = await scrapeStructured();
  console.log(`\n✓ Scraped ${docs.length} structured sections\n`);

  if (!docs.length) {
    console.log('⚠️  No content scraped — check SCRAPE_URLS or site availability.');
    await client.close();
    process.exit(0);
  }

  // 2. Create indexes
  await scrapedModel.createIndexes(db);

  // 3. Clear old scraped data (fresh re-index)
  const cleared = await scrapedModel.clearAll(db);
  console.log(`🗑️  Cleared ${cleared} old scraped documents\n`);

  // 4. Embed & index in batches
  console.log(`📐 Embedding ${docs.length} sections (question embedding + answer embedding each)...`);
  console.log('   (First run downloads the local MiniLM model ~25MB)\n');

  let indexed = 0;
  let failed  = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    for (const doc of batch) {
      try {
        // Primary question embedding: embed the first question + section heading
        const questionText = (doc.questions[0] || doc.section) + ' ' + doc.section;
        const answerText   = doc.content;

        // Generate DUAL embeddings — this is the key to smart matching
        const [embedding, answerEmbedding] = await Promise.all([
          embed(questionText),
          embed(answerText),
        ]);

        await scrapedModel.upsertDoc(db, { ...doc, embedding, answerEmbedding });

        indexed++;
        if (indexed % 10 === 0 || indexed === docs.length) {
          process.stdout.write(`\r   Indexed: ${indexed}/${docs.length}`);
        }
      } catch (err) {
        failed++;
        logger.error(`[SeedScraped] Failed to index ${doc.id}: ${err.message}`);
      }
    }
  }

  const total = await scrapedModel.count(db);
  console.log(`\n\n✅ Done! ${indexed} documents indexed into \`scraped_knowledge\` (${failed} failed).`);
  console.log(`   Total in collection: ${total}`);
  console.log('\n📋 Each document has:');
  console.log('   - Dual embeddings (question + answer) for smart multi-angle matching');
  console.log('   - 5-10 question phrasings per section');
  console.log('   - Source URL and page section for traceability');
  console.log('\nStart the server — the chatbot will now answer from scraped knowledge!\n');

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});