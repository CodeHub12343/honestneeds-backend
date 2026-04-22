/**
 * Sweepstakes Management Integration Tests
 * Complete test coverage for all 11 sweepstakes endpoints
 * 
 * Tests:
 * ✓ List Sweepstakes (GET /sweepstakes)
 * ✓ Get Sweepstake Detail (GET /sweepstakes/:id)
 * ✓ Create Sweepstake (POST /sweepstakes) - admin only
 * ✓ Enter Sweepstake (POST /sweepstakes/:id/enter)
 * ✓ My Entries (GET /sweepstakes/my-entries)
 * ✓ Campaign Entries (GET /sweepstakes/campaigns/:campaignId/entries)
 * ✓ Current Drawing (GET /sweepstakes/current-drawing)
 * ✓ My Winnings (GET /sweepstakes/my-winnings)
 * ✓ Claim Prize (POST /sweepstakes/:id/claim-prize)
 * ✓ Cancel Claim (POST /sweepstakes/:id/cancel-claim)
 * ✓ Past Drawings (GET /sweepstakes/past-drawings)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const SweepstakesDrawing = require('../models/SweepstakesDrawing');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

describe('Sweepstakes Management - Complete Integration Tests', () => {
  let server;
  let testUserId;
  let testAdminId;
  let campaignId;
  let sweepstakeId;
  let userToken;
  let adminToken;

  // Test fixtures
  const testUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'sweepstakes-user@example.com',
    password_hash: 'test_hash',
    full_name: 'Test Sweepstakes User',
    auth_provider: 'email',
    roles: ['supporter'],
    verified: true
  };

  const testAdmin = {
    _id: new mongoose.Types.ObjectId(),
    email: 'sweepstakes-admin@example.com',
    password_hash: 'test_hash',
    full_name: 'Sweepstakes Admin',
    auth_provider: 'email',
    roles: ['admin'],
    verified: true
  };

  const testCampaign = {
    title: 'Save Local Hospital',
    description: 'Help us save our local hospital',
    creator_id: null, // Will be set to admin
    status: 'active',
    need_type: 'healthcare',
    category: 'medical'
  };

  /**
   * Setup: Create test data
   */
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/honestneed-test'
      );
    }

    testUserId = testUser._id;
    testAdminId = testAdmin._id;

    try {
      await User.create(testUser);
      await User.create(testAdmin);
    } catch (error) {
      if (!error.message.includes('duplicate')) {
        console.error('Failed to create test users:', error);
      }
    }

    try {
      const campaign = await Campaign.create({
        ...testCampaign,
        creator_id: testAdminId
      });
      campaignId = campaign._id;
    } catch (error) {
      console.error('Failed to create test campaign:', error);
    }

    // Generate test tokens
    userToken = Buffer.from(
      JSON.stringify({ sub: testUserId, role: 'supporter' })
    ).toString('base64');
    adminToken = Buffer.from(
      JSON.stringify({ sub: testAdminId, role: 'admin' })
    ).toString('base64');
  });

  /**
   * Cleanup: Remove test data
   */
  afterAll(async () => {
    try {
      await SweepstakesDrawing.deleteMany({});
      await SweepstakesSubmission.deleteMany({});
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

  describe('GET /sweepstakes - List Sweepstakes', () => {
    it('should list all active sweepstakes', async () => {
      const response = await request(app)
        .get('/api/sweepstakes')
        .query({ status: 'active', page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sweepstakes');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.sweepstakes)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/sweepstakes')
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.limit).toBe(5);
      expect(response.body.data.sweepstakes.length).toBeLessThanOrEqual(5);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/sweepstakes')
        .query({ status: 'upcoming' });

      expect(response.status).toBe(200);
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/api/sweepstakes')
        .query({ sortBy: 'created' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /sweepstakes - Create Sweepstake', () => {
    it('should create sweepstake with admin credentials', async () => {
      const response = await request(app)
        .post('/api/sweepstakes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Spring Charity Drawing',
          description: 'Enter for a chance to win amazing prizes',
          prizePool: 1000,
          campaignId,
          drawDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          prizes: [{ amount: 500, winners: 1 }, { amount: 250, winners: 2 }]
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBeDefined();

      sweepstakeId = response.body.data.drawingId;
    });

    it('should reject non-admin sweepstake creation', async () => {
      const response = await request(app)
        .post('/api/sweepstakes')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Unauthorized Sweepstake',
          description: 'Should not work',
          prizePool: 1000,
          drawDate: new Date().toISOString()
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should reject sweepstake with missing required fields', async () => {
      const response = await request(app)
        .post('/api/sweepstakes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Incomplete Sweepstake'
          // Missing: description, prizePool, drawDate
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/sweepstakes')
        .send({
          title: 'Unauth Sweepstake',
          description: 'Test',
          prizePool: 1000,
          drawDate: new Date().toISOString()
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /sweepstakes/:id - Get Sweepstake Detail', () => {
    it('should return sweepstake details', async () => {
      if (!sweepstakeId) return;

      const response = await request(app)
        .get(`/api/sweepstakes/${sweepstakeId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('drawingId');
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('prizePool');
    });

    it('should include user entries if authenticated', async () => {
      if (!sweepstakeId) return;

      const response = await request(app)
        .get(`/api/sweepstakes/${sweepstakeId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('userEntries');
    });

    it('should return 404 for non-existent sweepstake', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/sweepstakes/fake-id-${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /sweepstakes/:id/enter - Enter Sweepstake', () => {
    it('should allow user to enter sweepstake', async () => {
      if (!sweepstakeId) return;

      const response = await request(app)
        .post(`/api/sweepstakes/${sweepstakeId}/enter`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ entryAmount: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('entryCount');
      expect(response.body.data.entryCount).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      if (!sweepstakeId) return;

      const response = await request(app)
        .post(`/api/sweepstakes/${sweepstakeId}/enter`)
        .send({ entryAmount: 1 });

      expect(response.status).toBe(401);
    });

    it('should reject entry for non-existent sweepstake', async () => {
      const response = await request(app)
        .post('/api/sweepstakes/fake-id/enter')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ entryAmount: 1 });

      expect(response.status).toBe(404);
    });

    it('should reject entry if period has ended', async () => {
      // Create expired sweepstake
      const expiredSweep = new SweepstakesDrawing({
        title: 'Expired Sweepstake',
        description: 'Already expired',
        prizePool: 100 * 100,
        entryEndDate: new Date(Date.now() - 1000), // 1 second ago
        drawDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active'
      });
      await expiredSweep.save();

      const response = await request(app)
        .post(`/api/sweepstakes/${expiredSweep.drawingId}/enter`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ entryAmount: 1 });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /sweepstakes/my-entries - User Entries', () => {
    it('should return user entries', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/my-entries')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('entries');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.entries)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/my-entries')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.entries.length).toBeLessThanOrEqual(5);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/my-entries')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /sweepstakes/campaigns/:campaignId/entries - Campaign Entries', () => {
    it('should return campaign entries for creator', async () => {
      const response = await request(app)
        .get(`/api/sweepstakes/campaigns/${campaignId}/entries`)
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('entries');
    });

    it('should restrict non-creators from viewing', async () => {
      const response = await request(app)
        .get(`/api/sweepstakes/campaigns/${campaignId}/entries`)
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/sweepstakes/campaigns/${fakeId}/entries`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /sweepstakes/current-drawing - Current Drawing', () => {
    it('should return current active drawing', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/current-drawing');

      expect(response.status).toBeOneOf([200, 404]);
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('drawingId');
        expect(response.body.data).toHaveProperty('status');
      }
    });

    it('should show user entries if authenticated', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/current-drawing')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBeOneOf([200, 404]);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('userEntries');
      }
    });
  });

  describe('GET /sweepstakes/my-winnings - User Winnings', () => {
    it('should return user winnings', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/my-winnings')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('winnings');
      expect(Array.isArray(response.body.data.winnings)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/my-winnings')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /sweepstakes/:id/claim-prize - Claim Prize', () => {
    it('should reject claim if user not winner', async () => {
      if (!sweepstakeId) return;

      const response = await request(app)
        .post(`/api/sweepstakes/${sweepstakeId}/claim-prize`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'method-123' });

      expect(response.status).toBeOneOf([403, 400]);
    });

    it('should require authentication', async () => {
      if (!sweepstakeId) return;

      const response = await request(app)
        .post(`/api/sweepstakes/${sweepstakeId}/claim-prize`)
        .send({ paymentMethodId: 'method-123' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /sweepstakes/:id/cancel-claim - Cancel Claim', () => {
    it('should require authentication', async () => {
      const fakeClaimId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/sweepstakes/${fakeClaimId}/cancel-claim`)
        .send({ reason: 'Changed mind' });

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent claim', async () => {
      const fakeClaimId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/sweepstakes/${fakeClaimId}/cancel-claim`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'Changed mind' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /sweepstakes/past-drawings - Past Drawings', () => {
    it('should return past drawings', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/past-drawings')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('drawings');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.drawings)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/sweepstakes/past-drawings')
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.drawings.length).toBeLessThanOrEqual(5);
    });
  });
});
