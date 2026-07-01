/**
 * ChatWindow.jsx — Main chat message area with welcome screen
 */

import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import MessageBubble from './MessageBubble';
import { selectCurrentMessages } from '../../store/chatSlice';

const WELCOME_CHIPS = [
  { label: 'What is OptionSmart?',    q: 'What is OptionSmart and how does it work?' },
  { label: 'Capital tiers',           q: 'What are the capital tiers and minimum investment?' },
  { label: 'Market Regime Engine',    q: 'What is the Market Regime Engine?' },
  { label: 'Algo strategies',         q: 'Explain the Saturn, Venus, and Pluto strategies' },
  { label: 'Risk management',         q: 'What risk management safeguards does OptionSmart have?' },
  { label: 'About the founders',      q: 'Who are the founders of OptionSmart?' },
];

function TypingIndicator() {
  return (
    <div className="os-typing-row">
      <div className="os-av os-av--bot">OS</div>
      <div className="os-typing-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}

function WelcomeScreen({ onChipClick }) {
  return (
    <div className="os-welcome">
      <div className="os-welcome-icon">OS</div>
      <h2 className="os-welcome-h2">OptionSmart AI Assistant</h2>
      <p className="os-welcome-p">
        Ask me anything about the OptionSmart platform — capital tiers, algo strategies, the Market
        Regime Engine, risk controls, SEBI compliance, or how to get started.
      </p>
      <div className="os-welcome-chips">
        {WELCOME_CHIPS.map(({ label, q }) => (
          <button key={label} className="os-wchip" onClick={() => onChipClick(q)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatWindow({ onChipClick, onAdvisorClick }) {
  const messages   = useSelector(selectCurrentMessages);
  const isStreaming = useSelector((s) => s.chat.isStreaming);
  const bottomRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const hasMessages = messages.length > 0;

  return (
    <div className="os-messages" id="os-messages">
      {!hasMessages && <WelcomeScreen onChipClick={onChipClick} />}

      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          message={msg}
          onChipClick={onChipClick}
          onAdvisorClick={onAdvisorClick}
        />
      ))}

      {/* Show typing indicator only when streaming hasn't started yet */}
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <TypingIndicator />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
