/**
 * InputBar.jsx — Chat input with voice, send button, rotating placeholders
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';

const PLACEHOLDERS = [
  'Ask about OptionSmart platform, strategies, risk management…',
  'What is the Market Regime Engine?',
  'How does the kill switch work?',
  'What capital do I need to start?',
  'Tell me about Saturn, Venus & Pluto strategies…',
  'How does AI exit intelligence decide when to exit?',
];

const PLACEHOLDERS_HI = [
  'OptionSmart प्लेटफ़ॉर्म, स्ट्रेटजी, रिस्क मैनेजमेंट के बारे में पूछें…',
  'मार्केट रिजीम इंजन क्या है?',
  'किल स्विच कैसे काम करता है?',
  'शुरू करने के लिए कितनी पूंजी चाहिए?',
];

export default function InputBar({ onSend, disabled }) {
  const lang = useSelector((s) => s.chat.lang);
  const [value, setValue] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const taRef = useRef(null);
  const recogRef = useRef(null);

  const placeholders = lang === 'hi' ? PLACEHOLDERS_HI : PLACEHOLDERS;

  // Rotate placeholder every 4s when not focused/typing
  useEffect(() => {
    const id = setInterval(() => {
      if (document.activeElement !== taRef.current && !value) {
        setPhIdx((i) => (i + 1) % placeholders.length);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [value, placeholders.length]);

  // Auto-resize textarea
  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 110) + 'px';
  }

  function handleInput(e) {
    setValue(e.target.value);
    autoResize();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue('');
    if (taRef.current) { taRef.current.style.height = 'auto'; }
  }

  // Voice input
  const initVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      setValue(txt);
      setTimeout(autoResize, 0);
      setIsListening(false);
    };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    return r;
  }, [lang]);

  function toggleVoice() {
    if (isListening) {
      recogRef.current?.stop();
      setIsListening(false);
      return;
    }
    if (!recogRef.current) recogRef.current = initVoice();
    if (!recogRef.current) return;
    recogRef.current.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    try {
      recogRef.current.start();
      setIsListening(true);
    } catch {}
  }

  return (
    <div className="os-input-area">
      <div className="os-input-wrap">
        {/* Voice button */}
        <button
          className={`os-voice-btn${isListening ? ' os-voice-btn--on' : ''}`}
          onClick={toggleVoice}
          title={isListening ? 'Stop recording' : 'Voice input'}
          type="button"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>
        </button>

        <textarea
          ref={taRef}
          className="os-textarea"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholders[phIdx]}
          rows={1}
          disabled={disabled}
        />

        <button
          className="os-send-btn"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          title="Send"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <p className="os-input-hint">
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
