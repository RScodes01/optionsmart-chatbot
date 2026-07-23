require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

async function clean() {
  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName   = process.env.MONGO_DB_NAME || 'optionsmart_chat';
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);

  const col = db.collection('faq_documents');
  const docs = await col.find({}).toArray();
  let updatedCount = 0;

  for (const doc of docs) {
    let text = doc.answer || doc.content || '';
    if (/cagr|sharpe|drawdown|nifty 50|45\.3%|2\.11|−20\.8%/i.test(text)) {
      const cleanText = text
        .replace(/45\.3%/g, '')
        .replace(/2\.11/g, '')
        .replace(/−20\.8%/g, '')
        .replace(/0\.52/g, '')
        .replace(/CAGR\s*·?\s*\d*\s*Years?/gi, '')
        .replace(/Sharpe Ratio/gi, '')
        .replace(/Max Drawdown/gi, '')
        .replace(/Beta to NIFTY/gi, '')
        .replace(/vs [-−]?\d+\.?\d*%?\s*NIFTY 50/gi, '')
        .replace(/Low market correlation/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (doc.answer) {
        await col.updateOne({ _id: doc._id }, { $set: { answer: cleanText } });
      } else {
        await col.updateOne({ _id: doc._id }, { $set: { content: cleanText } });
      }
      updatedCount++;
    }
  }

  console.log(`Cleaned ${updatedCount} MongoDB faq_documents containing residual statistics.`);
  await client.close();
}

clean();
