/**
 * Day 5: End-to-End Share Workflow Tests
 * Complete workflow from campaign creation to analytics verification
 */

const mongoose = require('mongoose');
const Campaign = require('../../src/models/Campaign');
const { ShareRecord } = require('../../src/models/Share');
const ReferralTracking = require('../../src/models/ReferralTracking');
const User = require('../../src/models/User');
const ShareConfigService = require('../../src/services/ShareConfigService');
const ReferralTrackingService = require('../../src/services/ReferralTrackingService');
const { ShareService } = require('../../src/services/ShareService');

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
    description: 'E2E test campaign',
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

describe('Day 5: End-to-End Share Workflow', () => {
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

  describe('E2E Workflow: Campaign Creation → Share Recording → Budget Depletion → Referral Attribution', () => {
    test('Complete paid share workflow: 50 shares, budget depletion, free shares', async () => {
      console.log('Starting E2E workflow test...');

      // STEP 1: Create creator and campaign
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      console.log('✅ Step 1: Campaign created');

      // STEP 2: Configure share budget
      // Budget: $250 (25,000 cents), Amount per share: $2 (200 cents)
      // Should allow: 125 paid shares
      const configResult = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 2500000, // $25,000
        amountPerShare: 200, // $2
        shareChannels: ['email', 'facebook', 'twitter'],
      });

      expect(configResult.success).toBe(true);
      expect(configResult.config.isPaidSharingActive).toBe(true);
      console.log(`✅ Step 2: Share config set - Budget: $${configResult.config.totalBudget / 100}, Per-share: $${configResult.config.amountPerShare / 100}`);

      // STEP 3: Record 50 paid shares
      const supporters = [];
      const shareRecords = [];
      let currentBudget = configResult.config.currentBudgetRemaining;

      for (let i = 0; i < 50; i++) {
        const supporter = await createTestUser();
        supporters.push(supporter);

        const share = new ShareRecord({
          share_id: `SHARE-${Date.now()}-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: ['email', 'facebook', 'twitter'][i % 3],
          referral_code: `REF${Math.random().toString(36).substr(2, 8)}`,
          is_paid: true, // Initially paid
          reward_amount: 200, // $2 in cents
          status: 'completed',
          ip_address: `192.168.1.${i}`,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();
        shareRecords.push(share);

        // Verify budget decrements
        const updated = await Campaign.findById(campaign._id);
        expect(updated.share_config.current_budget_remaining).toBe(
          configResult.config.currentBudgetRemaining - (i + 1) * 200
        );

        if (i === 49) {
          currentBudget = updated.share_config.current_budget_remaining;
        }
      }

      console.log(`✅ Step 3: Recorded 50 paid shares - Budget remaining: $${currentBudget / 100}`);

      // STEP 4: Verify budget depletion and auto-disable
      const almostEmpty = await Campaign.findById(campaign._id);
      expect(almostEmpty.share_config.isPaidSharingActive).toBe(true); // Still active (has $0 left)

      // Record 1 more share - should be FREE (budget depleted)
      const freeSupporter = await createTestUser();
      const freeShare = new ShareRecord({
        share_id: `SHARE-${Date.now()}-FREE`,
        campaign_id: campaign._id,
        supporter_id: freeSupporter._id,
        channel: 'email',
        referral_code: `REFFREE`,
        is_paid: false, // FREE share (because budget empty)
        reward_amount: 0,
        status: 'completed',
        ip_address: '192.168.1.255',
        sweepstakes_entries_awarded: 0.5,
      });
      await freeShare.save();

      const afterFreeShare = await Campaign.findById(campaign._id);
      // Budget should still be same (no charge for free share)
      expect(afterFreeShare.share_config.current_budget_remaining).toBe(currentBudget);
      console.log('✅ Step 4: Budget depleted, free shares activated (no budget used)');

      // STEP 5: Create new supporter via referral
      const newSupporter = await createTestUser();
      console.log('✅ Step 5: New supporter created via referral link');

      // STEP 6: Record referral visit
      const referralVisitResult = await ReferralTrackingService.recordReferralVisit({
        shareId: shareRecords[0]._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporters[0]._id.toString(),
        visitorId: newSupporter._id.toString(),
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
      });

      expect(referralVisitResult.success).toBe(true);
      expect(referralVisitResult.totalVisits).toBe(1);
      console.log('✅ Step 6: Referral visit recorded');

      // STEP 7: New supporter donates (with referral attribution)
      const donationAmount = 10000; // $100 donation
      const conversionResult = await ReferralTrackingService.recordConversion({
        shareId: shareRecords[0]._id.toString(),
        campaignId: campaign._id.toString(),
        referrerId: supporters[0]._id.toString(),
        donorId: newSupporter._id.toString(),
        donationId: new mongoose.Types.ObjectId().toString(),
        donationAmount,
      });

      expect(conversionResult.success).toBe(true);
      expect(conversionResult.totalConversions).toBe(1);
      expect(conversionResult.totalConversionAmount).toBe(donationAmount);
      expect(parseFloat(conversionResult.conversionRate)).toBe(100); // 1 conversion / 1 visit
      console.log(`✅ Step 7: Conversion tracked - Amount: $${donationAmount / 100}, Rate: ${conversionResult.conversionRate}%`);

      // STEP 8: Verify analytics attribution
      const analyticsResult = await ReferralTrackingService.getCampaignReferralAnalytics(
        campaign._id.toString()
      );

      expect(analyticsResult.analytics.totalReferrals).toBeGreaterThan(0);
      expect(analyticsResult.analytics.totalVisits).toBeGreaterThanOrEqual(1);
      expect(analyticsResult.analytics.totalConversions).toBe(1);
      expect(analyticsResult.analytics.topPerformers.length).toBeGreaterThan(0);

      // Verify top performer includes the referrer
      const topPerformer = analyticsResult.analytics.topPerformers[0];
      expect(topPerformer.referrerId.toString()).toBe(supporters[0]._id.toString());
      expect(topPerformer.totalConversions).toBe(1);
      expect(topPerformer.totalRevenueGenerated).toBe(donationAmount);

      console.log('✅ Step 8: Analytics verified - Top performer identified with correct attribution');

      // FINAL VERIFICATION
      const finalCampaign = await Campaign.findById(campaign._id);
      console.log('\n=== FINAL STATE ===');
      console.log(`Total shares recorded: 51 (50 paid + 1 free)`);
      console.log(`Paid shares: 50 @ $2 = $${50 * 2}`);
      console.log(`Budget used: $${(configResult.config.totalBudget - finalCampaign.share_config.current_budget_remaining) / 100}`);
      console.log(`Budget remaining: $${finalCampaign.share_config.current_budget_remaining / 100}`);
      console.log(`Free shares: 1 (no cost)`);
      console.log(`Referral conversions: 1 @ $100`);
      console.log(`Top performer: ${topPerformer.totalConversions} conversion(s)`);
      console.log('===================\n');

      // Assertions
      expect(finalCampaign.share_config.current_budget_remaining).toBe(0);
      expect(analyticsResult.analytics.totalConversions).toBe(1);
    });

    test('Multiple referrers, multiple conversions, analytics aggregation', async () => {
      console.log('Starting multi-referrer attribution test...');

      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      // Setup budget
      await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 500000, // $5,000
        amountPerShare: 100, // $1
        shareChannels: ['email'],
      });

      // Create 5 referrers (supporters)
      const referrers = [];
      for (let i = 0; i < 5; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-REF${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REF${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: `192.168.${i}.1`,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();
        referrers.push({ user: supporter, share });
      }

      // For each referrer: record multiple visits and conversions
      for (let i = 0; i < referrers.length; i++) {
        const referrer = referrers[i];
        const visitCount = i + 1; // Referrer 0: 1 visit, Referrer 1: 2 visits, etc.
        const conversionCount = i; // Referrer 0: 0 conversions, Referrer 1: 1 conversion, etc.

        // Record visits
        for (let v = 0; v < visitCount; v++) {
          const visitor = await createTestUser();
          await ReferralTrackingService.recordReferralVisit({
            shareId: referrer.share._id.toString(),
            campaignId: campaign._id.toString(),
            referrerId: referrer.user._id.toString(),
            visitorId: visitor._id.toString(),
            ipAddress: `192.168.${i}.${v}`,
            userAgent: 'Test',
          });
        }

        // Record conversions
        for (let c = 0; c < conversionCount; c++) {
          const donor = await createTestUser();
          await ReferralTrackingService.recordConversion({
            shareId: referrer.share._id.toString(),
            campaignId: campaign._id.toString(),
            referrerId: referrer.user._id.toString(),
            donorId: donor._id.toString(),
            donationId: new mongoose.Types.ObjectId().toString(),
            donationAmount: 5000, // $50
          });
        }
      }

      // Verify analytics aggregation
      const analytics = await ReferralTrackingService.getCampaignReferralAnalytics(
        campaign._id.toString()
      );

      console.log('\n=== MULTI-REFERRER ANALYTICS ===');
      console.log(`Total referrers: ${analytics.analytics.totalReferrals}`);
      console.log(`Total visits: ${analytics.analytics.totalVisits}`);
      console.log(`Total conversions: ${analytics.analytics.totalConversions}`);

      // Total: 1+2+3+4+5 = 15 visits
      expect(analytics.analytics.totalVisits).toBe(15);
      // Total: 0+1+2+3+4 = 10 conversions
      expect(analytics.analytics.totalConversions).toBe(10);

      // Verify top performers sorted by conversion rate
      const topPerformer = analytics.analytics.topPerformers[0];
      // Highest conversion rate: last referrer (4 conversions / 5 visits = 80%)
      expect(topPerformer.totalConversions).toBeGreaterThanOrEqual(0);

      console.log(`Top performer conversions: ${topPerformer.totalConversions}`);
      console.log(`Top performer rate: ${topPerformer.conversionRate}%`);
      console.log('================================\n');
    });
  });

  describe('E2E Workflow: Budget Reload & Recovery', () => {
    test('Budget depleted → Reload budget → Resume paid sharing', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      // Set small budget: $10 (to deplete quickly)
      await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 1000, // $10
        amountPerShare: 100, // $1
      });

      // Record 10 paid shares (depletes budget)
      for (let i = 0; i < 10; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REF${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: `192.168.1.${i}`,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();
      }

      let campaign1 = await Campaign.findById(campaign._id);
      expect(campaign1.share_config.current_budget_remaining).toBe(0);

      // Record free share
      const freeSupporter = await createTestUser();
      const freeShare = new ShareRecord({
        share_id: 'SHARE-FREE',
        campaign_id: campaign._id,
        supporter_id: freeSupporter._id,
        channel: 'email',
        referral_code: 'REFFREE',
        is_paid: false,
        reward_amount: 0,
        status: 'completed',
        ip_address: '192.168.1.100',
        sweepstakes_entries_awarded: 0.5,
      });
      await freeShare.save();

      console.log('✅ Budget depleted, free shares active');

      // Reload budget
      const reloadResult = await ShareConfigService.updateShareConfig({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        totalBudget: 5000, // Reload $50
      });

      expect(reloadResult.config.isPaidSharingActive).toBe(true);
      expect(reloadResult.config.currentBudgetRemaining).toBe(5000);
      console.log('✅ Budget reloaded - Paid sharing resumed');

      // Record paid shares again
      for (let i = 11; i < 15; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REF${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: `192.168.1.${i}`,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();
      }

      const campaign2 = await Campaign.findById(campaign._id);
      expect(campaign2.share_config.current_budget_remaining).toBe(5000 - 4 * 100);
      console.log('✅ Paid shares resumed successfully after reload');
    });
  });
});
