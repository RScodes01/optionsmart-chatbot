/**
 * qaGeneratorService.js
 * Generates structured Q&A pairs locally using page metadata and text parsing
 * to completely avoid LLM API rate limits during scraping.
 */

const logger = require('../utils/logger');

/**
 * Generate 2-3 high-quality Q&A pairs locally from a raw text chunk.
 * Safe and runs instantly with zero API calls.
 *
 * @param {string} title - Page title
 * @param {string} url - Source URL
 * @param {string} chunkText - Raw scraped text segment
 * @returns {Promise<Array<{ question: string, answer: string }>>}
 */
async function generateQAPairs(title, url, chunkText) {
  if (!chunkText || chunkText.trim().length < 50) return [];

  // Extract clean title (remove website branding prefixes/suffixes)
  const cleanTitle = title
    .replace(/OptionSmart\s*\|\s*/gi, '')
    .replace(/\s*\|\s*OptionSmart/gi, '')
    .replace(/—\s*hostname.*/gi, '')
    .trim();

  // Extract the first sentence of the text chunk
  const firstSentence = chunkText
    .split(/[.!?\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 15)[0] || '';

  const qaPairs = [];

  // Q1: Direct query on the page topic
  qaPairs.push({
    question: `What is the details regarding ${cleanTitle}?`,
    answer: chunkText
  });

  // Q2: Conversational query about the topic
  qaPairs.push({
    question: `Tell me about ${cleanTitle} on OptionSmart.`,
    answer: chunkText
  });

  // Q3: Match based on the first key sentence of the paragraph
  if (firstSentence && firstSentence.length < 150) {
    qaPairs.push({
      question: firstSentence.endsWith('?') ? firstSentence : `${firstSentence}`,
      answer: chunkText
    });
  }

  return qaPairs;
}

module.exports = { generateQAPairs };
