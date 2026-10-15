process.env.I18N_SUPPORTED_LOCALES = 'en,es';
process.env.I18N_DEFAULT_LOCALE = 'en';

const { t, tLocale, format, _clearCache } = require('../../src/i18n/t');

afterEach(() => _clearCache());

describe('format (ICU subset)', () => {
  it('substitutes simple variables', () => {
    expect(format('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('leaves undefined vars as empty', () => {
    expect(format('Hello {name}', {})).toBe('Hello ');
  });

  it('handles plural one/other', () => {
    const tpl = '{count, plural, one {# campaign} other {# campaigns}}';
    expect(format(tpl, { count: 1 }, 'en')).toBe('1 campaign');
    expect(format(tpl, { count: 3 }, 'en')).toBe('3 campaigns');
    expect(format(tpl, { count: 0 }, 'en')).toBe('0 campaigns');
  });

  it('honours exact match (=0) over category', () => {
    const tpl = '{count, plural, =0 {None yet} one {# campaign} other {# campaigns}}';
    expect(format(tpl, { count: 0 }, 'en')).toBe('None yet');
    expect(format(tpl, { count: 2 }, 'en')).toBe('2 campaigns');
  });

  it('handles select', () => {
    const tpl = '{gender, select, male {he} female {she} other {they}}';
    expect(format(tpl, { gender: 'male' })).toBe('he');
    expect(format(tpl, { gender: 'female' })).toBe('she');
    expect(format(tpl, { gender: 'nonbinary' })).toBe('they');
  });

  it('pluralises Spanish correctly', () => {
    const tpl = '{count, plural, one {# campaña} other {# campañas}}';
    expect(format(tpl, { count: 1 }, 'es')).toBe('1 campaña');
    expect(format(tpl, { count: 7 }, 'es')).toBe('7 campañas');
  });
});

describe('t / tLocale (key resolution)', () => {
  it('returns Spanish for a known key in es', () => {
    expect(tLocale('es', 'validation.email_required')).toMatch(/correo/);
  });

  it('falls back to English when the key is missing in requested locale', () => {
    expect(tLocale('es', 'common.ok')).toBe('OK');
  });

  it('returns the key itself when missing in every locale', () => {
    expect(tLocale('en', 'does.not.exist')).toBe('does.not.exist');
  });

  it('t uses req.locale', () => {
    const req = { locale: 'es' };
    expect(t(req, 'validation.email_required')).toMatch(/correo/);
  });

  it('t falls back to default locale when req is bare', () => {
    expect(t({}, 'validation.email_required')).toMatch(/An email address/);
  });

  it('plural + variable interpolation together', () => {
    const req = { locale: 'en' };
    expect(t(req, 'campaigns.count', { count: 5 })).toBe('5 campaigns');
  });
});
