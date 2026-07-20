/**
 * FaqHub.jsx — Interactive modal for browsing, searching, and reading all 35 FAQs.
 */

import React, { useState, useMemo } from 'react';

// Static import of all 35 structured FAQs matching the server seed
const FAQS = [
  {
    id: "faq_q01",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "Why choose OptionSmart over other algo trading platforms?",
    answer: "OptionSmart stands apart for these key reasons:\n\n• **Institutional-grade infrastructure**: Built on GoAlgoTrade — 26 quantitative engines, 99.9% uptime SLA, NSE/BSE/MCX coverage.\n• **SEBI-aligned, White Box**: Every algo decision is auditable and documented. Not a black box.\n• **Your capital stays with you**: Funds never leave your broker account — OptionSmart only has API trade access, not withdrawal access.\n• **2% MTM cap + kill switch <1 second**: Hard-coded loss protection on every session.\n• **No coding needed**: Fully managed — you connect your broker account once; algorithms do the rest.\n• **No overnight risk**: 100% intraday square-off every session.\n• **1,300+ B2B partners** and deep market expertise from 20+ years of founders' experience."
  },
  {
    id: "faq_q02",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "How do OptionSmart strategies work? Strategy mechanism, investment schemes, product information.",
    answer: "OptionSmart runs **26 quantitative strategy engines**, with three named flagship strategies:\n\n• **Saturn**: Non-Directional theta harvesting strategy. Primary in range-bound regimes, writing straddles/strangles.\n• **Venus**: Versatile hybrid strategy using defined-risk spreads (bull/bear spreads, iron condors) capping both profits and losses.\n• **Pluto**: Aggressive directional strategy for trending regimes using trailing stops.\n\n**Capital schemes**: Core (₹9 Lakh) | Alpha (₹25 Lakh) | Pro (₹50 Lakh) | Elite (₹1 Crore) | Institutional (₹5 Crore+)."
  },
  {
    id: "faq_q03",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What are OptionSmart's platform charges, fees, and subscription cost?",
    answer: "OptionSmart's specific fee structure, profit-sharing arrangements, and subscription pricing are shared directly by an advisor — tailored to your capital tier and trading volume.\n\n• Fees vary by capital tier (Core/Alpha/Pro/Elite/Institutional).\n• Brokerage costs are separate — charged by your connected broker.\n• No hidden fees — all charges are disclosed upfront during onboarding.\n\n📞 Speak to an advisor at **+91 8779328028** for detailed figures."
  },
  {
    id: "faq_q04",
    category: "platform",
    categoryLabel: "Platform",
    question: "Is there a mobile application for OptionSmart?",
    answer: "The **GoAlgoTrade platform** (which powers OptionSmart) is accessible via web browser on both desktop and mobile. The portal is fully responsive and optimized for real-time monitoring of trades, PnL, and option Greeks. Dedicated iOS and Android app availability can be confirmed with your onboarding advisor."
  },
  {
    id: "faq_q05",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "Do I need coding knowledge to use OptionSmart? Is programming required?",
    answer: "**No coding knowledge is required.** OptionSmart is a fully managed algo trading service. You connect your broker account via API with a few clicks, and the algorithms execute trades automatically. Programming skills are only relevant if you want to build and list your own strategies in the developer marketplace."
  },
  {
    id: "faq_q06",
    category: "platform",
    categoryLabel: "Platform",
    question: "Does OptionSmart support backtesting of strategies?",
    answer: "**Yes.** The underlying GoAlgoTrade platform includes a built-in **Strategy Builder & Backtesting** module. You can test and validate custom strategies against NSE/BSE/MCX historical market data to evaluate metrics like PnL, drawdowns, win rate, and Sharpe ratio before deploying real funds."
  },
  {
    id: "faq_q07",
    category: "platform",
    categoryLabel: "Platform",
    question: "Which trading segments are supported? Does OptionSmart trade equity, F&O, commodities?",
    answer: "OptionSmart supports multi-asset coverage across key exchanges:\n\n• **Equity Derivatives (F&O)**: NSE index and stock options (Nifty, BankNifty, FinNifty).\n• **Equity Cash**: Cash equity trading on NSE/BSE.\n• **Commodity Derivatives**: MCX trading (Gold, Silver, Crude Oil, Natural Gas).\n• **Currency Derivatives**: NSE/BSE currency pairs (USD-INR, EUR-INR)."
  },
  {
    id: "faq_q08",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "How beginner-friendly is OptionSmart? Can a beginner use it?",
    answer: "**OptionSmart is 100% beginner-friendly.** You do not need previous trading experience, coding skills, or knowledge of options Greeks. A dedicated executive support team handles onboarding, and the system executes all risk management and trades automatically. We suggest beginners start with the Core tier (Saturn strategy)."
  },
  {
    id: "faq_q09",
    category: "platform",
    categoryLabel: "Platform",
    question: "Does OptionSmart integrate with TradingView?",
    answer: "Yes, the underlying GoAlgoTrade platform supports TradingView integrations (including webhook alerts for custom alert-based order execution). Contact support at **+91 8779328028** to configure custom alert keys or webhooks."
  },
  {
    id: "faq_q10",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "Can I be a strategy developer on OptionSmart? Can I monetize my strategies? What is SmartAlgos?",
    answer: "Yes! You can use GoAlgoTrade's Strategy Builder to construct custom logic, backtest it on historical data, and list it on the **SmartAlgos marketplace** to earn subscription revenues. Contact the B2B team to register as a strategy creator."
  },
  {
    id: "faq_q11",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What is the ROC (Return on Capital) for OptionSmart strategies?",
    answer: "OptionSmart does not guarantee returns, in compliance with SEBI regulations. Saturn targets consistent decay harvesting, while Pluto targets directional trending swings. Specific past performance sheets are shared during personal advisory calls at **+91 8779328028**."
  },
  {
    id: "faq_q12",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What is hedge, position market information, risk, and directional vs non-directional trading?",
    answer: "All strategies deploy defined-risk positions (like option spreads) to cap downside. Non-directional trading (Saturn) captures time decay when the market moves sideways. Directional trading (Pluto) catches trends. Position sizes are automatically adapted based on your capital tier and volatility regime."
  },
  {
    id: "faq_q13",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "What strategy indices and markets does OptionSmart operate in?",
    answer: "OptionSmart primarily trades high-liquidity index derivatives on the **National Stock Exchange (NSE)**, specifically options and futures on **Nifty 50, Bank Nifty, and Fin Nifty**. Select capital plans also offer commodity trading on the **Multi Commodity Exchange (MCX)**."
  },
  {
    id: "faq_q14",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What are the Risk-Reward, Stop-Loss, margin, capital, collateral, and pledge-related features?",
    answer: "Option positions have hard-hedged spreads. Daily loss is capped at **2% MTM** per session (triggering a <1s kill switch). Deployed margin stays in your own broker account. Most supported brokers allow you to pledge shares/ETFs as collateral margin to run OptionSmart strategies."
  },
  {
    id: "faq_q15",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What is the drawdown of OptionSmart strategies? Maximum drawdown?",
    answer: "The absolute maximum daily drawdown is capped at **2% of capital per session** by the automated kill switch. Long-term strategy-level drawdowns vary by strategy (Saturn is conservative with lowest drawdown; Pluto is aggressive with higher volatility). Speak to an advisor to view full performance logs."
  },
  {
    id: "faq_q16",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What are the returns? Why choose OptionSmart if returns are less than 15%? Why not a mutual fund?",
    answer: "OptionSmart focuses on generating uncorrelated, high risk-adjusted returns (Sharpe ratio) with complete liquidity (no lock-ins) and zero overnight risk (100% intraday square-off). Mutual funds carry full market index risk and have T+1/T+3 redemption cycles. OptionSmart limits daily session drawdown to 2%."
  },
  {
    id: "faq_q17",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "How does the strategy function when government news or market events affect stocks?",
    answer: "During events (Budget, RBI policy, elections), the Market Regime Engine detects Volatility Expansion. It automatically scales down position sizes, widens dynamic stops, or pauses trading via its 15+ volatility filters. The 2% MTM cap and intraday square-off ensure no overnight gap down or extreme surprise risk."
  },
  {
    id: "faq_q18",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "What is the brokerage cost with OptionSmart?",
    answer: "Brokerage is paid directly to your connected broker (e.g. Zerodha, Angel One) under their standard rates (usually ₹20 per executed order). Because index options execution involves multiple daily legs, transaction costs are integrated and optimized in OptionSmart's execution logic."
  },
  {
    id: "faq_q19",
    category: "platform",
    categoryLabel: "Platform",
    question: "Does OptionSmart deal in F&O equity markets? How does F&O trading work?",
    answer: "Yes, NSE index F&O (Futures & Options) is our primary segment. OptionSmart utilizes option selling (Saturn) and structured spreads (Venus) to capitalize on decay, avoiding high-risk naked buying. All trades are closed out prior to market close (no physical delivery risk)."
  },
  {
    id: "faq_q20",
    category: "platform",
    categoryLabel: "Platform",
    question: "What is OptionSmart's commodity trading model? Does it trade MCX?",
    answer: "Yes, OptionSmart supports MCX commodity contracts (Gold, Silver, Crude Oil, Natural Gas). It applies the same regime-based execution algorithms, utilizing MCX commodity options to write straddles/strangles and capture theta decay in range-bound cycles."
  },
  {
    id: "faq_q21",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "How did you find the OptionSmart website? What is the source of OptionSmart?",
    answer: "OptionSmart's official web domains are **optionsmart.in** (client information & tiers) and **goalgotrade.tech** (underlying broker execution engine). Users discover OptionSmart through our 1,300+ sub-broker and advisor partner networks, direct referrals, or digital finance media."
  },
  {
    id: "faq_q22",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "Which sector should I invest in? Which stocks should I buy?",
    answer: "OptionSmart does not provide stock advisory or sector picks. To remove single-stock risks (bad earnings reports, corporate issues) and ensure deep execution liquidity, OptionSmart's 26 engines trade exclusively at the index level (Nifty 50, Bank Nifty, Fin Nifty)."
  },
  {
    id: "faq_q23",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "What does the OptionSmart website offer? What are all the features?",
    answer: "We provide systematic index F&O trading powered by 26 quantitative strategies, live analytics via the GoAlgoTrade dashboard, real-time Greeks monitoring, a 2% MTM daily loss cap, and zero overnight exposure. For developers and partners, we offer white-label tools and a strategy monetization engine."
  },
  {
    id: "faq_q24",
    category: "risk",
    categoryLabel: "Risk & Safety",
    question: "What is the risk comparison between equity trading and options trading?",
    answer: "Cash equity has 1:1 exposure and standard market risk. Options F&O has high leverage and higher complexity (time decay, volatility). OptionSmart converts high option risk into a managed, bounded framework by utilizing hedged spreads and enforces a hard-coded 2% daily loss cap."
  },
  {
    id: "faq_q25",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "What are the risk, capital requirements, legality, and SEBI registration details of OptionSmart?",
    answer: "OptionSmart is fully aligned with SEBI's algorithmic trading guidelines, is a registered SEBI Algo Vendor, and trades on NSE & BSE. Capital starts at ₹9 Lakh (Core plan). Your capital remains safe in your own demat account, protected by the broker-client SEBI framework."
  },
  {
    id: "faq_q26",
    category: "platform",
    categoryLabel: "Platform",
    question: "Which brokers are connected to OptionSmart? What are the supported brokers?",
    answer: "Supported brokers include **Zerodha (Kite Connect API)**, **Angel One**, **Motilal Oswal**, **Upstox**, **5Paisa**, and other leading broker terminals. The connection is API-only, giving trade placement rights but zero fund-withdrawal permissions."
  },
  {
    id: "faq_q27",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "Who are the fund managers at OptionSmart?",
    answer: "OptionSmart is an automated algorithmic trading provider, not a PMS or AIF mutual fund. Trades are managed 100% by rules-based quantitative engines designed by co-founders Madhur Dahale (20+ yrs market experience, IIM Lucknow) and Aakash Gupta (Quant specialist, MBA Finance UK)."
  },
  {
    id: "faq_q28",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "Is there a referral commission or affiliation program at OptionSmart?",
    answer: "Yes, OptionSmart supports a robust B2B affiliate and sub-broker program with over 1,300+ registered partners. Partners earn recurring revenue shares based on capital volumes routed through the GoAlgoTrade engine. Contact B2B support to register."
  },
  {
    id: "faq_q29",
    category: "why_choose",
    categoryLabel: "Why OptionSmart",
    question: "What are the advantages of the OptionSmart platform?",
    answer: "1. API trade-execution on your own account (zero fund custody by platform).\n2. Automated 2% daily loss limit (MTM cap).\n3. 100% intraday square-off (no gap risk).\n4. AI/ML exit triggers to prevent emotional errors.\n5. SEBI registered vendor status.\n6. 99.9% uptime SLA."
  },
  {
    id: "faq_q30",
    category: "pricing",
    categoryLabel: "Capital & Pricing",
    question: "Is there software, a subscription plan, a demo, or a trial available for OptionSmart?",
    answer: "OptionSmart is a fully managed cloud service, meaning there is no local software installation. Subscription structures are matched to your capital tier (Core, Alpha, Pro, Elite, Institutional). Demo setups and historical paper trading access can be requested from your advisor."
  },
  {
    id: "faq_q31",
    category: "beginner",
    categoryLabel: "Beginner Friendly",
    question: "What course planning or educational content does OptionSmart offer?",
    answer: "We focus on algorithmic options trading execution. We don't sell active courses, but we provide transparent White Box documentations of our strategy logics (Saturn, Venus, Pluto) and walk clients through the analytics dashboard during onboarding."
  },
  {
    id: "faq_q32",
    category: "onboarding",
    categoryLabel: "Onboarding",
    question: "How does registration and onboarding work at OptionSmart? What is the process and executive support?",
    answer: "1. Speak to an onboarding advisor: 📞 **+91 8779328028**.\n2. Complete KYC forms.\n3. Select your capital tier.\n4. Link your broker terminal (API connect).\n5. Live trading begins. You receive full executive setup support throughout this process."
  },
  {
    id: "faq_q33",
    category: "strategies",
    categoryLabel: "Algo Strategies",
    question: "Can you explain OptionSmart's strategies in depth? How do they function in detail?",
    answer: "• **Saturn**: Standard range-bound theta writer. Initiates straddles/strangles on high IV Rank indices, capturing premium decay.\n• **Venus**: Balanced option spreads (bull spreads, iron condors) keeping capital max risk bounded.\n• **Pluto**: Directional trend rider. Enters index futures/options during high momentum with dynamic trailing exits."
  },
  {
    id: "faq_q34",
    category: "platform",
    categoryLabel: "Platform",
    question: "What are the trading runs, timings, and can I create my own strategy?",
    answer: "Algorithms run matching the market window (9:15 AM to 3:30 PM IST). Strategies initiate trades from 9:30 AM (post-open volatility) and square off all open positions by 3:15 PM. Custom strategy creation and backtesting are supported via GoAlgoTrade developer tools."
  },
  {
    id: "faq_q35",
    category: "onboarding",
    categoryLabel: "Onboarding",
    question: "How do I start trading with OptionSmart? What are the starting instructions?",
    answer: "1. Enable F&O segment in your Zerodha/Angel broker account.\n2. Ensure minimum capital of ₹9 Lakh (Core plan) is cleared in your ledger.\n3. Contact OptionSmart support at **+91 8779328028** to complete KYC and bind your broker API key."
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
        faq.question.toLowerCase().includes(search.toLowerCase()) ||
        faq.answer.toLowerCase().includes(search.toLowerCase());
      
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
          <span>Need custom answers? Ask the bot or call: **+91 8779328028**</span>
        </div>
      </div>
    </div>
  );
}
