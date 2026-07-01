/**
 * TradeJournal.jsx — Trade Journal drawer with Log/History/Insights tabs
 * Persists trades to MongoDB via /api/journal/trades
 */

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { fetchTrades, saveTrade, deleteTrade, showToast } from '../../store/chatSlice';

function now() {
  const d = new Date();
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
  };
}

function calcPnl(entry, exit, qty) {
  const e = parseFloat(entry) || 0;
  const x = parseFloat(exit) || 0;
  const q = parseFloat(qty) || 1;
  return (x - e) * q * 75;
}

// ── Log Trade form ──────────────────────────────────
function LogTradeTab({ onSaved }) {
  const dispatch = useDispatch();
  const initial = now();
  const [form, setForm] = useState({
    date: initial.date, time: initial.time,
    instrument: '', strategy: '', entry: '', exit: '', qty: '', exitReason: '', notes: '',
  });

  const pnl = (form.entry && form.exit) ? calcPnl(form.entry, form.exit, form.qty || 1) : null;

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSave() {
    if (!form.instrument || !form.entry || !form.exit) {
      dispatch(showToast({ message: '⚠ Fill in Instrument, Entry & Exit', type: 'error' }));
      return;
    }
    const tradePayload = { ...form, qty: form.qty || 1, pnl: pnl?.toFixed(2) };
    const result = await dispatch(saveTrade(tradePayload));
    if (saveTrade.fulfilled.match(result)) {
      dispatch(showToast({ message: '✓ Trade logged', type: 'success' }));
      const n = now();
      setForm({ date: n.date, time: n.time, instrument: '', strategy: '', entry: '', exit: '', qty: '', exitReason: '', notes: '' });
      onSaved?.();
    } else {
      dispatch(showToast({ message: result.payload || 'Save failed', type: 'error' }));
    }
  }

  return (
    <div className="os-trade-form">
      <div className="os-tf-row">
        <div className="os-tf-group"><label className="os-tf-label">Date</label>
          <input className="os-tf-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
        <div className="os-tf-group"><label className="os-tf-label">Time</label>
          <input className="os-tf-input" type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
      </div>
      <div className="os-tf-row">
        <div className="os-tf-group"><label className="os-tf-label">Instrument</label>
          <input className="os-tf-input" type="text" placeholder="NIFTY 25000 CE" value={form.instrument} onChange={e => set('instrument', e.target.value)} /></div>
        <div className="os-tf-group"><label className="os-tf-label">Strategy</label>
          <select className="os-tf-input" value={form.strategy} onChange={e => set('strategy', e.target.value)}>
            <option value="">Select…</option>
            {['Saturn','Venus','Pluto','Manual','Other'].map(s => <option key={s}>{s}</option>)}
          </select></div>
      </div>
      <div className="os-tf-row">
        <div className="os-tf-group"><label className="os-tf-label">Entry Price (₹)</label>
          <input className="os-tf-input" type="number" placeholder="0.00" value={form.entry} onChange={e => set('entry', e.target.value)} /></div>
        <div className="os-tf-group"><label className="os-tf-label">Exit Price (₹)</label>
          <input className="os-tf-input" type="number" placeholder="0.00" value={form.exit} onChange={e => set('exit', e.target.value)} /></div>
      </div>
      <div className="os-tf-row">
        <div className="os-tf-group"><label className="os-tf-label">Qty / Lots</label>
          <input className="os-tf-input" type="number" placeholder="1" value={form.qty} onChange={e => set('qty', e.target.value)} /></div>
        <div className="os-tf-group"><label className="os-tf-label">Exit Reason</label>
          <select className="os-tf-input" value={form.exitReason} onChange={e => set('exitReason', e.target.value)}>
            <option value="">Select…</option>
            {['Target hit','Stop-loss hit','Trailing stop','Time-based exit','Kill switch','Manual / gut'].map(s => <option key={s}>{s}</option>)}
          </select></div>
      </div>
      {pnl !== null && (
        <div className={`os-pnl-preview os-pnl-preview--${pnl >= 0 ? 'profit' : 'loss'}`}>
          {pnl >= 0 ? '▲ Profit: +₹' : '▼ Loss: ₹'}{Math.abs(pnl).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      )}
      <div className="os-tf-group"><label className="os-tf-label">Notes</label>
        <textarea className="os-tf-input os-tf-notes" rows={2} placeholder="What happened? Any emotional triggers?" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
      <button className="os-journal-save-btn" onClick={handleSave}>+ Log this trade</button>
    </div>
  );
}

// ── History tab ─────────────────────────────────────
function HistoryTab() {
  const dispatch = useDispatch();
  const trades   = useSelector(s => s.chat.trades);

  async function handleDelete(id) {
    await dispatch(deleteTrade(id));
    dispatch(showToast({ message: 'Trade removed', type: 'info' }));
  }

  if (!trades.length) return (
    <div className="os-history-empty">
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <div>No trades logged yet.</div>
    </div>
  );

  return (
    <div>
      {trades.map((t) => {
        const id = t._id || t.id;
        const isProfit = t.pnl >= 0;
        return (
          <div key={id} className="os-trade-card">
            <button className="os-trade-del" onClick={() => handleDelete(id)} title="Delete">✕</button>
            <div className="os-trade-card-header">
              <div className="os-trade-card-title">{t.instrument}</div>
              <div className="os-trade-card-strategy">{t.strategy}</div>
            </div>
            <div className="os-trade-card-meta">
              <span>📅 {t.date}</span><span>⏰ {t.time}</span><span>Qty:{t.qty}</span>
            </div>
            <div className={`os-trade-card-pnl os-trade-card-pnl--${isProfit ? 'profit' : 'loss'}`}>
              {isProfit ? '▲ +₹' : '▼ ₹'}{Math.abs(t.pnl).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            {t.exitReason && <div className="os-trade-card-exit">Exit: {t.exitReason}</div>}
            {t.notes && <div className="os-trade-card-notes">{t.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── AI Insights tab ────────────────────────────────
function InsightsTab() {
  const trades = useSelector(s => s.chat.trades);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [stats, setStats]       = useState(null);

  async function load() {
    if (trades.length < 3) return;
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/chat/insights', { trades });
      setInsights(res.data.data.insights);
      setStats(res.data.stats);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (trades.length < 3) return (
    <div className="os-insights-empty">
      <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
      <div>Log at least 3 trades to unlock AI insights.</div>
    </div>
  );

  const wins   = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const winRate = Math.round((wins / trades.length) * 100);
  const totalPnl = trades.reduce((a, t) => a + parseFloat(t.pnl), 0);

  return (
    <div>
      {/* Stats row */}
      <div className="os-insights-stats">
        <div className="os-insights-stat">
          <div className="os-insights-stat-label">Win Rate</div>
          <div className={`os-insights-stat-val os-insights-stat-val--${winRate >= 50 ? 'good' : 'bad'}`}>{winRate}%</div>
        </div>
        <div className="os-insights-stat">
          <div className="os-insights-stat-label">Total P&L</div>
          <div className={`os-insights-stat-val os-insights-stat-val--${totalPnl >= 0 ? 'good' : 'bad'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="os-insights-stat">
          <div className="os-insights-stat-label">Trades</div>
          <div className="os-insights-stat-val os-insights-stat-val--neutral">{trades.length}</div>
        </div>
      </div>

      {loading && (
        <div className="os-coach-loading"><div className="os-coach-spinner" /><div className="os-coach-loading-text">Analysing patterns…</div></div>
      )}
      {error && <div className="os-err-bubble">Analysis failed.<br /><small>{error}</small></div>}
      {insights && !loading && insights.map((ins, i) => (
        <div key={i} className={`os-insight-card os-insight-card--${ins.type || 'neutral'}`}>
          <div className="os-insight-label">{ins.label}</div>
          <div className="os-insight-text">{ins.text}</div>
        </div>
      ))}
      {insights && !loading && (
        <button className="os-journal-save-btn" style={{ marginTop: 16 }} onClick={load}>↻ Re-analyse</button>
      )}
    </div>
  );
}

// ── Main drawer ────────────────────────────────────
export default function TradeJournal({ isOpen, onClose }) {
  const dispatch = useDispatch();
  const trades   = useSelector(s => s.chat.trades);
  const [tab, setTab] = useState('log');

  useEffect(() => {
    if (isOpen) dispatch(fetchTrades());
  }, [isOpen, dispatch]);

  return (
    <>
      {isOpen && <div className="os-drawer-backdrop" onClick={onClose} />}
      <div className={`os-drawer os-drawer--right${isOpen ? ' os-drawer--open' : ''}`}>
        <div className="os-drawer-header">
          <div className="os-drawer-title-row">
            <span className="os-drawer-icon">📒</span>
            <div>
              <div className="os-drawer-title">AI Trade Journal</div>
              <div className="os-drawer-sub">Log trades · get behavioral insights</div>
            </div>
          </div>
          <button className="os-drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="os-journal-tabs">
          {['log', 'history', 'insights'].map(t => (
            <button key={t} className={`os-jtab${tab === t ? ' os-jtab--active' : ''}`} onClick={() => setTab(t)}>
              {t === 'log' ? 'Log Trade' : t === 'history' ? `History (${trades.length})` : 'AI Insights'}
            </button>
          ))}
        </div>

        <div className="os-drawer-body">
          {tab === 'log'      && <LogTradeTab onSaved={() => setTab('history')} />}
          {tab === 'history'  && <HistoryTab />}
          {tab === 'insights' && <InsightsTab />}
        </div>
      </div>
    </>
  );
}
