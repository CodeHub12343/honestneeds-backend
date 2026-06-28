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

/**
 * Parse a rate from an env var, falling back to a default when missing/invalid.
 * Rates must be in [0, 1).
 * @param {string|undefined} envVal
 * @param {number} fallback
 * @returns {number}
 */
function parseRate(envVal, fallback) {
  const n = parseFloat(envVal);
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : fallback;
}

// ─────────────────────────────────────────────
// Canonical fee rates (F-9 / R-4) — the ONLY place fee percentages are defined.
// Override per-environment with the matching env var.
// ─────────────────────────────────────────────

// Platform fee on donations. Policy: 5%. (Manual model: this is owed by the
// creator to the platform, tracked on the fee-settlement ledger — see CF-3.)
const DONATION_FEE_RATE = parseRate(process.env.DONATION_FEE_RATE, 0.05);

// Fee on share-budget reloads. Policy: 20%.
const SHARE_RELOAD_FEE_RATE = parseRate(process.env.SHARE_RELOAD_FEE_RATE, 0.20);

// General/sponsorship platform fee. Policy: 20%. (Unchanged — sponsorship etc.)
const PLATFORM_FEE_RATE = parseRate(process.env.PLATFORM_FEE_RATE, 0.20);

const WITHDRAWAL_FEE_RATE = parseRate(process.env.WITHDRAWAL_FEE_RATE, 0.07); // 7 % on withdrawals

// Integer percentage labels for display (derived — never hard-code "20%"/"5%").
const DONATION_FEE_PERCENT = Math.round(DONATION_FEE_RATE * 100);
const SHARE_RELOAD_FEE_PERCENT = Math.round(SHARE_RELOAD_FEE_RATE * 100);

/**
 * Canonical donation fee calculation, in CENTS (donations are stored in cents).
 * Every donation fee — persisted, displayed, or analytic — must come from here.
 *
 * @param {number} grossCents - gross donation amount in cents
 * @returns {{ grossCents: number, feeCents: number, netCents: number, rate: number, percent: number }}
 */
function calculateDonationFee(grossCents) {
  const g = Math.max(0, Math.round(grossCents || 0));
  const feeCents = Math.round(g * DONATION_FEE_RATE);
  const netCents = g - feeCents;
  return {
    grossCents: g,
    feeCents,
    netCents,
    rate: DONATION_FEE_RATE,
    percent: DONATION_FEE_PERCENT,
  };
}

/**
 * Canonical share-budget reload fee, in CENTS.
 * @param {number} reloadCents - gross reload amount in cents
 * @returns {{ grossCents: number, feeCents: number, netCents: number, rate: number, percent: number }}
 */
function calculateShareReloadFee(reloadCents) {
  const g = Math.max(0, Math.round(reloadCents || 0));
  const feeCents = Math.round(g * SHARE_RELOAD_FEE_RATE);
  return {
    grossCents: g,
    feeCents,
    netCents: g - feeCents,
    rate: SHARE_RELOAD_FEE_RATE,
    percent: SHARE_RELOAD_FEE_PERCENT,
  };
}

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
  // Canonical rates (F-9 / R-4)
  DONATION_FEE_RATE,
  DONATION_FEE_PERCENT,
  SHARE_RELOAD_FEE_RATE,
  SHARE_RELOAD_FEE_PERCENT,
  PLATFORM_FEE_RATE,
  WITHDRAWAL_FEE_RATE,
  // Calculators
  calculateDonationFee,
  calculateShareReloadFee,
  calculateSponsorshipFees,
  calculateWithdrawal,
  generateAdminTasks,
};
