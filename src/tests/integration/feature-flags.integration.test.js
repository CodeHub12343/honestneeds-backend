/**
 * Feature flags — integration tests.
 *
 * These flags exist so the staged rollout is reversible from the admin panel
 * rather than by redeploy. The behaviour worth proving is:
 *   - a flag actually gates the feature it names
 *   - each upgrade initiator is independently switchable
 *   - the payout gate's three modes really differ (off / warn / enforce), since
 *     `warn` is what makes the breaking change measurable before it bites
 *   - an admin save takes effect immediately, not after the cache TTL
 *   - a malformed stored value falls back to the declared default rather than
 *     putting a feature into an undefined state
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Campaign = require('../../models/Campaign');
const CampaignSupportBoost = require('../../models/CampaignSupportBoost');
const CampaignUpgrade = require('../../models/CampaignUpgrade');
const PaymentMethod = require('../../models/PaymentMethod');
const PlatformSettings = require('../../models/PlatformSettings');
const ActivityLog = require('../../models/ActivityLog');
const User = require('../../models/User');

const FeatureFlagService = require('../../services/FeatureFlagService');
const CampaignUpgradeService = require('../../services/CampaignUpgradeService');
const CampaignBoostService = require('../../services/CampaignBoostService');
const ConfigService = require('../../services/admin/ConfigService');

jest.mock('../../services/NotificationDispatcher', () => ({
  notify: jest.fn().mockResolvedValue({ delivered: true, channels: ['in_app'] }),
  notifyMany: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/GamificationService', () => ({
  awardForAction: jest.fn().mockResolvedValue({ awarded: 25 }),
  awardXp: jest.fn().mockResolvedValue({ awarded: 25 }),
}));

let mongoServer;
const DAY = 86400000;

async function makeUser(overrides = {}) {
  return User.create({
    email: `u${Math.random().toString(36).slice(2)}@example.com`,
    password_hash: 'x'.repeat(60),
    display_name: 'Test User',
    created_at: new Date(Date.now() - 30 * DAY),
    verification_badges: { email_verified: true, identity_verified: true },
    ...overrides,
  });
}

async function makeCampaign(creator, overrides = {}) {
  return Campaign.create({
    campaign_id: `CAMP-2026-${Math.floor(Math.random() * 1000000)}`,
    creator_id: creator._id,
    title: 'Help build the community centre',
    description: 'A long enough description for validation purposes.',
    need_type: 'community_infrastructure',
    status: 'active',
    campaign_type: 'fundraising',
    ...overrides,
  });
}

async function makePaymentMethod(user, overrides = {}) {
  return PaymentMethod.create({
    user_id: user._id,
    type: 'bank_transfer',
    provider: 'manual',
    status: 'active',
    verification_status: 'verified',
    bank_account_last_four: '4242',
    is_primary: true,
    ...overrides,
  });
}

/** Write flags straight to settings and drop the cache, as a save would. */
async function setFlags(value) {
  await PlatformSettings.updateByKey('feature_flags', value, null);
  FeatureFlagService.invalidate();
}

const goodConfig = { budget: 100, reward_per_share: 5, platforms: ['facebook'] };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([CampaignUpgrade.syncIndexes(), CampaignSupportBoost.syncIndexes()]);
}, 180000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  FeatureFlagService.invalidate();
  await Promise.all([
    Campaign.deleteMany({}),
    CampaignUpgrade.deleteMany({}),
    CampaignSupportBoost.deleteMany({}),
    PaymentMethod.deleteMany({}),
    PlatformSettings.deleteMany({}),
    ActivityLog.deleteMany({}),
    User.deleteMany({}),
  ]);
});

