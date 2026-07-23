/**
 * FaqHub.jsx — MongoDB-driven FAQ browser.
 * Fetches all curated FAQ entries from GET /api/chat/faqs on mount.
 * No static data — everything comes from MongoDB.
 */

import React, { useState, useEffect, useMemo } from 'react';
import CONTACT_INFO from '../../config/contact';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

const CATEGORIES = [
  { id: 'all',        label: 'All Topics' },
  { id: 'why_choose', label: 'Why OptionSmart' },
  { id: 'pricing',    label: 'Capital & Pricing' },
  { id: 'strategies', label: 'Algo Strategies' },
  { id: 'risk',       label: 'Risk & Safety' },
  { id: 'onboarding', label: 'Onboarding & Help' },
];

export default function FaqHub({ isOpen, onClose, onSelectQuestion }) {
  const [faqs, setFaqs]                   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // ── Fetch from MongoDB via GET /api/chat/faqs ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;           // only fetch when modal is open
    if (faqs.length > 0) return;   // already loaded — skip re-fetch

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/chat/faqs`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.ok && Array.isArray(data.faqs)) {
          setFaqs(data.faqs);
        } else {
          throw new Error('Unexpected response format');
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load FAQs');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredFaqs = useMemo(() => {
    const q = search.toLowerCase();
    return faqs.filter((faq) => {
      const matchesSearch   = !q || faq.question.toLowerCase().includes(q);
      const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [faqs, search, activeCategory]);

  if (!isOpen) return null;

  // ── Loading state ──────────────────────────────────────────────────────────
  const renderBody = () => {
    if (loading) {
      return (
        <div className="os-faq-loading">
          <div className="os-faq-spinner" />
          <p>Loading FAQs from database…</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="os-faq-empty">
          <span>⚠️</span>
          <p>Could not load FAQs: {error}</p>
          <button
            className="os-faq-reset-btn"
            onClick={() => { setFaqs([]); setError(null); setLoading(true); }}
          >
            Retry
          </button>
        </div>
      );
    }

    if (filteredFaqs.length === 0) {
      return (
        <div className="os-faq-empty">
          <span>📭</span>
          <p>No matches found{search ? ` for "${search}"` : ''}</p>
          <button
            className="os-faq-reset-btn"
            onClick={() => { setSearch(''); setActiveCategory('all'); }}
          >
            Reset
          </button>
        </div>
      );
    }

    return filteredFaqs.map((faq) => (
      <div key={faq.id} className="os-faq-item">
        <div
          className="os-faq-q-row"
          onClick={() => { onSelectQuestion(faq.question); onClose(); }}
        >
          <span className="os-faq-q-text">{faq.question}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="os-faq-badge">{faq.categoryLabel || 'General'}</span>
            <span style={{ color: 'var(--os-accent2)', fontSize: '12px' }}>Ask 💬</span>
          </div>
        </div>
      </div>
    ));
  };

  return (
    <div className="os-modal-overlay" onClick={onClose}>
      <div className="os-modal os-modal--faq" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="os-modal-head">
          <div className="os-modal-logo" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            FAQ
          </div>
          <div style={{ flex: 1 }}>
            <div className="os-logo-name">OptionSmart Knowledge Hub</div>
            <div className="os-logo-sub">
              {loading
                ? 'Loading from database…'
                : `${faqs.length} questions — click any to ask the chatbot`}
            </div>
          </div>
          <button className="os-faq-close-x" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="os-faq-search-wrapper">
          <span className="os-faq-search-icon">🔍</span>
          <input
            type="text"
            className="os-faq-search-input"
            placeholder="Search FAQs (e.g. SEBI, Saturn, capital, lock-in)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            disabled={loading}
          />
          {search && (
            <button className="os-faq-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="os-faq-tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`os-faq-tab${activeCategory === cat.id ? ' os-faq-tab--active' : ''}`}
              onClick={() => { setActiveCategory(cat.id); }}
              disabled={loading}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* FAQ List */}
        <div className="os-faq-list">
          {renderBody()}
        </div>

        {/* Footer */}
        <div className="os-faq-foot">
          <span>
            {loading ? 'Loading…' : `Showing ${filteredFaqs.length} of ${faqs.length} FAQs`}
          </span>
          <span>
            Need custom answers? Call: <strong>{CONTACT_INFO.phoneDisplay}</strong>
          </span>
        </div>

      </div>
    </div>
  );
}
