/**
 * answerFramer.js
 * Formats database direct hits (FAQs and scraped knowledge) to match the
 * official OptionSmart design and UI expectations (conciseness, markdown tables,
 * suggestions chips, and action cards) with ZERO API cost.
 */

const CONTACT_INFO = require('../config/contact');

const SUGGESTION_MAP = {
  tiers: 'What is the Core tier? | Can I withdraw anytime? | Is my capital safe?',
  strategies: 'How does Saturn work? | What is Pluto strategy? | What is the MTM cap?',
  risk: 'What is the MTM cap? | Is OptionSmart SEBI compliant? | What is the kill switch?',
  onboarding: 'How do I start onboarding? | Which brokers are supported? | What is the minimum capital?',
  default: 'How do strategies work? | What is the minimum capital? | Is OptionSmart SEBI compliant?'
};

/**
 * Dynamically frames a DB retrieved document into a premium formatted chat response.
 * 
 * @param {Object} doc - The matched document from faq_documents or scraped_knowledge
 * @param {string} source - 'faq' or 'scraped' or 'text_search'
 * @returns {string} Fully formatted response with headings, tags, suggestions and cards
 */
function frameAnswer(doc, source) {
  if (!doc || (!doc.answer && !doc.content)) return '';

  let formatted = '';
  const answerContent = doc.answer || doc.content || '';

  // ── 1. Heading structure ──────────────────────────────────────────────────
  if (source === 'scraped' || doc.type === 'scraped') {
    // Clean up title and header for scraped content
    const title = doc.pageTitle || 'OptionSmart Knowledge Base';
    const section = doc.section || 'General Information';
    formatted += `## ${section}\n*Source: ${title}*\n\n`;
    
    // Clean content of common web scraping artifacts and performance statistics
    let cleanContent = answerContent
      .replace(/Explore Strategy FrameworkView GoAlgo Platform ↗/gi, '')
      .replace(/\d+\s*Strategy Engines\s*\d+,\d+\+Users\s*\d+\.\d+%Uptime/gi, '')
      .replace(/Live Market ActivityNIFTY Options Flow.*Active/gi, '')
      .replace(/\d+\.?\d*%\s*(CAGR|Return|ROI|Drawdown|Win Rate|Yield|Profit)[^\n.]*/gi, '')
      .replace(/(CAGR|Sharpe Ratio|Max Drawdown|Beta to NIFTY)[^\n.]*/gi, '')
      .replace(/45\.3%|2\.11|−20\.8%|0\.52 Beta/gi, '')
      .replace(/vs \d+\.?\d*% NIFTY 50/gi, '')
      .trim();

    // Clean up run-on newlines or single short words on newlines
    let lines = cleanContent.split('\n');
    let formattedLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // If a line is short and followed by content, make it a heading or bold
      if (line.length < 40 && i < lines.length - 1 && lines[i+1].trim().length > 40 && !line.startsWith('-') && !line.startsWith('*')) {
        formattedLines.push(`### ${line}`);
      } else {
        formattedLines.push(line);
      }
    }
    formatted += formattedLines.join('\n\n');

    // Add source URL if present
    if (doc.sourceUrl) {
      formatted += `\n\n*Read more at the official source:* [${doc.sourceUrl}](${doc.sourceUrl})`;
    }
  } else {
    // Curated FAQ — Prepend the question as a clear, premium heading
    if (doc.question) {
      formatted += `## ${doc.question}\n\n`;
    }
    // Format contact numbers / lines in blockquotes for premium highlighted presentation
    let lines = answerContent.split('\n');
    lines = lines.map(line => {
      const trimmedLine = line.trim();
      if ((trimmedLine.includes(CONTACT_INFO.phoneDisplay) || trimmedLine.includes(CONTACT_INFO.phoneNumber) || trimmedLine.includes(CONTACT_INFO.email)) && !trimmedLine.startsWith('>')) {
        return `> ${line}`;
      }
      return line;
    });
    formatted += lines.join('\n');
  }

  // ── 2. Attach action cards if explaining tiers ────────────────────────────
  const lowerText = formatted.toLowerCase();
  const hasTiers = lowerText.includes('core') && lowerText.includes('alpha') && lowerText.includes('pro');
  if (hasTiers && !formatted.includes('CARDS: TIERS')) {
    formatted += '\n\nCARDS: TIERS';
  }

  // ── 3. Append dynamic SUGGESTIONS chips ──────────────────────────────────
  const tags = Array.isArray(doc.tags) ? doc.tags.map(t => t.toLowerCase()) : [];
  let suggestionCategory = 'default';

  if (tags.some(t => t.includes('tier') || t.includes('capital') || t.includes('pricing') || t.includes('fee') || t.includes('cost'))) {
    suggestionCategory = 'tiers';
  } else if (tags.some(t => t.includes('strategy') || t.includes('saturn') || t.includes('venus') || t.includes('pluto') || t.includes('regime') || t.includes('algo'))) {
    suggestionCategory = 'strategies';
  } else if (tags.some(t => t.includes('risk') || t.includes('safe') || t.includes('sebi') || t.includes('compliant') || t.includes('legal') || t.includes('limit') || t.includes('switch') || t.includes('drawdown'))) {
    suggestionCategory = 'risk';
  } else if (tags.some(t => t.includes('onboard') || t.includes('start') || t.includes('register') || t.includes('broker') || t.includes('zerodha') || t.includes('connect'))) {
    suggestionCategory = 'onboarding';
  }

  const suggestions = SUGGESTION_MAP[suggestionCategory];
  if (!formatted.includes('SUGGESTIONS:')) {
    formatted += `\n\nSUGGESTIONS: ${suggestions}`;
  }

  return formatted;
}

module.exports = { frameAnswer };
