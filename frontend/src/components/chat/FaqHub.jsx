/**
 * FaqHub.jsx — Interactive modal for browsing, searching, and reading all 35 FAQs.
 */

import React, { useState, useMemo } from 'react';
import CONTACT_INFO from '../../config/contact';

// Static import of all 35 structured FAQs matching the server seed
const FAQS = [
  {
    id: "faq_q01",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "Why choose OptionSmart over other algo trading platforms?"
  },
  {
    id: "faq_q02",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "How do OptionSmart strategies work? Strategy mechanism, investment schemes, product information."
  },
  {
    id: "faq_q03",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What are OptionSmart's platform charges, fees, and subscription cost?"
  },
  {
    id: "faq_q04",
    category: "platform",
    categoryLabel: "Platform",
    question: "Is there a mobile application for OptionSmart?"
  },
  {
    id: "faq_q05",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "Do I need coding knowledge to use OptionSmart? Is programming required?"
  },
  {
    id: "faq_q06",
    category: "platform",
    categoryLabel: "Platform",
    question: "Does OptionSmart support backtesting of strategies?"
  },
  {
    id: "faq_q07",
    category: "platform",
    categoryLabel: "Platform",
    question: "Which trading segments are supported? Does OptionSmart trade equity, F&O, commodities?"
  },
  {
    id: "faq_q08",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "How beginner-friendly is OptionSmart? Can a beginner use it?"
  },
  {
    id: "faq_q09",
    category: "platform",
    categoryLabel: "Platform",
    question: "Does OptionSmart integrate with TradingView?"
  },
  {
    id: "faq_q10",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "Can I be a strategy developer on OptionSmart? Can I monetize my strategies? What is SmartAlgos?"
  },
  {
    id: "faq_q11",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What is the ROC (Return on Capital) for OptionSmart strategies?"
  },
  {
    id: "faq_q12",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What is hedge, position market information, risk, and directional vs non-directional trading?"
  },
  {
    id: "faq_q13",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "What strategy indices and markets does OptionSmart operate in?"
  },
  {
    id: "faq_q14",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What are the Risk-Reward, Stop-Loss, margin, capital, collateral, and pledge-related features?"
  },
  {
    id: "faq_q15",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What is the drawdown of OptionSmart strategies? Maximum drawdown?"
  },
  {
    id: "faq_q16",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What are the returns? Why choose OptionSmart if returns are less than 15%? Why not a mutual fund?"
  },
  {
    id: "faq_q17",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "How does the strategy function when government news or market events affect stocks?"
  },
  {
    id: "faq_q18",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What is the brokerage cost with OptionSmart?"
  },
  {
    id: "faq_q19",
    category: "platform",
    categoryLabel: "Platform",
    question: "Does OptionSmart deal in F&O equity markets? How does F&O trading work?"
  },
  {
    id: "faq_q20",
    category: "platform",
    categoryLabel: "Platform",
    question: "What is OptionSmart's commodity trading model? Does it trade MCX?"
  },
  {
    id: "faq_q21",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "How did you find the OptionSmart website? What is the source of OptionSmart?"
  },
  {
    id: "faq_q22",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "Which sector should I invest in? Which stocks should I buy?"
  },
  {
    id: "faq_q23",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "What does the OptionSmart website offer? What are all the features?"
  },
  {
    id: "faq_q24",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What is the risk comparison between equity trading and options trading?"
  },
  {
    id: "faq_q25",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "What are the risk, capital requirements, legality, and SEBI registration details of OptionSmart?"
  },
  {
    id: "faq_q26",
    category: "platform",
    categoryLabel: "Platform",
    question: "Which brokers are connected to OptionSmart? What are the supported brokers?"
  },
  {
    id: "faq_q27",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "Who are the fund managers at OptionSmart?"
  },
  {
    id: "faq_q28",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "Is there a referral commission or affiliation program at OptionSmart?"
  },
  {
    id: "faq_q29",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "What are the advantages of the OptionSmart platform?"
  },
  {
    id: "faq_q30",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "Is there software, a subscription plan, a demo, or a trial available for OptionSmart?"
  },
  {
    id: "faq_q31",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "What course planning or educational content does OptionSmart offer?"
  },
  {
    id: "faq_q32",
    category: "onboarding",
    categoryLabel: "Onboarding",
    question: "How does registration and onboarding work at OptionSmart? What is the process and executive support?"
  },
  {
    id: "faq_q33",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "Can you explain OptionSmart's strategies in depth? How do they function in detail?"
  },
  {
    id: "faq_q34",
    category: "platform",
    categoryLabel: "Platform",
    question: "What are the trading runs, timings, and can I create my own strategy?"
  },
  {
    id: "faq_q35",
    category: "onboarding",
    categoryLabel: "Onboarding",
    question: "How do I start trading with OptionSmart? What are the starting instructions?"
  }
];

