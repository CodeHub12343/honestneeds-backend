/**
 * Honest Need Fee Engine
 * Centralised financial calculations for the entire platform.
 * All percentage-based fees are defined here so they can be updated in one place.
 *
 * Rules
 * -----
 * 1. NEVER hard-code fee percentages inline — always import from this module.
 * 2. All money values are stored and returned as floating-point dollars
 *    (rounded to 2 decimal places) to match the rest of the codebase.
 */

const PLATFORM_FEE_RATE = 0.20;     // 20 % on all transactions
const WITHDRAWAL_FEE_RATE = 0.07;   // 7 % on all withdrawals

// ─────────────────────────────────────────────
// Sponsorship Fee Calculation
// ─────────────────────────────────────────────

/**
 * Calculate sponsorship fees.
 * @param {number} grossAmount — Amount the sponsor is paying.
 * @returns {{ platformFee: number, netAmount: number, breakdown: string }}
 */
function calculateSponsorshipFees(grossAmount) {
  const platformFee = parseFloat((grossAmount * PLATFORM_FEE_RATE).toFixed(2));
  const netAmount   = parseFloat((grossAmount - platformFee).toFixed(2));

  return {
    platformFee,
    netAmount,
    breakdown: `$${grossAmount} gross → $${platformFee} platform fee (20%) → $${netAmount} to community programs`,
  };
}

// ─────────────────────────────────────────────
// Withdrawal Fee Calculation
// ─────────────────────────────────────────────

/**
 * Calculate withdrawal net amount.
 * @param {number} currentBalance
 * @returns {{ withdrawalFee: number, netWithdrawal: number }}
 */
function calculateWithdrawal(currentBalance) {
  const withdrawalFee = parseFloat((currentBalance * WITHDRAWAL_FEE_RATE).toFixed(2));
  const netWithdrawal = parseFloat((currentBalance - withdrawalFee).toFixed(2));
  return { withdrawalFee, netWithdrawal };
}

// ─────────────────────────────────────────────
// Admin Task Generation
// ─────────────────────────────────────────────

/**
 * Benefit → task-description map.
 * Only benefits that require a manual admin action are listed.
 */
const BENEFIT_TASK_MAP = {
  'Social media shoutout':
    (biz) => `Post social media shoutout for "${biz}" — tag their handles if provided`,
  'Dedicated social post':
    (biz) => `Create and publish a dedicated social media post for "${biz}"`,
  'Featured logo placement on Sponsor Wall':
    (biz) => `Upload and place "${biz}" logo on Sponsor Wall (Gold tier position)`,
  'Featured in email campaign':
    (biz) => `Include "${biz}" in next email newsletter campaign`,
  'Homepage placement (30 days)':
    (biz) => `Activate homepage banner for "${biz}" — set 30-day timer`,
  'Video shoutout':
    (biz) => `Record and post video shoutout for "${biz}"`,
  'Priority campaign listing':
    (biz) => `Enable priority listing for "${biz}" campaigns`,
  'Featured campaign promotion for 60 days':
    (biz) => `Activate featured campaign promotion for "${biz}" — set 60-day timer`,
  'Sponsor recognition across all campaigns':
    (biz) => `Add "${biz}" recognition badge across all active campaigns`,
  'Press mention':
    (biz) => `Include "${biz}" in next press release or blog post`,
  'Larger ad placement':
    (biz) => `Set up larger ad placement for "${biz}" on the platform`,
  'Expanded promotional opportunities':
    (biz) => `Set up expanded promotional placements for "${biz}"`,
  'Homepage banner placement':
    (biz) => `Activate homepage banner for "${biz}" (Gold org tier — permanent)`,
  'Homepage banner (permanent)':
    (biz) => `Activate permanent homepage banner for "${biz}" (National tier)`,
  'VIP partnership call':
    (biz) => `Schedule VIP onboarding call with "${biz}" representative`,
  'Press & media features':
    (biz) => `Coordinate press & media feature coverage for "${biz}"`,
  'Custom Enterprise terms':
    (biz) => `Draft and send custom enterprise partnership terms to "${biz}"`,
};

/**
 * Auto-generate admin tasks based on the tier's benefits.
 * @param {object}  tier         — Tier object from SPONSORSHIP_TIERS
 * @param {string}  businessName — The sponsor's business name
 * @returns {Array<{ taskDescription: string, isComplete: boolean, completedAt: Date|null }>}
 */
function generateAdminTasks(tier, businessName) {
  const biz = businessName || 'Sponsor';

  return tier.benefits
    .filter((benefit) => BENEFIT_TASK_MAP[benefit])
    .map((benefit) => ({
      taskDescription: BENEFIT_TASK_MAP[benefit](biz),
      isComplete: false,
      completedAt: null,
    }));
}

module.exports = {
  PLATFORM_FEE_RATE,
  WITHDRAWAL_FEE_RATE,
  calculateSponsorshipFees,
  calculateWithdrawal,
  generateAdminTasks,
};
