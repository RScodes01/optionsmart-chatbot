/**
 * MessageBubble.jsx
 * Renders a single chat message (user or bot) with:
 * - Typewriter reveal for new bot messages
 * - Follow-up suggestion chips
 * - Tier cards (when CARDS: TIERS in response)
 * - Copy button
 */

import React, { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { showToast } from '../../store/chatSlice';

// ─────────────────────────────────────────
// Tier data (mirrored from HTML)
// ─────────────────────────────────────────
const TIER_DATA = [
  { name: 'Core',          price: '₹9 Lakh',    popular: false, features: ['Non-Directional Strategy access', 'AI/ML exit intelligence', 'Basic risk management'] },
  { name: 'Alpha',         price: '₹25 Lakh',   popular: false, features: ['Everything in Core', 'Increased directional strategies', 'Advanced risk controls'] },
  { name: 'Pro',           price: '₹50 Lakh',   popular: true,  features: ['Everything in Alpha', 'Directional + Non-Directional combo', 'Enhanced risk management', 'Adaptive strategy selection'] },
  { name: 'Elite',         price: '₹1 Crore',   popular: false, features: ['Everything in Pro', 'Custom strategy allocation', 'Auto Delta Risk Management'] },
  { name: 'Institutional', price: '₹5 Crore+',  popular: false, features: ['Full strategy suite', 'Adaptive non-correlated strategies', 'Enterprise-grade solutions'] },
];

// ─────────────────────────────────────────
// Parse SUGGESTIONS + CARDS from bot text
// ─────────────────────────────────────────
function parseResponse(raw = '') {
  const sugMatch = raw.match(/SUGGESTIONS:\s*(.+)/i);
  const chips = sugMatch
    ? sugMatch[1].split('|').map(s => s.trim().replace(/^\[|\]$/g, '')).filter(Boolean).slice(0, 3)
    : [];
  const showTierCards = /CARDS:\s*TIERS/i.test(raw);
  const text = raw.replace(/SUGGESTIONS:.+/i, '').replace(/CARDS:\s*TIERS/i, '').trim();
  return { text, chips, showTierCards };
}

// ─────────────────────────────────────────
// Full Markdown → safe HTML renderer
// Supports: tables, ordered/unordered lists,
// code blocks, headings, bold, italic,
// horizontal rules, blockquotes, inline code
// ─────────────────────────────────────────
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  // Inline code (must come before bold/italic to avoid conflicts)
  text = text.replace(/`([^`]+)`/g, '<code class="os-inline-code">$1</code>');
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Highlight ₹ amounts and percentages
  text = text.replace(/(₹[\d,]+(?:\.\d+)?(?:\s?(?:Lakh|Crore|L|Cr|K))?)/g, '<span class="os-highlight-price">$1</span>');
  text = text.replace(/(\+[\d.]+%|[-][\d.]+%)/g, (m) => {
    const cls = m.startsWith('+') ? 'os-pct-up' : 'os-pct-down';
    return `<span class="${cls}">${m}</span>`;
  });
  return text;
}

function parseTable(lines) {
  const rows = lines.filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) return null;

  const headerCells = rows[0].trim().slice(1, -1).split('|').map(c => c.trim());
  // rows[1] is the separator line (---|---|---)
  const bodyRows = rows.slice(2);

  let html = '<div class="os-table-wrap"><table class="os-table"><thead><tr>';
  for (const cell of headerCells) {
    html += `<th>${inlineFormat(cell)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of bodyRows) {
    const cells = row.trim().slice(1, -1).split('|').map(c => c.trim());
    html += '<tr>';
    for (const cell of cells) {
      html += `<td>${inlineFormat(cell)}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

function formatHTML(text) {
  const lines  = text.split('\n');
  let html     = '';
  let i        = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Fenced code block ────────────────────────────────────────────
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      i++;
      let code = '';
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code += escapeHTML(lines[i]) + '\n';
        i++;
      }
      html += `<div class="os-code-block"><div class="os-code-lang">${lang || 'code'}</div><pre><code>${code.trimEnd()}</code></pre></div>`;
      i++;
      continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────
    if (/^[-*_]{3,}$/.test(trimmed)) {
      html += '<hr class="os-hr" />';
      i++;
      continue;
    }

    // ── Headings ─────────────────────────────────────────────────────
    if (/^###\s/.test(trimmed)) {
      html += `<h4 class="os-bubble-h4">${inlineFormat(trimmed.replace(/^###\s/, ''))}</h4>`;
      i++; continue;
    }
    if (/^##\s/.test(trimmed)) {
      html += `<h3 class="os-bubble-h3">${inlineFormat(trimmed.replace(/^##\s/, ''))}</h3>`;
      i++; continue;
    }
    if (/^#\s/.test(trimmed)) {
      html += `<h2 class="os-bubble-h2">${inlineFormat(trimmed.replace(/^#\s/, ''))}</h2>`;
      i++; continue;
    }

    // ── Markdown table (detect block) ─────────────────────────────────
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[-| :]+\|$/.test(lines[i + 1]?.trim())) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableHTML = parseTable(tableLines);
      if (tableHTML) { html += tableHTML; continue; }
    }

    // ── Blockquote ───────────────────────────────────────────────────
    if (trimmed.startsWith('> ')) {
      let quote = '';
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quote += inlineFormat(lines[i].trim().slice(2)) + ' ';
        i++;
      }
      html += `<blockquote class="os-blockquote">${quote.trim()}</blockquote>`;
      continue;
    }

    // ── Unordered list ───────────────────────────────────────────────
    if (/^[-•*]\s/.test(trimmed)) {
      html += '<ul class="os-bubble-ul">';
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        html += `<li>${inlineFormat(lines[i].trim().replace(/^[-•*]\s*/, ''))}</li>`;
        i++;
      }
      html += '</ul>';
      continue;
    }

    // ── Ordered list ─────────────────────────────────────────────────
    if (/^\d+\.\s/.test(trimmed)) {
      html += '<ol class="os-bubble-ol">';
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        html += `<li>${inlineFormat(lines[i].trim().replace(/^\d+\.\s*/, ''))}</li>`;
        i++;
      }
      html += '</ol>';
      continue;
    }

    // ── Empty line ───────────────────────────────────────────────────
    if (!trimmed) { i++; continue; }

    // ── Regular paragraph ─────────────────────────────────────────────
    html += `<p class="os-bubble-p">${inlineFormat(trimmed)}</p>`;
    i++;
  }

  return html;
}


