/**
 * queryNormalizer.js
 * Cleans user questions without altering their natural grammatical structure.
 * Stuffs keywords/synonyms should be avoided because sentence transformer models
 * (like MiniLM) rely on word order and grammar to match semantic meaning.
 */

const FILLER_PATTERNS = [
  /\b(can you |please |could you |i want to know |tell me |explain |what is |what are |how does |how do |do you |i need to know about |i was wondering |just |basically |kindly )\b/gi,
  /\?+$/g,          // trailing question marks
  /\s{2,}/g,        // multiple spaces → single space
];

const CLEANUPS = [
  [/\bmin\b/gi, 'minimum'],
  [/\bmax\b/gi, 'maximum'],
  [/\balgo\b/gi, 'algorithmic'],
  [/\balgos\b/gi, 'algorithmic strategies'],
  [/\bsebi register\b/gi, 'sebi registration'],
  [/\bstop loss\b/gi, 'stop-loss'],
];

function normalizeQuery(question) {
  if (!question || typeof question !== 'string') return '';

  let q = question.toLowerCase().trim();

  // Expand common short abbreviations
  for (const [pattern, replacement] of CLEANUPS) {
    q = q.replace(pattern, replacement);
  }

  // Remove trailing punctuation and extra spaces while preserving grammatical structure
  q = q.replace(/[?!.,;:]+$/g, '').replace(/\s{2,}/g, ' ').trim();

  return q;
}

module.exports = { normalizeQuery };