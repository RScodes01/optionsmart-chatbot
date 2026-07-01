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
// Markdown → safe HTML (no external lib)
// ─────────────────────────────────────────
function formatHTML(text) {
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  const lines = text.split('\n');
  let html = '', inList = false;
  for (let line of lines) {
    line = line.trim();
    if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (/^#{1,3}\s/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 class="os-bubble-h3">${line.replace(/^#{1,3}\s/, '')}</h3>`;
      continue;
    }
    if (/^[-•]\s/.test(line)) {
      if (!inList) { html += '<ul class="os-bubble-ul">'; inList = true; }
      html += `<li>${line.replace(/^[-•]\s*/, '')}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p class="os-bubble-p">${line}</p>`;
  }
  if (inList) html += '</ul>';
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
