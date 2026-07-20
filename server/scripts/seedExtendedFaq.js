/**
 * seedExtendedFaq.js — Seeds the 35 extended FAQ documents into MongoDB.
 *
 * Run from the project root:
 *   node server/scripts/seedExtendedFaq.js
 *
 * Safe to re-run — uses upsert (no duplicate entries).
 * The local MiniLM model (~25 MB) downloads automatically on first run.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const ragService      = require('../services/ragService');
const extendedFaqs    = require('../data/faq_extended.json');

async function main() {
  const mongoUrl = process.env.MONGODB_URI    || 'mongodb://localhost:27017';
  const dbName   = process.env.MONGO_DB_NAME  || 'optionsmart_chat';

  console.log(`\n🔗 Connecting to MongoDB at ${mongoUrl} …`);
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);
  console.log(`✓ Connected  (db: ${dbName})\n`);

  // Mark all docs as 'curated' so they use the curated similarity threshold (0.60)
  const docs = extendedFaqs.map(f => ({ ...f, type: 'curated' }));

  console.log(`📚 Embedding and indexing ${docs.length} extended FAQ documents…`);
  console.log('   (first run downloads the ~25 MB MiniLM model — takes ~30 s)\n');

  await ragService.indexFAQs(db, docs);

  // ── Alias variants for maximum phrase coverage ──────────────────────────────
  // Common user phrasings that should all hit the right FAQ directly from MongoDB
  const ALIASES = [
    // Q01 — Why choose OptionSmart
    { id: 'ext_alias_q01_a', question: 'why should I use optionsmart',           answer: docs.find(d => d.id === 'faq_q01')?.answer },
    { id: 'ext_alias_q01_b', question: 'what makes optionsmart better',          answer: docs.find(d => d.id === 'faq_q01')?.answer },
    { id: 'ext_alias_q01_c', question: 'optionsmart vs competitors advantages',   answer: docs.find(d => d.id === 'faq_q01')?.answer },

    // Q02 — How strategies work
    { id: 'ext_alias_q02_a', question: 'explain how algo strategies work',       answer: docs.find(d => d.id === 'faq_q02')?.answer },
    { id: 'ext_alias_q02_b', question: 'how does saturn venus pluto work',        answer: docs.find(d => d.id === 'faq_q02')?.answer },
    { id: 'ext_alias_q02_c', question: 'investment scheme optionsmart',           answer: docs.find(d => d.id === 'faq_q02')?.answer },

    // Q03 — Platform charges
    { id: 'ext_alias_q03_a', question: 'how much does optionsmart cost',          answer: docs.find(d => d.id === 'faq_q03')?.answer },
    { id: 'ext_alias_q03_b', question: 'optionsmart subscription price',          answer: docs.find(d => d.id === 'faq_q03')?.answer },
    { id: 'ext_alias_q03_c', question: 'fee charges of optionsmart platform',     answer: docs.find(d => d.id === 'faq_q03')?.answer },

    // Q04 — Mobile app
    { id: 'ext_alias_q04_a', question: 'is there an app for optionsmart',         answer: docs.find(d => d.id === 'faq_q04')?.answer },
    { id: 'ext_alias_q04_b', question: 'optionsmart android app',                 answer: docs.find(d => d.id === 'faq_q04')?.answer },
    { id: 'ext_alias_q04_c', question: 'optionsmart iphone ios app',              answer: docs.find(d => d.id === 'faq_q04')?.answer },

    // Q05 — Coding knowledge
    { id: 'ext_alias_q05_a', question: 'do I need to know coding for optionsmart',answer: docs.find(d => d.id === 'faq_q05')?.answer },
    { id: 'ext_alias_q05_b', question: 'programming required for algo trading',   answer: docs.find(d => d.id === 'faq_q05')?.answer },
    { id: 'ext_alias_q05_c', question: 'is optionsmart for non-technical users',  answer: docs.find(d => d.id === 'faq_q05')?.answer },

    // Q06 — Backtesting
    { id: 'ext_alias_q06_a', question: 'can I backtest before investing',         answer: docs.find(d => d.id === 'faq_q06')?.answer },
    { id: 'ext_alias_q06_b', question: 'test strategy on historical data',        answer: docs.find(d => d.id === 'faq_q06')?.answer },

    // Q07 — Trading segments
    { id: 'ext_alias_q07_a', question: 'which markets does optionsmart trade in', answer: docs.find(d => d.id === 'faq_q07')?.answer },
    { id: 'ext_alias_q07_b', question: 'does optionsmart trade nifty banknifty',  answer: docs.find(d => d.id === 'faq_q07')?.answer },
    { id: 'ext_alias_q07_c', question: 'equity futures options commodity trading',answer: docs.find(d => d.id === 'faq_q07')?.answer },

    // Q08 — Beginner friendly
    { id: 'ext_alias_q08_a', question: 'can a beginner use optionsmart',          answer: docs.find(d => d.id === 'faq_q08')?.answer },
    { id: 'ext_alias_q08_b', question: 'I am new to trading can I use optionsmart',answer: docs.find(d => d.id === 'faq_q08')?.answer },
    { id: 'ext_alias_q08_c', question: 'no trading experience optionsmart',       answer: docs.find(d => d.id === 'faq_q08')?.answer },

    // Q09 — TradingView
    { id: 'ext_alias_q09_a', question: 'tradingview charts with optionsmart',     answer: docs.find(d => d.id === 'faq_q09')?.answer },
    { id: 'ext_alias_q09_b', question: 'does optionsmart support tradingview',    answer: docs.find(d => d.id === 'faq_q09')?.answer },

    // Q10 — Strategy developers
    { id: 'ext_alias_q10_a', question: 'how to become a strategy developer',      answer: docs.find(d => d.id === 'faq_q10')?.answer },
    { id: 'ext_alias_q10_b', question: 'sell my algo strategy optionsmart',       answer: docs.find(d => d.id === 'faq_q10')?.answer },
    { id: 'ext_alias_q10_c', question: 'what is smartalgos',                      answer: docs.find(d => d.id === 'faq_q10')?.answer },

    // Q11 — ROC
    { id: 'ext_alias_q11_a', question: 'how much return does optionsmart give',   answer: docs.find(d => d.id === 'faq_q11')?.answer },
    { id: 'ext_alias_q11_b', question: 'expected returns from optionsmart',       answer: docs.find(d => d.id === 'faq_q11')?.answer },
    { id: 'ext_alias_q11_c', question: 'return on capital roc optionsmart',       answer: docs.find(d => d.id === 'faq_q11')?.answer },

    // Q12 — Hedge, directional info
    { id: 'ext_alias_q12_a', question: 'does optionsmart hedge positions',        answer: docs.find(d => d.id === 'faq_q12')?.answer },
    { id: 'ext_alias_q12_b', question: 'what is directional vs non directional',  answer: docs.find(d => d.id === 'faq_q12')?.answer },

    // Q13 — Strategy index, markets
    { id: 'ext_alias_q13_a', question: 'which index does optionsmart trade',      answer: docs.find(d => d.id === 'faq_q13')?.answer },
    { id: 'ext_alias_q13_b', question: 'nifty banknifty optionsmart strategies',  answer: docs.find(d => d.id === 'faq_q13')?.answer },

    // Q14 — Risk-reward, margin, collateral
    { id: 'ext_alias_q14_a', question: 'margin needed for optionsmart',           answer: docs.find(d => d.id === 'faq_q14')?.answer },
    { id: 'ext_alias_q14_b', question: 'can I use pledged shares collateral',     answer: docs.find(d => d.id === 'faq_q14')?.answer },
    { id: 'ext_alias_q14_c', question: 'what is the stop loss in optionsmart',    answer: docs.find(d => d.id === 'faq_q14')?.answer },

    // Q15 — Drawdown
    { id: 'ext_alias_q15_a', question: 'maximum loss in optionsmart',             answer: docs.find(d => d.id === 'faq_q15')?.answer },
    { id: 'ext_alias_q15_b', question: 'what is drawdown in optionsmart',         answer: docs.find(d => d.id === 'faq_q15')?.answer },
    { id: 'ext_alias_q15_c', question: 'how much can optionsmart lose per day',   answer: docs.find(d => d.id === 'faq_q15')?.answer },

    // Q16 — Returns vs mutual fund
    { id: 'ext_alias_q16_a', question: 'optionsmart vs mutual fund which is better', answer: docs.find(d => d.id === 'faq_q16')?.answer },
    { id: 'ext_alias_q16_b', question: 'why algo trading over mutual fund',       answer: docs.find(d => d.id === 'faq_q16')?.answer },
    { id: 'ext_alias_q16_c', question: 'less than 15 percent return worth it',    answer: docs.find(d => d.id === 'faq_q16')?.answer },

    // Q17 — Government news impact
    { id: 'ext_alias_q17_a', question: 'what happens to strategy on budget day',  answer: docs.find(d => d.id === 'faq_q17')?.answer },
    { id: 'ext_alias_q17_b', question: 'RBI policy impact on optionsmart algo',   answer: docs.find(d => d.id === 'faq_q17')?.answer },
    { id: 'ext_alias_q17_c', question: 'how algo handles market crash news',      answer: docs.find(d => d.id === 'faq_q17')?.answer },

    // Q18 — Brokerage cost
    { id: 'ext_alias_q18_a', question: 'zerodha brokerage for optionsmart trades',answer: docs.find(d => d.id === 'faq_q18')?.answer },
    { id: 'ext_alias_q18_b', question: 'how much brokerage is charged',           answer: docs.find(d => d.id === 'faq_q18')?.answer },

    // Q19 — F&O equity
    { id: 'ext_alias_q19_a', question: 'does optionsmart trade options futures',  answer: docs.find(d => d.id === 'faq_q19')?.answer },
    { id: 'ext_alias_q19_b', question: 'weekly expiry options trading optionsmart',answer: docs.find(d => d.id === 'faq_q19')?.answer },

    // Q20 — Commodity MCX
    { id: 'ext_alias_q20_a', question: 'gold silver crude oil trading optionsmart',answer: docs.find(d => d.id === 'faq_q20')?.answer },
    { id: 'ext_alias_q20_b', question: 'mcx commodity optionsmart',               answer: docs.find(d => d.id === 'faq_q20')?.answer },

    // Q22 — Which sector
    { id: 'ext_alias_q22_a', question: 'which stocks should I invest in',         answer: docs.find(d => d.id === 'faq_q22')?.answer },
    { id: 'ext_alias_q22_b', question: 'stock recommendations optionsmart',       answer: docs.find(d => d.id === 'faq_q22')?.answer },

    // Q23 — What website offers
    { id: 'ext_alias_q23_a', question: 'what services does optionsmart provide',  answer: docs.find(d => d.id === 'faq_q23')?.answer },
    { id: 'ext_alias_q23_b', question: 'optionsmart platform features',           answer: docs.find(d => d.id === 'faq_q23')?.answer },

    // Q24 — Risk comparison
    { id: 'ext_alias_q24_a', question: 'is options trading riskier than equity',  answer: docs.find(d => d.id === 'faq_q24')?.answer },
    { id: 'ext_alias_q24_b', question: 'options vs equity which is safer',        answer: docs.find(d => d.id === 'faq_q24')?.answer },

    // Q25 — Risk, capital, SEBI
    { id: 'ext_alias_q25_a', question: 'is optionsmart SEBI approved',            answer: docs.find(d => d.id === 'faq_q25')?.answer },
    { id: 'ext_alias_q25_b', question: 'minimum capital to start optionsmart',    answer: docs.find(d => d.id === 'faq_q25')?.answer },
    { id: 'ext_alias_q25_c', question: 'legal compliance optionsmart india',      answer: docs.find(d => d.id === 'faq_q25')?.answer },

    // Q26 — Connected brokers
    { id: 'ext_alias_q26_a', question: 'can I use zerodha with optionsmart',      answer: docs.find(d => d.id === 'faq_q26')?.answer },
    { id: 'ext_alias_q26_b', question: 'angel one optionsmart supported',         answer: docs.find(d => d.id === 'faq_q26')?.answer },

    // Q27 — Fund managers
    { id: 'ext_alias_q27_a', question: 'who manages my money in optionsmart',     answer: docs.find(d => d.id === 'faq_q27')?.answer },
    { id: 'ext_alias_q27_b', question: 'optionsmart team who runs strategies',    answer: docs.find(d => d.id === 'faq_q27')?.answer },

    // Q28 — Referral commission
    { id: 'ext_alias_q28_a', question: 'can I earn referring clients to optionsmart', answer: docs.find(d => d.id === 'faq_q28')?.answer },
    { id: 'ext_alias_q28_b', question: 'affiliate partner program optionsmart',   answer: docs.find(d => d.id === 'faq_q28')?.answer },
    { id: 'ext_alias_q28_c', question: 'referral commission from optionsmart',    answer: docs.find(d => d.id === 'faq_q28')?.answer },

    // Q29 — Platform advantages
    { id: 'ext_alias_q29_a', question: 'what are the benefits of optionsmart',    answer: docs.find(d => d.id === 'faq_q29')?.answer },
    { id: 'ext_alias_q29_b', question: 'pros of using optionsmart algo trading',  answer: docs.find(d => d.id === 'faq_q29')?.answer },

    // Q30 — Software, demo, trial
    { id: 'ext_alias_q30_a', question: 'free trial optionsmart',                  answer: docs.find(d => d.id === 'faq_q30')?.answer },
    { id: 'ext_alias_q30_b', question: 'demo account optionsmart',                answer: docs.find(d => d.id === 'faq_q30')?.answer },
    { id: 'ext_alias_q30_c', question: 'paper trading optionsmart',               answer: docs.find(d => d.id === 'faq_q30')?.answer },

    // Q31 — Course planning
    { id: 'ext_alias_q31_a', question: 'trading course from optionsmart',         answer: docs.find(d => d.id === 'faq_q31')?.answer },
    { id: 'ext_alias_q31_b', question: 'learn algo trading optionsmart',          answer: docs.find(d => d.id === 'faq_q31')?.answer },

    // Q32 — Registration, onboarding
    { id: 'ext_alias_q32_a', question: 'how to register on optionsmart',          answer: docs.find(d => d.id === 'faq_q32')?.answer },
    { id: 'ext_alias_q32_b', question: 'onboarding process optionsmart steps',    answer: docs.find(d => d.id === 'faq_q32')?.answer },
    { id: 'ext_alias_q32_c', question: 'executive support during registration',   answer: docs.find(d => d.id === 'faq_q32')?.answer },

    // Q33 — Strategy depth
    { id: 'ext_alias_q33_a', question: 'detailed explanation of optionsmart strategies', answer: docs.find(d => d.id === 'faq_q33')?.answer },
    { id: 'ext_alias_q33_b', question: 'how exactly does saturn strategy work',   answer: docs.find(d => d.id === 'faq_q33')?.answer },
    { id: 'ext_alias_q33_c', question: 'deep dive pluto directional strategy',    answer: docs.find(d => d.id === 'faq_q33')?.answer },

    // Q34 — Runs, timings, own strategy
    { id: 'ext_alias_q34_a', question: 'at what time does algo start trading',    answer: docs.find(d => d.id === 'faq_q34')?.answer },
    { id: 'ext_alias_q34_b', question: 'what time does optionsmart square off',   answer: docs.find(d => d.id === 'faq_q34')?.answer },
    { id: 'ext_alias_q34_c', question: 'build my own strategy on optionsmart',    answer: docs.find(d => d.id === 'faq_q34')?.answer },

    // Q35 — Starting instructions
    { id: 'ext_alias_q35_a', question: 'step by step guide to start optionsmart', answer: docs.find(d => d.id === 'faq_q35')?.answer },
    { id: 'ext_alias_q35_b', question: 'what do I need to start algo trading',    answer: docs.find(d => d.id === 'faq_q35')?.answer },
    { id: 'ext_alias_q35_c', question: 'requirements to start with optionsmart',  answer: docs.find(d => d.id === 'faq_q35')?.answer },
  ].filter(a => a.answer);

  console.log(`\n🔗 Adding ${ALIASES.length} alias documents for extended phrase coverage…`);
  await ragService.indexFAQs(db, ALIASES.map(a => ({ ...a, type: 'curated' })));

  const total = docs.length + ALIASES.length;
  console.log(`\n✅ Done! ${docs.length} extended FAQs + ${ALIASES.length} aliases indexed into MongoDB.`);
  console.log(`   Total documents added: ${total}`);
  console.log('   Restart the server or let warmCaches() reload — queries will now hit MongoDB directly.\n');

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Extended FAQ seed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
