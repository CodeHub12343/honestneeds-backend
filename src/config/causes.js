/**
 * Cause / Interest Catalogue
 *
 * Canonical list of high-level causes a supporter can follow during onboarding
 * (PRD §5.1 Step 3 "Select interests/causes"). These power interest-based
 * campaign matching in AIRecommendationService.
 *
 * Each cause maps to one or more Campaign.need_type prefixes so a category-level
 * interest (e.g. "medical") matches every concrete need type under it
 * (medical_surgery, medical_cancer, …). Keep `code` stable — it is persisted on
 * the user (preferences.interests).
 */

const CAUSES = [
  { code: 'emergency', label: 'Emergency Relief', icon: '🚨', need_prefixes: ['emergency'] },
  { code: 'medical', label: 'Medical & Health', icon: '🏥', need_prefixes: ['medical', 'emergency_medical'] },
  { code: 'education', label: 'Education', icon: '🎓', need_prefixes: ['education'] },
  { code: 'family', label: 'Family & Children', icon: '👨‍👩‍👧', need_prefixes: ['family', 'emergency_food', 'emergency_shelter'] },
  { code: 'community', label: 'Community & Environment', icon: '🌍', need_prefixes: ['community'] },
  { code: 'business', label: 'Small Business', icon: '💼', need_prefixes: ['business'] },
  { code: 'individual', label: 'Individual Support', icon: '🤝', need_prefixes: ['individual'] },
  { code: 'animals', label: 'Animals & Wildlife', icon: '🐾', need_prefixes: ['community_animal_rescue'] },
];

const CAUSE_CODES = CAUSES.map((c) => c.code);
const CAUSE_BY_CODE = new Map(CAUSES.map((c) => [c.code, c]));

/**
 * Whether a given string is a known cause code.
 * @param {string} code
 * @returns {boolean}
 */
function isValidCause(code) {
  return CAUSE_BY_CODE.has(code);
}

/**
 * Normalize an arbitrary interests array to a deduped list of valid cause codes,
 * capped at the catalogue size.
 * @param {unknown} interests
 * @returns {string[]}
 */
function normalizeInterests(interests) {
  if (!Array.isArray(interests)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of interests) {
    const code = String(raw || '').toLowerCase().trim();
    if (isValidCause(code) && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out.slice(0, CAUSES.length);
}

/**
 * Whether a campaign need_type falls under any of the user's interests.
 * Matches on need_type prefix so a category interest covers all sub-types.
 * @param {string} needType - Campaign.need_type
 * @param {string[]} interests - user cause codes
 * @returns {boolean}
 */
function needTypeMatchesInterests(needType, interests) {
  if (!needType || !Array.isArray(interests) || interests.length === 0) return false;
  const nt = String(needType).toLowerCase();
  for (const code of interests) {
    const cause = CAUSE_BY_CODE.get(code);
    if (cause && cause.need_prefixes.some((p) => nt.startsWith(p))) return true;
  }
  return false;
}

module.exports = {
  CAUSES,
  CAUSE_CODES,
  isValidCause,
  normalizeInterests,
  needTypeMatchesInterests,
};
