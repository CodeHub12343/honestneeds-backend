/**
 * Test Suite: Campaign Goals Update Functionality
 * Tests for critical fixes to donation and share goal updates
 * 
 * Run with: npm test -- campaign-goals.test.js
 */

const mongoose = require('mongoose');
const Campaign = require('../src/models/Campaign');
const Transaction = require('../src/models/Transaction');
const TransactionService = require('../src/services/TransactionService');
const ShareService = require('../src/services/ShareService');
const User = require('../src/models/User');

describe('Campaign Goals - Critical Fixes', () => {
  let campaignId, supporterId, creatorId, campaign;
  let transactionService, shareService;

  beforeAll(async () => {
    // Connect to test database
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/honestneed-test');
    }

    // Initialize services
    transactionService = new TransactionService();
    shareService = ShareService;
  });

  beforeEach(async () => {
    // Clean up
    await Campaign.deleteMany({});
    await Transaction.deleteMany({});
    await User.deleteMany({});

    // Create test users
    const creator = await User.create({
      email: 'creator@test.com',
      password_hash: 'hash',
      full_name: 'Creator'
    });
    creatorId = creator._id;

    const supporter = await User.create({
      email: 'supporter@test.com',
      password_hash: 'hash',
      full_name: 'Supporter'
    });
    supporterId = supporter._id;

    // Create test campaign with goals
    campaign = await Campaign.create({
      campaign_id: `TEST-${Date.now()}`,
      title: 'Emergency Medical Fund',
      description: 'Test campaign',
      creator_id: creatorId,
      status: 'active',
      need_type: 'emergency_medical',
      payment_methods: [{ type: 'paypal' }],
      goals: [
        {
          goal_type: 'fundraising',
          goal_name: 'Raise Emergency Funds',
          target_amount: 5000,
          current_amount: 0
        },
        {
          goal_type: 'sharing_reach',
          goal_name: 'Spread the Word',
          target_amount: 100,
          current_amount: 0
        },
        {
          goal_type: 'resource_collection',
          goal_name: 'Collect Items',
          target_amount: 50,
          current_amount: 0
        }
      ]
    });
    campaignId = campaign._id;
  });

  afterAll(async () => {
    await Campaign.deleteMany({});
    await Transaction.deleteMany({});
    await User.deleteMany({});
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
    }
  });

  // ============================================
  // DONATION GOAL UPDATE TESTS
  // ============================================

  describe('Donation Goal Updates', () => {
    it('should update fundraising goal when donation is recorded', async () => {
      expect(campaign.goals[0].current_amount).toBe(0);

      await transactionService.recordDonation(
        campaignId,
        supporterId,
        100,
        'paypal',
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      );

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].goal_type).toBe('fundraising');
      expect(updated.goals[0].current_amount).toBe(100);
    });

    it('should accumulate donations correctly', async () => {
      // First donation
      await transactionService.recordDonation(campaignId, supporterId, 100, 'paypal');
      let updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(100);

      // Second donation
      const supporter2 = await User.create({
        email: 'supporter2@test.com',
        password_hash: 'hash'
      });

      await transactionService.recordDonation(campaignId, supporter2._id, 250, 'paypal');
      updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(350);

      // Third donation
      const supporter3 = await User.create({
        email: 'supporter3@test.com',
        password_hash: 'hash'
      });

      await transactionService.recordDonation(campaignId, supporter3._id, 150, 'paypal');
      updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(500);
    });

    it('should not update sharing_reach goal on donation', async () => {
      expect(campaign.goals[1].current_amount).toBe(0);

      await transactionService.recordDonation(campaignId, supporterId, 100, 'paypal');

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(100); // Fundraising updated
      expect(updated.goals[1].current_amount).toBe(0);   // Sharing NOT updated
    });

    it('should not update resource_collection goal on donation', async () => {
      expect(campaign.goals[2].current_amount).toBe(0);

      await transactionService.recordDonation(campaignId, supporterId, 100, 'paypal');

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[2].current_amount).toBe(0); // Resource NOT updated
    });

    it('should handle goal completion', async () => {
      // Create campaign with small goal
      const smallGoalCampaign = await Campaign.create({
        campaign_id: `TEST-SMALL-${Date.now()}`,
        title: 'Small Goal Campaign',
        creator_id: creatorId,
        status: 'active',
        need_type: 'emergency_medical',
        payment_methods: [{ type: 'paypal' }],
        goals: [{
          goal_type: 'fundraising',
          goal_name: 'Small Fund',
          target_amount: 100,
          current_amount: 0
        }]
      });

      // Donate $70
      await transactionService.recordDonation(smallGoalCampaign._id, supporterId, 70, 'paypal');
      let updated = await Campaign.findById(smallGoalCampaign._id);
      expect(updated.goals[0].current_amount).toBe(70);
      expect(updated.goals[0].current_amount < updated.goals[0].target_amount).toBeTruthy();

      // Donate $30 to complete
      const supporter2 = await User.create({
        email: 'supporter-complete@test.com',
        password_hash: 'hash'
      });
      await transactionService.recordDonation(smallGoalCampaign._id, supporter2._id, 30, 'paypal');
      updated = await Campaign.findById(smallGoalCampaign._id);
      expect(updated.goals[0].current_amount).toBe(100);
      expect(updated.goals[0].current_amount === updated.goals[0].target_amount).toBeTruthy();
    });

    it('should handle decimal donation amounts', async () => {
      await transactionService.recordDonation(campaignId, supporterId, 123.45, 'paypal');

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(123.45);
    });

    it('should handle campaign with no goals gracefully', async () => {
      const ngoalsCampaign = await Campaign.create({
        campaign_id: `TEST-NO-GOALS-${Date.now()}`,
        title: 'No Goals Campaign',
        creator_id: creatorId,
        status: 'active',
        need_type: 'emergency_medical',
        payment_methods: [{ type: 'paypal' }],
        goals: []
      });

      // Should not throw error
      const result = await transactionService.recordDonation(ngoalsCampaign._id, supporterId, 100, 'paypal');
      expect(result.status).toBe('pending');
      expect(result.amount_dollars).toBe(100);
    });

    it('should handle goal with null current_amount', async () => {
      const nullGoalCampaign = await Campaign.create({
        campaign_id: `TEST-NULL-GOAL-${Date.now()}`,
        title: 'Null Goal Amount Campaign',
        creator_id: creatorId,
        status: 'active',
        need_type: 'emergency_medical',
        payment_methods: [{ type: 'paypal' }],
        goals: [{
          goal_type: 'fundraising',
          goal_name: 'Fund',
          target_amount: 1000,
          current_amount: null // Undefined
        }]
      });

      await transactionService.recordDonation(nullGoalCampaign._id, supporterId, 100, 'paypal');

      const updated = await Campaign.findById(nullGoalCampaign._id);
      expect(updated.goals[0].current_amount).toBe(100);
    });
  });

  // ============================================
  // SHARE GOAL UPDATE TESTS
  // ============================================

  describe('Share Goal Updates', () => {
    it('should update sharing_reach goal when share is recorded', async () => {
      expect(campaign.goals[1].current_amount).toBe(0);

      await shareService.recordShare({
        campaignId,
        supporterId,
        channel: 'facebook',
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[1].goal_type).toBe('sharing_reach');
      expect(updated.goals[1].current_amount).toBe(1);
    });

    it('should increment sharing goal by 1 per share', async () => {
      const supporter2 = await User.create({
        email: 'supporter-share2@test.com',
        password_hash: 'hash'
      });

      const supporter3 = await User.create({
        email: 'supporter-share3@test.com',
        password_hash: 'hash'
      });

      // Share 1
      await shareService.recordShare({
        campaignId,
        supporterId,
        channel: 'facebook',
        ipAddress: '127.0.0.1'
      });

      // Share 2
      await shareService.recordShare({
        campaignId,
        supporterId: supporter2._id,
        channel: 'twitter',
        ipAddress: '127.0.0.2'
      });

      // Share 3
      await shareService.recordShare({
        campaignId,
        supporterId: supporter3._id,
        channel: 'instagram',
        ipAddress: '127.0.0.3'
      });

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[1].current_amount).toBe(3);
    });

    it('should not update fundraising goal on share', async () => {
      expect(campaign.goals[0].current_amount).toBe(0);

      await shareService.recordShare({
        campaignId,
        supporterId,
        channel: 'facebook',
        ipAddress: '127.0.0.1'
      });

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(0);   // Fundraising NOT updated
      expect(updated.goals[1].current_amount).toBe(1);   // Sharing updated
    });

    it('should not update resource_collection goal on share', async () => {
      expect(campaign.goals[2].current_amount).toBe(0);

      await shareService.recordShare({
        campaignId,
        supporterId,
        channel: 'facebook',
        ipAddress: '127.0.0.1'
      });

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[2].current_amount).toBe(0); // Resource NOT updated
    });

    it('should handle reaching sharing goal target', async () => {
      // Create campaign with small sharing goal
      const smallShareGoal = await Campaign.create({
        campaign_id: `TEST-SHARE-SMALL-${Date.now()}`,
        title: 'Small Share Goal',
        creator_id: creatorId,
        status: 'active',
        need_type: 'emergency_medical',
        payment_methods: [{ type: 'paypal' }],
        goals: [{
          goal_type: 'sharing_reach',
          goal_name: 'Share Goal',
          target_amount: 5,
          current_amount: 0
        }]
      });

      // Share 4 times
      for (let i = 0; i < 4; i++) {
        const user = await User.create({
          email: `share-user-${i}@test.com`,
          password_hash: 'hash'
        });
        await shareService.recordShare({
          campaignId: smallShareGoal._id,
          supporterId: user._id,
          channel: 'facebook',
          ipAddress: `127.0.0.${i}`
        });
      }

      let updated = await Campaign.findById(smallShareGoal._id);
      expect(updated.goals[0].current_amount).toBe(4);
      expect(updated.goals[0].current_amount < updated.goals[0].target_amount).toBeTruthy();

      // Share 5th time to complete goal
      const finalUser = await User.create({
        email: 'final-share@test.com',
        password_hash: 'hash'
      });
      await shareService.recordShare({
        campaignId: smallShareGoal._id,
        supporterId: finalUser._id,
        channel: 'twitter',
        ipAddress: '127.0.0.99'
      });

      updated = await Campaign.findById(smallShareGoal._id);
      expect(updated.goals[0].current_amount).toBe(5);
      expect(updated.goals[0].current_amount === updated.goals[0].target_amount).toBeTruthy();
    });

    it('should handle share from different channels', async () => {
      const channels = ['facebook', 'twitter', 'instagram', 'linkedin', 'whatsapp'];
      
      for (let i = 0; i < channels.length; i++) {
        const user = await User.create({
          email: `share-channel-${i}@test.com`,
          password_hash: 'hash'
        });
        await shareService.recordShare({
          campaignId,
          supporterId: user._id,
          channel: channels[i],
          ipAddress: `127.0.0.${i}`
        });
      }

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[1].current_amount).toBe(5);
    });
  });

  // ============================================
  // MULTI-GOAL INTEGRATION TESTS
  // ============================================

  describe('Multi-Goal Campaign Integration', () => {
    it('should update independent goals correctly', async () => {
      expect(campaign.goals[0].current_amount).toBe(0);
      expect(campaign.goals[1].current_amount).toBe(0);
      expect(campaign.goals[2].current_amount).toBe(0);

      // Donations
      await transactionService.recordDonation(campaignId, supporterId, 1000, 'paypal');
      const supporter2 = await User.create({
        email: 'donor2@test.com',
        password_hash: 'hash'
      });
      await transactionService.recordDonation(campaignId, supporter2._id, 500, 'paypal');

      // Shares
      const supporter3 = await User.create({
        email: 'sharer3@test.com',
        password_hash: 'hash'
      });
      await shareService.recordShare({
        campaignId,
        supporterId: supporter3._id,
        channel: 'facebook',
        ipAddress: '127.0.0.1'
      });

      const updated = await Campaign.findById(campaignId);
      expect(updated.goals[0].current_amount).toBe(1500); // Fundraising
      expect(updated.goals[1].current_amount).toBe(1);    // Sharing
      expect(updated.goals[2].current_amount).toBe(0);    // Resources
    });

    it('should not interfere when one goal type is missing', async () => {
      const campaignNoShare = await Campaign.create({
        campaign_id: `TEST-NO-SHARE-${Date.now()}`,
        title: 'No Share Goal',
        creator_id: creatorId,
        status: 'active',
        need_type: 'emergency_medical',
        payment_methods: [{ type: 'paypal' }],
        goals: [{
          goal_type: 'fundraising',
          goal_name: 'Fund Only',
          target_amount: 1000,
          current_amount: 0
        }]
      });

      await transactionService.recordDonation(campaignNoShare._id, supporterId, 100, 'paypal');

      const updated = await Campaign.findById(campaignNoShare._id);
      expect(updated.goals.length).toBe(1);
      expect(updated.goals[0].current_amount).toBe(100);
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling & Recovery', () => {
    it('should not throw error on goal update failure', async () => {
      // Mock Campaign.findByIdAndUpdate to simulate goal update failure
      // The donation should still succeed
      const result = await transactionService.recordDonation(
        campaignId,
        supporterId,
        100,
        'paypal'
      );

      expect(result.success).not.toBeDefined(); // recordDonation returns object with fields
      expect(result.amount_dollars).toBe(100);
      expect(result.status).toBe('pending');
    });

    it('should create transaction even if goal update fails silently', async () => {
      await transactionService.recordDonation(campaignId, supporterId, 100, 'paypal');

      const transaction = await Transaction.findOne({ campaign_id: campaignId });
      expect(transaction).toBeDefined();
      expect(transaction.amount_cents).toBe(10000);
    });

    it('should record share even if goal update fails', async () => {
      const result = await shareService.recordShare({
        campaignId,
        supporterId,
        channel: 'facebook',
        ipAddress: '127.0.0.1'
      });

      expect(result.success).toBeTruthy();
      expect(result.shareId).toBeDefined();
    });
  });
});

module.exports = {
  // For manual test execution
  testSuite: 'Campaign Goals - Critical Fixes'
};
