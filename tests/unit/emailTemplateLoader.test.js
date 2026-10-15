process.env.I18N_SUPPORTED_LOCALES = 'en,es';
process.env.I18N_DEFAULT_LOCALE = 'en';

const emailService = require('../../src/services/emailService');

describe('emailService.renderTemplate', () => {
  beforeEach(() => emailService._clearTemplateCache());

  it('renders English welcome template with variable interpolation', async () => {
    const r = await emailService.renderTemplate({
      template: 'welcome',
      locale: 'en',
      data: { displayName: 'Ada', appUrl: 'https://honestneed.com' },
    });
    expect(r.subject).toMatch(/Welcome to HonestNeed, Ada/);
    expect(r.html).toMatch(/Welcome, Ada\./);
    expect(r.html).toContain('https://honestneed.com');
    expect(r.locale).toBe('en');
  });

  it('renders Spanish variant', async () => {
    const r = await emailService.renderTemplate({
      template: 'welcome',
      locale: 'es',
      data: { displayName: 'Ada', appUrl: 'https://honestneed.com' },
    });
    expect(r.subject).toMatch(/Bienvenido a HonestNeed, Ada/);
    expect(r.html).toMatch(/Bienvenido, Ada/);
    expect(r.locale).toBe('es');
  });

  it('falls back to English for an unknown locale', async () => {
    const r = await emailService.renderTemplate({
      template: 'welcome',
      locale: 'de', // not supported
      data: { displayName: 'Ada' },
    });
    expect(r.locale).toBe('en');
    expect(r.subject).toMatch(/Welcome to HonestNeed/);
  });

  it('throws for an unknown template name', async () => {
    await expect(
      emailService.renderTemplate({ template: 'nope_not_a_template', locale: 'en' })
    ).rejects.toThrow(/not found/);
  });

  it('HTML-escapes user-controlled values', async () => {
    const r = await emailService.renderTemplate({
      template: 'welcome',
      locale: 'en',
      data: { displayName: '<script>alert(1)</script>', appUrl: 'https://x' },
    });
    expect(r.html).not.toMatch(/<script>alert/);
    expect(r.html).toMatch(/&lt;script&gt;/);
  });
});
