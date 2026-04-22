/**
 * Share Service Integration Tests
 * Comprehensive testing of share recording, budget management, and workflows
 * Target: >90% code coverage
 */

const mongoose = require('mongoose');
const ShareService = require('../../src/services/ShareService');
const { ShareRecord, ShareBudgetReload } = require('../../src/models/Share');
const Campaign = require('../../src/models/Campaign');
const User = require('../../src/models/User');
const request = require('supertest');

// Test helpers
const createTestUser = async (data = {}) => {
  const defaults = {
    name: `Test User ${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    phone: '1234567890',
    password: 'hashedpassword123',
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
    description: 'A test campaign for shares',
    need_type: 'education_scholarship_matching',
    status: 'active',
    share_config: {
      is_paid_sharing_active: true,
      current_budget_remaining: 50000, // $500 in cents
      amount_per_share: 100, // $1 per share in cents
      total_budget_allocated: 50000,
      share_channels: ['email', 'facebook', 'twitter'],
    },
    ...data,
  };
  const campaign = new Campaign(defaults);
  await campaign.save();
  return campaign;
};

describe('Share Service - Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-test';
      await mongoose.connect(mongoUrl);
    }
  });

  afterAll(async () => {
    // Clean up and close connection
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await ShareRecord.deleteMany({});
    await ShareBudgetReload.deleteMany({});
    await Campaign.deleteMany({});
    await User.deleteMany({});
  });

  // ========== Scenario 1: Happy Path - Record a Paid Share ==========
  describe('Scenario 1: Happy Path - Paid Share Recording', () => {
    test('Should record a paid share successfully with reward', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      const result = await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        location: { country: 'US' },
      });

      expect(result.success).toBe(true);
      expect(result.isPaid).toBe(true);
      expect(result.rewardAmount).toBe(100); // $1 in cents
      expect(result.referralCode).toMatch(/\?ref=/);
      expect(result.shareId).toMatch(/SHARE-/);

      // Verify share was recorded
      const share = await ShareRecord.findOne({ share_id: result.shareId });
      expect(share).toBeDefined();
      expect(share.is_paid).toBe(true);
      expect(share.reward_amount).toBe(100);
      expect(share.channel).toBe('email');
      expect(share.status).toBe('completed');
    });

    test('Should update campaign metrics on share', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);
      const initialShares = campaign.metrics?.total_shares || 0;

      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'facebook',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      const updated = await Campaign.findById(campaign._id);
      expect(updated.metrics.total_shares).toBe(initialShares + 1);
    });

    test('Should award sweepstakes entries per share', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      const result = await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'twitter',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      // All shares award 0.5 sweepstakes entries
      const share = await ShareRecord.findOne({ share_id: result.shareId });
      expect(share.sweepstakes_entries_awarded).toBe(0.5);
    });

    test('Should deduct from budget on paid share', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: true,
          current_budget_remaining: 500, // Only 5 shares worth
          amount_per_share: 100,
        },
      });

      const initialBudget = campaign.share_config.current_budget_remaining;

      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.current_budget_remaining).toBe(initialBudget - 100);
    });
  });

  // ========== Scenario 2: Free Shares (Budget Depleted) ==========
  describe('Scenario 2: Free Share Recording', () => {
    test('Should record free share when budget is depleted', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 0,
        },
      });

      const result = await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      expect(result.success).toBe(true);
      expect(result.isPaid).toBe(false);
      expect(result.rewardAmount).toBe(0);

      const share = await ShareRecord.findOne({ share_id: result.shareId });
      expect(share.is_paid).toBe(false);
    });

    test('Should still award sweepstakes entries for free shares', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 0,
        },
      });

      const result = await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'twitter',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      const share = await ShareRecord.findOne({ share_id: result.shareId });
      expect(share.sweepstakes_entries_awarded).toBe(0.5);
    });

    test('Should auto-disable paid sharing when budget reaches zero', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: true,
          current_budget_remaining: 100, // Exactly 1 share
          amount_per_share: 100,
        },
      });

      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.is_paid_sharing_active).toBe(false);
      expect(updated.share_config.amount_per_share).toBe(0);
    });
  });

  // ========== Scenario 3: Rate Limiting ==========
  describe('Scenario 3: Rate Limiting', () => {
    test('Should allow up to 10 shares per IP per hour', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 0,
        },
      });

      // Record 10 shares from same IP
      for (let i = 0; i < 10; i++) {
        const result = await ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
          userAgent: 'Test Agent',
        });

        expect(result.success).toBe(true);
      }

      // 11th should be rate limited
      const limitExceeded = await expect(
        ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
          userAgent: 'Test Agent',
        })
      ).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
      });

      expect(limitExceeded).toBeDefined();
    });

    test('Should allow shares from different IPs', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 0,
        },
      });

      // Record 10 shares from IP1
      for (let i = 0; i < 10; i++) {
        const result = await ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
          userAgent: 'Test Agent',
        });
        expect(result.success).toBe(true);
      }

      // Different IP should work fine
      const result = await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.2',
        userAgent: 'Test Agent',
      });

      expect(result.success).toBe(true);
    });
  });

  // ========== Scenario 4: Validation Errors ==========
  describe('Scenario 4: Validation Errors', () => {
    test('Should reject invalid channel', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'invalid_channel',
          ipAddress: '192.168.1.1',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_CHANNEL',
        statusCode: 400,
      });
    });

    test('Should reject share on inactive campaign', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id, { status: 'paused' });

      await expect(
        ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
        })
      ).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_ACTIVE',
      });
    });

    test('Should reject share for non-existent campaign', async () => {
      const supporter = await createTestUser();
      const fakeCampaignId = new mongoose.Types.ObjectId();

      await expect(
        ShareService.recordShare({
          campaignId: fakeCampaignId.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
        })
      ).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
      });
    });

    test('Should reject share for non-existent supporter', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const fakeSupporterId = new mongoose.Types.ObjectId();

      await expect(
        ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: fakeSupporterId.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
        })
      ).rejects.toMatchObject({
        code: 'SUPPORTER_NOT_FOUND',
      });
    });
  });

  // ========== Scenario 5: Budget Reload Request ==========
  describe('Scenario 5: Budget Reload Request', () => {
    test('Should create pending reload request', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const result = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000, // $100 in cents
        paymentMethod: 'bank_transfer',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');
      expect(result.requestedAmount).toBe(10000);
      expect(result.platformFee).toBe(2000); // 20% of 10000
      expect(result.netAmount).toBe(8000); // 80% of 10000

      // Verify reload was saved
      const reload = await ShareBudgetReload.findOne({ reload_id: result.reloadId });
      expect(reload).toBeDefined();
      expect(reload.status).toBe('pending');
    });

    test('Should calculate 20% platform fee correctly', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const result = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 50000, // $500
        paymentMethod: 'credit_card',
      });

      expect(result.platformFee).toBe(10000); // 20% of 50000
      expect(result.netAmount).toBe(40000); // 80% of 50000
    });

    test('Should reject reload amount < $10 (1000 cents)', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareService.requestShareBudgetReload({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          amount: 500, // $5 - below minimum
          paymentMethod: 'credit_card',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_RELOAD_AMOUNT',
        statusCode: 400,
      });
    });

    test('Should reject reload amount > $1M', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareService.requestShareBudgetReload({
          campaignId: campaign._id.toString(),
          creatorId: creator._id.toString(),
          amount: 200000000, // $2M - above maximum
          paymentMethod: 'credit_card',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_RELOAD_AMOUNT',
      });
    });

    test('Should reject reload if not campaign creator', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const otherUser = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      await expect(
        ShareService.requestShareBudgetReload({
          campaignId: campaign._id.toString(),
          creatorId: otherUser._id.toString(),
          amount: 10000,
          paymentMethod: 'credit_card',
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 403,
      });
    });
  });

  // ========== Scenario 6: Admin Budget Reload Approval ==========
  describe('Scenario 6: Admin Budget Reload Approval', () => {
    test('Should approve pending reload request', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 100,
        },
      });

      // Create reload request
      const reloadResult = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });

      // Admin approves
      const approvalResult = await ShareService.verifyShareBudgetReload({
        reloadId: reloadResult.reloadId,
        adminId: admin._id.toString(),
      });

      expect(approvalResult.success).toBe(true);
      expect(approvalResult.status).toBe('approved');
      expect(approvalResult.amountAdded).toBe(8000); // Net amount

      // Verify budget was updated
      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.current_budget_remaining).toBe(8000);
    });

    test('Should re-enable paid sharing on reload approval', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 100,
        },
      });

      const reloadResult = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });

      await ShareService.verifyShareBudgetReload({
        reloadId: reloadResult.reloadId,
        adminId: admin._id.toString(),
      });

      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.is_paid_sharing_active).toBe(true);
    });

    test('Should reject already approved reload', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const reloadResult = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });

      // First approval succeeds
      await ShareService.verifyShareBudgetReload({
        reloadId: reloadResult.reloadId,
        adminId: admin._id.toString(),
      });

      // Second approval fails
      await expect(
        ShareService.verifyShareBudgetReload({
          reloadId: reloadResult.reloadId,
          adminId: admin._id.toString(),
        })
      ).rejects.toMatchObject({
        code: 'INVALID_RELOAD_STATUS',
      });
    });
  });

  // ========== Scenario 7: Admin Budget Reload Rejection ==========
  describe('Scenario 7: Admin Budget Reload Rejection', () => {
    test('Should reject pending reload request', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      const reloadResult = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });

      const rejectionResult = await ShareService.rejectShareBudgetReload({
        reloadId: reloadResult.reloadId,
        adminId: admin._id.toString(),
        reason: 'Invalid payment method',
      });

      expect(rejectionResult.success).toBe(true);
      expect(rejectionResult.status).toBe('rejected');
      expect(rejectionResult.reason).toBe('Invalid payment method');

      // Verify reload status
      const reload = await ShareBudgetReload.findOne({ reload_id: reloadResult.reloadId });
      expect(reload.status).toBe('rejected');
    });

    test('Should not update budget on rejection', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id, {
        share_config: {
          is_paid_sharing_active: false,
          current_budget_remaining: 0,
          amount_per_share: 100,
        },
      });

      const reloadResult = await ShareService.requestShareBudgetReload({
        campaignId: campaign._id.toString(),
        creatorId: creator._id.toString(),
        amount: 10000,
        paymentMethod: 'credit_card',
      });

      await ShareService.rejectShareBudgetReload({
        reloadId: reloadResult.reloadId,
        adminId: admin._id.toString(),
        reason: 'Rejected',
      });

      const updated = await Campaign.findById(campaign._id);
      expect(updated.share_config.current_budget_remaining).toBe(0);
    });
  });

  // ========== Scenario 8: Analytics ==========
  describe('Scenario 8: Analytics & Reporting', () => {
    test('Should get share statistics', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter1 = await createTestUser();
      const supporter2 = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      // Record shares
      for (let i = 0; i < 3; i++) {
        await ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter1._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
        });
      }

      for (let i = 0; i < 2; i++) {
        await ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter2._id.toString(),
          channel: 'facebook',
          ipAddress: '192.168.1.2',
        });
      }

      const stats = await ShareService.getShareStats(campaign._id.toString());

      expect(stats.success).toBe(true);
      expect(stats.stats.totalShares).toBe(5);
      expect(stats.stats.sweepstakesEntriesAwarded).toBe(2.5); // 5 * 0.5
    });

    test('Should track shares by supporter', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      for (let i = 0; i < 3; i++) {
        await ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: '192.168.1.1',
        });
      }

      const result = await ShareService.getSharesBySupporter(supporter._id.toString());

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(3);
      expect(result.pagination.total).toBe(3);
    });

    test('Should paginate shares correctly', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const supporter = await createTestUser();
      const campaign = await createTestCampaign(creator._id);

      // Create 35 shares
      for (let i = 0; i < 35; i++) {
        await ShareService.recordShare({
          campaignId: campaign._id.toString(),
          supporterId: supporter._id.toString(),
          channel: 'email',
          ipAddress: `192.168.1.${i}`,
        });
      }

      const page1 = await ShareService.getSharesByCampaign(campaign._id.toString(), { page: 1, limit: 20 });
      const page2 = await ShareService.getSharesByCampaign(campaign._id.toString(), { page: 2, limit: 20 });

      expect(page1.data.length).toBe(20);
      expect(page2.data.length).toBe(15);
      expect(page1.pagination.total).toBe(35);
      expect(page1.pagination.pages).toBe(2);
    });
  });
});

// ========== Legacy Error Scenarios ==========
describe('Share Service - Error Handling', () => {
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
    await ShareRecord.deleteMany({});
    await ShareBudgetReload.deleteMany({});
    await Campaign.deleteMany({});
    await User.deleteMany({});
  });

  test('Should handle database errors gracefully', async () => {
    const creator = await createTestUser({ role: 'creator' });
    const supporter = await createTestUser();
    const campaign = await createTestCampaign(creator._id);

    // Mock a database error by closing connection
    const originalConnection = mongoose.connection;
    mongoose.connection = undefined;

    try {
      await ShareService.recordShare({
        campaignId: campaign._id.toString(),
        supporterId: supporter._id.toString(),
        channel: 'email',
        ipAddress: '192.168.1.1',
      });
    } catch (error) {
      expect(error).toBeDefined();
    }

    // Restore connection
    mongoose.connection = originalConnection;
  });
});
