/**
 * SocialDistributionService — mocked providers, idempotency and failure
 * isolation.
 */

jest.mock('../../src/models/SocialConnection', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../src/models/Video', () => ({
  findById: jest.fn(),
}));
jest.mock('../../src/models/Campaign', () => ({
  findById: jest.fn(),
}));
jest.mock('../../src/services/social/MetaService', () => ({
  publish: jest.fn(),
}));
jest.mock('../../src/services/social/XService', () => ({
  publish: jest.fn(),
}));

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const SocialConnection = require('../../src/models/SocialConnection');
const Video = require('../../src/models/Video');
const MetaService = require('../../src/services/social/MetaService');
const XService = require('../../src/services/social/XService');
const SocialDistributionService = require('../../src/services/SocialDistributionService');

const USER = '507f1f77bcf86cd799439011';
const VIDEO = '507f1f77bcf86cd799439099';

beforeEach(() => {
  jest.clearAllMocks();
  SocialDistributionService._idempotencyCacheForTests.clear();
  Video.findById.mockImplementation(() => ({
    lean: () => Promise.resolve({ _id: VIDEO, title: 'Test video' }),
  }));
});

describe('SocialDistributionService.distribute', () => {
  test('dry_run never calls providers and returns a preview per platform', async () => {
    const result = await SocialDistributionService.distribute({
      userId: USER,
      contentType: 'video',
      contentId: VIDEO,
      platforms: ['meta', 'x'],
      dryRun: true,
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.status === 'dry_run')).toBe(true);
    expect(MetaService.publish).not.toHaveBeenCalled();
    expect(XService.publish).not.toHaveBeenCalled();
  });

  test('posts via each provider when connection is active', async () => {
    SocialConnection.findOne.mockImplementation(({ provider }) =>
      Promise.resolve({ provider, status: 'active' })
    );
    MetaService.publish.mockResolvedValue({ provider_post_id: 'fb-123' });
    XService.publish.mockResolvedValue({ provider_post_id: 'tw-456' });

    const result = await SocialDistributionService.distribute({
      userId: USER,
      contentType: 'video',
      contentId: VIDEO,
      platforms: ['meta', 'x'],
    });

    expect(result.results.find((r) => r.platform === 'meta')).toMatchObject({
      status: 'posted',
      providerPostId: 'fb-123',
    });
    expect(result.results.find((r) => r.platform === 'x')).toMatchObject({
      status: 'posted',
      providerPostId: 'tw-456',
    });
  });

  test('idempotency: replay returns skipped_duplicate without re-posting', async () => {
    SocialConnection.findOne.mockResolvedValue({ provider: 'meta', status: 'active' });
    MetaService.publish.mockResolvedValue({ provider_post_id: 'fb-123' });

    await SocialDistributionService.distribute({
      userId: USER,
      contentType: 'video',
      contentId: VIDEO,
      platforms: ['meta'],
    });
    expect(MetaService.publish).toHaveBeenCalledTimes(1);

    const replay = await SocialDistributionService.distribute({
      userId: USER,
      contentType: 'video',
      contentId: VIDEO,
      platforms: ['meta'],
    });
    expect(MetaService.publish).toHaveBeenCalledTimes(1);
    expect(replay.results[0].status).toBe('skipped_duplicate');
    expect(replay.results[0].providerPostId).toBe('fb-123');
  });

  test('one failing provider does not block the others', async () => {
    SocialConnection.findOne.mockImplementation(({ provider }) =>
      Promise.resolve({ provider, status: 'active' })
    );
    MetaService.publish.mockRejectedValue(
      Object.assign(new Error('page down'), { statusCode: 400, code: 'META_FAIL' })
    );
    XService.publish.mockResolvedValue({ provider_post_id: 'tw-789' });

    const result = await SocialDistributionService.distribute({
      userId: USER,
      contentType: 'video',
      contentId: VIDEO,
      platforms: ['meta', 'x'],
    });

    const meta = result.results.find((r) => r.platform === 'meta');
    const x = result.results.find((r) => r.platform === 'x');
    expect(meta.status).toBe('failed');
    expect(meta.error).toBe('META_FAIL');
    expect(x.status).toBe('posted');
    expect(x.providerPostId).toBe('tw-789');
  });

  test('no active connection → failed:NOT_CONNECTED, no publish call', async () => {
    SocialConnection.findOne.mockResolvedValue(null);

    const result = await SocialDistributionService.distribute({
      userId: USER,
      contentType: 'video',
      contentId: VIDEO,
      platforms: ['meta'],
    });
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toBe('NOT_CONNECTED');
    expect(MetaService.publish).not.toHaveBeenCalled();
  });

  test('idempotency key is sha256(content_type|content_id|platform|user_id)', () => {
    const crypto = require('crypto');
    const expected = crypto
      .createHash('sha256')
      .update('video|v1|meta|u1')
      .digest('hex');
    expect(
      SocialDistributionService.buildIdempotencyKey({
        contentType: 'video',
        contentId: 'v1',
        platform: 'meta',
        userId: 'u1',
      })
    ).toBe(expected);
  });

  test('rejects unknown platform', async () => {
    await expect(
      SocialDistributionService.distribute({
        userId: USER,
        contentType: 'video',
        contentId: VIDEO,
        platforms: ['linkedin'],
      })
    ).rejects.toMatchObject({ code: 'UNKNOWN_PLATFORM' });
  });
});
