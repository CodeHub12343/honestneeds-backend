/**
 * i18n configuration (shared between backend layers).
 *
 * Supported locales come from `I18N_SUPPORTED_LOCALES` env (comma-sep), else
 * the hard default below. The locale allowlist is the source of truth; anything
 * outside it falls back to `DEFAULT_LOCALE`.
 *
 * Per decision §14.7 of the roadmap, Wave 1 is EN + ES; FR/PT-BR follow.
 */

const DEFAULT_LOCALE = (process.env.I18N_DEFAULT_LOCALE || 'en').toLowerCase();

const FALLBACK_SUPPORTED = ['en', 'es'];

const SUPPORTED_LOCALES = (process.env.I18N_SUPPORTED_LOCALES || FALLBACK_SUPPORTED.join(','))
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Normalize a user-supplied locale tag to a supported locale, or null.
 * Accepts 'es', 'es-MX', 'es_419', etc. Case-insensitive.
 */
function normalizeLocale(input) {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().toLowerCase().replace('_', '-');
  if (!cleaned) return null;
  // Exact match (e.g. 'pt-br' when supported list includes 'pt-br').
  if (SUPPORTED_LOCALES.includes(cleaned)) return cleaned;
  // Primary subtag match (e.g. 'es-mx' → 'es').
  const primary = cleaned.split('-')[0];
  if (SUPPORTED_LOCALES.includes(primary)) return primary;
  return null;
}

function isSupported(locale) {
  return SUPPORTED_LOCALES.includes(String(locale || '').toLowerCase());
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_COOKIE: 'nf_locale',
  normalizeLocale,
  isSupported,
};
