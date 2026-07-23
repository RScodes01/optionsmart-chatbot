/**
 * privacyGuard.js
 * Detects queries that ask for sensitive/private business data that should
 * NOT be revealed by the chatbot. Returns a structured "talk to advisor"
 * response instead of querying MongoDB or calling the LLM API.
 *
 * Sensitive categories:
 * - Exact returns / profit percentages / ROI numbers
 * - Specific fee structures / commission / pricing details
 * - Internal infrastructure / tech stack details
 * - Exact drawdown numbers / historical P&L data
 * - Client count / AUM / total funds managed
 * - Internal strategy parameters / algo code details
 */

// ── Private topic patterns ──────────────────────────────────────────────────
// Each entry: { pattern: RegExp, topic: string }
const PRIVATE_PATTERNS = [
  // Returns / Profit numbers
  { pattern: /\b(exact|actual|specific|precise|how much|what percentage|what %|guaranteed|average|annual|monthly|weekly|daily)\b.{0,40}\b(return|profit|gain|yield|income|roi|pnl|p&l|performance|expect)\b/i, topic: 'returns' },
  { pattern: /\b(returns?|profits?|gains?|yields?|income)\b.{0,15}\b(can i expect|should i expect|will i get|to expect)\b/i, topic: 'returns' },
  { pattern: /\bwhat returns\b/i, topic: 'returns' },
  { pattern: /\b(return|profit|gain|earn|yield|income).{0,20}\b(\d+\s*%|percent|crore|lakh|rupee)\b/i, topic: 'returns' },
  { pattern: /\bhow much.{0,30}(make|earn|profit|gain|generate|return)\b/i, topic: 'returns' },
  { pattern: /\b(past|historical|track record|last year|previous year)\b.{0,20}\b(return|profit|performance|result)\b/i, topic: 'historical_performance' },

  // Fee / Pricing details
  { pattern: /\b(fee|fees|charge|charges|commission|pricing|cost|rate|subscription).{0,20}\b(structure|breakdown|details|how much|exact|percentage|%)\b/i, topic: 'fees' },
  { pattern: /\b(how much).{0,30}(fee|cost|charge|pay|subscription)\b/i, topic: 'fees' },
  { pattern: /\b(profit sharing|revenue share|management fee|performance fee)\b/i, topic: 'fees' },

  // AUM / Client data
  { pattern: /\b(aum|assets under management|total funds|total capital|how many client|client count|total investor)\b/i, topic: 'aum' },
  { pattern: /\b(how many|number of|total|count of|size of)\b.{0,20}\b(client|investor|user|subscriber|customer|partner)\b/i, topic: 'aum' },
  { pattern: /\bhow many clients?\b/i, topic: 'aum' },

  // Internal algo parameters
  { pattern: /\b(algorithm|algo|strategy).{0,30}\b(code|source code|parameter|config|setting|threshold|formula|logic|weight|multiplier)\b/i, topic: 'algo_internals' },
  { pattern: /\b(how exactly|exactly how|step by step|implementation|internal|under the hood)\b.{0,30}\b(strategy|algorithm|algo|signal|trigger)\b/i, topic: 'algo_internals' },

  // Drawdown / Risk thresholds (detailed numbers)
  { pattern: /\b(exact|maximum|worst|historical|actual)\b.{0,20}\b(drawdown|loss|dd|max loss)\b/i, topic: 'drawdown' },

  // Infrastructure details
  { pattern: /\b(server|infrastructure|latency|tech stack|architecture|cloud|aws|azure|database)\b.{0,20}\b(detail|spec|setup|provider|host)\b/i, topic: 'tech_stack' },

  // Recruitment / Careers / Developer Onboarding
  { pattern: /\b(hiring|recruit|recruitment|recruiting|vacanc(y|ies)|careers?|internships?|jobs?|openings?)\b/i, topic: 'recruitment' },
  { pattern: /\b(apply|applying)\b.*\b(job|role|position|work|intern|developer)\b/i, topic: 'recruitment' },
  { pattern: /\b(work|working)\b.*\b(at|with|for)\b.*\b(optionsmart|goalgo)\b/i, topic: 'recruitment' },
  { pattern: /\b(strategy\s+developer|monetiz(e|ing|ation)\b.*\bstrateg(y|ies)|developer\s+onboarding)\b/i, topic: 'recruitment' },
];

const CONTACT_INFO = require('../config/contact');

const ADVISOR_MESSAGE = `For detailed figures on this — including specific performance numbers, fee structures, and strategy parameters — I'd recommend speaking directly with an OptionSmart advisor. They can walk you through the exact data tailored to your capital tier and goals.

📞 **Talk to an Advisor:**
- 💬 Use the WhatsApp button below to connect instantly
- 📧 Reach us at: **${CONTACT_INFO.email}**
- 📱 Call: **${CONTACT_INFO.phoneDisplay}**

An advisor will provide complete, accurate information that is specific to your situation.`;

const RECRUITMENT_ADVISOR_MESSAGE = `For all recruitment, hiring, career opportunities, and strategy developer onboarding queries, please speak directly with an OptionSmart advisor.

📞 **Talk to an Advisor:**
- 💬 Use the WhatsApp button below to connect instantly
- 📧 Reach us at: **${CONTACT_INFO.email}**
- 📱 Call: **${CONTACT_INFO.phoneDisplay}**

An advisor will assist you with current openings, developer partnerships, and onboarding requirements.`;

/**
 * Check if a question is asking for sensitive/private information.
 *
 * @param {string} question - User's question
 * @returns {{ blocked: boolean, topic?: string, message?: string }}
 */
function checkPrivacy(question) {
  if (!question || typeof question !== 'string') {
    return { blocked: false };
  }

  for (const { pattern, topic } of PRIVATE_PATTERNS) {
    if (pattern.test(question)) {
      return {
        blocked: true,
        topic,
        message: topic === 'recruitment' ? RECRUITMENT_ADVISOR_MESSAGE : ADVISOR_MESSAGE,
      };
    }
  }

  return { blocked: false };
}

module.exports = { checkPrivacy, ADVISOR_MESSAGE, RECRUITMENT_ADVISOR_MESSAGE };