const CATEGORIES = [
  { id: 'all', label: 'All Topics' },
  { id: 'why_choose', label: 'Why OptionSmart' },
  { id: 'pricing', label: 'Capital & Pricing' },
  { id: 'strategies', label: 'Algo Strategies' },
  { id: 'risk', label: 'Risk & Safety' },
  { id: 'onboarding', label: 'Onboarding & Help' }
];

export default function FaqHub({ isOpen, onClose, onSelectQuestion }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  // Filter FAQs based on search input and active category tab
  const filteredFaqs = useMemo(() => {
    return FAQS.filter(faq => {
      const matchesSearch = 
        faq.question.toLowerCase().includes(search.toLowerCase());
      
      const matchesCategory = 
        activeCategory === 'all' || faq.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  if (!isOpen) return null;

  return (
    <div className="os-modal-overlay" onClick={onClose}>
      <div className="os-modal os-modal--faq" onClick={e => e.stopPropagation()}>
        <div className="os-modal-head">
          <div className="os-modal-logo" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>FAQ</div>
          <div style={{ flex: 1 }}>
            <div className="os-logo-name">OptionSmart Knowledge Hub</div>
            <div className="os-logo-sub">Browse, search, and click questions to send to the chatbot</div>
          </div>
          <button className="os-faq-close-x" onClick={onClose}>✕</button>
        </div>

        {/* Search bar */}
        <div className="os-faq-search-wrapper">
          <span className="os-faq-search-icon">🔍</span>
          <input 
            type="text" 
            className="os-faq-search-input" 
            placeholder="Search all 35 FAQs (e.g. SEBI, Saturn, Zerodha, lock-in)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="os-faq-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="os-faq-tabs">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`os-faq-tab${activeCategory === cat.id ? ' os-faq-tab--active' : ''}`}
              onClick={() => { setActiveCategory(cat.id); setExpandedId(null); }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* FAQs List / Accordion */}
        <div className="os-faq-list">
          {filteredFaqs.length === 0 ? (
            <div className="os-faq-empty">
              <span>📭</span>
              <p>No matches found for "{search}"</p>
              <button className="os-faq-reset-btn" onClick={() => { setSearch(''); setActiveCategory('all'); }}>Reset Search</button>
            </div>
          ) : (
            filteredFaqs.map(faq => {
              return (
                <div key={faq.id} className="os-faq-item">
                  <div 
                    className="os-faq-q-row" 
                    onClick={() => {
                      onSelectQuestion(faq.question);
                      onClose();
                    }}
                  >
                    <span className="os-faq-q-text">{faq.question}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="os-faq-badge">{faq.categoryLabel || 'General'}</span>
                      <span style={{ color: 'var(--os-accent2)', fontSize: '12px' }}>Ask 💬</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="os-faq-foot">
          <span>Total FAQs: {FAQS.length}</span>
          <span>Need custom answers? Ask the bot or call: **{CONTACT_INFO.phoneDisplay}**</span>
        </div>
      </div>
    </div>
  );
}
