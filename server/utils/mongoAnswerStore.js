/**
 * mongoAnswerStore.js
 * Persists Gemini-generated answers back into faq_documents.
 *
 * Self-learning loop:
 *   Every time Gemini generates an answer, we store it in MongoDB.
 *   Next time someone asks the same (or similar) question, it hits
 *   the DB directly — zero Gemini tokens consumed.
 *
 * Generated docs use type:'generated' so they can be distinguished
 * from hand-curated FAQs and scraped content. They also use a
 * slightly higher similarity threshold in ragService (0.68 vs 0.60).
 */

const { embed }   = require('../services/embeddingService');
const { normalizeQuery } = require('./queryNormalizer');
const logger      = require('./logger');

const COLLECTION  = 'faq_documents';

/**
 * Persist a Gemini-generated QA pair into MongoDB.
 * Uses the normalized question as the document _id so duplicates
 * are safely upserted rather than inserted multiple times.
 *
 * @param {import('mongodb').Db} db
 * @param {string} question   — raw user question
 * @param {string} answer     — Gemini-generated answer
 */
async function storeGeneratedAnswer(db, question, answer) {
  if (!db || !question || !answer) return;

  try {
    const normalized = normalizeQuery(question);
    const docId      = 'gen_' + Buffer.from(normalized.slice(0, 60)).toString('base64url');

    // Generate embedding for the normalized question
    const embedding  = await embed(normalized);

    await db.collection(COLLECTION).updateOne(
      { _id: docId },
      {
        $set: {
          question:  question.trim(),
          answer:    answer.trim(),
          tags:      ['generated'],
          embedding,
          type:      'generated',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    logger.info(`[MongoAnswerStore] Stored generated answer → ${docId}`);
  } catch (err) {
    // Non-fatal: don't break the response if storage fails
    logger.warn(`[MongoAnswerStore] Failed to persist answer: ${err.message}`);
  }
}

module.exports = { storeGeneratedAnswer };
