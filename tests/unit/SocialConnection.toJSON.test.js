/**
 * SocialConnection.toJSON() must never leak ciphertext or last_error.
 */

const SocialConnection = require('../../src/models/SocialConnection');

describe('SocialConnection.toJSON()', () => {
  test('strips every token field', () => {
    const row = new SocialConnection({
      user_id: '507f1f77bcf86cd799439011',
      provider: 'meta',
      access_token_ct: 'v1:1:xx:yy:zz',
      refresh_token_ct: 'v1:1:aa:bb:cc',
      scopes: ['pages_manage_posts'],
      status: 'active',
      last_error: 'should-not-leak',
      meta: {
        page_access_token_ct: 'v1:1:pp:qq:rr',
        instagram_business_account_id: 'ig-123',
      },
    });

    const json = row.toJSON();
    expect(json.access_token_ct).toBeUndefined();
    expect(json.refresh_token_ct).toBeUndefined();
    expect(json.last_error).toBeUndefined();
    expect(json.meta.page_access_token_ct).toBeUndefined();
    expect(json.meta.instagram_business_account_id).toBe('ig-123');
    expect(json.scopes).toEqual(['pages_manage_posts']);
    expect(json.status).toBe('active');
  });

  test('serialising through JSON.stringify also strips ciphertext', () => {
    const row = new SocialConnection({
      user_id: '507f1f77bcf86cd799439011',
      provider: 'x',
      access_token_ct: 'v1:1:xx:yy:zz',
      refresh_token_ct: 'v1:1:aa:bb:cc',
    });
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain('xx:yy:zz');
    expect(serialised).not.toContain('aa:bb:cc');
  });
});
