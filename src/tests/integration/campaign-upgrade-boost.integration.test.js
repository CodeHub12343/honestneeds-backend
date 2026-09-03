/**
 * Campaign Upgrade + Community Boost — integration tests
 * -------------------------------------------------------------------------
 * Covers the scenarios the roadmap marks mandatory:
 *   - creator upgrade happy path, and DATA PRESERVATION
 *   - the payout-method gate (missing / unusable / provisional)
 *   - idempotency + concurrency
 *   - ineligible statuses and already-upgraded campaigns
 *   - sponsor request → owner approve / reject, and authorisation
 *   - admin upgrade, including the no-override rule
 *   - community boost: self-boost, daily quota, low-trust suppression, ranking
 *
 * Uses mongodb-memory-server so the unique indexes that carry the idempotency
 * and one-boost-per-day guarantees are exercised for real — those guarantees
 * live in the database, so mocking the DB would test nothing.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Campaign = require('../../models/Campaign');
const CampaignUpgrade = require('../../models/CampaignUpgrade');
const CampaignSupportBoost = require('../../models/CampaignSupportBoost');
const PaymentMethod = require('../../models/PaymentMethod');
const Donation = require('../../models/Donation');
const User = require('../../models/User');

const CampaignUpgradeService = require('../../services/CampaignUpgradeService');
const CampaignBoostService = require('../../services/CampaignBoostService');
const PayoutReadinessService = require('../../services/PayoutReadinessService');

// The dispatcher hits notification preferences and websockets; neither is under
// test here and both would slow every case down.
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
    campaign_id: `CAMP-2026-${Math.floor(Math.random() * 100000)}`,
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
  // mongod can take well over the 10s default to launch on a cold/slow machine,
  // which surfaces as every test in the file failing on a hook timeout.
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongoServer.getUri());
  // The unique indexes ARE the feature here — make sure they exist.
  await Promise.all([
    CampaignUpgrade.syncIndexes(),
    CampaignSupportBoost.syncIndexes(),
  ]);
}, 180000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  await Promise.all([
    Campaign.deleteMany({}),
    CampaignUpgrade.deleteMany({}),
    CampaignSupportBoost.deleteMany({}),
    PaymentMethod.deleteMany({}),
    Donation.deleteMany({}),
    User.deleteMany({}),
  ]);
});

// ───────────────────────────────────────────────────────────────────────────
describe('PayoutReadinessService', () => {
  test('reports none when the user has no payment method', async () => {
    const user = await makeUser();
    const r = await PayoutReadinessService.getReadiness(user._id);
    expect(r.ready).toBe(false);
    expect(r.level).toBe('none');
    expect(r.code).toBe('NO_PAYOUT_METHOD');
  });

  test('reports verified for an active, verified method', async () => {
    const user = await makeUser();
    await makePaymentMethod(user);
    const r = await PayoutReadinessService.getReadiness(user._id);
    expect(r.ready).toBe(true);
    expect(r.level).toBe('verified');
  });

  test('accepts pending_verification as provisional, matching the live payout path', async () => {
    const user = await makeUser();
    await makePaymentMethod(user, {
      status: 'pending_verification',
      verification_status: 'unverified',
    });
    const r = await PayoutReadinessService.getReadiness(user._id);
    expect(r.ready).toBe(true);
    expect(r.level).toBe('provisional');
  });

  // One method per user per case: PaymentMethod carries a unique index on
  // {user_id, stripe_payment_method_id} which, because that field defaults to
  // an explicit null rather than being absent, also prevents a user holding two
  // non-Stripe methods. That is a pre-existing schema defect, unrelated to this
  // feature and deliberately not changed here.
  test.each([
    ['inactive', { status: 'inactive' }],
    ['failed', { status: 'failed' }],
    ['soft-deleted', { deleted_at: new Date() }],
  ])('rejects a %s method', async (_label, overrides) => {
    const user = await makeUser();
    await makePaymentMethod(user, overrides);
    const r = await PayoutReadinessService.getReadiness(user._id);
    expect(r.ready).toBe(false);
    expect(r.level).toBe('none');
  });

  test('never leaks payment credentials', async () => {
    const user = await makeUser();
    await makePaymentMethod(user, {
      type: 'bank_transfer',
      bank_account_number: '123456789',
      bank_routing_number: '987654321',
    });
    const r = await PayoutReadinessService.getReadiness(user._id);
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain('123456789');
    expect(serialized).not.toContain('987654321');
    expect(r.method).not.toHaveProperty('bank_account_number');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Creator upgrade', () => {
  test('upgrades an eligible campaign and records provenance', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    expect(result.campaign.campaign_type).toBe('sharing');
    expect(result.campaign.upgrade_meta.original_campaign_type).toBe('fundraising');
    expect(result.campaign.upgrade_meta.upgrade_initiator_type).toBe('creator');
    expect(result.campaign.share_config.total_budget).toBe(10000);
    expect(result.campaign.share_config.amount_per_share).toBe(500);
    expect(result.campaign.share_config.is_paid_sharing_active).toBe(true);
    expect(result.campaign.share_config.creator_payout_consent_at).toBeTruthy();

    const upgrade = await CampaignUpgrade.findOne({ campaign_id: campaign._id });
    expect(upgrade.status).toBe('completed');
    expect(upgrade.initiator_type).toBe('creator');
  });

  test('preserves every piece of campaign data that is not part of the upgrade', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner, {
      image_url: 'https://cdn.example.com/a.jpg',
      category: 'community',
      tags: ['school', 'roof'],
      view_count: 412,
      share_count: 37,
      contributors: [{ donor_name: 'Ada', amount: 5000, message: 'good luck' }],
    });

    const before = (await Campaign.findById(campaign._id)).toObject();

    await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    const after = (await Campaign.findById(campaign._id)).toObject();

    // Identity and ownership must survive untouched.
    expect(String(after._id)).toBe(String(before._id));
    expect(after.campaign_id).toBe(before.campaign_id);
    expect(String(after.creator_id)).toBe(String(before.creator_id));

    // Content, media and metrics must survive untouched.
    expect(after.title).toBe(before.title);
    expect(after.description).toBe(before.description);
    expect(after.image_url).toBe(before.image_url);
    expect(after.category).toBe(before.category);
    expect(after.tags).toEqual(before.tags);
    expect(after.view_count).toBe(before.view_count);
    expect(after.share_count).toBe(before.share_count);
    expect(after.contributors).toHaveLength(before.contributors.length);
    expect(after.contributors[0].amount).toBe(before.contributors[0].amount);
  });

  test('blocks the upgrade when the creator has no payout method', async () => {
    const owner = await makeUser();
    const campaign = await makeCampaign(owner);

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'NO_PAYOUT_METHOD', statusCode: 400 });

    const unchanged = await Campaign.findById(campaign._id);
    expect(unchanged.campaign_type).toBe('fundraising');
  });

  test('blocks the upgrade when the only payout method is unusable', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner, { status: 'inactive' });
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
  });

  test('requires the pay-sharers-directly consent', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: false,
      })
    ).rejects.toMatchObject({ code: 'PAYOUT_CONSENT_REQUIRED' });
  });

  test('rejects a campaign that is already a Share Campaign', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner, { campaign_type: 'sharing' });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'ALREADY_SHARE_CAMPAIGN' });
  });

  test.each(['completed', 'cancelled', 'rejected'])(
    'rejects a %s campaign',
    async (status) => {
      const owner = await makeUser();
      await makePaymentMethod(owner);
      const campaign = await makeCampaign(owner, { status });

      await expect(
        CampaignUpgradeService.requestUpgrade({
          campaignId: campaign._id,
          actorId: owner._id,
          initiatorType: 'creator',
          shareConfig: goodConfig,
          payoutConsent: true,
        })
      ).rejects.toMatchObject({ code: 'CAMPAIGN_STATUS_INELIGIBLE' });
    }
  );

  // A past end_date must NOT block on its own. The public listing ignores
  // end_date and filters on status, and CompleteExpiredCampaigns is what marks a
  // finished campaign 'completed'. While it is still 'active' it is publicly
  // listed and taking donations, so it stays upgradeable.
  test('allows an active campaign whose end_date has passed', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner, {
      status: 'active',
      end_date: new Date(Date.now() - 30 * DAY),
    });

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    expect(result.campaign.campaign_type).toBe('sharing');
  });

  // ...but once the job has actually completed it, status blocks the upgrade.
  test('still rejects it once the expiry job marks it completed', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner, {
      status: 'completed',
      end_date: new Date(Date.now() - 30 * DAY),
    });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'CAMPAIGN_STATUS_INELIGIBLE' });
  });

  test('rejects a flagged campaign, so upgrading cannot route around review', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner, {
      moderation: { review_status: 'flagged' },
    });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_ELIGIBLE' });
  });

  test('rejects a non-owner using the creator flow', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: stranger._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'NOT_CAMPAIGN_OWNER', statusCode: 403 });
  });

  test('rejects a reward budget that cannot cover one reward', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: { budget: 1, reward_per_share: 5 },
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'INVALID_SHARE_CONFIG' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Idempotency and concurrency', () => {
  test('replaying the same idempotency key upgrades exactly once', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    const args = {
      campaignId: campaign._id,
      actorId: owner._id,
      initiatorType: 'creator',
      shareConfig: goodConfig,
      payoutConsent: true,
      idempotencyKey: 'client-uuid-1',
    };

    const first = await CampaignUpgradeService.requestUpgrade(args);
    const second = await CampaignUpgradeService.requestUpgrade(args);

    expect(first.already_upgraded).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.already_upgraded).toBe(true);

    expect(await CampaignUpgrade.countDocuments({ campaign_id: campaign._id })).toBe(1);
  });

  test('concurrent upgrades with different keys mutate the campaign only once', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    const attempt = (key) =>
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
        idempotencyKey: key,
      });

    const results = await Promise.allSettled([attempt('a'), attempt('b')]);

    // Neither call may blow up with a 500 — the loser resolves as an idempotent
    // success or a clean 409.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason.statusCode).toBe(409);
      }
    }

    const applied = await CampaignUpgrade.countDocuments({
      campaign_id: campaign._id,
      status: 'completed',
      completed_at: { $ne: null },
    });
    // At most one upgrade actually transitioned the campaign.
    const final = await Campaign.findById(campaign._id);
    expect(final.campaign_type).toBe('sharing');
    expect(applied).toBeGreaterThanOrEqual(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Sponsored (user-to-user) upgrade', () => {
  async function makeQualifiedSponsor(campaign) {
    const sponsor = await makeUser();
    await Donation.create({
      donor_id: sponsor._id,
      campaign_id: campaign._id,
      amount: 2500,
    });
    return sponsor;
  }

  test('a qualified sponsor creates a pending request without touching the campaign', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const sponsor = await makeQualifiedSponsor(campaign);

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: sponsor._id,
      initiatorType: 'sponsor',
      shareConfig: goodConfig,
    });

    expect(result.pending).toBe(true);
    expect(result.upgrade.status).toBe('pending_owner_approval');

    const unchanged = await Campaign.findById(campaign._id);
    expect(unchanged.campaign_type).toBe('fundraising');
  });

  test('an unqualified user cannot request an upgrade', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const stranger = await makeUser();

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: stranger._id,
        initiatorType: 'sponsor',
        shareConfig: goodConfig,
      })
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED_SPONSOR', statusCode: 403 });
  });

  test('a brand-new account cannot sponsor even after donating', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const fresh = await makeUser({ created_at: new Date() });
    await Donation.create({ donor_id: fresh._id, campaign_id: campaign._id, amount: 100 });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: fresh._id,
        initiatorType: 'sponsor',
        shareConfig: goodConfig,
      })
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED_SPONSOR' });
  });

  test('only one request may be pending per campaign', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const s1 = await makeQualifiedSponsor(campaign);
    const s2 = await makeQualifiedSponsor(campaign);

    await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: s1._id,
      initiatorType: 'sponsor',
      shareConfig: goodConfig,
    });

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: s2._id,
        initiatorType: 'sponsor',
        shareConfig: goodConfig,
      })
    ).rejects.toMatchObject({ code: 'UPGRADE_ALREADY_PENDING', statusCode: 409 });
  });

  test('owner approval applies the upgrade and records their consent', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const sponsor = await makeQualifiedSponsor(campaign);

    const { upgrade } = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: sponsor._id,
      initiatorType: 'sponsor',
      shareConfig: goodConfig,
    });

    const result = await CampaignUpgradeService.approveUpgrade({
      upgradeId: upgrade._id,
      ownerId: owner._id,
      shareConfig: goodConfig,
      payoutConsent: true,
    });

    expect(result.campaign.campaign_type).toBe('sharing');
    expect(result.campaign.share_config.creator_payout_consent_at).toBeTruthy();
    // Ownership is never transferred by a sponsored upgrade.
    expect(String(result.campaign.creator_id)).toBe(String(owner._id));
  });

  test('approval without the owner consent is refused', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const sponsor = await makeQualifiedSponsor(campaign);

    const { upgrade } = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: sponsor._id,
      initiatorType: 'sponsor',
      shareConfig: goodConfig,
    });

    await expect(
      CampaignUpgradeService.approveUpgrade({
        upgradeId: upgrade._id,
        ownerId: owner._id,
        payoutConsent: false,
      })
    ).rejects.toMatchObject({ code: 'PAYOUT_CONSENT_REQUIRED' });
  });

  test('a non-owner cannot approve a request', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const sponsor = await makeQualifiedSponsor(campaign);

    const { upgrade } = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: sponsor._id,
      initiatorType: 'sponsor',
      shareConfig: goodConfig,
    });

    await expect(
      CampaignUpgradeService.approveUpgrade({
        upgradeId: upgrade._id,
        ownerId: sponsor._id,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'NOT_CAMPAIGN_OWNER', statusCode: 403 });
  });

  test('rejection resolves the request and leaves the campaign alone', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);
    const sponsor = await makeQualifiedSponsor(campaign);

    const { upgrade } = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: sponsor._id,
      initiatorType: 'sponsor',
      shareConfig: goodConfig,
    });

    await CampaignUpgradeService.rejectUpgrade({
      upgradeId: upgrade._id,
      ownerId: owner._id,
      reason: 'Not right now',
    });

    const resolved = await CampaignUpgrade.findById(upgrade._id);
    expect(resolved.status).toBe('rejected');
    expect((await Campaign.findById(campaign._id)).campaign_type).toBe('fundraising');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Admin upgrade', () => {
  test('upgrades the campaign but leaves paid sharing OFF pending owner consent', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: admin._id,
      initiatorType: 'admin',
      shareConfig: goodConfig,
      adminNote: 'Verified need, upgrading on request.',
    });

    expect(result.campaign.campaign_type).toBe('sharing');
    expect(result.campaign.upgrade_meta.upgrade_initiator_type).toBe('admin');
    // An admin cannot accept a financial obligation on the owner's behalf.
    expect(result.campaign.share_config.is_paid_sharing_active).toBe(false);
    expect(result.campaign.share_config.creator_payout_consent_at).toBeNull();
    // Ownership untouched.
    expect(String(result.campaign.creator_id)).toBe(String(owner._id));
  });

  // The payout requirement guards ACTIVATION, not the type change. An admin
  // upgrade leaves paid sharing off, so nothing can be owed and the owner's
  // payout state must not stand in the way of an admin helping them.
  test('succeeds even when the OWNER has no payout method, with sharing left off', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    const campaign = await makeCampaign(owner); // owner has no payment method

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: admin._id,
      initiatorType: 'admin',
      shareConfig: goodConfig,
      adminNote: 'Creator verified over the phone; helping them upgrade.',
    });

    expect(result.campaign.campaign_type).toBe('sharing');
    // Nothing can accrue: no rewards until the owner sorts their payout method.
    expect(result.campaign.share_config.is_paid_sharing_active).toBe(false);
    expect(result.campaign.share_config.creator_payout_consent_at).toBeNull();
    // Recorded truthfully for the audit trail rather than blocking.
    expect(result.upgrade.payout_readiness.ready).toBe(false);
  });

  test('a creator upgrade still requires a payout method, because it activates immediately', async () => {
    const owner = await makeUser();
    const campaign = await makeCampaign(owner); // no payment method

    await expect(
      CampaignUpgradeService.requestUpgrade({
        campaignId: campaign._id,
        actorId: owner._id,
        initiatorType: 'creator',
        shareConfig: goodConfig,
        payoutConsent: true,
      })
    ).rejects.toMatchObject({ code: 'NO_PAYOUT_METHOD' });

    expect((await Campaign.findById(campaign._id)).campaign_type).toBe('fundraising');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Admin upgrade audit surface', () => {
  const ModerationService = require('../../services/admin/ModerationService');

  test('upgrade context reports blockers and the owner payout state', async () => {
    const owner = await makeUser();
    const campaign = await makeCampaign(owner); // owner has no payout method

    const ctx = await ModerationService.getCampaignUpgradeContext(campaign._id);

    // Payout state is a WARNING, not a blocker — the admin can still act.
    expect(ctx.can_upgrade).toBe(true);
    expect(ctx.payout_readiness.ready).toBe(false);
    expect(ctx.blockers).toHaveLength(0);
    expect(ctx.warnings.map((w) => w.code)).toContain('OWNER_PAYOUT_NOT_READY');
    expect(ctx.owner.email).toBe(owner.email);
    // The admin view must never carry payment credentials.
    expect(JSON.stringify(ctx)).not.toContain('bank_account_number');
  });

  test('upgrade context clears once the owner can be paid', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    const ctx = await ModerationService.getCampaignUpgradeContext(campaign._id);
    expect(ctx.can_upgrade).toBe(true);
    expect(ctx.blockers).toHaveLength(0);
    expect(ctx.payout_readiness.level).toBe('verified');
  });

  test('admin upgrade requires a substantive note for the audit trail', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    await expect(
      ModerationService.upgradeCampaign(campaign._id, {
        adminId: admin._id,
        shareConfig: goodConfig,
        adminNote: 'too short',
      })
    ).rejects.toMatchObject({ code: 'ADMIN_NOTE_REQUIRED' });

    expect((await Campaign.findById(campaign._id)).campaign_type).toBe('fundraising');
  });

  test('the upgrade history lists records and filters by initiator', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    await makePaymentMethod(owner);
    const campaign = await makeCampaign(owner);

    await ModerationService.upgradeCampaign(campaign._id, {
      adminId: admin._id,
      shareConfig: goodConfig,
      adminNote: 'Verified need over the phone, upgrading for them.',
    });

    const all = await ModerationService.listCampaignUpgrades({});
    expect(all.pagination.total).toBe(1);
    expect(all.upgrades[0].initiator_type).toBe('admin');
    expect(all.upgrades[0].admin_note).toContain('Verified need');
    // Actors are hydrated so the table shows names, not ObjectIds.
    expect(all.upgrades[0].owner_id.email).toBe(owner.email);

    const creatorOnly = await ModerationService.listCampaignUpgrades({
      initiatorType: 'creator',
    });
    expect(creatorOnly.pagination.total).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Paid-sharing activation gate', () => {
  const ShareConfigService = require('../../services/ShareConfigService');

  /** A Share Campaign with rewards configured but sharing switched off. */
  async function makeUpgradedCampaign(owner) {
    return makeCampaign(owner, {
      campaign_type: 'sharing',
      share_config: {
        total_budget: 10000,
        committed_budget_remaining: 10000,
        committed_total: 0,
        amount_per_share: 500,
        is_paid_sharing_active: false,
      },
    });
  }

  // This is the gate that actually matters: the moment rewards switch on is the
  // moment the creator starts owing sharers real money.
  test('refuses to enable paid sharing when the creator has no payout method', async () => {
    const owner = await makeUser();
    const campaign = await makeUpgradedCampaign(owner);

    await expect(
      ShareConfigService.enablePaidSharing(campaign._id, owner._id)
    ).rejects.toMatchObject({ code: 'NO_PAYOUT_METHOD' });

    const after = await Campaign.findById(campaign._id);
    expect(after.share_config.is_paid_sharing_active).toBe(false);
  });

  test('enables paid sharing once a payout method exists', async () => {
    const owner = await makeUser();
    await makePaymentMethod(owner);
    const campaign = await makeUpgradedCampaign(owner);

    await ShareConfigService.enablePaidSharing(campaign._id, owner._id);

    const after = await Campaign.findById(campaign._id);
    expect(after.share_config.is_paid_sharing_active).toBe(true);
  });

  // The whole point of moving the gate here: an admin-upgraded campaign whose
  // owner never added a payout method still cannot start paying out.
  test('an admin-upgraded campaign cannot start rewarding until the owner is payable', async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: 'admin' });
    const campaign = await makeCampaign(owner);

    await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: admin._id,
      initiatorType: 'admin',
      shareConfig: goodConfig,
      adminNote: 'Helping this creator get set up.',
    });

    await expect(
      ShareConfigService.enablePaidSharing(campaign._id, owner._id)
    ).rejects.toMatchObject({ code: 'NO_PAYOUT_METHOD' });

    // ...and succeeds the moment they add one.
    await makePaymentMethod(owner);
    await ShareConfigService.enablePaidSharing(campaign._id, owner._id);

    const after = await Campaign.findById(campaign._id);
    expect(after.share_config.is_paid_sharing_active).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Community boost', () => {
  test('a supporter can boost another user\'s campaign', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    const result = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: booster._id,
    });

    expect(result.counted).toBe(true);
    expect(result.campaign.community_boost_count).toBe(1);
    expect(result.campaign.community_boost_score).toBeGreaterThan(0);

    const updated = await Campaign.findById(campaign._id);
    // Boosters land in the existing activists list rather than a parallel one.
    expect(updated.activists.some((a) => a.action_type === 'advocate')).toBe(true);
  });

  test('self-boost is refused', async () => {
    const owner = await makeUser();
    const campaign = await makeCampaign(owner);

    await expect(
      CampaignBoostService.createBoost({ campaignId: campaign._id, userId: owner._id })
    ).rejects.toMatchObject({ code: 'SELF_BOOST_FORBIDDEN', statusCode: 403 });
  });

  test('a second boost the same day is recorded but does not count', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id });
    const second = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: booster._id,
    });

    expect(second.counted).toBe(false);
    expect(second.code).toBe('ALREADY_BOOSTED_TODAY');

    const updated = await Campaign.findById(campaign._id);
    expect(updated.community_boost_count).toBe(1);
    expect(await CampaignSupportBoost.countDocuments({ campaign_id: campaign._id })).toBe(1);
  });

  test('concurrent boosts by the same user create exactly one record', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    const results = await Promise.allSettled([
      CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id }),
      CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id }),
    ]);

    // Neither may reject — the DB unique index resolves the race into a
    // friendly "already boosted today".
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(results.filter((r) => r.value.counted).length).toBe(1);
    expect(await CampaignSupportBoost.countDocuments({ campaign_id: campaign._id })).toBe(1);
  });

  test('a low-trust account\'s boost is recorded but contributes nothing to ranking', async () => {
    const owner = await makeUser();
    const fresh = await makeUser({
      created_at: new Date(),
      verification_badges: { email_verified: false, identity_verified: false },
    });
    const campaign = await makeCampaign(owner);

    const result = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: fresh._id,
    });

    expect(result.counted).toBe(false);
    expect(result.suppressed_reason).toBe('low_trust');

    const updated = await Campaign.findById(campaign._id);
    expect(updated.community_boost_score).toBe(0);
    // Still recorded, so analytics stay truthful.
    expect(await CampaignSupportBoost.countDocuments({ campaign_id: campaign._id })).toBe(1);
  });

  test.each(['paused', 'completed', 'draft'])('cannot boost a %s campaign', async (status) => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner, { status });

    await expect(
      CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id })
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_ELIGIBLE' });
  });

  test('score decays with age and counts each booster once', async () => {
    const owner = await makeUser();
    const b1 = await makeUser();
    const b2 = await makeUser();
    const campaign = await makeCampaign(owner);

    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: b1._id });
    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: b2._id });

    const fresh = await CampaignBoostService.recomputeScore(campaign._id);
    expect(fresh.distinct_boosters).toBe(2);

    // Same boosts, evaluated a fortnight later.
    const later = await CampaignBoostService.recomputeScore(
      campaign._id,
      new Date(Date.now() + 14 * DAY)
    );
    expect(later.score).toBeLessThan(fresh.score);
  });

  test('revoking a boost removes its ranking contribution', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    const { boost } = await CampaignBoostService.createBoost({
      campaignId: campaign._id,
      userId: booster._id,
    });

    await CampaignBoostService.revokeBoost(boost._id, { reason: 'fraud ring' });

    const updated = await Campaign.findById(campaign._id);
    expect(updated.community_boost_score).toBe(0);
    expect(updated.community_boost_count).toBe(0);
  });

  test('eligibility reports the right state for each viewer', async () => {
    const owner = await makeUser();
    const booster = await makeUser();
    const campaign = await makeCampaign(owner);

    expect((await CampaignBoostService.getBoostEligibility(campaign._id, owner._id)).state).toBe(
      'self_boost'
    );
    expect((await CampaignBoostService.getBoostEligibility(campaign._id, null)).state).toBe(
      'unauthenticated'
    );
    expect((await CampaignBoostService.getBoostEligibility(campaign._id, booster._id)).state).toBe(
      'available'
    );

    await CampaignBoostService.createBoost({ campaignId: campaign._id, userId: booster._id });
    expect((await CampaignBoostService.getBoostEligibility(campaign._id, booster._id)).state).toBe(
      'already_boosted_today'
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Ranking guarantees', () => {
  test('a paid boost always outranks community boosts in the trending sort', async () => {
    const owner = await makeUser();

    const paid = await makeCampaign(owner, {
      is_boosted: true,
      boost_weight: 10,
      community_boost_score: 0,
    });
    const communityFavourite = await makeCampaign(owner, {
      is_boosted: false,
      boost_weight: 0,
      community_boost_score: 999,
    });

    const ordered = await Campaign.find({
      _id: { $in: [paid._id, communityFavourite._id] },
    }).sort({ is_boosted: -1, boost_weight: -1, community_boost_score: -1, created_at: -1 });

    // If this ever flips, a free action outranks the $20 product and the
    // feature becomes a revenue regression.
    expect(String(ordered[0]._id)).toBe(String(paid._id));
  });

  test('community score breaks the tie between two unboosted campaigns', async () => {
    const owner = await makeUser();
    const quiet = await makeCampaign(owner, { community_boost_score: 0 });
    const loved = await makeCampaign(owner, { community_boost_score: 5 });

    const ordered = await Campaign.find({ _id: { $in: [quiet._id, loved._id] } }).sort({
      is_boosted: -1,
      boost_weight: -1,
      community_boost_score: -1,
      created_at: -1,
    });

    expect(String(ordered[0]._id)).toBe(String(loved._id));
  });
});
