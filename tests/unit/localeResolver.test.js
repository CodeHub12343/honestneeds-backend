process.env.I18N_SUPPORTED_LOCALES = 'en,es,pt-br';
process.env.I18N_DEFAULT_LOCALE = 'en';

const localeResolver = require('../../src/middleware/localeResolver');
const { resolveLocale, fromAcceptLanguage } = localeResolver;

describe('resolveLocale (precedence)', () => {
  it('user locale wins over all other signals', () => {
    expect(
      resolveLocale({
        userLocale: 'es',
        cookieLocale: 'en',
        acceptLanguage: 'fr-FR,fr;q=0.9',
      })
    ).toBe('es');
  });

  it('cookie wins when user locale is unset', () => {
    expect(resolveLocale({ cookieLocale: 'es', acceptLanguage: 'en-US' })).toBe('es');
  });

  it('accept-language is used when no user or cookie', () => {
    expect(resolveLocale({ acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8' })).toBe('pt-br');
  });

  it('falls back to default when nothing matches', () => {
    expect(resolveLocale({ acceptLanguage: 'fr,de;q=0.5' })).toBe('en');
  });

  it('silently ignores an unsupported user locale', () => {
    expect(resolveLocale({ userLocale: 'wookiee', cookieLocale: 'es' })).toBe('es');
  });

  it('silently ignores an unsupported cookie value', () => {
    expect(resolveLocale({ cookieLocale: '////', acceptLanguage: 'es-ES' })).toBe('es');
  });

  it('normalizes region-only variants to primary subtag', () => {
    expect(resolveLocale({ userLocale: 'es-MX' })).toBe('es');
  });
});

describe('fromAcceptLanguage', () => {
  it('respects q-weighted order', () => {
    expect(fromAcceptLanguage('fr;q=0.5,es;q=0.9,en;q=0.1')).toBe('es');
  });

  it('returns null when nothing matches the allowlist', () => {
    expect(fromAcceptLanguage('de,fr;q=0.5')).toBeNull();
  });

  it('handles malformed header gracefully', () => {
    expect(fromAcceptLanguage('')).toBeNull();
    expect(fromAcceptLanguage(null)).toBeNull();
  });
});

describe('localeResolver middleware', () => {
  it('attaches req.locale from the resolved value', () => {
    const req = {
      user: { locale: 'es' },
      cookies: { nf_locale: 'en' },
      headers: { 'accept-language': 'fr-FR' },
    };
    const next = jest.fn();
    localeResolver(req, {}, next);
    expect(req.locale).toBe('es');
    expect(next).toHaveBeenCalledWith();
  });

  it('defaults to en when nothing is provided', () => {
    const req = { headers: {}, cookies: {} };
    const next = jest.fn();
    localeResolver(req, {}, next);
    expect(req.locale).toBe('en');
  });
});
