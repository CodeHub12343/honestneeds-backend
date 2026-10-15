/**
 * Server-side ICU-style message helper.
 *
 * Supports the subset actually used by HonestNeed:
 *   - Variable interpolation: `Hello {name}`
 *   - Pluralization:          `{count, plural, one {# campaign} other {# campaigns}}`
 *     where `#` substitutes the plural variable's value.
 *   - Select (string switch): `{gender, select, male {he} female {she} other {they}}`
 *
 * This is intentionally NOT a full ICU parser — the goal is to keep server
 * dependencies thin while covering 95% of real messages. If a template needs
 * nested formats, lift that string to the frontend (next-intl handles the
 * full spec there).
 *
 * API:
 *   t(req, 'validation.email_required')
 *   t(req, 'campaigns.count', { count: 3 })
 *   tLocale('es', 'validation.email_required')
 *
 * Resolution:
 *   current locale → DEFAULT_LOCALE → key itself (so callers see a loud miss).
 */

const path = require('path');
const fs = require('fs');

const { DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale } = require('../config/i18n');
const winstonLogger = require('../utils/winstonLogger');

const MESSAGES_DIR = path.join(__dirname, 'messages');

// Lazy, cached per locale. Falsy per-locale entry means "tried and missing".
const _cache = {};

function loadLocale(locale) {
  if (locale in _cache) return _cache[locale];
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const flat = flatten(JSON.parse(raw));
    _cache[locale] = flat;
    return flat;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      winstonLogger.error('i18n: failed to load locale', { locale, message: err.message });
    }
    _cache[locale] = null;
    return null;
  }
}

/**
 * Flattens nested message JSON into `a.b.c` → value map.
 * Values must be strings (ICU message template).
 */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else if (typeof v === 'string') {
      out[key] = v;
    }
  }
  return out;
}

function cardinalCategory(locale, n) {
  try {
    const pr = new Intl.PluralRules(locale);
    return pr.select(Number(n));
  } catch {
    return Number(n) === 1 ? 'one' : 'other';
  }
}

/**
 * Minimal ICU-ish formatter. Reads a template string + variables + locale and
 * returns the rendered string.
 */
function format(template, vars = {}, locale = DEFAULT_LOCALE) {
  if (typeof template !== 'string') return String(template);

  // Walk the template and find balanced {...} blocks.
  let out = '';
  let i = 0;
  while (i < template.length) {
    const openIdx = template.indexOf('{', i);
    if (openIdx === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, openIdx);

    // Find the matching close brace, accounting for nested braces.
    let depth = 1;
    let j = openIdx + 1;
    while (j < template.length && depth > 0) {
      if (template[j] === '{') depth += 1;
      else if (template[j] === '}') depth -= 1;
      if (depth === 0) break;
      j += 1;
    }
    if (depth !== 0) {
      // Unbalanced — pass through the rest unmodified.
      out += template.slice(openIdx);
      break;
    }

    const inner = template.slice(openIdx + 1, j);
    out += renderPlaceholder(inner, vars, locale);
    i = j + 1;
  }
  return out;
}

function renderPlaceholder(inner, vars, locale) {
  const trimmed = inner.trim();

  // Simple variable: {name}
  if (!trimmed.includes(',')) {
    const name = trimmed;
    const value = vars[name];
    return value === undefined || value === null ? '' : String(value);
  }

  // {varName, kind, body}
  const firstComma = trimmed.indexOf(',');
  const secondComma = trimmed.indexOf(',', firstComma + 1);
  if (secondComma === -1) return '';
  const varName = trimmed.slice(0, firstComma).trim();
  const kind = trimmed.slice(firstComma + 1, secondComma).trim();
  const body = trimmed.slice(secondComma + 1).trim();

  if (kind === 'plural') {
    const value = Number(vars[varName]);
    const category = Number.isFinite(value) ? cardinalCategory(locale, value) : 'other';
    const branches = parseBranches(body);
    // Numeric-exact match (`=0`, `=1`) wins over category.
    const exactKey = `=${value}`;
    const chosen = branches[exactKey] || branches[category] || branches.other || '';
    return format(chosen.replace(/#/g, String(value)), vars, locale);
  }

  if (kind === 'select') {
    const value = vars[varName];
    const branches = parseBranches(body);
    const chosen = branches[String(value)] || branches.other || '';
    return format(chosen, vars, locale);
  }

  return '';
}

/**
 * Parse `one {x #} other {y}` into {one:'x #', other:'y'}.
 */
function parseBranches(body) {
  const out = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i += 1;
    // Read branch key (any non-whitespace, non-brace char run).
    let keyEnd = i;
    while (keyEnd < body.length && body[keyEnd] !== '{' && !/\s/.test(body[keyEnd])) keyEnd += 1;
    const key = body.slice(i, keyEnd);
    i = keyEnd;
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (body[i] !== '{') break;
    // Find matching close brace.
    let depth = 1;
    let j = i + 1;
    while (j < body.length && depth > 0) {
      if (body[j] === '{') depth += 1;
      else if (body[j] === '}') depth -= 1;
      if (depth === 0) break;
      j += 1;
    }
    out[key] = body.slice(i + 1, j);
    i = j + 1;
  }
  return out;
}

/**
 * Look up a key in `locale`, with fallback to DEFAULT_LOCALE, then the key.
 */
function resolveMessage(locale, key) {
  const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
  const primary = loadLocale(normalized);
  if (primary && primary[key] !== undefined) return primary[key];
  if (normalized !== DEFAULT_LOCALE) {
    const fallback = loadLocale(DEFAULT_LOCALE);
    if (fallback && fallback[key] !== undefined) return fallback[key];
  }
  return key; // loud miss: callers see the raw key
}

function tLocale(locale, key, vars = {}) {
  return format(resolveMessage(locale, key), vars, locale);
}

function t(req, key, vars = {}) {
  const locale = (req && req.locale) || DEFAULT_LOCALE;
  return tLocale(locale, key, vars);
}

function _clearCache() {
  for (const k of Object.keys(_cache)) delete _cache[k];
}

module.exports = {
  t,
  tLocale,
  format,
  flatten,
  SUPPORTED_LOCALES,
  _clearCache,
};
