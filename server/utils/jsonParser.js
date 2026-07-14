const logger = require('./logger');

/**
 * Robustly extracts and parses JSON from text that might contain markdown blocks or leading/trailing commentary.
 * 
 * @param {string} text - The raw text output from the LLM.
 * @param {*} fallback - Optional fallback value if parsing completely fails.
 * @returns {any} parsed JSON object/array.
 */
function parseLLMJson(text, fallback = null) {
  if (!text || typeof text !== 'string') {
    return fallback;
  }

  const trimmed = text.trim();
  
  // 1. Try direct parsing first
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    // 2. Try removing markdown wrapper
    try {
      const stripped = trimmed.replace(/```json|```/g, '').trim();
      return JSON.parse(stripped);
    } catch (err2) {
      // 3. Regex match to extract the first JSON block (object or array)
      const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (err3) {
          logger.error(`[JsonParser] Regex matched JSON block but parsing failed: ${err3.message}. Raw prefix: ${trimmed.slice(0, 200)}`);
        }
      }
      
      logger.error(`[JsonParser] Failed to parse JSON: ${err.message}. Raw prefix: ${trimmed.slice(0, 200)}`);
      
      if (fallback !== null) {
        return fallback;
      }
      throw err;
    }
  }
}

module.exports = { parseLLMJson };
