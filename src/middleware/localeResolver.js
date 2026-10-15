/**
 * localeResolver — attaches `req.locale` to every request.
 *
 * Resolution order (highest wins):
 *   1. req.user.locale    — the signed-in user's stored preference
 *   2. nf_locale cookie   — persisted selection for signed-out users
 *   3. Accept-Language    — browser signal
 *   4. DEFAULT_LOCALE     — hard fallback (usually 'en')
 *
 * An untrusted header can only move the request to a locale that passes
 * `normalizeLocale()` — the allowlist is the source of truth. An invalid value
 * silently falls through to the next source rather than erroring, so a bad
 * cookie never 500s the API.
 *
 * Mounted AFTER authMiddleware (where it runs) so req.user.locale is seen,
 * but BEFORE route handlers so every endpoint has req.locale available.
 */

const { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } = require('../config/i18n');

function fromAcceptLanguage(header) {
  if (!header || typeof header !== 'string') return null;
  // Parse `en-US,en;q=0.9,es;q=0.8` → ordered tags.
  const parts = header
    .split(',')
    .map((p) => {
      const [tag, qPart] = p.trim().split(';');
      const q = qPart && /q=(\d+(\.\d+)?)/.exec(qPart);
      return { tag: tag.trim(), q: q ? parseFloat(q[1]) : 1.0 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    const normalized = normalizeLocale(tag);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Pure resolver — exported for unit tests. Takes the three signals and
 * returns the resolved locale.
 */
function resolveLocale({ userLocale, cookieLocale, acceptLanguage } = {}) {
  const userMatch = normalizeLocale(userLocale);
  if (userMatch) return userMatch;
  const cookieMatch = normalizeLocale(cookieLocale);
  if (cookieMatch) return cookieMatch;
  const headerMatch = fromAcceptLanguage(acceptLanguage);
  if (headerMatch) return headerMatch;
  return DEFAULT_LOCALE;
}

function localeResolver(req, _res, next) {
  const userLocale = req.user && req.user.locale ? req.user.locale : null;
  const cookieLocale = req.cookies ? req.cookies[LOCALE_COOKIE] : null;
  const acceptLanguage = req.headers ? req.headers['accept-language'] : null;
  req.locale = resolveLocale({ userLocale, cookieLocale, acceptLanguage });
  next();
}

module.exports = localeResolver;
module.exports.resolveLocale = resolveLocale;
module.exports.fromAcceptLanguage = fromAcceptLanguage;
