/**
 * Upgrade/boost analytics, boost fraud remediation, and payout-readiness
 * monitoring — integration tests.
 *
 * These three exist to make the feature operable rather than merely functional:
 *   - the funnel is what tells you whether the payout gate is about to block
 *     legitimate creators, BEFORE it starts blocking them
 *   - revocation is the only lever against boost farming
 *   - the monitoring job stops sharers accruing rewards nobody can pay
 *
 * Uses mongodb-memory-server so aggregations and guarded updates run for real.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Campaign = require('../../models/Campaign');
const CampaignSupportBoost = require('../../models/CampaignSupportBoost');
const CampaignUpgrade = require('../../models/CampaignUpgrade');
const PaymentMethod = require('../../models/PaymentMethod');
const ActivityLog = require('../../models/ActivityLog');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');

const CampaignUpgradeService = require('../../services/CampaignUpgradeService');
const CampaignBoostService = require('../../services/CampaignBoostService');
const CampaignEventAnalyticsService = require('../../services/CampaignEventAnalyticsService');
const ModerationService = require('../../services/admin/ModerationService');
const CheckSharePayoutReadinessJob = require('../../jobs/CheckSharePayoutReadiness');

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
  jest.restoreAllMocks();
  await Promise.all([
    Campaign.deleteMany({}),
    CampaignUpgrade.deleteMany({}),
    CampaignSupportBoost.deleteMany({}),
    PaymentMethod.deleteMany({}),
    ActivityLog.deleteMany({}),
    AuditLog.deleteMany({}),
    User.deleteMany({}),
  ]);
});

// ───────────────────────────────────────────────────────────────────────────
describe('Upgrade funnel instrumentation', () => {
  test('a successful upgrade records both the attempt and the success', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    const types = (await ActivityLog.find({ entity_id: campaign._id })).map((l) => l.activity_type);
    expect(types).toContain('campaign_upgrade_attempted');
    expect(types).toContain('campaign_upgrade_succeeded');
    expect(types).not.toContain('campaign_upgrade_failed');
  });

  test('a payout-gate refusal is recorded and flagged as the gate', async () => {
    const owner = await makeUser(); // no payout method
    const campaign = await makeCampaign(owner);

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'NO_PAYOUT_METHOD' });

    const failure = await ActivityLog.findOne({ activity_type: 'campaign_upgrade_failed' });
    expect(failure).toBeTruthy();
    expect(failure.metadata.context.reason_code).toBe('NO_PAYOUT_METHOD');
    // This flag is what separates "the gate blocked a real creator" from
    // "this campaign was never eligible anyway".
    expect(failure.metadata.context.payout_gate).toBe(true);
    // Operational metric, not activity-feed content.
    expect(failure.is_public).toBe(false);
  });

  test('an ineligibility refusal is NOT counted against the payout gate', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner, { status: 'completed' });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'CAMPAIGN_STATUS_INELIGIBLE' });

    const failure = await ActivityLog.findOne({ activity_type: 'campaign_upgrade_failed' });
    expect(failure.metadata.context.payout_gate).toBe(false);
  });

  test('an idempotent replay does not inflate the success count', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    const args = {
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
      idempotencyKey: 'replay-analytics-1',
    };

    await CampaignUpgradeService.requestUpgrade(args);
    await CampaignUpgradeService.requestUpgrade(args);

    expect(
      await ActivityLog.countDocuments({ activity_type: 'campaign_upgrade_succeeded' })
    ).toBe(1);
  });

  test('the funnel reports the payout-gate block rate', async () => {
    const blocked = await makeUser();
    const blockedCampaign = await makeCampaign(blocked);
    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: blockedCampaign._id,
        actorId: blocked._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toBeDefined();

    const healthy = await makeUser();
    await makePaymentMethod(healthy);
    const healthyCampaign = await makeCampaign(healthy);
    await CampaignUpgradeService.requestUpgrade({
      campaignId: healthyCampaign._id,
      actorId: healthy._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    const funnel = await CampaignEventAnalyticsService.getUpgradeFunnel({});
    expect(funnel.attempted).toBe(2);
    expect(funnel.succeeded).toBe(1);
    expect(funnel.failed).toBe(1);
    expect(funnel.conversion_rate).toBe(50);
    expect(funnel.payout_gate_failures).toBe(1);
    // The headline number the rollout decision depends on.
    expect(funnel.payout_gate_block_rate).toBe(50);
    expect(funnel.successes_by_initiator).toContainEqual({
      initiator_type: 'creator',
      count: 1,
    });
  });

  test('boosts record counted vs suppressed, the farming signal', async () => {
    const owner = await makeUser();
    const trusted = await makeUser();
    const fresh = await makeUser({
      created_at: new Date(),
      verification_badges: { email_verified: false, identity_verified: false },
    });
    const campaign = await makeCampaign(owner);

    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: trusted._id });
    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: fresh._id });

    const stats = await CampaignEventAnalyticsService.getBoostStats({});
    expect(stats.counted).toBe(1);
    expect(stats.suppressed).toBe(1);
    expect(stats.suppression_rate).toBe(50);
    expect(stats.suppressed_by_reason).toContainEqual({ reason: 'low_trust', count: 1 });
  });

  test('analytics failure never breaks the upgrade it measures', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    jest.spyOn(ActivityLog, 'create').mockRejectedValue(new Error('analytics store down'));

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    // The upgrade must still land.
    expect(result.campaign.campaign_type).toBe('sharing');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Boost fraud remediation (admin)', () => {
  test('an admin can list a campaign community boosts', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);
    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id });

    const data = await ModerationService.listCampaignSupportBoosts(campaign._id);
    expect(data.pagination.total).toBe(1);
    expect(data.boosts[0].booster_id.email).toBe(booster.email);
    expect(data.campaign.community_boost_count).toBe(1);
  });

  test('revoking strips the ranking contribution and recomputes immediately', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    const { boost } = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: booster._id,
    });
    expect((await Campaign.findById(campaign._id)).community_boost_score).toBeGreaterThan(0);

    await ModerationService.revokeSupportBoost(boost._id, {
      adminId: admin._id,
      reason: 'Coordinated boost ring',
    });

    // Recomputed on the spot, not at the next nightly decay run.
    const after = await Campaign.findById(campaign._id);
    expect(after.community_boost_score).toBe(0);
    expect(after.community_boost_count).toBe(0);

    const revoked = await CampaignSupportBoost.findById(boost._id);
    expect(revoked.counts_toward_score).toBe(false);
    expect(revoked.suppressed_reason).toBe('fraud_flag');
    expect(String(revoked.revoked_by)).toBe(String(admin._id));
  });

  test('a revocation is written to the audit log', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);
    const { boost } = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: booster._id,
    });

    await ModerationService.revokeSupportBoost(boost._id, {
      adminId: admin._id,
      reason: 'Sockpuppet cluster from one IP',
    });

    const entry = await AuditLog.findOne({ action_type: 'campaign.support_boost.revoked' });
    expect(entry).toBeTruthy();
    expect(String(entry.admin_id)).toBe(String(admin._id));
    expect(entry.metadata.reason).toContain('Sockpuppet');
    expect(entry.metadata.boost_id).toBe(String(boost._id));
  });

  test('a revocation requires a reason for the audit trail', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);
    const { boost } = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: booster._id,
    });

    await expect(
      ModerationService.revokeSupportBoost(boost._id, { adminId: admin._id, reason: 'x' })
    ).rejects.toMatchObject({ code: 'REVOKE_REASON_REQUIRED' });

    // Nothing was touched.
    expect((await Campaign.findById(campaign._id)).community_boost_score).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Payout-readiness monitoring job', () => {
  async function makeLiveShareCampaign(owner) {
    return makeCampaign(owner, {
      campaign_type: 'sharing',
      share_config: {
        total_budget: 10000,
        committed_budget_remaining: 10000,
        amount_per_share: 500,
        is_paid_sharing_active: true,
      },
    });
  }

  test('pauses paid sharing when the owner loses their payout method', async () => {
    const owner = await makeUser();
    const method = await makePaymentMethod(owner);
    const campaign = await makeLiveShareCampaign(owner);

    // The creator deletes their bank details weeks after upgrading.
    method.deleted_at = new Date();
    await method.save();

    const result = await CheckSharePayoutReadinessJob.run();

    expect(result.campaigns_paused).toBe(1);
    expect(result.creators_notified).toBe(1);

    const after = await Campaign.findById(campaign._id);
    expect(after.share_config.is_paid_sharing_active).toBe(false);
    // The upgrade is one-way. Reverting the type would strand rewards already
    // owed to sharers.
    expect(after.campaign_type).toBe('sharing');
  });

  test('leaves healthy campaigns completely alone', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeLiveShareCampaign(owner);

    const result = await CheckSharePayoutReadinessJob.run();

    expect(result.campaigns_paused).toBe(0);
    expect((await Campaign.findById(campaign._id)).share_config.is_paid_sharing_active).toBe(true);
  });

  test('ignores campaigns whose sharing is already paused', async () => {
    const owner = await makeUser();
    const campaign = await makeCampaign(owner, {
      campaign_type: 'sharing',
      share_config: { is_paid_sharing_active: false },
    });

    const result = await CheckSharePayoutReadinessJob.run();
    expect(result.campaigns_examined).toBe(0);
    expect(result.campaigns_paused).toBe(0);
    expect((await Campaign.findById(campaign._id)).share_config.is_paid_sharing_active).toBe(false);
  });

  test('checks each owner once even across several live campaigns', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    await makeLiveShareCampaign(owner);
    await makeLiveShareCampaign(owner);

    const result = await CheckSharePayoutReadinessJob.run();
    expect(result.campaigns_examined).toBe(2);
    expect(result.owners_checked).toBe(1);
  });
});
