/**
 * Phase 5 — tests for src/utils/crypto.js (TASK-5.1).
 *
 * Covers:
 *  - encrypt → decrypt round-trip of ASCII and Unicode strings
 *  - decrypt under the wrong key fails (GCM tag mismatch)
 *  - retired key still decrypts after active-key rotation
 *  - PKCE verifier/challenge pair satisfies S256 relationship
 *  - sha256 is stable for the same input
 */

const crypto = require('crypto');

const freshKey = () => crypto.randomBytes(32).toString('base64');

function reloadModule(env = {}) {
  jest.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return require('../../src/utils/crypto');
}

describe('utils/crypto', () => {
  const KEY_A = freshKey();
  const KEY_B = freshKey();

  afterEach(() => {
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY_ID;
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS;
  });

  test('encrypt/decrypt round-trip for ASCII', () => {
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    const ct = mod.encrypt('hello world');
    expect(ct).toMatch(/^v1:/);
    expect(mod.decrypt(ct)).toBe('hello world');
  });

  test('encrypt/decrypt round-trip for Unicode + long input', () => {
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    const text = '🔐 token—' + 'x'.repeat(2000);
    expect(mod.decrypt(mod.encrypt(text))).toBe(text);
  });

  test('decrypt under wrong key fails', () => {
    const encMod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    const ct = encMod.encrypt('secret-token');
    const decMod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_B });
    expect(() => decMod.decrypt(ct)).toThrow();
  });

  test('retired key still decrypts after rotation', () => {
    const old = reloadModule({
      SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A,
      SOCIAL_TOKEN_ENCRYPTION_KEY_ID: '1',
    });
    const ct = old.encrypt('legacy-token');

    const rotated = reloadModule({
      SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_B,
      SOCIAL_TOKEN_ENCRYPTION_KEY_ID: '2',
      SOCIAL_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_A }),
    });
    expect(rotated.decrypt(ct)).toBe('legacy-token');

    const newCt = rotated.encrypt('new-token');
    expect(newCt.split(':')[1]).toBe('2');
    expect(rotated.decrypt(newCt)).toBe('new-token');
  });

  test('decrypt rejects malformed ciphertext', () => {
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    expect(() => mod.decrypt('not-a-ciphertext')).toThrow(/malformed/i);
    expect(() => mod.decrypt('v1:1:aa:bb')).toThrow(/malformed/i);
  });

  test('null/undefined/empty pass through', () => {
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    expect(mod.encrypt(null)).toBeNull();
    expect(mod.encrypt(undefined)).toBeNull();
    expect(mod.decrypt(null)).toBeNull();
    expect(mod.decrypt('')).toBeNull();
  });

  test('key shorter than 32 bytes fails at startup', () => {
    const short = Buffer.alloc(16, 1).toString('base64');
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: short });
    expect(() => mod.encrypt('x')).toThrow(/32 bytes/);
  });

  test('PKCE pair: challenge = base64url(sha256(verifier))', () => {
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    const { verifier, challenge, method } = mod.generatePkcePair();
    expect(method).toBe('S256');
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  test('sha256 is stable', () => {
    const mod = reloadModule({ SOCIAL_TOKEN_ENCRYPTION_KEY: KEY_A });
    expect(mod.sha256('abc')).toBe(mod.sha256('abc'));
    expect(mod.sha256('abc')).not.toBe(mod.sha256('abd'));
  });
});
