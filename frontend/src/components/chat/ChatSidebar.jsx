/**
 * ChatSidebar.jsx — Conversation sessions list + quick questions
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  startNewSession, loadSession, deleteSession,
  selectCurrentMessages,
} from '../../store/chatSlice';

const QUICK_QUESTIONS = [
  { label: '📊 Capital requirements', q: 'What capital do I need to start with OptionSmart?' },
  { label: '🤖 How algos work', q: 'How do the algo strategies work?' },
  { label: '⚡ Kill switch', q: 'How does the kill switch protect my investment?' },
  { label: '📈 Market regime', q: 'What is the Market Regime Engine?' },
  { label: '🛡 Risk management', q: 'Explain all the risk management features' },
  { label: '🧠 AI exit', q: 'How does AI/ML exit intelligence decide when to exit?' },
  { label: '✅ SEBI compliance', q: 'Is OptionSmart SEBI regulated?' },
  { label: '🔗 Broker support', q: 'Which brokers does OptionSmart support?' },
];

export default function ChatSidebar({ isOpen, onClose, onQuickQ, onNewChat }) {
  const dispatch = useDispatch();
  const sessions = useSelector((s) => s.chat.sessions);
  const currentSessionId = useSelector((s) => s.chat.currentSessionId);
  const lang = useSelector((s) => s.chat.lang);

  function handleLoad(id) {
    dispatch(loadSession(id));
    onClose?.();
  }

  function handleDelete(e, id) {
    e.stopPropagation();
    dispatch(deleteSession(id));
  }

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div className="os-sidebar-backdrop" onClick={onClose} />
      )}

      <aside className={`os-sidebar${isOpen ? ' os-sidebar--open' : ''}`}>
        {/* New chat */}
        <div className="os-sidebar-section">
          <button className="os-sidebar-new-btn" onClick={onNewChat}>
            + New Conversation
          </button>
        </div>

        {/* Quick questions dropdown */}
        <div className="os-sidebar-section">
          <div className="os-s-label">Quick Questions</div>
          <select
            className="os-qselect"
            defaultValue=""
            onChange={(e) => { if (e.target.value) { onQuickQ(e.target.value); e.target.value = ''; } }}
          >
            <option value="" disabled>Select a question…</option>
            {QUICK_QUESTIONS.map(({ label, q }) => (
              <option key={q} value={q}>{label}</option>
            ))}
          </select>
        </div>

        {/* Conversation history */}
        <div className="os-sidebar-section os-sidebar-convos">
          <div className="os-s-label">Recent Conversations</div>
          {!sessions.length && (
            <div className="os-convo-empty">No conversations yet.</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`os-convo-item${s.id === currentSessionId ? ' os-convo-item--active' : ''}`}
              onClick={() => handleLoad(s.id)}
            >
              <span className="os-convo-title">{s.title || 'Conversation'}</span>
              <span
                className="os-convo-del"
                onClick={(e) => handleDelete(e, s.id)}
                title="Delete"
              >
                ✕
              </span>
            </button>
          ))}
        </div>

        {/* Portfolio stats placeholder */}
        <div className="os-sidebar-section">
          <div className="os-s-label">Platform Stats</div>
          <div className="os-pstat"><span className="os-pstat-lbl">B2B Partners</span><span className="os-pstat-val">1,300+</span></div>
          <div className="os-pstat"><span className="os-pstat-lbl">Uptime SLA</span><span className="os-pstat-val">99.9%</span></div>
          <div className="os-pstat"><span className="os-pstat-lbl">Algo Engines</span><span className="os-pstat-val">26</span></div>
          <div className="os-pstat"><span className="os-pstat-lbl">Kill Switch</span><span className="os-pstat-val">&lt; 1s</span></div>
        </div>
      </aside>
    </>
  );
}
