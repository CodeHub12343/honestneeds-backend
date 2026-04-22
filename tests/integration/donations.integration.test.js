/**
 * Donation Management Integration Tests
 * Complete test coverage for all 9 donation endpoints
 * 
 * Tests:
 * ✓ Create Donation (POST /donations)
 * ✓ List Donations (GET /donations) 
 * ✓ Get Donation Detail (GET /donations/:id)
 * ✓ Donation Analytics (GET /donations/analytics)
 * ✓ Campaign Donations (GET /campaigns/:id/donations)
 * ✓ Donation Receipt (GET /donations/:id/receipt)
 * ✓ Donation Refund (POST /donations/:id/refund)
 * ✓ Donation History (GET /donations/history)
 * ✓ Bulk Donation Export (GET /donations/export)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

describe('Donation Management - Complete Integration Tests', () => {
  let server;
  let testUserId;
  let testCreatorId;
  let testAdminId;
  let campaignId;
  let donationId;
  let donationToken;
  let creatorToken;
  let adminToken;

  // Test data fixtures
  const testDonor = {
    _id: new mongoose.Types.ObjectId(),
    email: 'donor@example.com',
    password_hash: 'test_hash',
    full_name: 'Test Donor',
    auth_provider: 'email',
    roles: ['supporter']
  };

  const testCreator = {
    _id: new mongoose.Types.ObjectId(),
    email: 'creator@example.com',
    password_hash: 'test_hash',
    full_name: 'Campaign Creator',
    auth_provider: 'email',
    roles: ['creator']
  };

  const testAdmin = {
    _id: new mongoose.Types.ObjectId(),
    email: 'admin@example.com',
    password_hash: 'test_hash',
    full_name: 'Admin User',
    auth_provider: 'email',
    roles: ['admin']
  };

  const testCampaign = {
    title: 'Help Build Community Center',
    description: 'We need funds to build a community center',
    need_type: 'community',
    category: 'humanitarian',
    goals: { fundraising: { target_amount: 50000, currency: 'USD' } },
    location: { country: 'Nigeria', state: 'Lagos', city: 'Ikeja' },
    payment_methods: ['paypal', 'stripe', 'bank_transfer'],
    tags: ['community', 'charity'],
    status: 'active'
  };

  /**
   * Setup: Create test users and campaign
   */
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/honestneed-test');
    }

    testUserId = testDonor._id;
    testCreatorId = testCreator._id;
    testAdminId = testAdmin._id;

    // Create test users
    try {
      await User.create(testDonor);
      await User.create(testCreator);
      await User.create(testAdmin);
    } catch (error) {
      if (!error.message.includes('duplicate')) {
        console.error('Failed to create test users:', error);
      }
    }

    // Create test campaign
    try {
      const campaign = await Campaign.create({
        ...testCampaign,
        creator_id: testCreatorId
      });
      campaignId = campaign._id;
    } catch (error) {
      console.error('Failed to create test campaign:', error);
    }

    // Generate test tokens (mock JWT)
    donationToken = Buffer.from(JSON.stringify({ sub: testUserId, role: 'supporter' })).toString('base64');
    creatorToken = Buffer.from(JSON.stringify({ sub: testCreatorId, role: 'creator' })).toString('base64');
    adminToken = Buffer.from(JSON.stringify({ sub: testAdminId, role: 'admin' })).toString('base64');
  });

  /**
   * Cleanup: Remove test data
   */
  afterAll(async () => {
    try {
      await Transaction.deleteMany({});
      await Campaign.deleteMany({});
      await User.deleteMany({});
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    if (server) server.close();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });

  describe('POST /donations - Create Donation', () => {
    it('should create a donation with valid input', async () => {
      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate`)
        .set('Authorization', `Bearer ${donationToken}`)
        .send({
          amount: 50,
          paymentMethod: 'paypal'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction_id');
      expect(response.body.data).toHaveProperty('fee_breakdown');
      expect(response.body.data.fee_breakdown.gross).toBe(5000); // $50 in cents

      donationId = response.body.data.transaction_db_id;
    });

    it('should calculate fees correctly (20% platform fee)', async () => {
      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate`)
        .set('Authorization', `Bearer ${donationToken}`)
        .send({
          amount: 100,
          paymentMethod: 'stripe'
        });

      expect(response.status).toBe(201);
      const { fee_breakdown } = response.body.data;
      expect(fee_breakdown.gross).toBe(10000); // $100 in cents
      expect(fee_breakdown.fee).toBe(2000); // 20% of $100 = $20
      expect(fee_breakdown.net).toBe(8000); // $100 - $20 = $80
    });

    it('should reject donation for inactive campaign', async () => {
      // Create an inactive campaign
      const inactiveCampaign = await Campaign.create({
        ...testCampaign,
        title: 'Inactive Campaign',
        status: 'draft',
        creator_id: testCreatorId
      });

      const response = await request(app)
        .post(`/api/donations/${inactiveCampaign._id}/donate`)
        .set('Authorization', `Bearer ${donationToken}`)
        .send({
          amount: 50,
          paymentMethod: 'paypal'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it('should reject donation with missing amount', async () => {
      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate`)
        .set('Authorization', `Bearer ${donationToken}`)
        .send({
          paymentMethod: 'paypal'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject donation with invalid amount', async () => {
      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate`)
        .set('Authorization', `Bearer ${donationToken}`)
        .send({
          amount: -10,
          paymentMethod: 'paypal'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject donation with unsupported payment method', async () => {
      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate`)
        .set('Authorization', `Bearer ${donationToken}`)
        .send({
          amount: 50,
          paymentMethod: 'bitcoin' // Not supported
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /donations - List Donations', () => {
    it('should list user donations with pagination', async () => {
      const response = await request(app)
        .get('/api/donations')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.donations)).toBe(true);
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.pagination).toHaveProperty('total');
    });

    it('should filter donations by campaign', async () => {
      const response = await request(app)
        .get('/api/donations')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ campaignId, page: 1, limit: 10 });

      expect(response.status).toBe(200);
      response.body.data.donations.forEach(donation => {
        expect(donation.campaign).toBeDefined();
      });
    });

    it('should filter donations by status', async () => {
      const response = await request(app)
        .get('/api/donations')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ status: 'pending', page: 1, limit: 10 });

      expect(response.status).toBe(200);
    });

    it('should filter donations by payment method', async () => {
      const response = await request(app)
        .get('/api/donations')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ paymentMethod: 'paypal', page: 1, limit: 10 });

      expect(response.status).toBe(200);
    });

    it('should filter donations by date range', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get('/api/donations')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ startDate, endDate, page: 1, limit: 10 });

      expect(response.status).toBe(200);
    });

    it('should enforce pagination limits', async () => {
      const response = await request(app)
        .get('/api/donations')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.donations.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /donations/analytics - Donation Analytics', () => {
    it('should return donation analytics', async () => {
      const response = await request(app)
        .get('/api/donations/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary).toHaveProperty('total_donations');
      expect(response.body.data.summary).toHaveProperty('total_amount_dollars');
    });

    it('should include payment method breakdown', async () => {
      const response = await request(app)
        .get('/api/donations/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('byPaymentMethod');
    });

    it('should include status breakdown', async () => {
      const response = await request(app)
        .get('/api/donations/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('byStatus');
    });

    it('should include daily timeline data', async () => {
      const response = await request(app)
        .get('/api/donations/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('byDate');
    });

    it('should include top campaigns', async () => {
      const response = await request(app)
        .get('/api/donations/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('topCampaigns');
      if (response.body.data.topCampaigns.length > 0) {
        expect(response.body.data.topCampaigns[0]).toHaveProperty('campaignTitle');
      }
    });
  });

  describe('GET /campaigns/:id/donations - Campaign Donations', () => {
    it('should return donations for specific campaign', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.donations)).toBe(true);
    });

    it('should support pagination for campaign donations', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.donations.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /campaigns/:id/donations/analytics - Campaign Donation Analytics', () => {
    it('should return campaign-specific analytics', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations/analytics`)
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('campaignId');
      expect(response.body.data).toHaveProperty('donations');
    });

    it('should include donation summary', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations/analytics`)
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(response.status).toBe(200);
      const donations = response.body.data.donations;
      expect(donations).toHaveProperty('total_count');
      expect(donations).toHaveProperty('unique_donors');
      expect(donations).toHaveProperty('total_raised_dollars');
    });

    it('should include timeline data', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations/analytics`)
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('timeline');
    });

    it('should include top donors', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations/analytics`)
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('topDonors');
    });

    it('should restrict to campaign creator', async () => {
      const response = await request(app)
        .get(`/api/donations/campaigns/${campaignId}/donations/analytics`)
        .set('Authorization', `Bearer ${donationToken}`); // Not creator

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /donations/:id/receipt - Donation Receipt', () => {
    it('should generate donation receipt', async () => {
      if (!donationId) return; // Skip if no donation created

      const response = await request(app)
        .get(`/api/donations/${donationId}/receipt`)
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('receiptNumber');
      expect(response.body.data).toHaveProperty('donorName');
      expect(response.body.data).toHaveProperty('campaignTitle');
    });

    it('should include donation amount details', async () => {
      if (!donationId) return;

      const response = await request(app)
        .get(`/api/donations/${donationId}/receipt`)
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(200);
      const receipt = response.body.data;
      expect(receipt.donationAmount).toHaveProperty('gross_dollars');
      expect(receipt.donationAmount).toHaveProperty('platform_fee_dollars');
      expect(receipt.donationAmount).toHaveProperty('net_amount_dollars');
    });

    it('should restrict to donation owner', async () => {
      if (!donationId) return;

      const response = await request(app)
        .get(`/api/donations/${donationId}/receipt`)
        .set('Authorization', `Bearer ${creatorToken}`); // Different user

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent donation', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/donations/${fakeId}/receipt`)
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /donations/:id/refund - Donation Refund', () => {
    let refundableId;

    beforeAll(async () => {
      // Create a donation to refund
      const donation = await Transaction.create({
        campaign_id: campaignId,
        supporter_id: testUserId,
        creator_id: testCreatorId,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'paypal',
        status: 'verified'
      });
      refundableId = donation._id;
    });

    it('should refund a verified donation', async () => {
      const response = await request(app)
        .post(`/api/donations/${refundableId}/refund`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          reason: 'Payment error'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('refunded');
    });

    it('should require creator or admin for refund', async () => {
      const donation = await Transaction.create({
        campaign_id: campaignId,
        supporter_id: testUserId,
        creator_id: testCreatorId,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'paypal',
        status: 'verified'
      });

      const response = await request(app)
        .post(`/api/donations/${donation._id}/refund`)
        .set('Authorization', `Bearer ${donationToken}`) // Not creator
        .send({
          reason: 'Request'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should not allow double refund', async () => {
      // Try to refund again
      const response = await request(app)
        .post(`/api/donations/${refundableId}/refund`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          reason: 'Duplicate'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /donations/history - Donation History', () => {
    it('should return user donation history', async () => {
      const response = await request(app)
        .get('/api/donations/history')
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.donations)).toBe(true);
    });

    it('should support date range filtering', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get('/api/donations/history')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ startDate, endDate });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/donations/history')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.donations.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /donations/export - Bulk Donation Export', () => {
    it('should export donations (admin only)', async () => {
      const response = await request(app)
        .get('/api/donations/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ format: 'json' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('count');
      expect(Array.isArray(response.body.data.donations)).toBe(true);
    });

    it('should export as CSV format', async () => {
      const response = await request(app)
        .get('/api/donations/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ format: 'csv' });

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/text\/csv/);
    });

    it('should filter export by campaign', async () => {
      const response = await request(app)
        .get('/api/donations/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ format: 'json', campaignId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should filter export by date range', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get('/api/donations/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ format: 'json', startDate, endDate });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should restrict export to admin only', async () => {
      const response = await request(app)
        .get('/api/donations/export')
        .set('Authorization', `Bearer ${donationToken}`)
        .query({ format: 'json' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /donations/:id - Get Donation Detail', () => {
    it('should retrieve donation details', async () => {
      if (!donationId) return;

      const response = await request(app)
        .get(`/api/donations/${donationId}`)
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction_id');
      expect(response.body.data).toHaveProperty('amount_dollars');
    });

    it('should restrict to donation owner or admin', async () => {
      if (!donationId) return;

      const response = await request(app)
        .get(`/api/donations/${donationId}`)
        .set('Authorization', `Bearer ${creatorToken}`); // Different user

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent donation', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/donations/${fakeId}`)
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /donations/:campaignId/donate/:transactionId/mark-sent - Mark Donation Sent', () => {
    let transactionId;

    beforeAll(async () => {
      const transaction = await Transaction.create({
        campaign_id: campaignId,
        supporter_id: testUserId,
        creator_id: testCreatorId,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'paypal',
        status: 'pending'
      });
      transactionId = transaction._id;
    });

    it('should mark donation as sent', async () => {
      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate/${transactionId}/mark-sent`)
        .set('Authorization', `Bearer ${donationToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('marked_sent');
    });

    it('should restrict to donation owner', async () => {
      const transaction = await Transaction.create({
        campaign_id: campaignId,
        supporter_id: testUserId,
        creator_id: testCreatorId,
        amount_cents: 5000,
        platform_fee_cents: 1000,
        net_amount_cents: 4000,
        payment_method: 'paypal',
        status: 'pending'
      });

      const response = await request(app)
        .post(`/api/donations/${campaignId}/donate/${transaction._id}/mark-sent`)
        .set('Authorization', `Bearer ${creatorToken}`); // Different user

      expect(response.status).toBe(403);
    });
  });
});
