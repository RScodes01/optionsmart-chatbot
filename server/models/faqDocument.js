/**
 * faqDocument.js — MongoDB collection helper for RAG knowledge base.
 *
 * Collection: faq_documents
 * Schema:
 *   {
 *     _id:       String  (e.g. "faq_001")
 *     question:  String
 *     answer:    String
 *     tags:      String[]
 *     embedding: Number[]   ← 384-dim (local MiniLM) or 1536-dim (OpenAI)
 *     updatedAt: Date
 *   }
 *
 * Works with both local MongoDB (localhost:27017) and MongoDB Atlas.
 * Uses manual cosine similarity computation inside the aggregation pipeline
 * (no Atlas Vector Search required).
 */

const COLLECTION = 'faq_documents';

/**
 * Get the faq_documents collection from a db handle.
 * @param {import('mongodb').Db} db
 */
function col(db) {
  return db.collection(COLLECTION);
}

/**
 * Upsert a single FAQ document with its embedding into MongoDB.
 * Uses _id as the document identifier so re-running is safe (idempotent).
 *
 * @param {import('mongodb').Db} db
 * @param {{ id: string, question: string, answer: string, tags: string[], embedding: number[] }} doc
 */
async function upsertDoc(db, doc) {
  await col(db).updateOne(
    { _id: doc.id },
    {
      $set: {
        question:  doc.question,
        answer:    doc.answer,
        tags:      doc.tags || [],
        embedding: doc.embedding,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Retrieve all FAQ documents (with embeddings).
 * Used by the in-process cosine scoring path.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<Array<{ _id: string, question: string, answer: string, embedding: number[] }>>}
 */
async function getAllDocs(db) {
  return col(db).find({}, { projection: { question: 1, answer: 1, embedding: 1 } }).toArray();
}

/**
 * Return the total number of indexed documents.
 * @param {import('mongodb').Db} db
 */
async function count(db) {
  return col(db).countDocuments();
}

/**
 * Create a plain index on the _id field (already the primary key) and a
 * text index on question+answer for potential keyword fallback.
 * Safe to call multiple times — MongoDB ignores duplicate index creation.
 *
 * @param {import('mongodb').Db} db
 */
async function createIndexes(db) {
  await col(db).createIndex({ tags: 1 });
  await col(db).createIndex(
    { question: 'text', answer: 'text' },
    { name: 'faq_text_search' }
  );
}

module.exports = { upsertDoc, getAllDocs, count, createIndexes };
