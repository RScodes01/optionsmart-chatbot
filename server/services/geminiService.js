/**
 * geminiService.js
 * Gemini wrapper for text generation using the Gemini REST API.
 * generateText — full response (used by coach, insights, market, queryNormalizer)
 * streamText   — async generator yielding real SSE chunks from Gemini (used by chat route)
 */

const axios = require('axios');
const logger = require('../utils/logger');

function getApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!key) throw new Error('No Gemini API key configured. Set GEMINI_API_KEY in the server .env file.');
  return key;
}

async function generateText(prompt, options = {}) {
  const apiKey = getApiKey();
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await axios.post(url, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens || 1024,
      },
    }, { timeout: 120000 });

    const text = response?.data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return text.trim();
  } catch (err) {
    logger.error(`[Gemini] Generation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Real SSE streaming from Gemini — yields text chunks as they arrive.
 * Use with: for await (const chunk of streamText(prompt, opts)) { ... }
 */
async function* streamText(prompt, options = {}) {
  const apiKey = getApiKey();
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const response = await axios.post(url, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens || 1024,
    },
  }, { responseType: 'stream', timeout: 120000 });

  let buf = '';
  for await (const raw of response.data) {
    buf += raw.toString();
    const lines = buf.split('\n');
    buf = lines.pop(); // keep any incomplete last line
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const obj = JSON.parse(json);
        const text = obj?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (text) yield text;
      } catch { /* skip malformed SSE lines */ }
    }
  }
  // flush any remaining buffer
  if (buf.startsWith('data:')) {
    try {
      const obj = JSON.parse(buf.slice(5).trim());
      const text = obj?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (text) yield text;
    } catch { }
  }
}

module.exports = { generateText, streamText };
