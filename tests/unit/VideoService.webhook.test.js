/**
 * Phase 4 — unit tests for VideoService.applyProcessingWebhook idempotency.
 *
 * Mocks the Video model + FeatureFlagService so no DB is needed.
 */

jest.mock('../../src/models/Video', () => {
  const fn = function Video() {};
  fn.findOne = jest.fn();
  fn.publicQuery = jest.fn().mockReturnValue({});
  fn.create = jest.fn();
  return fn;
});
jest.mock('../../src/services/FeatureFlagService', () => ({
  isEnabled: jest.fn().mockResolvedValue(false),
  isEnabledFor: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../src/services/AuditLogger', () => ({ record: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/services/NotificationDispatcher', () => ({ notify: jest.fn().mockResolvedValue(null) }));

const Video = require('../../src/models/Video');
const FeatureFlagService = require('../../src/services/FeatureFlagService');
const VideoService = require('../../src/services/VideoService');

function fakeDoc(initial = {}) {
  const doc = {
    _id: 'v1',
    status: 'uploading',
    cloudinary_public_id: 'honestneed/videos/u/x',
    moderation: { review_status: 'pending', auto_approved: false },
    save: jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
    ...initial,
  };
  return doc;
}

beforeEach(() => jest.clearAllMocks());

describe('applyProcessingWebhook', () => {
  it('rejects a malformed payload', async () => {
    await expect(VideoService.applyProcessingWebhook(null)).rejects.toMatchObject({ statusCode: 400 });
    await expect(VideoService.applyProcessingWebhook({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('no-ops for an unknown public_id', async () => {
    Video.findOne.mockResolvedValue(null);
    const r = await VideoService.applyProcessingWebhook({ public_id: 'x', notification_type: 'upload' });
    expect(r).toEqual({ applied: false, reason: 'unknown_public_id' });
  });

  it('no-ops when status is terminal', async () => {
    Video.findOne.mockResolvedValue(fakeDoc({ status: 'removed' }));
    const r = await VideoService.applyProcessingWebhook({ public_id: 'x', notification_type: 'upload' });
    expect(r).toEqual({ applied: false, reason: 'terminal_state' });
  });

  it('transitions uploading → processing on upload success', async () => {
    const doc = fakeDoc();
    Video.findOne.mockResolvedValue(doc);
    const r = await VideoService.applyProcessingWebhook({
      public_id: 'x',
      notification_type: 'upload',
      secure_url: 'https://cl/vid.mp4',
      duration: 120,
    });
    expect(r.status).toBe('processing');
    expect(doc.mp4_url).toBe('https://cl/vid.mp4');
    expect(doc.save).toHaveBeenCalled();
  });

  it('auto-publishes when feature flag is on', async () => {
    FeatureFlagService.isEnabled.mockResolvedValue(true);
    const doc = fakeDoc();
    Video.findOne.mockResolvedValue(doc);
    const r = await VideoService.applyProcessingWebhook({
      public_id: 'x',
      notification_type: 'upload',
      duration: 10,
    });
    expect(r.status).toBe('published');
    expect(doc.moderation.auto_approved).toBe(true);
  });

  it('rejects on duration exceeded', async () => {
    const doc = fakeDoc();
    Video.findOne.mockResolvedValue(doc);
    const r = await VideoService.applyProcessingWebhook({
      public_id: 'x',
      notification_type: 'upload',
      duration: 10_000, // > 600 default
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('duration_exceeded');
  });

  it('rejects on failed notification', async () => {
    const doc = fakeDoc();
    Video.findOne.mockResolvedValue(doc);
    const r = await VideoService.applyProcessingWebhook({
      public_id: 'x',
      notification_type: 'error',
      error: { message: 'bad codec' },
    });
    expect(r.status).toBe('rejected');
    expect(doc.processing_error).toBe('bad codec');
  });

  it('ignores unknown notification types', async () => {
    const doc = fakeDoc();
    Video.findOne.mockResolvedValue(doc);
    const r = await VideoService.applyProcessingWebhook({
      public_id: 'x',
      notification_type: 'eager_queued',
    });
    expect(r.applied).toBe(false);
  });
});
