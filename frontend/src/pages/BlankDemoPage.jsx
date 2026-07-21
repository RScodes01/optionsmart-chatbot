/**
 * BlankDemoPage.jsx — Sleek, modern blank landing page with bottom-right floating chatbot launcher.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import FloatingChatWidget from '../components/chat/FloatingChatWidget';
import '../components/chat/chat.css';

export default function BlankDemoPage() {
  const navigate = useNavigate();

  return (
    <div className="os-blank-page">
      {/* Dynamic Background Glow Elements */}
      <div className="os-blank-glow os-blank-glow--top-left" />
      <div className="os-blank-glow os-blank-glow--bottom-right" />

      {/* Top Navbar */}
      <header className="os-blank-header">
        <div className="os-logo-area">
          <div className="os-logo-icon">OS</div>
          <div>
            <div className="os-logo-name">OptionSmart</div>
            <div className="os-logo-sub">AI Assistant Hub</div>
          </div>
        </div>
      </header>

      {/* Main Showcase Hero */}
      <main className="os-blank-main">
        <div className="os-blank-badge">
          <span className="os-blank-badge-dot" />
          OptionSmart AI Assistant Widget Demo
        </div>

        <h1 className="os-blank-title">
          Institutional AI Trading Intelligence <br />
          <span className="os-blank-title-gradient">At Your Fingertips</span>
        </h1>

        <p className="os-blank-subtitle">
          Experience our responsive floating chatbot widget. Click the floating button in the bottom-right corner to start asking about capital tiers, algo strategies, or live market analytics.
        </p>

        {/* Action Prompt Card */}
        <div className="os-blank-prompt-card">
          <div className="os-prompt-icon">👇</div>
          <div>
            <div className="os-prompt-title">Try it out!</div>
            <div className="os-prompt-desc">
              Look at the <strong>bottom-right corner</strong> of your screen and click the floating <strong>OptionSmart Chat Button</strong> to launch the AI Assistant.
            </div>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="os-blank-features">
          <div className="os-feature-card">
            <div className="os-feature-icon">⚡</div>
            <h3>26 Algo Engines</h3>
            <p>Saturn, Venus, & Pluto quantitative strategies with real-time regime filtering.</p>
          </div>

          <div className="os-feature-card">
            <div className="os-feature-icon">🛡️</div>
            <h3>Automated Risk Engine</h3>
            <p>Hard stop-loss, trailing stops, max drawdown limits, and Zerodha broker kill switches.</p>
          </div>

          <div className="os-feature-card">
            <div className="os-feature-icon">📱</div>
            <h3>Fully Responsive & Scalable</h3>
            <p>Seamlessly transforms into a mobile sheet on small screens or a desktop popup widget.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="os-blank-footer">
        <div>OptionSmart AI Assistant · SEBI Regulated Platform Information</div>
      </footer>

      {/* ── THE BOTTOM-RIGHT FLOATING CHATBOT BUTTON & WIDGET ── */}
      <FloatingChatWidget initialOpen={false} />
    </div>
  );
}
