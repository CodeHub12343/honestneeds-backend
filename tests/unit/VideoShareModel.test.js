const VideoShare = require('../../src/models/VideoShare');

describe('VideoShare schema', () => {
  it('defaults verification_status to pending_verification', () => {
    const s = new VideoShare({
      video_id: '507f1f77bcf86cd799439011',
      user_id: '507f1f77bcf86cd799439012',
      platform: 'facebook',
      idempotency_key: 'k1',
    });
    expect(s.verification_status).toBe('pending_verification');
    expect(s.reward_status).toBe('none');
  });

  it('rejects unknown platform', () => {
    const s = new VideoShare({
      video_id: '507f1f77bcf86cd799439011',
      user_id: '507f1f77bcf86cd799439012',
      platform: 'myspace',
      idempotency_key: 'k1',
    });
    expect(s.validateSync()?.errors.platform).toBeTruthy();
  });

  it('declares a unique index on idempotency_key', () => {
    const idx = VideoShare.schema.indexes();
    const match = idx.find(([keys, opts]) => keys.idempotency_key === 1 && opts?.unique);
    expect(match).toBeTruthy();
  });
});
