/**
 * exportScraped.js
 * Utility script to fetch the current `scraped_knowledge` collection from MongoDB
 * and export it to a JSON file (`server/data/scraped_knowledge.json`) in the codebase.
 *
 * Run with:
 *   node server/scripts/exportScraped.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const fs             = require('fs');
const path           = require('path');

async function main() {
  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName   = process.env.MONGO_DB_NAME || 'optionsmart_chat';

  console.log(`🔗 Connecting to MongoDB at ${mongoUrl}...`);
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);

  console.log('📦 Fetching documents from "scraped_knowledge" collection...');
  const docs = await db.collection('scraped_knowledge').find({}).toArray();

  if (docs.length === 0) {
    console.log('⚠️  No documents found in the "scraped_knowledge" collection.');
    console.log('   To populate it, run: node server/scripts/seedScraped.js');
    await client.close();
    process.exit(0);
  }

  // Strip large embeddings for readability in the JSON file
  const cleanDocs = docs.map(d => {
    const { embedding, answerEmbedding, ...clean } = d;
    return clean;
  });

  const outputPath = path.join(__dirname, '../data/scraped_knowledge.json');
  fs.writeFileSync(outputPath, JSON.stringify(cleanDocs, null, 2), 'utf-8');

  console.log(`\n✅ Success! Exported ${docs.length} documents.`);
  console.log(`📁 File saved to: ${outputPath}\n`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Export failed:', err.message);
  process.exit(1);
});
