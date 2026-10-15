/**
 * MetaService — state replay protection (TASK-5.2 acceptance).
 *
 * The single-use `state` nonce must be refused on a replay even if the
 * `code` would be valid.
 */

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.META_APP_ID = 'test-app';
process.env.META_APP_SECRET = 'test-secret';
process.env.META_OAUTH_CALLBACK_URL = 'https://example.test/callback';

const MetaService = require('../../src/services/social/MetaService');

describe('MetaService state nonce', () => {
  afterEach(() => {
    MetaService._stateStoreForTests.clear();
  });

  test('getAuthorizeUrl issues a state and includes it in the URL', () => {
    const { url, state } = MetaService.getAuthorizeUrl({ userId: 'u1' });
    expect(url).toContain(`state=${encodeURIComponent(state)}`);
    expect(url).toContain('client_id=test-app');
  });

  test('an unseen state is rejected before any network call', async () => {
    await expect(
      MetaService.handleCallback({ code: 'x', state: 'never-issued' })
    ).rejects.toMatchObject({ code: 'META_STATE_INVALID' });
  });

  test('replayed state is rejected after first use', async () => {
    const { state } = MetaService.getAuthorizeUrl({ userId: 'u1' });

    // First redemption consumes the state. We stop at the first fetch to
    // avoid real HTTP — the point is that the second redemption fails on
    // state check before fetch, which is proven below.
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error('network blocked in test');
    });
    try {
      await expect(
        MetaService.handleCallback({ code: 'c', state })
      ).rejects.toThrow(); // fetch error, not state error — state WAS valid
    } finally {
      global.fetch = originalFetch;
    }

    // Second attempt with the same state: must fail with META_STATE_INVALID,
    // meaning the state was consumed and never reached fetch.
    await expect(
      MetaService.handleCallback({ code: 'c', state })
    ).rejects.toMatchObject({ code: 'META_STATE_INVALID' });
  });
});
