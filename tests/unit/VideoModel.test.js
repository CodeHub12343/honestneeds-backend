const Video = require('../../src/models/Video');

describe('Video schema', () => {
  it('defaults status to uploading', () => {
    const v = new Video({
      owner_id: '507f1f77bcf86cd799439011',
      title: 'T',
      cloudinary_public_id: 'honestneed/videos/u1/abc',
    });
    expect(v.status).toBe('uploading');
    expect(v.visibility).toBe('public');
  });

  it('rejects an unknown status', () => {
    const v = new Video({
      owner_id: '507f1f77bcf86cd799439011',
      title: 'T',
      cloudinary_public_id: 'x',
      status: 'wat',
    });
    expect(v.validateSync()?.errors.status).toBeTruthy();
  });

  it('toJSON strips moderation + internal fields', () => {
    const v = new Video({
      owner_id: '507f1f77bcf86cd799439011',
      title: 'T',
      cloudinary_public_id: 'x',
      processing_error: 'oh no',
    });
    v.moderation = { review_status: 'pending', ai_flags: ['pii'] };
    const out = v.toJSON();
    expect(out.moderation).toBeUndefined();
    expect(out.processing_error).toBeUndefined();
  });

  it('publicQuery returns the expected filter', () => {
    expect(Video.publicQuery()).toEqual({
      status: 'published',
      visibility: { $in: ['public', 'community'] },
    });
    expect(Video.publicQuery({ is_veteran_content: true })).toMatchObject({
      is_veteran_content: true,
    });
  });

  it('declares the (owner_id, cloudinary_public_id) unique index', () => {
    const idx = Video.schema.indexes();
    const match = idx.find(([keys, opts]) => keys.owner_id === 1 && keys.cloudinary_public_id === 1 && opts?.unique);
    expect(match).toBeTruthy();
  });
});
