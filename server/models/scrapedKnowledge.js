/**
 * scrapedKnowledge.js
 * MongoDB model for the `scraped_knowledge` collection.
 * Dual-embedding: question embedding + answer embedding for max match coverage.
 * When user asks something, we compare against BOTH vectors and take the max score.
 */

const COLLECTION = 'scraped_knowledge';

async function createIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex({ sourceUrl: 1 });
  await col.createIndex({ section: 'text', content: 'text' });
}

async function upsertDoc(db, doc) {
  await db.collection(COLLECTION).updateOne(
    { _id: doc.id },
    {
      $set: {
        sourceUrl:       doc.sourceUrl,
        pageTitle:       doc.pageTitle,
        section:         doc.section,
        content:         doc.content,
        questions:       doc.questions,
        tags:            doc.tags || [],
        embedding:       doc.embedding,        // vector of primary question text
        answerEmbedding: doc.answerEmbedding,  // vector of answer/content text
        updatedAt:       new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

async function getAllDocs(db) {
  return db.collection(COLLECTION).find(
    {},
    { projection: { _id: 1, section: 1, content: 1, questions: 1, sourceUrl: 1, embedding: 1, answerEmbedding: 1, tags: 1 } }
  ).toArray();
}

async function count(db)    { return db.collection(COLLECTION).countDocuments(); }
async function clearAll(db) { const r = await db.collection(COLLECTION).deleteMany({}); return r.deletedCount; }

module.exports = { createIndexes, upsertDoc, getAllDocs, count, clearAll, COLLECTION };