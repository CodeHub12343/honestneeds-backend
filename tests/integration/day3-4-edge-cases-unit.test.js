/**
 * Share Configuration & Referral Tracking - Unit & Edge Case Tests
 * Day 3-4: Additional Coverage for Error Scenarios
 * Complements: day3-4-share-budget-referral.test.js
 */

const mongoose = require('mongoose');
const ShareConfigService = require('../../src/services/ShareConfigService');
const ReferralTrackingService = require('../../src/services/ReferralTrackingService');
const Campaign = require('../../src/models/Campaign');
const { ShareRecord } = require('../../src/models/Share');
const ReferralTracking = require('../../src/models/ReferralTracking');
const User = require('../../src/models/User');

// Test helpers
const createTestUser = async (data = {}) => {
  const defaults = {
    name: `Test User ${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    phone: '1234567890',
    password: 'hashedpassword',
    role: 'supporter',
    ...data,
  };
  const user = new User(defaults);
  await user.save();
  return user;
};

const createTestCampaign = async (creatorId, data = {}) => {
  const defaults = {
    campaign_id: `CAMP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    creator_id: creatorId,
    title: 'Test Campaign',
    description: 'Unit test campaign',
    need_type: 'education_scholarship_matching',
    status: 'active',
    share_config: {
      total_budget: 0,
      current_budget_remaining: 0,
      amount_per_share: 0,
      is_paid_sharing_active: false,
      share_channels: [],
    },
    ...data,
  };
  const campaign = new Campaign(defaults);
  await campaign.save();
  return campaign;
};

