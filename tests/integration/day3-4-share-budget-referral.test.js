/**
 * Share Configuration & Referral Tracking - Integration Tests
 * Day 3-4: Budget Management & Referral Tracking
 * Target: >90% code coverage
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
    description: 'Performance test campaign',
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

describe('Share Configuration & Referral Tracking - Integration Tests', () => {
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

  // ========== Scenario 1: Share Configuration Updates ==========
  describe('Scenario 1: Share Configuration Updates', () => {
    test('Should update total budget successfully', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 50000, // $500
      });

      expect(result.success).toBe(true);
      expect(result.config.totalBudget).toBe(50000);
      expect(result.config.currentBudgetRemaining).toBe(50000);

      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.total_budget).toBe(50000);
    });

    test('Should update amount per share', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amountPerShare: 100, // $1
      });

      expect(result.success).toBe(true);
      expect(result.config.amountPerShare).toBe(100);
    });

    test('Should update share channels', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const channels = ['email', 'facebook', 'twitter'];
      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        shareChannels: channels,
      });

      expect(result.success).toBe(true);
      expect(result.config.shareChannels).toEqual(channels);
    });

    test('Should auto-enable paid sharing when budget and amount are set', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 50000,
      });

      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amountPerShare: 100,
      });

      expect(result.config.isPaidSharingActive).toBe(true);
    });

    test('Should reject if amount per share exceeds max ($100)', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          amountPerShare: 20000, // $200 - exceeds max
        })
      ).rejects.toMatchObject({
        code: 'AMOUNT_PER_SHARE_EXCEEDED',
      });
    });

    test('Should reject non-creator from updating config', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const otherUser = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: otherUser._id.toString(),
          totalBudget: 50000,
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    test('Should reject update if campaign not active', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, { status: 'paused' });

      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          totalBudget: 50000,
        })
      ).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_ACTIVE',
      });
    });
  });

  // ========== Scenario 2: Rate Limiting on Config Updates ==========
  describe('Scenario 2: Rate Limiting on Config Updates', () => {
    test('Should allow 1 config update per hour', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      // First update should succeed
      const result1 = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 50000,
      });
      expect(result1.success).toBe(true);

      // Second update immediately should fail
      await expect(
        ShareConfigService.updateShareConfig({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          totalBudget: 60000,
        })
      ).rejects.toMatchObject({
        code: 'CONFIG_UPDATE_RATE_LIMITED',
        statusCode: 429,
      });
    });
  });

  // ========== Scenario 3: Referral Visit Tracking ==========
  describe('Scenario 3: Referral Visit Tracking', () => {
    test('Should record referral visit successfully', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      const result = await ReferralTrackingService.recordReferralVisit({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        visitorId: null,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser',
      });

      expect(result.success).toBe(true);
      expect(result.totalVisits).toBe(1);

      // Verify tracking record created
      const tracking = await ReferralTracking.findOne({ tracking_id: result.trackingId });
      expect(tracking).toBeDefined();
      expect(tracking.referral_visits.length).toBe(1);
    });

    test('Should track multiple visits to same share', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Record 3 visits
      for (let i = 0; i < 3; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: null,
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test Browser',
        });
      }

      const tracking = await ReferralTracking.findOne({
        share_id: share._id,
        referrer_id: supporter._id,
      });
      expect(tracking.total_visits).toBe(3);
    });

    test('Should record logged-in visitor ID', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const visitor = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      const result = await ReferralTrackingService.recordReferralVisit({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        visitorId: visitor._id.toString(),
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
      });

      const tracking = await ReferralTracking.findOne({ tracking_id: result.trackingId });
      expect(tracking.referral_visits[0].visitor_id.toString()).toBe(visitor._id.toString());
    });
  });

  // ========== Scenario 4: Referral Conversion Tracking ==========
  describe('Scenario 4: Referral Conversion Tracking', () => {
    test('Should record conversion on referral donation', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const donor = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Record visit first
      await ReferralTrackingService.recordReferralVisit({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        visitorId: donor._id.toString(),
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
      });

      // Record conversion
      const fakeDonationId = new mongoose.Types.ObjectId();
      const result = await ReferralTrackingService.recordConversion({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        donorId: donor._id.toString(),
        donationId: fakeDonationId.toString(),
        donationAmount: 5000, // $50
      });

      expect(result.success).toBe(true);
      expect(result.totalConversions).toBe(1);
      expect(result.totalConversionAmount).toBe(5000);
      expect(result.conversionRate).toBe('100.00'); // 1 conversion / 1 visit

      // Verify tracking updated
      const tracking = await ReferralTracking.findOne({
        tracking_id: result.trackingId,
      });
      expect(tracking.conversions.length).toBe(1);
      expect(tracking.total_conversions).toBe(1);
    });

    test('Should calculate conversion rate correctly', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);

      // Record 3 visits
      for (let i = 0; i < 3; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: i === 0 ? new mongoose.Types.ObjectId().toString() : null,
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test',
        });
      }

      // Record 1 conversion
      const donationId = new mongoose.Types.ObjectId();
      await ReferralTrackingService.recordConversion({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        donorId: new mongoose.Types.ObjectId().toString(),
        donationId: donationId.toString(),
        donationAmount: 5000,
      });

      const tracking = await ReferralTracking.findOne({
        share_id: share._id,
        referrer_id: supporter._id,
      });
      // 1 conversion / 3 visits = 33.33%
      expect(parseFloat(tracking.conversion_rate)).toBeCloseTo(33.33, 1);
    });

    test('Should prevent duplicate conversions', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share = await createTestShare(campaign._id, supporter._id);
      const donationId = new mongoose.Types.ObjectId();

      // Record conversion
      await ReferralTrackingService.recordConversion({
        shareId: share._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporter._id.toString(),
        donorId: new mongoose.Types.ObjectId().toString(),
        donationId: donationId.toString(),
        donationAmount: 5000,
      });

      // Try to record same donation again
      await expect(
        ReferralTrackingService.recordConversion({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          donorId: new mongoose.Types.ObjectId().toString(),
          donationId: donationId.toString(),
          donationAmount: 5000,
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_CONVERSION',
      });
    });
  });

  // ========== Scenario 5: Campaign Referral Analytics ==========
  describe('Scenario 5: Campaign Referral Analytics', () => {
    test('Should get campaign referral analytics', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter1 = await createTestUser();
      const supporter2 = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const share1 = await createTestShare(campaign._id, supporter1._id);
      const share2 = await createTestShare(campaign._id, supporter2._id);

      // Setup data
      for (let i = 0; i < 5; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share1._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter1._id.toString(),
          visitorId: null,
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test',
        });
      }

      for (let i = 0; i < 3; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share2._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter2._id.toString(),
          visitorId: null,
          ipAddress: `192.168.2.${i}`,
          userAgent: 'Test',
        });
      }

      // Record conversions
      for (let i = 0; i < 2; i++) {
        await ReferralTrackingService.recordConversion({
          shareId: share1._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter1._id.toString(),
          donorId: new mongoose.Types.ObjectId().toString(),
          donationId: new mongoose.Types.ObjectId().toString(),
          donationAmount: 5000,
        });
      }

      const result = await ReferralTrackingService.getCampaignReferralAnalytics(
        campaign._id.toString()
      );

      expect(result.success).toBe(true);
      expect(result.analytics.totalReferrals).toBe(2);
      expect(result.analytics.totalVisits).toBe(8);
      expect(result.analytics.totalConversions).toBe(2);
      expect(result.analytics.topPerformers.length).toBeGreaterThan(0);
    });

    test('Should identify top performers correctly', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const topSupporter = await createTestUser();
      const lowSupporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const shareTop = await createTestShare(campaign._id, topSupporter._id);
      const shareLow = await createTestShare(campaign._id, lowSupporter._id);

      // Top supporter: 5 visits, 4 conversions = 80% conversion rate
      for (let i = 0; i < 5; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: shareTop._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: topSupporter._id.toString(),
          visitorId: null,
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test',
        });
      }

      for (let i = 0; i < 4; i++) {
        await ReferralTrackingService.recordConversion({
          shareId: shareTop._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: topSupporter._id.toString(),
          donorId: new mongoose.Types.ObjectId().toString(),
          donationId: new mongoose.Types.ObjectId().toString(),
          donationAmount: 5000,
        });
      }

      // Low supporter: 10 visits, 1 conversion = 10% conversion rate
      for (let i = 0; i < 10; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: shareLow._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: lowSupporter._id.toString(),
          visitorId: null,
          ipAddress: `192.168.2.${i}`,
          userAgent: 'Test',
        });
      }

      await ReferralTrackingService.recordConversion({
        shareId: shareLow._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: lowSupporter._id.toString(),
        donorId: new mongoose.Types.ObjectId().toString(),
        donationId: new mongoose.Types.ObjectId().toString(),
        donationAmount: 5000,
      });

      const result = await ReferralTrackingService.getCampaignReferralAnalytics(
        campaign._id.toString()
      );

      // Top performer should be list ed first
      expect(result.analytics.topPerformers[0].referrerId.toString()).toBe(topSupporter._id.toString());
      expect(result.analytics.topPerformers[0].conversionRate).toBe('80.00');
    });
  });

  // ========== Scenario 6: Supporter Referral Performance ==========
  describe('Scenario 6: Supporter Referral Performance', () => {
    test('Should get supporter referral performance', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign1 = await createTestCampaign(creator._id);
      const campaign2 = await createTestCampaign(creator._id);
      const share1 = await createTestShare(campaign1._id, supporter._id);
      const share2 = await createTestShare(campaign2._id, supporter._id);

      // Setup shares across campaigns
      for (let i = 0; i < 3; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share1._id.toString(),
          campaignId: campaign1._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: null,
          ip Address: `192.168.1.${i}`,
          userAgent: 'Test',
        });
      }

      for (let i = 0; i < 2; i++) {
        await ReferralTrackingService.recordReferralVisit({
          shareId: share2._id.toString(),
          campaignId: campaign2._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: null,
          ipAddress: `192.168.2.${i}`,
          userAgent: 'Test',
        });
      }

      const result = await ReferralTrackingService.getSupporterReferralPerformance(
        supporter._id.toString()
      );

      expect(result.success).toBe(true);
      expect(result.performance.referrerId.toString()).toBe(supporter._id.toString());
      expect(result.performance.totalTrackedReferrals).toBe(2);
      expect(result.performance.totalVisits).toBe(5);
    });

    test('Should paginate supporter referral performance', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();

      // Create 30 campaigns and shares
      for (let i = 0; i < 30; i++) {
        const campaign = await createTestCampaign(creator._id);
        const share = await createTestShare(campaign._id, supporter._id);

        await ReferralTrackingService.recordReferralVisit({
          shareId: share._id.toString(),
          campaignId: campaign._id.toString(),
          referrerId: supporter._id.toString(),
          visitorId: null,
          ipAddress: '192.168.1.1',
          userAgent: 'Test',
        });
      }

      const page1 = await ReferralTrackingService.getSupporterReferralPerformance(
        supporter._id.toString(),
        { page: 1, limit: 20 }
      );

      const page2 = await ReferralTrackingService.getSupporterReferralPerformance(
        supporter._id.toString(),
        { page: 2, limit: 20 }
      );

      expect(page1.performance.referrals.length).toBe(20);
      expect(page2.performance.referrals.length).toBe(10);
      expect(page1.pagination.total).toBe(30);
      expect(page1.pagination.pages).toBe(2);
    });
  });

  // ========== Scenario 7: Budget Depletion & Re-enablement ==========
  describe('Scenario 7: Budget Depletion & Re-enablement', () => {
    test('Should auto-disable when budget reaches zero', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      // Set budget to $100
      await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 10000,
        amountPerShare: 100,
      });

      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.isPaidSharingActive).toBe(true);

      // Reduce budget to $0
      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 0,
      });

      expect(result.config.isPaidSharingActive).toBe(false);
    });

    test('Should re-enable paid sharing on budget reload', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          total_budget: 0,
          current_budget_remaining: 0,
          amount_per_share: 100,
          is_paid_sharing_active: false,
        },
      });

      // Reload budget
      const result = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 50000, // $500
      });

      expect(result.config.isPaidSharingActive).toBe(true);
    });
  });
});
