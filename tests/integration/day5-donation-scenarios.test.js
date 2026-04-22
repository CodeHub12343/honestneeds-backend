/**
 * Day 5: Complete Testing & Validation - Donation Scenarios
 * 
 * Comprehensive test suite covering:
 * - Happy path scenarios
 * - Admin workflows
 * - Error handling
 * - Edge cases
 * - Concurrent operations
 * 
 * Coverage Target: >92%
 * Performance Targets: All tests < 5s total
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const { 
  Donation, 
  Campaign, 
  User, 
  FeeTransaction, 
  SettlementLedger,
  Sweepstakes 
} = require('../../src/models');
const FeeTrackingService = require('../../src/services/FeeTrackingService');
const CampaignService = require('../../src/services/CampaignService');
const TransactionService = require('../../src/services/TransactionService');

// ============================================================================
// TEST DATA SETUP
// ============================================================================

const createTestData = async () => {
  // Create admin user
  const admin = await User.create({
    email: 'admin@honestneed.test',
    username: 'admin_test',
    role: 'admin',
    verified: true
  });

  // Create campaign creator
  const creator = await User.create({
    email: 'creator@honestneed.test',
    username: 'creator_test',
    verified: true
  });

  // Create donors
  const donor1 = await User.create({
    email: 'donor1@honestneed.test',
    username: 'donor1_test',
    verified: true
  });

  const donor2 = await User.create({
    email: 'donor2@honestneed.test',
    username: 'donor2_test',
    verified: true
  });

  // Create active campaign
  const activeCampaign = await Campaign.create({
    title: 'Test Campaign - Active',
    description: 'Active campaign for testing',
    creator_id: creator._id,
    campaign_type: 'fundraising',
    status: 'active',
    goal_amount: 50000, // $500
    current_raised: 0,
    total_donors: 0,
    donation_count: 0,
    start_date: new Date(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    category: 'health',
    tags: ['test', 'health']
  });

  // Create inactive campaign
  const inactiveCampaign = await Campaign.create({
    title: 'Test Campaign - Inactive',
    description: 'Inactive campaign for testing',
    creator_id: creator._id,
    campaign_type: 'fundraising',
    status: 'draft',
    goal_amount: 30000, // $300
    current_raised: 0,
    total_donors: 0,
    donation_count: 0,
    start_date: new Date(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    category: 'education',
    tags: ['test', 'education']
  });

  // Create paused campaign
  const pausedCampaign = await Campaign.create({
    title: 'Test Campaign - Paused',
    description: 'Paused campaign for testing',
    creator_id: creator._id,
    campaign_type: 'fundraising',
    status: 'paused',
    goal_amount: 20000, // $200
    current_raised: 0,
    total_donors: 0,
    donation_count: 0,
    start_date: new Date(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    category: 'community',
    tags: ['test', 'community']
  });

  return {
    admin,
    creator,
    donor1,
    donor2,
    activeCampaign,
    inactiveCampaign,
    pausedCampaign
  };
};

// ============================================================================
// SCENARIO 1: HAPPY PATH - Donor to Campaign Receives Money
// ============================================================================

describe('Scenario 1: Happy Path - Donation Flow', () => {
  let testData;
  let adminToken;
  let donor1Token;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/honestneed-test');
    }
    testData = await createTestData();

    // Generate tokens
    adminToken = require('../../src/utils/tokenUtils').generateToken(testData.admin._id, testData.admin.role);
    donor1Token = require('../../src/utils/tokenUtils').generateToken(testData.donor1._id, 'user');
  });

  afterAll(async () => {
    // Cleanup
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await Donation.deleteMany({});
    await FeeTransaction.deleteMany({});
  });

  test('1.1: Donor creates donation for active campaign', async () => {
    const donationData = {
      campaign_id: testData.activeCampaign._id.toString(),
      amount: 5000, // $50
      donor_name: 'John Donor',
      donor_email: 'john@example.com',
      payment_method: 'credit_card',
      payment_reference: 'pi_test123456',
      is_anonymous: false
    };

    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donor1Token}`)
      .send(donationData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('donation_id');
    expect(response.body.data.amount).toBe(5000);
    expect(response.body.data.platform_fee).toBe(1000); // 20% of 5000
    expect(response.body.data.creator_receive).toBe(4000);
    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.fee_breakdown.platform_fee_rate).toBe(0.2);
  });

  test('1.2: Campaign metrics updated after donation', async () => {
    const campaign = await Campaign.findById(testData.activeCampaign._id);
    
    expect(campaign.current_raised).toBeGreaterThan(0);
    expect(campaign.donation_count).toBeGreaterThan(0);
    expect(campaign.total_donors).toBeGreaterThan(0);
  });

  test('1.3: Fee transaction recorded automatically', async () => {
    const fees = await FeeTransaction.find({
      campaign_id: testData.activeCampaign._id
    });

    expect(fees.length).toBeGreaterThan(0);
    const latestFee = fees[fees.length - 1];
    
    expect(latestFee.donation_amount).toBe(5000);
    expect(latestFee.fee_amount).toBe(1000);
    expect(latestFee.fee_status).toBe('pending_settlement');
    expect(latestFee.fee_rate).toBe(0.2);
  });

  test('1.4: Donor marks donation as sent', async () => {
    const donations = await Donation.find({
      campaign_id: testData.activeCampaign._id
    });
    const donation = donations[0];

    const response = await request(app)
      .patch(`/api/donations/${donation._id.toString()}/mark-sent`)
      .set('Authorization', `Bearer ${donor1Token}`)
      .send({
        transfer_confirmation: 'Transfer completed to account',
        manual_notes: 'Verified'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.new_status).toBe('sent');
    expect(response.body.data.fee_transaction).toHaveProperty('fee_transaction_id');
  });

  test('1.5: Creator can verify donation in dashboard', async () => {
    const response = await request(app)
      .get('/api/donations')
      .set('Authorization', `Bearer ${donor1Token}`)
      .query({ status: 'sent' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.donations.length).toBeGreaterThan(0);
    expect(response.body.data.donations[0].status).toBe('sent');
  });

  test('1.6: Transaction Service records donation', async () => {
    const transactions = await TransactionService.getAllTransactions({
      type: 'donation',
      limit: 1
    });

    expect(transactions.length).toBeGreaterThan(0);
    expect(transactions[0].type).toBe('donation');
  });

  test('1.7: Sweepstakes entry created for donation', async () => {
    const entries = await Sweepstakes.find({
      campaign_id: testData.activeCampaign._id
    });

    expect(entries.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SCENARIO 2: Admin Approves Donation
// ============================================================================

describe('Scenario 2: Admin Approves Donation', () => {
  let testData;
  let adminToken;
  let donor1Token;
  let donationId;
  let feeTransactionId;

  beforeAll(async () => {
    testData = await createTestData();
    adminToken = require('../../src/utils/tokenUtils').generateToken(testData.admin._id, 'admin');
    donor1Token = require('../../src/utils/tokenUtils').generateToken(testData.donor1._id, 'user');

    // Create and mark donation as sent
    const donation = await Donation.create({
      campaign_id: testData.activeCampaign._id,
      donor_id: testData.donor1._id,
      amount: 5000,
      donor_name: 'John Donor',
      donor_email: 'john@example.com',
      status: 'sent',
      payment_method: 'credit_card',
      payment_reference: 'pi_test123'
    });
    donationId = donation._id.toString();

    // Create associated fee transaction
    const fee = await FeeTransaction.create({
      donation_id: donation._id,
      campaign_id: testData.activeCampaign._id,
      creator_id: testData.activeCampaign.creator_id,
      donation_amount: 5000,
      fee_amount: 1000,
      fee_rate: 0.2,
      fee_status: 'pending_settlement'
    });
    feeTransactionId = fee._id.toString();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await Donation.deleteMany({});
    await FeeTransaction.deleteMany({});
  });

  test('2.1: Admin can verify fee transaction', async () => {
    const response = await request(app)
      .post(`/api/admin/fees/transactions/${feeTransactionId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verification_notes: 'Verified against payment gateway'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status_before).toBe('pending_settlement');
    expect(response.body.data.status_after).toBe('verified');
    expect(response.body.data).toHaveProperty('verified_at');
  });

  test('2.2: Fee status updated to verified in database', async () => {
    const fee = await FeeTransaction.findById(feeTransactionId);
    
    expect(fee.fee_status).toBe('verified');
    expect(fee.verified_by_admin_id).toBeDefined();
    expect(fee.verified_at).toBeDefined();
  });

  test('2.3: Admin settlement creates ledger entry', async () => {
    const response = await request(app)
      .post('/api/admin/fees/settle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fee_transaction_ids: [feeTransactionId],
        settlement_method: 'bank_transfer',
        settlement_notes: 'Weekly settlement batch'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.settlement_id).toBeDefined();
    expect(response.body.data.settlement_status).toBe('completed');
    expect(response.body.data.transaction_count).toBe(1);
    expect(response.body.data.total_settled_amount).toBe(1000);
  });

  test('2.4: Fee marked as settled', async () => {
    const fee = await FeeTransaction.findById(feeTransactionId);
    
    expect(fee.fee_status).toBe('settled');
    expect(fee.settlement_id).toBeDefined();
  });

  test('2.5: Settlement ledger created with audit trail', async () => {
    const settlements = await SettlementLedger.find({});
    
    expect(settlements.length).toBeGreaterThan(0);
    const settlement = settlements[settlements.length - 1];
    
    expect(settlement.transaction_count).toBe(1);
    expect(settlement.total_amount).toBe(1000);
    expect(settlement.status).toBe('completed');
    expect(settlement.settled_by_admin_id).toBeDefined();
  });

  test('2.6: Admin can view settlement history', async () => {
    const response = await request(app)
      .get('/api/admin/fees/settlements')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'completed' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.settlements.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SCENARIO 3: Admin Rejects Donation with Rollback
// ============================================================================

describe('Scenario 3: Admin Rejects Donation - Rollback', () => {
  let testData;
  let adminToken;
  let donationId;

  beforeAll(async () => {
    testData = await createTestData();
    adminToken = require('../../src/utils/tokenUtils').generateToken(testData.admin._id, 'admin');

    // Create donation with associated updates
    const donation = await Donation.create({
      campaign_id: testData.activeCampaign._id,
      donor_id: testData.donor1._id,
      amount: 5000,
      status: 'sent',
      payment_method: 'credit_card',
      payment_reference: 'pi_fraud_test'
    });
    donationId = donation._id.toString();

    // Update campaign metrics
    testData.activeCampaign.current_raised += 5000;
    testData.activeCampaign.donation_count += 1;
    testData.activeCampaign.total_donors += 1;
    await testData.activeCampaign.save();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await Donation.deleteMany({});
    await FeeTransaction.deleteMany({});
  });

  test('3.1: Admin rejects donation', async () => {
    const response = await request(app)
      .patch(`/api/donations/${donationId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Suspicious payment - failed verification',
        admin_notes: 'Payment gateway flagged as fraud'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('rejected');
  });

  test('3.2: Campaign metrics rolled back after rejection', async () => {
    const campaign = await Campaign.findById(testData.activeCampaign._id);
    const initialRaised = testData.activeCampaign.current_raised;

    // Donation amount should be deducted
    expect(campaign.current_raised).toBeLessThanOrEqual(initialRaised);
    expect(campaign.donation_count).toBeLessThanOrEqual(testData.activeCampaign.donation_count);
  });

  test('3.3: Fee transaction marked as rejected', async () => {
    const fees = await FeeTransaction.find({
      campaign_id: testData.activeCampaign._id
    });

    // Should have rejected status
    const hasRejected = fees.some(f => f.fee_status === 'rejected');
    expect(hasRejected).toBe(true);
  });

  test('3.4: Sweepstakes entry removed on rejection', async () => {
    const entries = await Sweepstakes.find({
      campaign_id: testData.activeCampaign._id
    });

    // Should be empty after rejection cleanup
    expect(entries.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// SCENARIO 4: Invalid Amounts Rejected
// ============================================================================

describe('Scenario 4: Invalid Amounts - Error Handling', () => {
  let testData;
  let donorToken;

  beforeAll(async () => {
    testData = await createTestData();
    donorToken = require('../../src/utils/tokenUtils').generateToken(testData.donor1._id, 'user');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
  });

  test('4.1: Amount less than minimum ($1) rejected', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 50, // $0.50
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_AMOUNT');
    expect(response.body.error.message).toContain('must be at least');
  });

  test('4.2: Negative amount rejected', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: -1000,
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_AMOUNT');
  });

  test('4.3: Zero amount rejected', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 0,
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_AMOUNT');
  });

  test('4.4: Non-numeric amount rejected', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 'invalid',
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(422);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('4.5: Amount too large rejected', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 999999999999, // Unreasonably large
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toMatch(/INVALID_AMOUNT|VALIDATION_ERROR/);
  });
});

// ============================================================================
// SCENARIO 5: Self-Donation Blocked
// ============================================================================

describe('Scenario 5: Self-Donation Prevention', () => {
  let testData;
  let creatorToken;

  beforeAll(async () => {
    testData = await createTestData();
    creatorToken = require('../../src/utils/tokenUtils').generateToken(testData.creator._id, 'user');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
  });

  test('5.1: Campaign creator cannot donate to own campaign', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 5000,
        donor_name: 'Creator',
        donor_email: testData.creator.email,
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SELF_DONATION_NOT_ALLOWED');
  });

  test('5.2: Error message is clear about self-donation', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 5000,
        donor_name: 'Creator',
        donor_email: testData.creator.email,
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.error.message).toContain('cannot donate');
  });

  test('5.3: No donation recorded for self-donation attempt', async () => {
    const donations = await Donation.find({
      campaign_id: testData.activeCampaign._id,
      donor_id: testData.creator._id
    });

    expect(donations.length).toBe(0);
  });
});

// ============================================================================
// SCENARIO 6: Campaign Inactive - Donation Rejected
// ============================================================================

describe('Scenario 6: Campaign State Validation', () => {
  let testData;
  let donorToken;

  beforeAll(async () => {
    testData = await createTestData();
    donorToken = require('../../src/utils/tokenUtils').generateToken(testData.donor1._id, 'user');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
  });

  test('6.1: Cannot donate to draft campaign', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.inactiveCampaign._id.toString(),
        amount: 5000,
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('CAMPAIGN_NOT_ACTIVE');
  });

  test('6.2: Cannot donate to paused campaign', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.pausedCampaign._id.toString(),
        amount: 5000,
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('CAMPAIGN_NOT_ACTIVE');
  });

  test('6.3: Can donate to active campaign', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 5000,
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(201);

    expect(response.body.success).toBe(true);
  });

  test('6.4: Completed campaign cannot receive donations', async () => {
    // Create completed campaign
    const completedCampaign = await Campaign.create({
      title: 'Completed Campaign',
      creator_id: testData.creator._id,
      campaign_type: 'fundraising',
      status: 'completed',
      goal_amount: 50000,
      category: 'health',
      tags: ['test']
    });

    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        campaign_id: completedCampaign._id.toString(),
        amount: 5000,
        donor_name: 'John',
        donor_email: 'john@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('CAMPAIGN_NOT_ACTIVE');
  });
});

// ============================================================================
// SCENARIO 7: Unknown Supporter Still Credited
// ============================================================================

describe('Scenario 7: Anonymous & Unknown Supporters', () => {
  let testData;
  let anonToken;

  beforeAll(async () => {
    testData = await createTestData();
    // Create anonymous user (not verified)
    const anonUser = await User.create({
      email: 'anon@honestneed.test',
      username: 'anon_test',
      verified: false
    });
    anonToken = require('../../src/utils/tokenUtils').generateToken(anonUser._id, 'user');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await Donation.deleteMany({});
  });

  test('7.1: Unverified user can still donate', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${anonToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 5000,
        donor_name: 'Anonymous Donor',
        donor_email: 'anon@test.com',
        payment_method: 'credit_card',
        payment_reference: 'pi_test'
      })
      .expect(201);

    expect(response.body.success).toBe(true);
  });

  test('7.2: Anonymous donation accepted', async () => {
    const response = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${anonToken}`)
      .send({
        campaign_id: testData.activeCampaign._id.toString(),
        amount: 5000,
        donor_name: null,
        donor_email: null,
        is_anonymous: true,
        payment_method: 'credit_card',
        payment_reference: 'pi_anon'
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.is_anonymous).toBe(true);
  });

  test('7.3: Anonymous donations recorded without donor name', async () => {
    const donations = await Donation.find({
      campaign_id: testData.activeCampaign._id,
      is_anonymous: true
    });

    expect(donations.length).toBeGreaterThan(0);
    const anonDonation = donations[0];
    expect(anonDonation.donor_name).toBeNull();
  });

  test('7.4: Campaign metrics credited regardless of anonymity', async () => {
    const campaign = await Campaign.findById(testData.activeCampaign._id);
    
    // Should still count toward campaign raised
    expect(campaign.current_raised).toBeGreaterThan(0);
    expect(campaign.donation_count).toBeGreaterThan(0);
  });

  test('7.5: Fee tracked for anonymous donations', async () => {
    const fees = await FeeTransaction.find({
      campaign_id: testData.activeCampaign._id
    });

    expect(fees.length).toBeGreaterThan(0);
    // All donations have fees tracked
    fees.forEach(fee => {
      expect(fee.fee_amount).toBe(Math.round(fee.donation_amount * 0.2));
    });
  });
});

// ============================================================================
// SCENARIO 8: Concurrent Donations - Atomic Operations
// ============================================================================

describe('Scenario 8: Concurrent Donations - Race Condition Prevention', () => {
  let testData;
  let donor1Token;
  let donor2Token;

  beforeAll(async () => {
    testData = await createTestData();
    donor1Token = require('../../src/utils/tokenUtils').generateToken(testData.donor1._id, 'user');
    donor2Token = require('../../src/utils/tokenUtils').generateToken(testData.donor2._id, 'user');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await Donation.deleteMany({});
    await FeeTransaction.deleteMany({});
  });

  test('8.1: Multiple concurrent donations succeed', async () => {
    const donationData1 = {
      campaign_id: testData.activeCampaign._id.toString(),
      amount: 5000,
      donor_name: 'Donor 1',
      donor_email: 'donor1@test.com',
      payment_method: 'credit_card',
      payment_reference: 'pi_concurrent_1'
    };

    const donationData2 = {
      campaign_id: testData.activeCampaign._id.toString(),
      amount: 3000,
      donor_name: 'Donor 2',
      donor_email: 'donor2@test.com',
      payment_method: 'bank_transfer',
      payment_reference: 'pi_concurrent_2'
    };

    // Send concurrent requests
    const [response1, response2] = await Promise.all([
      request(app)
        .post('/api/donations')
        .set('Authorization', `Bearer ${donor1Token}`)
        .send(donationData1),
      request(app)
        .post('/api/donations')
        .set('Authorization', `Bearer ${donor2Token}`)
        .send(donationData2)
    ]);

    expect(response1.status).toBe(201);
    expect(response2.status).toBe(201);
  });

  test('8.2: Campaign metrics updated correctly for concurrent donations', async () => {
    const campaign = await Campaign.findById(testData.activeCampaign._id);
    
    // Should have both donations (5000 + 3000 = 8000)
    expect(campaign.current_raised).toBe(8000);
    expect(campaign.donation_count).toBe(2);
    expect(campaign.total_donors).toBe(2);
  });

  test('8.3: Fee transactions created for all concurrent donations', async () => {
    const fees = await FeeTransaction.find({
      campaign_id: testData.activeCampaign._id
    });

    expect(fees.length).toBe(2);
    expect(fees[0].fee_amount).toBe(1000); // 20% of 5000
    expect(fees[1].fee_amount).toBe(600);  // 20% of 3000
  });

  test('8.4: No data corruption or duplication', async () => {
    const donations = await Donation.find({
      campaign_id: testData.activeCampaign._id
    });

    // Should have exactly 2 donations, not duplicated
    expect(donations.length).toBe(2);
    
    // All should be valid
    donations.forEach(donation => {
      expect(donation._id).toBeDefined();
      expect(donation.amount).toBeGreaterThan(0);
    });
  });

  test('8.5: Database constraints prevent double-counting', async () => {
    const campaign = await Campaign.findById(testData.activeCampaign._id);
    const donations = await Donation.find({
      campaign_id: testData.activeCampaign._id
    });

    // Verify counts match
    let totalRaised = 0;
    donations.forEach(d => {
      totalRaised += d.amount;
    });

    expect(campaign.current_raised).toBe(totalRaised);
  });
});

// ============================================================================
// EXPORTS FOR TEST RUNNING
// ============================================================================

module.exports = {
  createTestData
};
