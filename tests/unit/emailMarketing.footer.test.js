/**
 * TASK-9.1 — the marketing footer helper injects the unsubscribe link,
 * physical address, and locale-correct copy. Transactional sends never
 * invoke this helper (verified by inspection: only `marketing.*` writers
 * call it; the EmailService class methods do not require it).
 */

process.env.SENDGRID_MARKETING_API_KEY = 'test-key';
process.env.MARKETING_UNSUBSCRIBE_URL = 'https://honestneed.com/unsubscribe';
process.env.MARKETING_PHYSICAL_ADDRESS = 'HonestNeed · 1 Market St · SF CA';

const { marketing } = require('../../src/services/emailService');

describe('marketing footer', () => {
  test('English footer has unsubscribe link + address', () => {
    const { html, text } = marketing._footerForTests({
      unsubscribeUrl: 'https://honestneed.com/unsubscribe',
      physicalAddress: 'HonestNeed · 1 Market St · SF CA',
      locale: 'en',
    });
    expect(html).toContain('https://honestneed.com/unsubscribe');
    expect(html).toContain('HonestNeed · 1 Market St · SF CA');
    expect(html).toMatch(/Unsubscribe/i);
    expect(text).toContain('Unsubscribe:');
    expect(text).toContain('HonestNeed · 1 Market St · SF CA');
  });

  test('Spanish locale uses Spanish copy', () => {
    const { html } = marketing._footerForTests({
      unsubscribeUrl: 'https://x/u',
      physicalAddress: 'addr',
      locale: 'es',
    });
    expect(html).toMatch(/Darse de baja/);
  });

  test('unknown locale falls back to English', () => {
    const { html } = marketing._footerForTests({
      unsubscribeUrl: 'https://x/u',
      physicalAddress: 'addr',
      locale: 'xx',
    });
    expect(html).toMatch(/Unsubscribe/);
  });
});

describe('marketing.sendCampaign dry_run', () => {
  test('dry_run returns preview with the footer appended, no network call', async () => {
    const result = await marketing.sendCampaign({
      name: 'Welcome blast',
      list_ids: ['list-1'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      dry_run: true,
    });
    expect(result.dry_run).toBe(true);
    expect(result.preview.html).toContain('<p>Hi</p>');
    expect(result.preview.html).toContain('https://honestneed.com/unsubscribe');
  });

  test('rejects invalid input before any network call', async () => {
    await expect(marketing.sendCampaign({ name: '', list_ids: [], subject: '', html: '' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