// ───────────────────────────────────────────────────────────────────────────
describe('FeatureFlagService', () => {
  test('returns declared defaults when nothing is stored', async () => {
    const flags = await FeatureFlagService.getAll();
    expect(flags.campaign_upgrade_creator).toBe(true);
    expect(flags.community_boost).toBe(true);
    // The two risky steps are deliberately not fully on by default.
    expect(flags.community_boost_ranking).toBe(false);
    expect(flags.share_campaign_payout_gate).toBe('warn');
  });

  test('a stored value overrides the default', async () => {
    await setFlags({ community_boost: false, community_boost_ranking: true });
    const flags = await FeatureFlagService.getAll();
    expect(flags.community_boost).toBe(false);
    expect(flags.community_boost_ranking).toBe(true);
    // Untouched flags keep their defaults.
    expect(flags.campaign_upgrade_creator).toBe(true);
  });

  test('a malformed stored value falls back to the default', async () => {
    // A bad edit must not put a feature into an undefined state.
    await setFlags({ community_boost: 'yes please', share_campaign_payout_gate: 'banana' });
    const flags = await FeatureFlagService.getAll();
    expect(flags.community_boost).toBe(true);
    expect(flags.share_campaign_payout_gate).toBe('warn');
  });

  test('assertEnabled throws a 503 for a disabled feature', async () => {
    await setFlags({ community_boost: false });
    await expect(FeatureFlagService.assertEnabled('community_boost')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      statusCode: 503,
    });
  });

  test('describe() exposes shape and override state for the admin UI', async () => {
    await setFlags({ community_boost_ranking: true });
    const described = await FeatureFlagService.describe();

    const gate = described.find((f) => f.name === 'share_campaign_payout_gate');
    expect(gate.type).toBe('mode');
    expect(gate.modes).toEqual(['off', 'warn', 'enforce']);
    expect(gate.overridden).toBe(false);

    const ranking = described.find((f) => f.name === 'community_boost_ranking');
    expect(ranking.value).toBe(true);
    expect(ranking.overridden).toBe(true);
  });

  test('an admin save takes effect immediately, not after the cache TTL', async () => {
    expect(await FeatureFlagService.isEnabled('community_boost')).toBe(true);

    // Warm the cache, then save through the real admin path.
    await ConfigService.updateByKey('feature_flags', { community_boost: false }, { adminId: null });

    // No manual invalidation here — ConfigService must have done it.
    expect(await FeatureFlagService.isEnabled('community_boost')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Flags gate the features they name', () => {
  test('each upgrade initiator is independently switchable', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    // Turn off ONLY the creator flow.
    await setFlags({ campaign_upgrade_creator: false });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED', statusCode: 503 });

    // The admin flow is untouched by that switch.
    const admin = await makeUser({ role: 'admin' });
    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: admin._id,
      initiatorType: 'admin',
      shareConfig: goodConfig,
      adminNote: 'Upgrading on the creator’s behalf while their flow is off.',
    });
    expect(result.campaign.campaign_type).toBe('sharing');
  });

  test('disabling community_boost refuses new boosts', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    await setFlags({ community_boost: false });

    await expect(
      CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id })
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });

    expect(await CampaignSupportBoost.countDocuments({})).toBe(0);
  });

  test('a disabled upgrade is still recorded as a failed attempt', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    await setFlags({ campaign_upgrade_creator: false });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toBeDefined();

    const failure = await ActivityLog.findOne({ activity_type: 'campaign_upgrade_failed' });
    expect(failure.metadata.context.reason_code).toBe('FEATURE_DISABLED');
    // A feature switch is not the payout gate turning someone away — it must
    // not pollute the block-rate metric.
    expect(failure.metadata.context.payout_gate).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Payout gate modes on campaign creation', () => {
  const CampaignService = require('../../services/CampaignService');

  const sharingPayload = {
    title: 'Help build the community centre',
    description: 'A long enough description for validation purposes, well past the minimum.',
    need_type: 'community_infrastructure',
    campaign_type: 'sharing',
    budget: 100,
    reward_per_share: 5,
    platforms: ['facebook'],
    payout_consent: true,
    goals: [{ goal_type: 'sharing_reach', goal_name: 'Reach', target_amount: 500 }],
    payment_methods: [
      { type: 'bank_transfer', account_holder: 'Test User', account_number: '12345678', is_primary: true },
    ],
  };

  test('enforce refuses a creator with no payout method', async () => {
    const creator = await makeUser();
    await setFlags({ share_campaign_payout_gate: 'enforce' });

    await expect(
      CampaignService.createCampaign(String(creator._id), { ...sharingPayload })
    ).rejects.toMatchObject({ code: 'NO_PAYOUT_METHOD' });

    expect(await Campaign.countDocuments({})).toBe(0);
  });

  test('warn lets them through but records who would have been blocked', async () => {
    const creator = await makeUser();
    await setFlags({ share_campaign_payout_gate: 'warn' });

    await CampaignService.createCampaign(String(creator._id), { ...sharingPayload });

    // The campaign exists — nobody was actually turned away.
    expect(await Campaign.countDocuments({ campaign_type: 'sharing' })).toBe(1);

    // …but the signal the enforce decision needs was captured.
    const warned = await ActivityLog.findOne({ activity_type: 'share_campaign_gate_warned' });
    expect(warned).toBeTruthy();
    expect(warned.metadata.context.would_block).toBe(true);
    expect(warned.metadata.context.reason_code).toBe('NO_PAYOUT_METHOD');
  });

  test('off skips the check entirely and records nothing', async () => {
    const creator = await makeUser();
    await setFlags({ share_campaign_payout_gate: 'off' });

    await CampaignService.createCampaign(String(creator._id), { ...sharingPayload });

    expect(await Campaign.countDocuments({ campaign_type: 'sharing' })).toBe(1);
    expect(await ActivityLog.countDocuments({ activity_type: 'share_campaign_gate_warned' })).toBe(0);
  });

  test('a creator WITH a payout method is unaffected by the mode', async () => {
    const creator = await makeUser();
    await makePaymentMethod(creator);
    await setFlags({ share_campaign_payout_gate: 'enforce' });

    await CampaignService.createCampaign(String(creator._id), { ...sharingPayload });

    expect(await Campaign.countDocuments({ campaign_type: 'sharing' })).toBe(1);
    expect(await ActivityLog.countDocuments({ activity_type: 'share_campaign_gate_warned' })).toBe(0);
  });
});