const createTestShare = async (campaignId, supporterId) => {
  const share = new ShareRecord({
    share_id: `SHARE-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    campaign_id: campaignId,
    supporter_id: supporterId,
    channel: 'email',
    referral_code: `REF${Math.random().toString(36).substr(2, 8)}`,
    is_paid: false,
    reward_amount: 0,
    status: 'completed',
    ip_address: '192.168.1.1',
    sweepstakes_entries_awarded: 0.5,
  });
  await share.save();
  return share;
};

describe('Share Configuration & Referral - Unit & Edge Case Tests', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-test';
      await mongoose.connect(mongoUrl);
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Campaign.deleteMany({});
    await ShareRecord.deleteMany({});
    await ReferralTracking.deleteMany({});
    await User.deleteMany({});
  });

  // ========== Error Scenarios: ShareConfigService ==========
  describe('Error Scenarios: ShareConfigService', () => {
    test('Should return error when campaign not found', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: fakeId.toString(),
          creatorId: creator._id.toString(),
          totalBudget: 50000,
        })
      ).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
        statusCode: 404,
      });
    });

    test('Should return error when trying to exceed max increase per update', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          total_budget: 50000, // $500 already set
          current_budget_remaining: 50000,
          amount_per_share: 0,
          is_paid_sharing_active: false,
          share_channels: [],
        },
      });

      // Try to increase by $11,000 (exceeds $10,000 max)
      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          totalBudget: 1150000, // Current 50000 + 1100000 increase
        })
      ).rejects.toMatchObject({
        code: 'BUDGET_INCREASE_EXCEEDED',
        statusCode: 400,
      });
    });

    test('Should return error when amount per share is invalid', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          amountPerShare: 0, // Invalid - must be > 0
        })
      ).rejects.toMatchObject({
        code: 'INVALID_AMOUNT_PER_SHARE',
        statusCode: 400,
      });
    });

    test('Should return error when total budget is negative', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          totalBudget: -10000,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_TOTAL_BUDGET',
        statusCode: 400,
      });
    });

    test('Should disable paid sharing on zero budget', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          total_budget: 50000,
          current_budget_remaining: 50000,
          amount_per_share: 100,
          is_paid_sharing_active: true,
          share_channels: ['email'],
        },
      });

      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 0,
      });

      expect(result.config.isPaidSharingActive).toBe(false);
    });
  });

  // ========== Error Scenarios: ReferralTrackingService ==========
  describe('Error Scenarios: ReferralTrackingService', () => {
    test('Should return error when share not found', async () => {
      const fakeShareId = new mongoose.Types.ObjectId();
      const fakeCampaignId = new mongoose.Types.ObjectId();
      const fakeReferrerId = new mongoose.Types.ObjectId();

      await expect(
        ReferralTrackingService.recordReferralVisit({
          shareId: fakeShareId.toString(),
          campaignId: fakeCampaignId.toString(),
          referrerId: fakeReferrerId.toString(),
          visitorId: null,
          ipAddress: '192.168.1.1',
          userAgent: 'Test',
        })
      ).rejects.toMatchObject({
        code: 'SHARE_NOT_FOUND',
        statusCode: 404,
      });
    });

    test('Should return error when campaign not found for conversion', async () => {
      const fakeShareId = new mongoose.Types.ObjectId();
      const fakeCampaignId = new mongoose.Types.ObjectId();
      const fakeReferrerId = new mongoose.Types.ObjectId();

      await expect(
        ReferralTrackingService.recordConversion({
          shareId: fakeShareId.toString(),
          campaignId: fakeCampaignId.toString(),
          referrerId: fakeReferrerId.toString(),
          donorId: new mongoose.Types.ObjectId().toString(),
          donationId: new mongoose.Types.ObjectId().toString(),
          donationAmount: 5000,
        })
      ).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
        statusCode: 404,
      });
    });

    test('Should return zero conversion rate when no visits', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Create tracking with conversion but no visits
      const tracking = new ReferralTracking({
        campaign_id: campaign._id,
        share_id: share._id,
        referrer_id: supporter._id,
        referral_visits: [],
        conversions: [
          {
            converted_by_id: new mongoose.Types.ObjectId(),
            donation_id: new mongoose.Types.ObjectId(),
            donation_amount: 5000,
            converted_at: new Date(),
            reward_pending: true,
          },
        ],
        total_visits: 0,
        total_conversions: 1,
        total_conversion_amount: 5000,
      });
      await tracking.save();

      // Conversion rate should be "0.00" due to division handling
      expect(tracking.conversion_rate).toBe('0.00');
    });
  });

  // ========== Constraint Validation Tests ==========
  describe('Constraint Validation Tests', () => {
    test('Should validate max amount per share ($100)', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const testAmounts = [
        { amount: 10000, shouldFail: false }, // $100 exactly
        { amount: 10001, shouldFail: true }, // $100.01
        { amount: 9900, shouldFail: false }, // $99
      ];

      for (const test of testAmounts) {
        if (test.shouldFail) {
          await expect(
            ShareConfigService.updateShareConfig({
              campaignId: campaign._id.toString(),
              creatorId: creator._id.toString(),
              amountPerShare: test.amount,
            })
          ).rejects.toHaveProperty('code', 'AMOUNT_PER_SHARE_EXCEEDED');
        } else {
          const result = await ShareConfigService.updateShareConfig({
            campaignId: campaign._id.toString(),
            creatorId: creator._id.toString(),
            amountPerShare: test.amount,
          });
          expect(result.success).toBe(true);
        }
      }
    });

    test('Should validate max budget increase ($10,000)', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          total_budget: 50000,
          current_budget_remaining: 50000,
          amount_per_share: 0,
          is_paid_sharing_active: false,
          share_channels: [],
        },
      });

      // Test boundary: exactly $10K increase should pass
      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 1050000, // + $10,000
      });
      expect(result.success).toBe(true);
    });

    test('Should validate share channel values', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const validChannels = [
        'email',
        'facebook',
        'twitter',
        'instagram',
        'linkedin',
        'sms',
        'whatsapp',
        'telegram',
        'reddit',
        'tiktok',
      ];

      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        shareChannels: validChannels,
      });

      expect(result.config.shareChannels).toEqual(validChannels);
    });
  });

  // ========== Referral Tracking Edge Cases ==========
  describe('Referral Tracking Edge Cases', () => {
    test('Should handle consecutive conversions from same donor', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const donor = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Single visit
      await ReferralTrackingService.recordReferralVisit({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        visitorId: donor._id.toString(),
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
      });

      // Multiple conversions (different donations)
      for (let i = 0; i < 3; i++) {
        const result = await ReferralTrackingService.recordConversion({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          donorId: donor._id.toString(),
          donationId: new mongoose.Types.ObjectId().toString(),
          donationAmount: 5000,
        });

        expect(result.totalConversions).toBe(i + 1);
      }

      const tracking = await ReferralTracking.findOne({
        share_id: share._id,
        referrer_id: supporter._id,
      });
      expect(tracking.conversions.length).toBe(3);
      expect(tracking.total_conversion_amount).toBe(15000); // 3 × $50
    });

    test('Should track large donor amounts correctly', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Record visit
      await ReferralTrackingService.recordReferralVisit({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        visitorId: null,
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
      });

      // Record large conversion
      const largeAmount = 50000000; // $500,000
      const result = await ReferralTrackingService.recordConversion({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        donorId: new mongoose.Types.ObjectId().toString(),
        donationId: new mongoose.Types.ObjectId().toString(),
        donationAmount: largeAmount,
      });

      expect(result.totalConversionAmount).toBe(largeAmount);

      const tracking = await ReferralTracking.findOne({
        share_id: share._id,
        referrer_id: supporter._id,
      });
      expect(tracking.conversions[0].donation_amount).toBe(largeAmount);
    });

    test('Should mark reward as paid correctly', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Setup conversion
      await ReferralTrackingService.recordReferralVisit({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        visitorId: null,
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
      });

      const conversionResult = await ReferralTrackingService.recordConversion({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        donorId: new mongoose.Types.ObjectId().toString(),
        donationId: new mongoose.Types.ObjectId().toString(),
        donationAmount: 5000,
      });

      // Mark reward as paid (Phase 2 workflow)
      const result = await ReferralTrackingService.markRewardPaid(
        conversionResult.trackingId,
        0, // First conversion
        1000 // $10 reward
      );

      expect(result.success).toBe(true);

      const tracking = await ReferralTracking.findOne({
        tracking_id: result.trackingId,
      });
      expect(tracking.conversions[0].reward_pending).toBe(false);
      expect(tracking.conversions[0].reward_amount).toBe(1000);
    });
  });

  // ========== Analytics Query Tests ==========
  describe('Analytics Query Tests', () => {
    test('Should handle empty campaign analytics', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const result = await ReferralTrackingService.getCampaignReferralAnalytics(
        campaign._id.toString()
      );

      expect(result.analytics.totalReferrals).toBe(0);
      expect(result.analytics.totalVisits).toBe(0);
      expect(result.analytics.totalConversions).toBe(0);
      expect(result.analytics.averageConversionRate).toBe('0.00');
      expect(result.analytics.topPerformers.length).toBe(0);
    });

    test('Should get share referral details', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter1 = await createTestUser();
      const supporter2 = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter1._id);

      // Add visits from two referrers
      for (let i = 0; i < 3; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter1._id.toString(),
          visitorId: null,
          ipAddress: '192.168.1.1',
          userAgent: 'Test',
        });
      }

      // Note: In real scenario, both would track to same share, this tests single referrer
      const result = await ReferralTrackingService.getShareReferralDetails(share._id.toString());

      expect(result.success).toBe(true);
      expect(result.details.shareId.toString()).toBe(share._id.toString());
    });
  });

  // ========== Concurrent Operations Tests ==========
  describe('Concurrent Operations Tests', () => {
    test('Should handle concurrent visits to same share', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Simulate 10 concurrent visits
      const visitPromises = Array.from({ length: 10 }, (_, i) =>
        ReferralTrackingService.recordReferralVisit({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: null,
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test',
        })
      );

      const results = await Promise.all(visitPromises);

      // All should succeed
      expect(results.every((r) => r.success === true)).toBe(true);

      const tracking = await ReferralTracking.findOne({
        share_id: share._id,
        referrer_id: supporter._id,
      });
      expect(tracking.total_visits).toBe(10);
    });
  });

  // ========== Data Integrity Tests ==========
  describe('Data Integrity Tests', () => {
    test('Should maintain data consistency across operations', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Record 5 visits
      for (let i = 0; i < 5; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: null,
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test',
        });
      }

      // Record 3 conversions
      for (let i = 0; i < 3; i++) {
        await ReferralTrackingService.recordConversion({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          donorId: new mongoose.Types.ObjectId().toString(),
          donationId: new mongoose.Types.ObjectId().toString(),
          donationAmount: 5000,
        });
      }

      const tracking = await ReferralTracking.findOne({
        share_id: share._id,
        referrer_id: supporter._id,
      });

      // Verify data consistency
      expect(tracking.total_visits).toBe(5);
      expect(tracking.referral_visits.length).toBe(5);
      expect(tracking.total_conversions).toBe(3);
      expect(tracking.conversions.length).toBe(3);
      expect(tracking.total_conversion_amount).toBe(15000);
      expect(parseFloat(tracking.conversion_rate)).toBeCloseTo(60, 0); // 3/5 = 60%
    });
  });
});
