/**
 * Table-driven eligibility checks for VideoRewardService.evaluateEligibility.
 * Each case flips one rule and expects a specific reason code.
 */

jest.mock('../../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../../src/models/Video', () => ({ findById: jest.fn() }));
jest.mock('../../src/models/VideoReward', () => ({
  findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })),
  countDocuments: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../src/models/PromoWallet', () => ({
  singleton: jest.fn().mockResolvedValue({ balance_cents: 1_000_000, reserved_cents: 0 }),
}));
jest.mock('../../src/models/PromoWalletLedger', () => ({}));
jest.mock('../../src/services/FeatureFlagService', () => ({
  isEnabled: jest.fn().mockResolvedValue(true),
}));

const VideoReward = require('../../src/models/VideoReward');
const PromoWallet = require('../../src/models/PromoWallet');
const FeatureFlagService = require('../../src/services/FeatureFlagService');
const VideoRewardService = require('../../src/services/VideoRewardService');

function okUser(overrides = {}) {
  return {
    _id: 'u1',
    primary_social_platform: 'facebook',
    blocked: false,
    fraud_flagged: false,
    verification_badges: { identity_verified: true },
    ...overrides,
  };
}
function okVideo(overrides = {}) {
  return { _id: 'v1', status: 'published', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  VideoReward.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(null) }),
  });
  VideoReward.countDocuments.mockResolvedValue(0);
  PromoWallet.singleton.mockResolvedValue({ balance_cents: 1_000_000, reserved_cents: 0 });
  FeatureFlagService.isEnabled.mockResolvedValue(true);
});

describe('VideoRewardService.evaluateEligibility', () => {
  test('happy path returns eligible', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.eligible).toBe(true);
    expect(r.amount_cents).toBeGreaterThan(0);
  });

  test('feature flag off → FEATURE_DISABLED', async () => {
    FeatureFlagService.isEnabled.mockResolvedValue(false);
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('FEATURE_DISABLED');
  });

  test('unverified identity → IDENTITY_NOT_VERIFIED', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser({ verification_badges: { identity_verified: false } }),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('IDENTITY_NOT_VERIFIED');
  });

  test('platform mismatch → PLATFORM_MISMATCH', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser({ primary_social_platform: 'instagram' }),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('PLATFORM_MISMATCH');
  });

  test('twitter and x are treated as the same platform', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser({ primary_social_platform: 'twitter' }),
      video: okVideo(),
      platform: 'x',
    });
    expect(r.eligible).toBe(true);
  });

  test('fraud_flagged user → FRAUD_FLAG', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser({ fraud_flagged: true }),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('FRAUD_FLAG');
  });

  test('blocked user → FRAUD_FLAG', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser({ blocked: true }),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('FRAUD_FLAG');
  });

  test('video not published → VIDEO_NOT_PUBLISHED', async () => {
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo({ status: 'pending' }),
      platform: 'facebook',
    });
    expect(r.reason).toBe('VIDEO_NOT_PUBLISHED');
  });

  test('cooldown active → COOLDOWN_ACTIVE', async () => {
    VideoReward.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ _id: 'r0' }) }),
    });
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('COOLDOWN_ACTIVE');
  });

  test('per-user daily cap → USER_DAILY_CAP', async () => {
    process.env.VIDEO_REWARD_PER_USER_DAILY_CAP = '2';
    VideoReward.countDocuments.mockResolvedValueOnce(2);
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('USER_DAILY_CAP');
    delete process.env.VIDEO_REWARD_PER_USER_DAILY_CAP;
  });

  test('platform-wide daily cap → PLATFORM_DAILY_CAP', async () => {
    process.env.VIDEO_REWARD_PLATFORM_DAILY_CAP = '5';
    VideoReward.countDocuments
      .mockResolvedValueOnce(0) // user
      .mockResolvedValueOnce(5); // platform
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('PLATFORM_DAILY_CAP');
    delete process.env.VIDEO_REWARD_PLATFORM_DAILY_CAP;
  });

  test('empty promo wallet → INSUFFICIENT_PROMO_FUNDS', async () => {
    PromoWallet.singleton.mockResolvedValue({ balance_cents: 10, reserved_cents: 10 });
    const r = await VideoRewardService.evaluateEligibility({
      user: okUser(),
      video: okVideo(),
      platform: 'facebook',
    });
    expect(r.reason).toBe('INSUFFICIENT_PROMO_FUNDS');
  });
});
