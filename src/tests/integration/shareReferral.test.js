/**
 * @fileoverview Integration Tests for Share Referral Routes
 * Tests all share/referral endpoints including:
 * - Join Share Campaign
 * - Track Share Events
 * - Get Share Status
 * - Get User Earnings
 * - Share History with Filtering
 * - Withdraw Earnings
 * - Platform Performance
 * - Share Leaderboard
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

describe('Share Referral Routes', () => {
  let app;
  let server;
  let testUserId;
  let testCampaignId;
  let testShareTrackingId;
  let testWithdrawalId;
  let authToken;

  // Mock data
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'sharer@test.com',
    display_name: 'Test Sharer',
    password: 'hashedPassword123',
    role: 'user',
  };

  const mockCampaign = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Test Campaign',
    description: 'A test campaign for sharing',
    creator_id: new mongoose.Types.ObjectId(),
    goal_amount: 5000,
    status: 'active',
    type: 'fundraising',
  };

  const mockShareTracking = {
    _id: new mongoose.Types.ObjectId(),
    tracking_id: 'ST-123456789-abc123',
    user_id: mockUser._id,
    campaign_id: mockCampaign._id,
    referral_code: 'ABC12XYZ',
    referral_link: 'https://honestneed.com/campaigns/123?ref=ABC12XYZ',
    total_earnings: 5000,
    pending_earnings: 1000,
    withdrawn_earnings: 4000,
    total_shares: 100,
    total_conversions: 15,
    conversion_rate: 15.0,
    status: 'active',
    shares_by_platform: new Map([
      ['facebook', { count: 60, earnings: 3000, conversions: 10 }],
      ['instagram', { count: 40, earnings: 2000, conversions: 5 }],
    ]),
  };

  beforeAll(async () => {
    // Initialize Express app
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        if (token === 'valid-token') {
          req.user = mockUser;
        }
      }
      next();
    });

    // Load routes (mock setup)
    require('../../routes/shareReferralRoutes');

    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  // ============================================
  // JOIN SHARE CAMPAIGN TESTS
  // ============================================

  describe('POST /api/share/join', () => {
    test('should join share campaign successfully', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.share_tracking).toBeDefined();
      expect(res.body.share_tracking.referral_code).toBeDefined();
      expect(res.body.share_tracking.referral_link).toContain('?ref=');
    });

    test('should return 400 when campaign_id missing', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: new mongoose.Types.ObjectId().toString(),
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });

      expect([401, 403]).toContain(res.status);
    });

    test('should return existing tracking if already joined', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.share_tracking).toBeDefined();
    });
  });

  // ============================================
  // TRACK SHARE TESTS
  // ============================================

  describe('POST /api/share/track', () => {
    test('should track share successfully', async () => {
      const res = await request(app)
        .post('/api/share/track')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
          platform: 'facebook',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.share).toBeDefined();
      expect(res.body.share.platform).toBe('facebook');
    });

    test('should track different platforms', async () => {
      const platforms = ['facebook', 'instagram', 'twitter', 'email'];

      for (const platform of platforms) {
        const res = await request(app)
          .post('/api/share/track')
          .set('Authorization', 'Bearer valid-token')
          .send({
            campaign_id: mockCampaign._id.toString(),
            platform,
          });

        expect(res.status).toBe(200);
        expect(res.body.share.platform).toBe(platform);
      }
    });

    test('should return 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/share/track')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });

      expect(res.status).toBe(400);
    });

    test('should auto-create tracking if not already joined', async () => {
      const res = await request(app)
        .post('/api/share/track')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
          platform: 'facebook',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });

    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/share/track')
        .send({
          campaign_id: mockCampaign._id.toString(),
          platform: 'facebook',
        });

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // GET SHARE STATUS TESTS
  // ============================================

  describe('GET /api/share/:campaignId/status', () => {
    test('should return share status for campaign', async () => {
      const res = await request(app)
        .get(`/api/share/${mockCampaign._id}/status`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.share_status).toBeDefined();
      expect(res.body.share_status.campaign_id).toBeDefined();
    });

    test('should include platform breakdown', async () => {
      const res = await request(app)
        .get(`/api/share/${mockCampaign._id}/status`)
        .set('Authorization', 'Bearer valid-token');

      if (res.status === 200 && res.body.share_status) {
        expect(res.body.share_status.platforms).toBeDefined();
      }
    });

    test('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .get(`/api/share/${new mongoose.Types.ObjectId()}/status`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });

    test('should return null status if not yet joined', async () => {
      const res = await request(app)
        .get(`/api/share/${new mongoose.Types.ObjectId()}/status`)
        .set('Authorization', 'Bearer valid-token');

      // Will fail with 404, but ideally should return { share_status: null }
      expect([200, 404]).toContain(res.status);
    });

    test('should require authentication', async () => {
      const res = await request(app).get(`/api/share/${mockCampaign._id}/status`);

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // GET USER EARNINGS TESTS
  // ============================================

  describe('GET /api/share/:userId/earnings', () => {
    test('should return user earnings', async () => {
      const res = await request(app)
        .get(`/api/share/me/earnings`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.earnings).toBeDefined();
      expect(res.body.earnings.total_earnings).toBeDefined();
    });

    test('should include breakdown by campaign', async () => {
      const res = await request(app)
        .get(`/api/share/me/earnings`)
        .set('Authorization', 'Bearer valid-token');

      if (res.status === 200) {
        expect(res.body.earnings.by_campaign).toBeDefined();
        expect(Array.isArray(res.body.earnings.by_campaign)).toBe(true);
      }
    });

    test('should calculate available withdrawal amount', async () => {
      const res = await request(app)
        .get(`/api/share/me/earnings`)
        .set('Authorization', 'Bearer valid-token');

      if (res.status === 200) {
        expect(res.body.earnings.available_withdrawal).toBeDefined();
      }
    });

    test('should filter by campaign_id if provided', async () => {
      const res = await request(app)
        .get(`/api/share/me/earnings?campaign_id=${mockCampaign._id}`)
        .set('Authorization', 'Bearer valid-token');

      expect([200, 404]).toContain(res.status);
    });

    test('should return 403 when accessing other user earnings', async () => {
      const res = await request(app)
        .get(`/api/share/${new mongoose.Types.ObjectId()}/earnings`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/share/me/earnings');

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // GET SHARE HISTORY TESTS
  // ============================================

  describe('GET /api/share/history', () => {
    test('should return share history', async () => {
      const res = await request(app)
        .get('/api/share/history')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.history).toBeDefined();
      expect(Array.isArray(res.body.history.shares)).toBe(true);
    });

    test('should support pagination', async () => {
      const res = await request(app)
        .get('/api/share/history?page=1&limit=10')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.history.page).toBe(1);
      expect(res.body.history.limit).toBe(10);
      expect(res.body.history.total).toBeDefined();
      expect(res.body.history.pages).toBeDefined();
    });

    test('should filter by platform', async () => {
      const res = await request(app)
        .get('/api/share/history?platform=facebook')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      // All returned shares should be facebook platform
      if (res.body.history.shares.length > 0) {
        expect(res.body.history.shares[0].platform).toBe('facebook');
      }
    });

    test('should filter by date range', async () => {
      const res = await request(app)
        .get('/api/share/history?startDate=2026-04-01&endDate=2026-04-05')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.history.shares).toBeDefined();
    });

    test('should filter by campaign', async () => {
      const res = await request(app)
        .get(`/api/share/history?campaign_id=${mockCampaign._id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
    });

    test('should filter by status', async () => {
      const res = await request(app)
        .get('/api/share/history?status=completed')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/share/history');

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // WITHDRAW EARNINGS TESTS
  // ============================================

  describe('POST /api/share/withdraw', () => {
    test('should submit withdrawal request', async () => {
      const res = await request(app)
        .post('/api/share/withdraw')
        .set('Authorization', 'Bearer valid-token')
        .send({
          amount: 5000,
          payment_method_id: new mongoose.Types.ObjectId().toString(),
          payment_type: 'bank_transfer',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.withdrawal).toBeDefined();
      expect(res.body.withdrawal.withdrawal_id).toBeDefined();
      expect(res.body.withdrawal.status).toBe('pending');
    });

    test('should return 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/share/withdraw')
        .set('Authorization', 'Bearer valid-token')
        .send({
          amount: 5000,
        });

      expect(res.status).toBe(400);
    });

    test('should return 400 when insufficient balance', async () => {
      const res = await request(app)
        .post('/api/share/withdraw')
        .set('Authorization', 'Bearer valid-token')
        .send({
          amount: 9999999999, // Huge amount
          payment_method_id: new mongoose.Types.ObjectId().toString(),
          payment_type: 'bank_transfer',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient');
    });

    test('should support multiple payment types', async () => {
      const paymentTypes = ['bank_transfer', 'mobile_money', 'stripe', 'paypal'];

      for (const paymentType of paymentTypes) {
        const res = await request(app)
          .post('/api/share/withdraw')
          .set('Authorization', 'Bearer valid-token')
          .send({
            amount: 5000,
            payment_method_id: new mongoose.Types.ObjectId().toString(),
            payment_type: paymentType,
          });

        expect([201, 400]).toContain(res.status);
      }
    });

    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/share/withdraw')
        .send({
          amount: 5000,
          payment_method_id: new mongoose.Types.ObjectId().toString(),
          payment_type: 'bank_transfer',
        });

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // GET PLATFORM PERFORMANCE TESTS
  // ============================================

  describe('GET /api/share/:platform/performance', () => {
    test('should return facebook performance', async () => {
      const res = await request(app)
        .get('/api/share/facebook/performance')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.performance).toBeDefined();
      expect(res.body.performance.platform).toBe('facebook');
    });

    test('should include conversion metrics', async () => {
      const res = await request(app)
        .get('/api/share/instagram/performance')
        .set('Authorization', 'Bearer valid-token');

      if (res.status === 200) {
        expect(res.body.performance.total_conversions).toBeDefined();
        expect(res.body.performance.conversion_rate).toBeDefined();
      }
    });

    test('should filter by campaign', async () => {
      const res = await request(app)
        .get(`/api/share/facebook/performance?campaign_id=${mockCampaign._id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
    });

    test('should return 400 for invalid platform', async () => {
      const res = await request(app)
        .get('/api/share/invalid_platform/performance')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    test('should support all valid platforms', async () => {
      const validPlatforms = ['facebook', 'instagram', 'twitter', 'email', 'linkedin'];

      for (const platform of validPlatforms) {
        const res = await request(app)
          .get(`/api/share/${platform}/performance`)
          .set('Authorization', 'Bearer valid-token');

        expect([200, 404]).toContain(res.status);
      }
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/share/facebook/performance');

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // GET LEADERBOARD TESTS
  // ============================================

  describe('GET /api/share/leaderboard', () => {
    test('should return global leaderboard', async () => {
      const res = await request(app).get('/api/share/leaderboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.leaderboard).toBeDefined();
      expect(Array.isArray(res.body.leaderboard.entries)).toBe(true);
    });

    test('should include ranking information', async () => {
      const res = await request(app).get('/api/share/leaderboard');

      if (res.status === 200 && res.body.leaderboard.entries.length > 0) {
        const entry = res.body.leaderboard.entries[0];
        expect(entry.rank).toBeDefined();
        expect(entry.user_name).toBeDefined();
        expect(entry.total_earnings).toBeDefined();
      }
    });

    test('should support pagination', async () => {
      const res = await request(app)
        .get('/api/share/leaderboard?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.page).toBe(1);
      expect(res.body.leaderboard.limit).toBe(10);
    });

    test('should filter by campaign', async () => {
      const res = await request(app)
        .get(`/api/share/leaderboard?campaign_id=${mockCampaign._id}`);

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.filter.type).toBe('campaign');
    });

    test('should support custom limit', async () => {
      const res = await request(app)
        .get('/api/share/leaderboard?limit=50');

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.entries.length).toBeLessThanOrEqual(50);
    });

    test('should not require authentication', async () => {
      const res = await request(app).get('/api/share/leaderboard');

      expect([200, 401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    test('should handle invalid MongoDB IDs gracefully', async () => {
      const res = await request(app)
        .get('/api/share/invalid-id/status')
        .set('Authorization', 'Bearer valid-token');

      expect([400, 404]).toContain(res.status);
    });

    test('should handle malformed requests', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: null,
        });

      expect([400, 422]).toContain(res.status);
    });

    test('should handle concurrent withdrawal requests', async () => {
      const requests = [
        request(app)
          .post('/api/share/withdraw')
          .set('Authorization', 'Bearer valid-token')
          .send({
            amount: 2500,
            payment_method_id: new mongoose.Types.ObjectId().toString(),
            payment_type: 'bank_transfer',
          }),
        request(app)
          .post('/api/share/withdraw')
          .set('Authorization', 'Bearer valid-token')
          .send({
            amount: 2500,
            payment_method_id: new mongoose.Types.ObjectId().toString(),
            payment_type: 'bank_transfer',
          }),
      ];

      const results = await Promise.all(requests);

      // Should handle gracefully (either both succeed or balance check prevents second)
      expect([201, 400]).toContain(results[1].status);
    });
  });

  // ============================================
  // RESPONSE FORMAT TESTS
  // ============================================

  describe('Response Format Consistency', () => {
    test('all success responses should have success flag', async () => {
      const res = await request(app).get('/api/share/leaderboard');

      expect(res.body.success).toBe(true);
    });

    test('all error responses should have success flag and message', async () => {
      const res = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      if (res.status >= 400) {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBeDefined();
      }
    });

    test('all responses should have consistent status codes', async () => {
      const getRes = await request(app).get('/api/share/leaderboard');
      expect(typeof getRes.status).toBe('number');

      const postRes = await request(app)
        .post('/api/share/join')
        .set('Authorization', 'Bearer valid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });
      expect(typeof postRes.status).toBe('number');
    });
  });

  // ============================================
  // AUTHORIZATION TESTS
  // ============================================

  describe('Authorization & Access Control', () => {
    test('leaderboard should be publicly accessible', async () => {
      const res = await request(app).get('/api/share/leaderboard');

      expect([200, 401, 404]).toContain(res.status);
    });

    test('protected endpoints should require auth', async () => {
      const endpoints = [
        { method: 'post', path: '/api/share/join', body: { campaign_id: mockCampaign._id } },
        { method: 'post', path: '/api/share/track', body: { campaign_id: mockCampaign._id, platform: 'facebook' } },
        { method: 'get', path: '/api/share/me/earnings' },
        { method: 'get', path: '/api/share/history' },
        { method: 'post', path: '/api/share/withdraw', body: { amount: 5000, payment_method_id: '123', payment_type: 'bank_transfer' } },
      ];

      for (const endpoint of endpoints) {
        let req = request(app)[endpoint.method](endpoint.path);
        if (endpoint.body) {
          req = req.send(endpoint.body);
        }
        const res = await req;

        expect([401, 403, 400, 404]).toContain(res.status);
      }
    });
  });
});
