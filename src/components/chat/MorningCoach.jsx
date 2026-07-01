/**
 * MorningCoach.jsx — Morning Market Coach drawer
 * Calls POST /api/chat/coach → renders structured market briefing
 */

import React, { useState, useCallback } from 'react';
import axios from 'axios';

function Spinner() {
  return (
    <div className="os-coach-loading">
      <div className="os-coach-spinner" />
      <div className="os-coach-loading-text">Analysing market context…</div>
    </div>
  );
}

function StrategyBadge({ cls, icon, name }) {
  const labels = { good: 'Recommended', bad: 'Avoid', neutral: 'Watch' };
  return (
    <div className={`os-strategy-item os-strategy-item--${cls}`}>
      <span className="os-strategy-badge">{icon}</span>
      <span>{name}</span>
      <span className="os-strategy-label">{labels[cls]}</span>
    </div>
  );
}

function CoachContent({ data, dateStr, dayName }) {
  const riskClass = data.riskLevel || 'medium';
  const riskLabel = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' }[riskClass];
  const riskDot   = { low: '🟢', medium: '🟡', high: '🔴' }[riskClass];

  const biasColor = data.niftyBias === 'Bullish' ? '#22c55e'
    : data.niftyBias === 'Bearish' ? '#f87171' : '#fbbf24';

  const volColor = data.volatility === 'High' ? '#f87171'
    : data.volatility === 'Low' ? '#22c55e' : '#fbbf24';

  const allStrats = [
    ...(data.recommended || []).map(s => ({ name: s, cls: 'good', icon: '✓' })),
    ...(data.neutral || []).map(s => ({ name: s, cls: 'neutral', icon: '~' })),
    ...(data.avoid || []).map(s => ({ name: s, cls: 'bad', icon: '✗' })),
  ];

  return (
    <div className="os-coach-content">
      <div className="os-coach-greeting">{data.greeting || 'Good morning, Trader'} 👋</div>
      <div className="os-coach-date">{dayName}, {dateStr}</div>

      {/* Market snapshot */}
      <div className="os-coach-card">
        <div className="os-coach-card-title">Today's Market Snapshot</div>
        <div className="os-coach-market-grid">
          <div className="os-coach-metric">
            <div className="os-coach-metric-label">Market Regime</div>
            <div className="os-coach-metric-value os-coach-metric-value--sm">{data.regime || 'Range-Bound'}</div>
          </div>
          <div className="os-coach-metric">
            <div className="os-coach-metric-label">Nifty Bias</div>
            <div className="os-coach-metric-value" style={{ color: biasColor }}>{data.niftyBias || 'Neutral'}</div>
            <div className="os-coach-metric-sub">~{data.niftyLevel || '24,800'}</div>
          </div>
          <div className="os-coach-metric">
            <div className="os-coach-metric-label">India VIX</div>
            <div className="os-coach-metric-value">{data.vix || '14.5'}</div>
          </div>
          <div className="os-coach-metric">
            <div className="os-coach-metric-label">Volatility</div>
            <div className="os-coach-metric-value os-coach-metric-value--sm" style={{ color: volColor }}>{data.volatility || 'Medium'}</div>
          </div>
        </div>
        <div className="os-trend-bar-wrap">
          <div className="os-trend-bar-labels">
            <span>Trend Probability</span>
            <span className="os-trend-pct">{data.trendProbability || 55}%</span>
          </div>
          <div className="os-trend-bar">
            <div className="os-trend-fill" style={{ width: `${data.trendProbability || 55}%` }} />
          </div>
        </div>
      </div>

      {/* Strategy recommendations */}
      <div className="os-coach-card">
        <div className="os-coach-card-title">Strategy Recommendation</div>
        <div className="os-strategy-list">
          {allStrats.map(s => <StrategyBadge key={s.name} {...s} />)}
        </div>
      </div>

      {/* Risk */}
      <div className="os-coach-card">
        <div className="os-coach-card-title">Expected Risk</div>
        <span className={`os-risk-badge os-risk-badge--${riskClass}`}>{riskDot} {riskLabel}</span>
      </div>

      {/* Key insight */}
      <div className="os-coach-card">
        <div className="os-coach-card-title">Coach's Key Insight</div>
        <div className="os-coach-insight">{data.keyInsight}</div>
      </div>

      {/* Watch out */}
      <div className="os-coach-card os-coach-card--warn">
        <div className="os-coach-card-title">⚠ Watch Out For</div>
        <div className="os-coach-insight os-coach-insight--warn">{data.watchOut}</div>
      </div>
    </div>
  );
}

export default function MorningCoach({ isOpen, onClose, onAskCoach }) {
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [loaded, setLoaded]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/chat/coach');
      setData(res.data.data);
      setLoaded(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load when first opened
  React.useEffect(() => {
    if (isOpen && !loaded) load();
  }, [isOpen, loaded, load]);

  const now     = new Date();
  const dayName = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      {isOpen && <div className="os-drawer-backdrop" onClick={onClose} />}
      <div className={`os-drawer os-drawer--left${isOpen ? ' os-drawer--open' : ''}`}>
        <div className="os-drawer-header">
          <div className="os-drawer-title-row">
            <span className="os-drawer-icon">☀</span>
            <div>
              <div className="os-drawer-title">Morning Market Coach</div>
              <div className="os-drawer-sub">AI-generated briefing · refreshes daily</div>
            </div>
          </div>
          <button className="os-drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="os-drawer-body">
          {loading && <Spinner />}
          {error && (
            <div className="os-err-bubble">
              Could not load briefing.<br /><small>{error}</small>
            </div>
          )}
          {data && !loading && <CoachContent data={data} dateStr={dateStr} dayName={dayName} />}
        </div>

        <div className="os-drawer-footer">
          <button className="os-drawer-action-btn" onClick={() => { setLoaded(false); load(); }}>
            ↻ Refresh briefing
          </button>
          <button className="os-drawer-action-btn os-drawer-action-btn--ghost" onClick={onAskCoach}>
            Ask coach a question →
          </button>
        </div>
      </div>
    </>
  );
}
