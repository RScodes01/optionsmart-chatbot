/**
 * FloatingChatWidget.jsx — Scalable & Responsive Floating Chatbot Widget
 * Renders a bottom-right launcher button and toggles a responsive chatbot modal/overlay.
 */

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ChatWindow   from './ChatWindow';
import InputBar     from './InputBar';
import MorningCoach from './MorningCoach';
import TradeJournal from './TradeJournal';
import LeadModal    from './LeadModal';
import FaqHub       from './FaqHub';

import { useChatStream } from '../../hooks/useChatStream';
import { useFaqLookup }  from '../../hooks/useFaqLookup';
import {
  setLang, startNewSession,
  fetchZerodhaStatus, fetchMarketData,
  showToast, clearToast,
} from '../../store/chatSlice';

import './chat.css';

function WidgetToast() {
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

export default function FloatingChatWidget({ initialOpen = false }) {
  const [isOpen, setIsOpen]           = useState(initialOpen);
  const [widgetSize, setWidgetSize]   = useState('normal'); // 'normal' | 'expanded' | 'fullscreen'
  const [theme, setTheme]             = useState(localStorage.getItem('os_theme') || 'dark');
  const [customDimensions, setCustomDimensions] = useState(null); // { width, height } when dragged with mouse
  const [isResizing, setIsResizing]   = useState(false);
  const [unreadCount, setUnreadCount] = useState(1); // Welcome notification badge

  const [coachOpen, setCoachOpen]     = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [leadOpen, setLeadOpen]       = useState(false);
  const [faqHubOpen, setFaqHubOpen]   = useState(false);

  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const lang      = useSelector(s => s.chat.lang);
  const { sendMessage, isStreaming } = useChatStream();
  const { sendFaqMessage }           = useFaqLookup();

  // Poll market data every 30s
  useEffect(() => {
    dispatch(fetchZerodhaStatus());
    dispatch(fetchMarketData());
    const id = setInterval(() => dispatch(fetchMarketData()), 30000);
    return () => clearInterval(id);
  }, [dispatch]);

  // Sync data-theme on document root as well
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('os_theme', nextTheme);
  };

  // ── MOUSE DRAG TO RESIZE HANDLER (Top-Left & Top/Left edges) ──
  const startMouseResize = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;

    const popupEl = e.currentTarget.closest('.os-widget-popup-container');
    const startW = popupEl ? popupEl.offsetWidth : (customDimensions?.width || 440);
    const startH = popupEl ? popupEl.offsetHeight : (customDimensions?.height || 680);

    const onMouseMove = (moveEvent) => {
      const deltaX = startX - moveEvent.clientX; // Moving left increases width for bottom-right fixed window
      const deltaY = startY - moveEvent.clientY; // Moving up increases height for bottom-right fixed window

      let newW = startW;
      let newH = startH;

      if (direction.includes('w') || direction.includes('left') || direction === 'tl') {
        newW = Math.max(320, Math.min(window.innerWidth - 32, startW + deltaX));
      }
      if (direction.includes('h') || direction.includes('top') || direction === 'tl') {
        newH = Math.max(400, Math.min(window.innerHeight - 110, startH + deltaY));
      }

      setCustomDimensions({ width: newW, height: newH });
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const toggleWidget = () => {
    setIsOpen(prev => !prev);
    if (unreadCount > 0) {
      setUnreadCount(0);
    }
  };

  const cycleWidgetSize = () => {
    setCustomDimensions(null); // Reset custom mouse dimensions when cycling presets
    setWidgetSize(current => {
      if (current === 'normal') return 'expanded';
      if (current === 'expanded') return 'fullscreen';
      return 'normal';
    });
  };

  const handleSend = (text) => {
    sendMessage(text);
  };

  const handleNewChat = () => {
    dispatch(startNewSession());
  };

  return (
    <>
      {/* ── BOTTOM-RIGHT FLOATING LAUNCHER BUTTON ── */}
      <div className="os-widget-launcher-wrapper">
        {!isOpen && (
          <div className="os-widget-tooltip">
            <span>Ask OptionSmart AI</span>
            <div className="os-widget-tooltip-arrow" />
          </div>
        )}

        <button
          className={`os-widget-launcher-btn ${isOpen ? 'os-widget-launcher-btn--active' : ''}`}
          onClick={toggleWidget}
          aria-label={isOpen ? 'Close OptionSmart Chat' : 'Open OptionSmart Chat'}
          title="OptionSmart AI Assistant"
        >
          {/* Animated Glow Ring */}
          <div className="os-widget-pulse-ring" />

          {/* Unread badge */}
          {!isOpen && unreadCount > 0 && (
            <span className="os-widget-unread-badge">{unreadCount}</span>
          )}

          {/* Icon state */}
          {isOpen ? (
            <svg className="os-launcher-icon os-launcher-icon--close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <div className="os-launcher-icon-inner">
              <span className="os-launcher-sparkle">✦</span>
              <svg className="os-launcher-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* ── RESPONSIVE FLOATING CHATBOT WIDGET OVERLAY ── */}
      {isOpen && (
        <div
          className={`os-widget-popup-container os-widget-popup--${widgetSize} ${isResizing ? 'os-widget-popup--dragging' : ''}`}
          data-theme={theme}
          style={
            customDimensions
              ? { width: `${customDimensions.width}px`, height: `${customDimensions.height}px`, maxWidth: 'none', maxHeight: 'none' }
              : undefined
          }
        >
          {/* Top-Left Mouse Drag Handle Grip */}
          <div
            className="os-widget-drag-handle-tl"
            onMouseDown={(e) => startMouseResize(e, 'tl')}
            title="Click and drag mouse to resize window width & height"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="os-drag-dots">
              <circle cx="4" cy="4" r="1.5" />
              <circle cx="12" cy="4" r="1.5" />
              <circle cx="4" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
            </svg>
          </div>

          {/* Top Border Mouse Drag Edge */}
          <div
            className="os-widget-drag-edge-top"
            onMouseDown={(e) => startMouseResize(e, 'top')}
            title="Drag mouse up/down to resize height"
          />

          {/* Left Border Mouse Drag Edge */}
          <div
            className="os-widget-drag-edge-left"
            onMouseDown={(e) => startMouseResize(e, 'left')}
            title="Drag mouse left/right to resize width"
          />

          {/* Compact Widget Header */}
          <div className="os-widget-header">
            <div className="os-widget-header-brand">
              <div className="os-logo-icon os-logo-icon--sm">OS</div>
              <div>
                <div className="os-widget-title">
                  OptionSmart AI
                  <span className="os-widget-live-dot" title="System Live" />
                </div>
                <div className="os-widget-sub">AI Trading Assistant</div>
              </div>
            </div>

            <div className="os-widget-header-actions">
              {/* Theme toggle (Light / Dark) */}
              <button
                className="os-widget-hicon"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>

              {/* Browse FAQs button */}
              <button
                className="os-widget-hicon"
                title="Browse FAQ Knowledge Base"
                onClick={() => setFaqHubOpen(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>

              {/* Morning Coach button */}
              <button
                className="os-widget-hicon"
                title="Morning Coach"
                onClick={() => setCoachOpen(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </button>

              {/* Window Size toggle button (Normal -> Expanded -> Fullscreen overlay) */}
              <button
                className="os-widget-hicon os-widget-hicon--expand"
                title={
                  widgetSize === 'normal'
                    ? 'Expand window'
                    : widgetSize === 'expanded'
                    ? 'Maximize fullscreen'
                    : 'Restore window'
                }
                onClick={cycleWidgetSize}
              >
                {widgetSize === 'normal' ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                ) : widgetSize === 'expanded' ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="10" y1="14" x2="3" y2="21" />
                  </svg>
                )}
              </button>

              {/* Close widget */}
              <button
                className="os-widget-hicon os-widget-hicon--close"
                title="Close chatbot"
                onClick={() => setIsOpen(false)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Widget Body */}
          <div className="os-widget-body">
            <ChatWindow
              onChipClick={(input) => sendFaqMessage(input)}
              onAdvisorClick={() => setLeadOpen(true)}
            />
          </div>

          {/* Widget Footer & Input */}
          <div className="os-widget-footer">
            <InputBar onSend={handleSend} disabled={isStreaming} />
            <div className="os-widget-disclaimer">
              OptionSmart AI · SEBI regulated info
            </div>
          </div>

          {/* Drawers & Modals inside widget */}
          <MorningCoach isOpen={coachOpen} onClose={() => setCoachOpen(false)} onAskCoach={() => { setCoachOpen(false); sendMessage("Based on today's market conditions, what should I focus on?"); }} />
          <TradeJournal isOpen={journalOpen} onClose={() => setJournalOpen(false)} />
          <LeadModal    isOpen={leadOpen}    onClose={() => setLeadOpen(false)} />
          <FaqHub       isOpen={faqHubOpen}  onClose={() => setFaqHubOpen(false)} onSelectQuestion={(q) => sendFaqMessage(q)} />

          <WidgetToast />
        </div>
      )}
    </>
  );
}
