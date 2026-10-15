const crypto = require('crypto');
const { verifySignature, expectedSignature } = require('../../src/webhooks/cloudinaryVideo');

describe('cloudinaryVideo webhook signature', () => {
  it('accepts a valid signature within clock skew', () => {
    const body = JSON.stringify({ hello: 'world' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = expectedSignature(body, ts, 'secret');
    const ok = verifySignature(Buffer.from(body), {
      'x-cld-timestamp': ts,
      'x-cld-signature': sig,
    }, 'secret');
    expect(ok).toBe(true);
  });

  it('rejects a forged signature', () => {
    const body = JSON.stringify({ hello: 'world' });
    const ts = String(Math.floor(Date.now() / 1000));
    const bogus = crypto.createHash('sha1').update('nope').digest('hex');
    const ok = verifySignature(Buffer.from(body), {
      'x-cld-timestamp': ts,
      'x-cld-signature': bogus,
    }, 'secret');
    expect(ok).toBe(false);
  });

  it('rejects stale timestamps', () => {
    const body = JSON.stringify({ hello: 'world' });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = expectedSignature(body, staleTs, 'secret');
    const ok = verifySignature(Buffer.from(body), {
      'x-cld-timestamp': staleTs,
      'x-cld-signature': sig,
    }, 'secret');
    expect(ok).toBe(false);
  });

  it('rejects when missing signature or timestamp', () => {
    expect(verifySignature(Buffer.from('x'), {}, 'secret')).toBe(false);
    expect(verifySignature(Buffer.from('x'), { 'x-cld-timestamp': '1' }, 'secret')).toBe(false);
  });

  it('rejects when secret is missing', () => {
    const body = 'x';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = expectedSignature(body, ts, 'secret');
    expect(verifySignature(Buffer.from(body), { 'x-cld-timestamp': ts, 'x-cld-signature': sig }, undefined)).toBe(false);
  });
});
