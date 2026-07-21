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
  { label: '💰 Capital Tiers',       q: 'What are the capital tiers and minimum investment?',      faqId: 'faq_002' },
  { label: '🛡️ Loss Protection',     q: 'What risk management safeguards does OptionSmart have?',  faqId: 'faq_006' },
  { label: '✅ SEBI Compliance',     q: 'Is OptionSmart SEBI regulated and compliant?',           faqId: 'faq_009' },
];

export default function ChatSidebar({ isOpen, isCollapsed, onClose, onFaqQ, onQuickQ, onNewChat, onOpenFaq }) {
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

  // Group conversations by date boundaries
  const groups = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7DaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

  sessions.forEach(s => {
    const ts = s.updatedAt || Date.now();
    if (ts >= startOfToday) {
      groups.today.push(s);
    } else if (ts >= startOfYesterday) {
      groups.yesterday.push(s);
    } else if (ts >= startOf7DaysAgo) {
      groups.last7Days.push(s);
    } else {
      groups.older.push(s);
    }
  });

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div className="os-sidebar-backdrop" onClick={onClose} />
      )}

      <aside className={`os-sidebar${isOpen ? ' os-sidebar--open' : ''}${isCollapsed ? ' os-sidebar--collapsed' : ''}`}>

        {/* FAQ Hub Trigger — answered from MongoDB with zero API calls */}
        <div className="os-sidebar-section">
          <div className="os-s-label">FAQ Knowledge Base</div>
          
          <button 
            className="os-sidebar-new-btn" 
            style={{ 
              background: 'rgba(22,163,74,0.06)', 
              borderColor: 'rgba(22,163,74,0.3)', 
              color: '#4ade80',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: '600'
            }}
            onClick={() => {
              onClose?.();
              onOpenFaq?.();
            }}
          >
            🔍 Browse FAQ Hub
          </button>

          {/* Quick-click pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
            {QUICK_QUESTIONS.map(qq => (
              <button
                key={qq.faqId}
                className="os-convo-item"
                style={{ margin: 0, padding: '7px 9px', fontSize: '11.5px', justifyContent: 'space-between' }}
                onClick={() => {
                  onClose?.();
                  const handler = onFaqQ || onQuickQ;
                  handler?.({ q: qq.q, faqId: qq.faqId });
                }}
              >
                <span>{qq.label}</span>
                <span style={{ opacity: 0.5 }}>→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation history */}
        <div className="os-sidebar-section os-sidebar-convos">
          <div className="os-s-label">Recent Conversations</div>
          {!sessions.length && (
            <div className="os-convo-empty">No conversations yet.</div>
          )}

          {Object.entries({
            'Today': groups.today,
            'Yesterday': groups.yesterday,
            'Previous 7 Days': groups.last7Days,
            'Older': groups.older
          }).map(([label, groupList]) => {
            if (!groupList.length) return null;
            return (
              <React.Fragment key={label}>
                <div className="os-sidebar-group-label">{label}</div>
                {groupList.map((s) => (
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
              </React.Fragment>
            );
          })}
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