function TierCards() {
  return (
    <div className="os-tier-cards">
      {TIER_DATA.map((t) => (
        <div key={t.name} className={`os-tier-card${t.popular ? ' os-tier-card--popular' : ''}`}>
          {t.popular && <div className="os-tier-badge">Most Popular</div>}
          <div className="os-tier-head">
            <span className="os-tier-name">{t.name}</span>
            <span className="os-tier-price">{t.price}</span>
          </div>
          <ul className="os-tier-features">
            {t.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────
export default function MessageBubble({ message, onChipClick, onAdvisorClick }) {
  const dispatch = useDispatch();
  const isBot  = message.role === 'assistant';
  const isUser = message.role === 'user';

  const { text, chips, showTierCards } = useMemo(
    () => (isBot ? parseResponse(message.content) : { text: message.content, chips: [], showTierCards: false }),
    [message.content, isBot]
  );

  const formattedHTML = useMemo(() => (isBot ? formatHTML(text) : null), [text, isBot]);

  const ts = useMemo(() => {
    const d = message.ts ? new Date(message.ts) : new Date();
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }, [message.ts]);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() =>
      dispatch(showToast({ message: '✓ Copied to clipboard', type: 'info' }))
    );
  }

  const BUYING_INTENT_RX = /\b(pricing|price|cost|how much|minimum capital|minimum investment|get started|how to start|onboard|sign up|signup|demo|book a call|talk to (someone|advisor|sales|team)|invest|deposit|open an account)\b/i;
  const showAdvisorCTA = isBot && BUYING_INTENT_RX.test(message.content);

  return (
    <div className={`os-msg os-msg--${isBot ? 'bot' : 'user'}`}>
      <div className={`os-av os-av--${isBot ? 'bot' : 'usr'}`}>{isBot ? 'OS' : 'You'}</div>

      <div className="os-msg-body">
        {isBot ? (
          <div className="os-bubble os-bubble--bot">
            {message.streaming ? (
              <span dangerouslySetInnerHTML={{ __html: formattedHTML || text }} />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: formattedHTML }} />
            )}
            {message.streaming && <span className="os-cursor">▋</span>}
          </div>
        ) : (
          <div className="os-bubble os-bubble--user">{text}</div>
        )}

        {/* Tier Cards */}
        {showTierCards && !message.streaming && <TierCards />}

        {/* Copy + timestamp */}
        {isBot && !message.streaming && (
          <div className="os-msg-meta">
            <button className="os-maction" onClick={handleCopy} title="Copy">Copy</button>
            <span className="os-ts">{ts}</span>
            {message.source === 'cache' && (
              <span className="os-cache-badge" title="Served from Redis cache">⚡ cached</span>
            )}
          </div>
        )}
        {isUser && <div className="os-ts os-ts--user">{ts}</div>}

        {/* Follow-up chips */}
        {chips.length > 0 && !message.streaming && (
          <div className="os-follow-chips">
            {chips.map((c) => (
              <button key={c} className="os-fchip" onClick={() => onChipClick?.(c)}>{c}</button>
            ))}
          </div>
        )}

        {/* Advisor CTA */}
        {showAdvisorCTA && !message.streaming && (
          <div className="os-inline-cta">
            <p className="os-inline-cta-text">
              Sounds like you'd like more detail — happy to connect you with an advisor.
            </p>
            <button className="os-inline-cta-btn" onClick={onAdvisorClick}>
              Talk to an advisor →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
