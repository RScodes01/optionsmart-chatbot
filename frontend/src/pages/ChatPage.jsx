/**
 * ChatPage.jsx — Full-page chat route (/chat)
 * Orchestrates all chat sub-components.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';

import ChatSidebar   from '../components/chat/ChatSidebar';
import ChatWindow    from '../components/chat/ChatWindow';
import InputBar      from '../components/chat/InputBar';
import MorningCoach  from '../components/chat/MorningCoach';
import TradeJournal  from '../components/chat/TradeJournal';
import LeadModal     from '../components/chat/LeadModal';
import FaqHub        from '../components/chat/FaqHub';

import { useChatStream } from '../hooks/useChatStream';
import { useFaqLookup }  from '../hooks/useFaqLookup';
import {
  setLang, startNewSession, createSession,
  fetchZerodhaStatus, fetchMarketData,
  showToast, clearToast,
} from '../store/chatSlice';

import "../components/chat/chat.css";

// ── Toast component ──────────────────────────────────
function Toast() {
  const dispatch = useDispatch();
  const toast    = useSelector(s => s.chat.toast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => dispatch(clearToast()), 2800);
    return () => clearTimeout(id);
  }, [toast, dispatch]);

  if (!toast) return null;
  return (
    <div className={`os-toast os-toast--${toast.type} os-toast--show`}>
      {toast.message}
    </div>
  );
}

// ── Header ───────────────────────────────────────────
function ChatHeader({ onMenuToggle, onCoach, onFaq, onExport }) {
  return (
    <header className="os-header">
      <button className="os-menu-btn" onClick={onMenuToggle}>☰</button>

      <div className="os-logo-area">
        <div className="os-logo-icon">OS</div>
        <div>
          <div className="os-logo-name">OptionSmart</div>
          <div className="os-logo-sub">AI Assistant</div>
        </div>
      </div>

      <div className="os-header-pills">
        <div className="os-hpill"><div className="os-live-dot" /> Live</div>
        <div className="os-hpill">26 Algo Engines</div>
        <div className="os-hpill">1,300+ Partners</div>
        <div className="os-hpill">99.9% Uptime</div>
      </div>

      <div className="os-header-actions">
        <button className="os-hbtn" onClick={onFaq}>🔍 Browse FAQs</button>
        <button className="os-hbtn os-hbtn--coach" onClick={onCoach}>☀ Morning Coach</button>
        <button className="os-hbtn" onClick={onExport}>↓ Export</button>
      </div>
    </header>
  );
}

// ── Sticky CTA bar ────────────────────────────────────
function CtaBar({ onTalkAdvisor, onDismiss }) {
  return (
    <div className="os-cta-bar">
      <span className="os-cta-bar-text">
        📈 Ready to explore OptionSmart? Talk to an advisor today.
      </span>
      <div className="os-cta-bar-actions">
        <button className="os-cta-bar-btn" onClick={onTalkAdvisor}>Talk to an advisor →</button>
        <button className="os-cta-bar-dismiss" onClick={onDismiss}>✕</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────
export default function ChatPage() {
  const dispatch    = useDispatch();
  const { sendMessage, isStreaming } = useChatStream();
  const { sendFaqMessage, isFaqLoading } = useFaqLookup();

  const sessions         = useSelector(s => s.chat.sessions);
  const currentSessionId = useSelector(s => s.chat.currentSessionId);
  const lang             = useSelector(s => s.chat.lang);

  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [coachOpen,     setCoachOpen]     = useState(false);
  const [journalOpen,   setJournalOpen]   = useState(false);
  const [leadOpen,      setLeadOpen]      = useState(false);
  const [faqHubOpen,    setFaqHubOpen]    = useState(false);
  const [ctaDismissed,  setCtaDismissed]  = useState(false);

  const msgCount = useSelector(s => {
    const cur = s.chat.sessions.find(x => x.id === s.chat.currentSessionId);
    return cur?.messages?.length || 0;
  });

  // Poll market data every 30s
  useEffect(() => {
    dispatch(fetchZerodhaStatus());
    dispatch(fetchMarketData());
    const id = setInterval(() => dispatch(fetchMarketData()), 30000);
    return () => clearInterval(id);
  }, [dispatch]);

  function handleSend(text) {
    sendMessage(text);
  }

  function handleNewChat() {
    dispatch(startNewSession());
    setSidebarOpen(false);
  }

  function handleMenuToggle() {
    if (window.innerWidth <= 660) {
      setSidebarOpen(o => !o);
    } else {
      setSidebarCollapsed(c => !c);
    }
  }

  function handleExport() {
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session?.messages?.length) {
      dispatch(showToast({ message: 'No conversation to export yet.', type: 'info' }));
      return;
    }
    const line = '─'.repeat(50);
    let txt = `OptionSmart AI Conversation\n${new Date().toLocaleString('en-IN')}\n${line}\n\n`;
    const msgs = session.messages;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === 'user') {
        txt += `You:\n${m.content}\n\n`;
      } else {
        const clean = m.content.replace(/SUGGESTIONS:.+/i, '').replace(/CARDS:\s*TIERS/i, '').trim();
        txt += `OptionSmart AI:\n${clean}\n\n${line}\n\n`;
      }
    }
    txt += 'Generated by OptionSmart AI Assistant · goalgotrade.tech';
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(txt);
    a.download = 'optionsmart-conversation.txt';
    a.click();
    dispatch(showToast({ message: '✓ Conversation exported', type: 'success' }));
  }

  function handleCoachToChat() {
    setCoachOpen(false);
    sendMessage("Based on today's market conditions, what should I focus on?");
  }

  const showCta = !ctaDismissed && msgCount >= 4;

  return (
    <div className="os-page">
      <ChatHeader
        onMenuToggle={handleMenuToggle}
        onFaq={() => setFaqHubOpen(true)}
        onCoach={() => setCoachOpen(true)}
        onExport={handleExport}
      />

      <div className="os-layout">
        <ChatSidebar
          isOpen={sidebarOpen}
          isCollapsed={sidebarCollapsed}
          onClose={() => setSidebarOpen(false)}
          onFaqQ={(q) => { setSidebarOpen(false); sendFaqMessage(q.q || q); }}
          onQuickQ={(q) => { setSidebarOpen(false); sendMessage(q.q || q); }}
          onNewChat={handleNewChat}
          onOpenFaq={() => setFaqHubOpen(true)}
        />

        <div className="os-chat-area">
          <ChatWindow
            onChipClick={(input) => sendFaqMessage(input)}
            onAdvisorClick={() => setLeadOpen(true)}
          />

          {showCta && (
            <CtaBar
              onTalkAdvisor={() => setLeadOpen(true)}
              onDismiss={() => setCtaDismissed(true)}
            />
          )}

          <InputBar onSend={handleSend} disabled={isStreaming} />

          <p className="os-disclaimer">
            {lang === 'hi'
              ? 'OptionSmart AI केवल प्लेटफ़ॉर्म जानकारी देता है · यह निवेश सलाह नहीं है · ट्रेडिंग में जोखिम है · SEBI विनियमित'
              : 'OptionSmart AI provides platform information only · Not investment advice · Trading involves risk · SEBI regulated'}
          </p>
        </div>
      </div>

      {/* Drawers & Modals */}
      <MorningCoach isOpen={coachOpen} onClose={() => setCoachOpen(false)} onAskCoach={handleCoachToChat} />
      <TradeJournal isOpen={journalOpen} onClose={() => setJournalOpen(false)} />
      <LeadModal    isOpen={leadOpen}    onClose={() => setLeadOpen(false)} />
      <FaqHub       isOpen={faqHubOpen}  onClose={() => setFaqHubOpen(false)} onSelectQuestion={(q) => sendFaqMessage(q)} />

      <Toast />
    </div>
  );
}
