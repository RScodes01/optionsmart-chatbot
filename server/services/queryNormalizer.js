/**
 * queryNormalizer.js
 * Lightweight query distillation for ambiguous RAG questions.
 *
 * Uses Anthropic's Claude Haiku for a fast, low-latency extraction step:
 *   "Extract the core question in under 12 words, no preamble, no quotes:\n" + userText
 *
 * This is intentionally fail-open: any error falls back to the original text.
 */

const logger = require('../utils/logger');
const { generateText } = require('./geminiService');

async function distillQuery(userText) {
  try {
    const prompt = 'Extract the core question in under 12 words, no preamble, no quotes:\n' + userText;
    const text = await generateText(prompt, { maxTokens: 30, temperature: 0.1 });
    return text || userText;
  } catch (err) {
    logger.warn(`[QueryNormalizer] Distillation failed, using original query: ${err.message}`);
    return userText;
  }
}

module.exports = { distillQuery };
