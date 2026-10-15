/**
 * Phase 3 — tests the UpgradeRequest schema's shape + default TTL.
 * Does NOT connect to MongoDB; verifies behaviour through mongoose's in-memory
 * validation.
 */

const UpgradeRequest = require('../../src/models/UpgradeRequest');

describe('UpgradeRequest schema', () => {
  it('defaults status to open and expires_at ~14 days out', () => {
    const doc = new UpgradeRequest({
      campaign_id: '507f1f77bcf86cd799439011',
      owner_id: '507f1f77bcf86cd799439012',
    });
    expect(doc.status).toBe('open');
    const nowPlus14 = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const delta = Math.abs(doc.expires_at.getTime() - nowPlus14);
    expect(delta).toBeLessThan(5 * 60 * 1000); // within 5 min
  });

  it('rejects an unknown status', () => {
    const doc = new UpgradeRequest({
      campaign_id: '507f1f77bcf86cd799439011',
      owner_id: '507f1f77bcf86cd799439012',
      status: 'wat',
    });
    const err = doc.validateSync();
    expect(err).toBeTruthy();
    expect(err.errors.status).toBeTruthy();
  });

  it('caps message at 1000 chars', () => {
    const doc = new UpgradeRequest({
      campaign_id: '507f1f77bcf86cd799439011',
      owner_id: '507f1f77bcf86cd799439012',
      message: 'x'.repeat(1001),
    });
    const err = doc.validateSync();
    expect(err && err.errors.message).toBeTruthy();
  });

  it('declares a partial unique index on (campaign_id, status=open)', () => {
    const indexes = UpgradeRequest.schema.indexes();
    const match = indexes.find(([, opts]) => {
      return (
        opts &&
        opts.unique &&
        opts.partialFilterExpression &&
        opts.partialFilterExpression.status === 'open'
      );
    });
    expect(match).toBeTruthy();
  });
});
