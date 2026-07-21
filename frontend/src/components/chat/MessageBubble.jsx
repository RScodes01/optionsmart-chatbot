/**
 * MessageBubble.jsx
 * Renders a single chat message (user or bot) with:
 * - Typewriter reveal for new bot messages
 * - Text-to-Speech (audio response reader)
 * - Follow-up suggestion chips
 * - Tier cards (when CARDS: TIERS in response)
 * - Copy + Thumbs Up/Down Feedback
 */

import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { showToast } from '../../store/chatSlice';

// Maps common follow-up chip questions → FAQ IDs for instant MongoDB lookup
const FAQ_CHIP_MAP = {
  'What are the capital tiers and minimum investment?':          'faq_002',
  'What are the algo strategies — Saturn, Venus, and Pluto?':   'faq_005',
  'What is the Market Regime Engine?':                          'faq_004',
  'What risk management safeguards does OptionSmart have?':     'faq_006',
  'How does AI/ML exit intelligence work?':                     'faq_007',
  'Is OptionSmart SEBI regulated and compliant?':               'faq_009',
  'What is the kill switch and how fast does it work?':         'faq_011',
  'How do I get started or sign up with OptionSmart?':          'faq_012',
  'Does OptionSmart have overnight positions?':                 'faq_014',
  'What brokers are supported?':                                'faq_015',
  'Is there a lock-in period or can I withdraw anytime?':       'faq_029',
  'Is my capital safe with OptionSmart?':                       'faq_030',
};

const TIER_DATA = [
  { name: 'Core',          price: '₹9 Lakh',    popular: false, features: ['Non-Directional Strategy access', 'AI/ML exit intelligence', 'Basic risk management'] },
  { name: 'Alpha',         price: '₹25 Lakh',   popular: false, features: ['Everything in Core', 'Increased directional strategies', 'Advanced risk controls'] },
  { name: 'Pro',           price: '₹50 Lakh',   popular: true,  features: ['Everything in Alpha', 'Directional + Non-Directional combo', 'Enhanced risk management', 'Adaptive strategy selection'] },
  { name: 'Elite',         price: '₹1 Crore',   popular: false, features: ['Everything in Pro', 'Custom strategy allocation', 'Auto Delta Risk Management'] },
  { name: 'Institutional', price: '₹5 Crore+',  popular: false, features: ['Full strategy suite', 'Adaptive non-correlated strategies', 'Enterprise-grade solutions'] },
];

function parseResponse(raw = '') {
  const sugMatch = raw.match(/SUGGESTIONS:\s*(.+)/i);
  const chips = sugMatch
    ? sugMatch[1].split('|').map(s => s.trim().replace(/^\[|\]$/g, '')).filter(Boolean).slice(0, 3)
    : [];
  const showTierCards = /CARDS:\s*TIERS/i.test(raw);
  const text = raw.replace(/SUGGESTIONS:.+/i, '').replace(/CARDS:\s*TIERS/i, '').trim();
  return { text, chips, showTierCards };
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  text = text.replace(/`([^`]+)`/g, '<code class="os-inline-code">$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
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

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      i++;
      let code = '';
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code += escapeHTML(lines[i]) + '\n';
        i++;
      }
      html += `<div class="os-code-block"><div class="os-code-header"><span class="os-code-lang">${lang || 'code'}</span><button class="os-code-copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code.trimEnd())}')).then(() => { this.innerText = '✓ Copied'; setTimeout(() => this.innerText = 'Copy', 2000); })">Copy</button></div><pre><code>${code.trimEnd()}</code></pre></div>`;
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      html += '<hr class="os-hr" />';
      i++;
      continue;
    }

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

    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[-| :]+\|$/.test(lines[i + 1]?.trim())) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableHTML = parseTable(tableLines);
      if (tableHTML) { html += tableHTML; continue; }
    }

    if (trimmed.startsWith('> ')) {
      let quote = '';
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quote += inlineFormat(lines[i].trim().slice(2)) + ' ';
        i++;
      }
      html += `<blockquote class="os-blockquote">${quote.trim()}</blockquote>`;
      continue;
    }

    if (/^[-•*]\s/.test(trimmed)) {
      html += '<ul class="os-bubble-ul">';
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        html += `<li>${inlineFormat(lines[i].trim().replace(/^[-•*]\s*/, ''))}</li>`;
        i++;
      }
      html += '</ul>';
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      html += '<ol class="os-bubble-ol">';
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        html += `<li>${inlineFormat(lines[i].trim().replace(/^\d+\.\s*/, ''))}</li>`;
        i++;
      }
      html += '</ol>';
      continue;
    }

    if (!trimmed) { i++; continue; }

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

  const [copied, setCopied]         = useState(false);
  const [liked, setLiked]           = useState(false);
  const [disliked, setDisliked]     = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      dispatch(showToast({ message: '✓ Copied to clipboard', type: 'info' }));
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSpeakToggle() {
    if (!('speechSynthesis' in window)) {
      dispatch(showToast({ message: 'Text-to-speech not supported in this browser.', type: 'info' }));
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/SUGGESTIONS:.+/i, '')
      .replace(/CARDS:\s*TIERS/i, '')
      .replace(/[*#_`~|]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function handleLike() {
    if (liked) {
      setLiked(false);
    } else {
      setLiked(true);
      setDisliked(false);
      dispatch(showToast({ message: 'Thank you for your feedback! 👍', type: 'success' }));
    }
  }

  function handleDislike() {
    if (disliked) {
      setDisliked(false);
    } else {
      setDisliked(true);
      setLiked(false);
      dispatch(showToast({ message: 'Thank you for your feedback! 👎', type: 'info' }));
    }
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

        {showTierCards && !message.streaming && <TierCards />}

        {isBot && !message.streaming && (
          <div className="os-msg-meta">
            {/* Text-to-Speech Audio Button */}
            <button
              className={`os-maction ${isSpeaking ? 'os-maction--speaking' : ''}`}
              onClick={handleSpeakToggle}
              title={isSpeaking ? 'Stop audio' : 'Listen to response'}
              style={{ color: isSpeaking ? '#34d399' : 'var(--os-muted)' }}
            >
              {isSpeaking ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ verticalAlign: 'middle' }}>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              )}
            </button>

            {/* Copy button */}
            <button className="os-maction" onClick={handleCopy} title="Copy response">
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>

            {/* Feedback buttons */}
            <button className="os-maction" onClick={handleLike} title="Good response" style={{ color: liked ? '#10b981' : 'var(--os-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={liked ? "#10b981" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
              </svg>
            </button>
            <button className="os-maction" onClick={handleDislike} title="Bad response" style={{ color: disliked ? '#ef4444' : 'var(--os-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={disliked ? "#ef4444" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm12-3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
              </svg>
            </button>

            <span className="os-ts">{ts}</span>
          </div>
        )}
        {isUser && <div className="os-ts os-ts--user">{ts}</div>}

        {chips.length > 0 && !message.streaming && (
          <div className="os-follow-chips">
            {chips.map((c) => (
              <button key={c} className="os-fchip" onClick={() => onChipClick?.({ q: c, faqId: FAQ_CHIP_MAP[c] || null })}>{c}</button>
            ))}
          </div>
        )}

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
