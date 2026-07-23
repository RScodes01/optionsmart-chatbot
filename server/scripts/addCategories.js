const fs = require('fs');
const path = require('path');

const CATEGORY_MAP = {
  faq_q01: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q02: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q03: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q04: { category: "platform", categoryLabel: "Platform" },
  faq_q05: { category: "beginner", categoryLabel: "Beginner Friendly" },
  faq_q06: { category: "platform", categoryLabel: "Platform" },
  faq_q07: { category: "platform", categoryLabel: "Platform" },
  faq_q08: { category: "beginner", categoryLabel: "Beginner Friendly" },
  faq_q09: { category: "platform", categoryLabel: "Platform" },
  faq_q10: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q11: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q12: { category: "risk", categoryLabel: "Risk & Safety" },
  faq_q13: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q14: { category: "risk", categoryLabel: "Risk & Safety" },
  faq_q15: { category: "risk", categoryLabel: "Risk & Safety" },
  faq_q16: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q17: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q18: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q19: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q20: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q21: { category: "onboarding", categoryLabel: "Onboarding" },
  faq_q22: { category: "onboarding", categoryLabel: "Onboarding" },
  faq_q23: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q24: { category: "risk", categoryLabel: "Risk & Safety" },
  faq_q25: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q26: { category: "platform", categoryLabel: "Platform" },
  faq_q27: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q28: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q29: { category: "why_choose", categoryLabel: "Why OptionSmart" },
  faq_q30: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q31: { category: "beginner", categoryLabel: "Beginner Friendly" },
  faq_q32: { category: "onboarding", categoryLabel: "Onboarding" },
  faq_q33: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q34: { category: "platform", categoryLabel: "Platform" },
  faq_q35: { category: "onboarding", categoryLabel: "Onboarding" },
  faq_q36: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q37: { category: "strategies", categoryLabel: "Algo Strategies" },
  faq_q38: { category: "pricing", categoryLabel: "Capital & Pricing" },
  faq_q39: { category: "risk", categoryLabel: "Risk & Safety" },
  faq_q40: { category: "onboarding", categoryLabel: "Onboarding" },
  faq_q41: { category: "strategies", categoryLabel: "Algo Strategies" }
};

const extPath = path.join(__dirname, '../data/faq_extended.json');
const extFaqs = JSON.parse(fs.readFileSync(extPath, 'utf8'));

const updated = extFaqs.map(faq => {
  const catInfo = CATEGORY_MAP[faq.id] || { category: "platform", categoryLabel: "Platform" };
  return {
    ...faq,
    ...catInfo
  };
});

fs.writeFileSync(extPath, JSON.stringify(updated, null, 2), 'utf8');
console.log(`Updated ${updated.length} items in faq_extended.json with category metadata.`);
