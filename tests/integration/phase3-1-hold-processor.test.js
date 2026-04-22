/**
 * Phase 3.1 Integration Tests
 * 30-Day Hold Processor
 * 
 * Tests verify:
 * 1. Transaction model hold fields
 * 2. ProcessShareHolds job execution
 * 3. Fraud detection accuracy
 * 4. Email sending
 * 5. Wallet balance updates
 * 6. Audit trail maintenance
 */

const mongoose = require('mongoose');
const ProcessShareHoldsJob = require('../src/jobs/ProcessShareHolds');
const ShareFraudDetectionService = require('../src/services/ShareFraudDetectionService');
const Transaction = require('../src/models/Transaction');
const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const { ShareRecord } = require('../src/models/Share');
const emailService = require('../src/services/emailService');

describe('Phase 3.1: 30-Day Hold Processor', () => {
  
  let testUser;
  let testCreator;
  let testCampaign;
  let testTransaction;

  beforeAll(async () => {
    // Setup test database connection if needed
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/honestneed-test');
    }
  });

  beforeEach(async () => {
    // Clear test collections
    await Transaction.deleteMany({});
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await ShareRecord.deleteMany({});
    emailService.clearSentEmails();

    // Create test data
    testCreator = await User.create({
      email: 'creator@test.com',
      password_hash: 'hashed_password',
      display_name: 'Test Creator',
      role: 'creator'
    });

    testUser = await User.create({
      email: 'supporter@test.com',
      password_hash: 'hashed_password',
      display_name: 'Test Supporter',
      role: 'user'
    });

    testCampaign = await Campaign.create({
      title: 'Test Campaign',
      description: 'Test description',
      creator_id: testCreator._id,
      category: 'health',
      status: 'active'
    });
  });

  afterEach(async () => {
    emailService.clearSentEmails();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  // ========== TRANSACTION MODEL TESTS ==========

  describe('Transaction Model Hold Fields', () => {
    test('should have hold_until_date field', async () => {
      const doc = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      expect(doc.hold_until_date).toBeDefined();
      expect(doc.hold_until_date instanceof Date).toBe(true);
    });

    test('should have hold_reason field', async () => {
      const doc = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_reason: 'share_reward_fraud_protection',
        hold_until_date: new Date()
      });

      expect(doc.hold_reason).toBe('share_reward_fraud_protection');
    });

    test('should support approved status', async () => {
      const doc = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'approved',
        transaction_type: 'share_reward',
        approved_at: new Date()
      });

      expect(doc.status).toBe('approved');
      expect(doc.approved_at).toBeDefined();
    });

    test('should support rejected status with fraud reason', async () => {
      const doc = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'rejected',
        transaction_type: 'share_reward',
        hold_fraud_check_result: 'rejected',
        hold_fraud_reason: 'Multiple conversions in 24 hours'
      });

      expect(doc.status).toBe('rejected');
      expect(doc.hold_fraud_reason).toBe('Multiple conversions in 24 hours');
    });
  });

  // ========== PROCESS SHARE HOLDS JOB TESTS ==========

  describe('ProcessShareHoldsJob Execution', () => {
    test('should approve transaction after hold period expires', async () => {
      // Create expired hold transaction
      testTransaction = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() - 60 * 1000) // 1 minute ago
      });

      // Run job
      const result = await ProcessShareHoldsJob.run();

      expect(result.success).toBe(true);
      expect(result.processed).toBeGreaterThan(0);

      // Verify transaction approved
      const updated = await Transaction.findById(testTransaction._id);
      expect(updated.status).toBe('approved');
      expect(updated.approved_at).toBeDefined();
    });

    test('should update user balance on approval', async () => {
      // Record initial balance
      const initialBalance = testUser.wallet?.available_cents || 0;

      // Create expired hold
      testTransaction = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() - 60 * 1000)
      });

      // Run job
      await ProcessShareHoldsJob.run();

      // Verify balance updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.wallet.available_cents).toBe(initialBalance + 5000);
    });

    test('should send approval email', async () => {
      testTransaction = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() - 60 * 1000)
      });

      await ProcessShareHoldsJob.run();

      // Verify email sent
      const sentEmails = emailService.getSentEmails({
        to: testUser.email,
        eventType: 'share_reward:approved'
      });

      expect(sentEmails.length).toBeGreaterThan(0);
      expect(sentEmails[0].subject).toContain('Available');
    });

    test('should maintain audit trail', async () => {
      testTransaction = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() - 60 * 1000),
        notes: []
      });

      await ProcessShareHoldsJob.run();

      const updated = await Transaction.findById(testTransaction._id);
      expect(updated.notes.length).toBeGreaterThan(0);
      expect(updated.notes[0].action).toContain('hold_approved');
    });

    test('should get statistics', async () => {
      await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() + 60 * 1000)
      });

      const stats = await ProcessShareHoldsJob.getStats();
      expect(stats.total_pending).toBeGreaterThan(0);
    });
  });

  // ========== FRAUD DETECTION TESTS ==========

  describe('ShareFraudDetectionService', () => {
    test('should detect ROI anomaly (reward > donation)', async () => {
      const donation = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 100, // $1
        platform_fee_cents: 20,
        net_amount_cents: 80,
        payment_method: 'stripe',
        status: 'verified',
        transaction_type: 'donation'
      });

      const reward = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 10000, // $100 reward for $1 donation
        platform_fee_cents: 2000,
        net_amount_cents: 8000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward'
      });

      const result = await ShareFraudDetectionService.checkTransactionForFraud(reward);
      expect(result.isFraud).toBe(true);
      expect(result.reason).toContain('ROI');
    });

    test('should detect new account with large reward', async () => {
      const newUser = await User.create({
        email: 'newuser@test.com',
        password_hash: 'hashed',
        display_name: 'New User',
        created_at: new Date() // Just created
      });

      const reward = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: newUser._id,
        creator_id: testCreator._id,
        amount_cents: 10000, // $100
        platform_fee_cents: 2000,
        net_amount_cents: 8000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward'
      });

      const result = await ShareFraudDetectionService.checkTransactionForFraud(reward);
      expect(result.isFraud).toBe(true);
      expect(result.reason).toContain('Account');
    });

    test('should detect multiple conversions', async () => {
      // Create multiple rewards from same user
      for (let i = 0; i < 3; i++) {
        await Transaction.create({
          campaign_id: testCampaign._id,
          supporter_id: testUser._id,
          creator_id: testCreator._id,
          amount_cents: 5000,
          platform_fee_cents: 1000,
          net_amount_cents: 4000,
          payment_method: 'stripe',
          status: 'approved',
          transaction_type: 'share_reward'
        });
      }

      const testReward = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward'
      });

      const result = await ShareFraudDetectionService.checkTransactionForFraud(testReward);
      expect(result.isFraud).toBe(true);
      expect(result.reason).toContain('Multiple');
    });

    test('should pass legitimate transactions', async () => {
      // Create legitimate user with history
      const legitUser = await User.create({
        email: 'legit@test.com',
        password_hash: 'hashed',
        display_name: 'Legit User',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days old
      });

      // Create a donation from them
      await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: legitUser._id,
        creator_id: testCreator._id,
        amount_cents: 50000, // $500 donation
        platform_fee_cents: 10000,
        net_amount_cents: 40000,
        payment_method: 'stripe',
        status: 'verified',
        transaction_type: 'donation'
      });

      // Reasonable reward for large donation
      const reward = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: legitUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000, // $50 reward (10% of $500)
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward'
      });

      const result = await ShareFraudDetectionService.checkTransactionForFraud(reward);
      expect(result.isFraud).toBe(false);
    });
  });

  // ========== EMAIL TESTS ==========

  describe('Email Service', () => {
    test('should send approval email', async () => {
      await emailService.sendShareRewardApprovedEmail(
        'test@example.com',
        {
          supporterName: 'Test User',
          amount: '50.00',
          campaignTitle: 'Test Campaign'
        }
      );

      const sent = emailService.getSentEmails({ to: 'test@example.com' });
      expect(sent.length).toBeGreaterThan(0);
      expect(sent[0].subject).toContain('Available');
    });

    test('should send rejection email', async () => {
      await emailService.sendShareRewardRejectedEmail(
        'test@example.com',
        {
          supporterName: 'Test User',
          amount: '50.00',
          campaignTitle: 'Test Campaign',
          reason: 'Unusual activity detected',
          severity: 'high'
        }
      );

      const sent = emailService.getSentEmails({ to: 'test@example.com' });
      expect(sent.length).toBeGreaterThan(0);
      expect(sent[0].subject).toContain('Verification');
    });
  });

  // ========== END-TO-END TESTS ==========

  describe('End-to-End Hold Processing', () => {
    test('full workflow: share -> donation -> hold -> approval', async () => {
      // 1. Create share record
      const shareRecord = await ShareRecord.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        channel: 'twitter'
      });

      // 2. Create donation
      await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 50000,
        platform_fee_cents: 10000,
        net_amount_cents: 40000,
        payment_method: 'stripe',
        status: 'verified',
        transaction_type: 'donation'
      });

      // 3. Create reward with hold
      testTransaction = await Transaction.create({
        campaign_id: testCampaign._id,
        supporter_id: testUser._id,
        creator_id: testCreator._id,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'stripe',
        status: 'pending_hold',
        transaction_type: 'share_reward',
        hold_until_date: new Date(Date.now() - 60 * 1000)
      });

      // 4. Run job
      const result = await ProcessShareHoldsJob.run();
      expect(result.approved).toBeGreaterThan(0);

      // 5. Verify approval
      const updated = await Transaction.findById(testTransaction._id);
      expect(updated.status).toBe('approved');

      // 6. Verify balance
      const user = await User.findById(testUser._id);
      expect(user.wallet.available_cents).toBe(5000);
    });
  });
});

// ========== MANUAL TEST COMMANDS ==========

/**
 * Run these commands in Node REPL to test manually:
 * 
 * // Connect to DB
 * require('mongoose').connect('mongodb://localhost/honestneed-dev');
 * 
 * // Run job
 * const ProcessShareHoldsJob = require('./src/jobs/ProcessShareHolds');
 * const result = await ProcessShareHoldsJob.runManual();
 * console.log(result);
 * 
 * // Get stats
 * const stats = await ProcessShareHoldsJob.getStats();
 * console.log('Pending holds:', stats);
 * 
 * // Check fraud
 * const ShareFraudDetectionService = require('./src/services/ShareFraudDetectionService');
 * const check = await ShareFraudDetectionService.checkTransactionForFraud(transaction);
 * console.log('Fraud check:', check);
 * 
 * // View sent emails
 * const emailService = require('./src/services/emailService');
 * console.log(emailService.getSentEmails());
 */

module.exports = {
  ProcessShareHoldsJob,
  ShareFraudDetectionService
};
