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

  const curatedDocs = faqs.map(f => ({ ...f, type: 'curated' }));

  // ── Alias documents: common rephrasing of key FAQs ────────────────────
  // Each alias points to the same answer as a core FAQ.
  // This massively expands the surface area of what MongoDB can answer directly.
  const ALIASES = [
    // faq_001: Capital tiers
    { id: 'alias_001_a', question: 'how much money do I need to start algo trading?', answer: faqs.find(f=>f.id==='faq_001')?.answer, type: 'curated' },
    { id: 'alias_001_b', question: 'minimum investment for OptionSmart',               answer: faqs.find(f=>f.id==='faq_001')?.answer, type: 'curated' },
    { id: 'alias_001_c', question: 'what is the entry level capital requirement?',      answer: faqs.find(f=>f.id==='faq_001')?.answer, type: 'curated' },
    { id: 'alias_001_d', question: 'starting amount for optionsmart algo plan',         answer: faqs.find(f=>f.id==='faq_001')?.answer, type: 'curated' },
    // faq_006: Risk management
    { id: 'alias_006_a', question: 'what happens if algo loses too much money?',        answer: faqs.find(f=>f.id==='faq_006')?.answer, type: 'curated' },
    { id: 'alias_006_b', question: 'how does optionsmart protect my capital?',          answer: faqs.find(f=>f.id==='faq_006')?.answer, type: 'curated' },
    { id: 'alias_006_c', question: 'what safeguards are in place for losses?',          answer: faqs.find(f=>f.id==='faq_006')?.answer, type: 'curated' },
    // faq_011: Kill switch
    { id: 'alias_011_a', question: 'how quickly can positions be closed in emergency?', answer: faqs.find(f=>f.id==='faq_011')?.answer, type: 'curated' },
    { id: 'alias_011_b', question: 'emergency stop for all trades',                     answer: faqs.find(f=>f.id==='faq_011')?.answer, type: 'curated' },
    { id: 'alias_011_c', question: 'can I instantly stop all algo trades?',             answer: faqs.find(f=>f.id==='faq_011')?.answer, type: 'curated' },
    // faq_029: Withdraw
    { id: 'alias_029_a', question: 'can I withdraw my money anytime?',                  answer: faqs.find(f=>f.id==='faq_029')?.answer, type: 'curated' },
    { id: 'alias_029_b', question: 'is there a lock in period for optionsmart?',        answer: faqs.find(f=>f.id==='faq_029')?.answer, type: 'curated' },
    { id: 'alias_029_c', question: 'how long is capital locked with optionsmart?',      answer: faqs.find(f=>f.id==='faq_029')?.answer, type: 'curated' },
    // faq_030: Capital safety
    { id: 'alias_030_a', question: 'is my money safe with optionsmart?',                answer: faqs.find(f=>f.id==='faq_030')?.answer, type: 'curated' },
    { id: 'alias_030_b', question: 'who holds my investment capital?',                  answer: faqs.find(f=>f.id==='faq_030')?.answer, type: 'curated' },
    { id: 'alias_030_c', question: 'does optionsmart hold my funds?',                   answer: faqs.find(f=>f.id==='faq_030')?.answer, type: 'curated' },
    // faq_009: SEBI compliance
    { id: 'alias_009_a', question: 'is optionsmart legal in india?',                    answer: faqs.find(f=>f.id==='faq_009')?.answer, type: 'curated' },
    { id: 'alias_009_b', question: 'is this SEBI approved algo trading?',               answer: faqs.find(f=>f.id==='faq_009')?.answer, type: 'curated' },
    { id: 'alias_009_c', question: 'sebi registered algo platform india',               answer: faqs.find(f=>f.id==='faq_009')?.answer, type: 'curated' },
    { id: 'alias_009_d', question: 'what is sebi registration?',                        answer: faqs.find(f=>f.id==='faq_009')?.answer, type: 'curated' },
    // faq_012: Getting started
    { id: 'alias_012_a', question: 'how do I get started with optionsmart?',            answer: faqs.find(f=>f.id==='faq_012')?.answer, type: 'curated' },
    { id: 'alias_012_b', question: 'how do I sign up for algo trading?',                answer: faqs.find(f=>f.id==='faq_012')?.answer, type: 'curated' },
    { id: 'alias_012_c', question: 'what is the onboarding process?',                   answer: faqs.find(f=>f.id==='faq_012')?.answer, type: 'curated' },
    { id: 'alias_012_d', question: 'how to get started onboarding',                     answer: faqs.find(f=>f.id==='faq_012')?.answer, type: 'curated' },
    { id: 'alias_012_e', question: 'how to start onboarding',                           answer: faqs.find(f=>f.id==='faq_012')?.answer, type: 'curated' },
    // faq_014: Overnight risk
    { id: 'alias_014_a', question: 'does optionsmart keep positions overnight?',        answer: faqs.find(f=>f.id==='faq_014')?.answer, type: 'curated' },
    { id: 'alias_014_b', question: 'are there any open positions after market close?',  answer: faqs.find(f=>f.id==='faq_014')?.answer, type: 'curated' },
    // faq_003: Algos run
    { id: 'alias_003_a', question: 'what algos do you run?',                            answer: faqs.find(f=>f.id==='faq_003')?.answer, type: 'curated' },
    { id: 'alias_003_b', question: 'what strategies do you run?',                       answer: faqs.find(f=>f.id==='faq_003')?.answer, type: 'curated' },
    { id: 'alias_003_c', question: 'list of algo strategies',                           answer: faqs.find(f=>f.id==='faq_003')?.answer, type: 'curated' },
    { id: 'alias_003_d', question: 'how do algo strategies work?',                       answer: faqs.find(f=>f.id==='faq_003')?.answer, type: 'curated' },
  ].filter(a => a.answer); // filter out any aliases where source FAQ wasn't found

  const allDocs = [...curatedDocs, ...ALIASES];
  console.log('Adding ' + ALIASES.length + ' alias documents for extended phrase coverage.');
  await ragService.indexFAQs(db, allDocs);

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
