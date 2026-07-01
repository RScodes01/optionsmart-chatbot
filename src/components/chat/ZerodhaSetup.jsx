/**
 * ZerodhaSetup.jsx — Zerodha Kite integration modal
 * - Credentials tab: stores API key/secret (server-side, not localStorage)
 * - How-to tab: step-by-step guide
 * - Connection tab: daily OAuth flow → server-side token exchange (no CORS issue)
 */

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import {
  fetchZerodhaStatus,
  exchangeZerodhaToken,
  showToast,
} from '../../store/chatSlice';

const TABS = ['api', 'how', 'status'];

export default function ZerodhaSetup({ isOpen, onClose }) {
  const dispatch  = useDispatch();
  const zerodha   = useSelector(s => s.chat.zerodha);
  const [tab, setTab]         = useState('api');
  const [loginUrl, setLoginUrl] = useState('');
  const [reqToken, setReqToken] = useState('');
  const [tokenErr, setTokenErr] = useState('');
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchZerodhaStatus());
      // Fetch the login URL from server
      axios.get('/api/zerodha/login-url')
        .then(r => setLoginUrl(r.data.loginUrl))
        .catch(() => setLoginUrl(''));
    }
  }, [isOpen, dispatch]);

  async function handleTokenExchange() {
    if (!reqToken.trim()) { setTokenErr('Paste the request_token from the redirect URL.'); return; }
    setTokenErr('');
    setExchanging(true);
    const result = await dispatch(exchangeZerodhaToken(reqToken.trim()));
    setExchanging(false);
    if (exchangeZerodhaToken.fulfilled.match(result)) {
      dispatch(showToast({ message: '✓ Zerodha connected! Token active for today.', type: 'success' }));
      setReqToken('');
      setTab('status');
      dispatch(fetchZerodhaStatus());
    } else {
      setTokenErr(result.payload || 'Token exchange failed. Check your credentials on the server.');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="os-modal-overlay" onClick={onClose}>
      <div className="os-modal os-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="os-modal-head">
          <div className="os-modal-logo os-modal-logo--zerodha">Z</div>
          <div>
            <div className="os-logo-name">Zerodha Kite</div>
            <div className="os-logo-sub">Trade Import Setup</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="os-modal-tabs">
          {TABS.map(t => (
            <button key={t} className={`os-modal-tab${tab === t ? ' os-modal-tab--active' : ''}`} onClick={() => setTab(t)}>
              {t === 'api' ? '🔑 API Credentials' : t === 'how' ? '📖 How to get keys' : '📡 Connection'}
            </button>
          ))}
        </div>

        {/* API Credentials tab */}
        {tab === 'api' && (
          <div>
            <div className="os-modal-note" style={{ marginBottom: 16 }}>
              🔒 <strong>Security upgrade:</strong> Your Zerodha API Key and Secret are now configured
              on the <strong>server</strong> (in <code>.env</code>), not in your browser.
              Contact your admin to update <code>ZERODHA_API_KEY</code> and <code>ZERODHA_API_SECRET</code>.
            </div>
            <div className={`os-zstatus ${zerodha.apiKeyConfigured ? 'os-zstatus--partial' : 'os-zstatus--disconnected'}`}>
              <div className="os-zstatus-dot" />
              <span>
                {zerodha.apiKeyConfigured
                  ? 'API credentials configured on server ✓'
                  : 'API credentials not configured — set ZERODHA_API_KEY in .env'}
              </span>
            </div>
            <button className="os-modal-submit os-modal-submit--blue" style={{ marginTop: 14 }} onClick={() => setTab('status')}>
              Proceed to daily login →
            </button>
          </div>
        )}

        {/* How-to tab */}
        {tab === 'how' && (
          <div>
            {[
              ['1', <>Go to <a href="https://developers.kite.trade" target="_blank" rel="noreferrer" className="os-zlink">developers.kite.trade</a> and log in.</>],
              ['2', <><strong>Create new app</strong>. Choose type: <strong>Connect</strong>.</>],
              ['3', <>Set the <strong>Redirect URL</strong> to your app's domain (e.g. <code>https://yourapp.com</code>).</>],
              ['4', <>Copy your <strong>API Key</strong> and <strong>API Secret</strong>.</>],
              ['5', <>Add them to your server's <code>.env</code>: <code>ZERODHA_API_KEY</code> and <code>ZERODHA_API_SECRET</code>.</>],
            ].map(([n, txt]) => (
              <div key={n} className="os-zstep">
                <div className="os-zstep-num">{n}</div>
                <div className="os-zstep-text">{txt}</div>
              </div>
            ))}
            <div className="os-modal-note">
              💰 Kite Connect API costs <strong>₹2,000/month</strong> per app.{' '}
              <a href="https://kite.trade/pricing" target="_blank" rel="noreferrer" className="os-zlink">See pricing →</a>
            </div>
            <button className="os-modal-submit os-modal-submit--blue" style={{ marginTop: 14 }} onClick={() => setTab('api')}>
              ← Back to credentials
            </button>
          </div>
        )}

        {/* Connection / Status tab */}
        {tab === 'status' && (
          <div>
            <div className={`os-zstatus ${zerodha.connected ? 'os-zstatus--connected' : zerodha.apiKeyConfigured ? 'os-zstatus--partial' : 'os-zstatus--disconnected'}`}>
              <div className="os-zstatus-dot" />
              <span>
                {zerodha.connected
                  ? `Connected · Token valid (expires in ${Math.round(zerodha.expiresInSeconds / 3600)}h)`
                  : zerodha.apiKeyConfigured
                    ? 'Credentials configured · Complete daily login to activate'
                    : 'Not configured — add API credentials to server .env'}
              </span>
            </div>

            <div className="os-modal-divider" />

            <p style={{ fontSize: 12, color: 'var(--os-muted)', lineHeight: 1.7, marginBottom: 12 }}>
              <strong style={{ color: 'var(--os-text)' }}>Daily Login Required</strong><br />
              Zerodha uses OAuth — every trading day you need to authorize fresh access.
              Click below to open Zerodha login. After logging in, paste the{' '}
              <code>request_token</code> from the redirect URL.
            </p>

            {loginUrl ? (
              <button className="os-modal-submit os-modal-submit--blue"
                onClick={() => window.open(loginUrl, '_blank', 'width=520,height=640,scrollbars=yes')}
                style={{ marginBottom: 12 }}>
                🔐 Login with Zerodha (Daily Auth)
              </button>
            ) : (
              <div className="os-modal-note">Configure ZERODHA_API_KEY on server first.</div>
            )}

            <label className="os-modal-label" style={{ marginTop: 10 }}>Paste request_token from redirect URL</label>
            <div className="os-modal-input-row">
              <input className="os-modal-input" type="text" placeholder="Paste token from redirect URL..."
                value={reqToken} onChange={e => { setReqToken(e.target.value); setTokenErr(''); }} />
            </div>
            {tokenErr && <div className="os-modal-err">{tokenErr}</div>}
            <button className="os-modal-submit" onClick={handleTokenExchange} disabled={exchanging}>
              {exchanging ? 'Exchanging…' : 'Generate access token →'}
            </button>

            <div className="os-modal-note" style={{ marginTop: 12 }}>
              Token exchange happens <strong>server-side</strong> — no CORS issues.
              Your access token is stored in Redis (8h TTL) and never exposed to the browser.
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} className="os-modal-close-link">✕ Close</button>
          <span style={{ fontSize: 11, color: 'var(--os-faint)' }}>Token stored in Redis · Never shared</span>
        </div>
      </div>
    </div>
  );
}
