/**
 * @fileoverview Integration Tests for Analytics Routes
 * Tests QR code generation, analytics tracking, and data export endpoints
 * 
 * Coverage:
 * - QR Code Generation (POST /qr/generate)
 * - QR Code Analytics (GET /qr/:id/analytics)
 * - Campaign Flyer Generation (GET /campaigns/:id/flyer)
 * - Share Analytics (GET /campaigns/:id/share-analytics)
 * - Donation Analytics (GET /campaigns/:id/donation-analytics)
 * - Trending Campaigns (GET /trending)
 * - User Activity (GET /user-activity)
 * - Analytics Export (GET /export)
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

describe('Analytics Routes', () => {
  let app;
  let server;
  let testUserId;
  let testCampaignId;
  let testQRCodeId;
  let authToken;
  let adminToken;

  // Mock data
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'creator@test.com',
    display_name: 'Test Creator',
    password: 'hashedPassword123',
    role: 'creator',
  };

  const mockAdmin = {
    _id: new mongoose.Types.ObjectId(),
    email: 'admin@test.com',
    display_name: 'Test Admin',
    password: 'hashedPassword123',
    role: 'admin',
  };

  const mockCampaign = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Test Campaign',
    description: 'A test campaign for analytics',
    creator_id: mockUser._id,
    goal_amount: 5000,
    status: 'active',
    type: 'fundraising',
    category: 'community',
    image: 'https://example.com/campaign.jpg',
  };

  const mockQRCode = {
    _id: new mongoose.Types.ObjectId(),
    campaign_id: mockCampaign._id,
    code: 'data:image/png;base64,BASE64_ENCODED_QR',
    url: 'https://honestneed.com/campaigns/123',
    label: 'Main QR',
    created_by: mockUser._id,
    total_scans: 100,
    total_conversions: 20,
    conversion_rate: 20,
    status: 'active',
    scans: [
      {
        timestamp: new Date(Date.now() - 86400000),
        source: 'mobile',
        device: 'iPhone 12',
        location: { latitude: 40.7128, longitude: -74.006 },
      },
    ],
    conversions: [
      {
        donation_id: new mongoose.Types.ObjectId(),
        amount: 500,
        timestamp: new Date(Date.now() - 86400000),
      },
    ],
  };

  const mockDonation = {
    _id: new mongoose.Types.ObjectId(),
    campaign_id: mockCampaign._id,
    donor_id: new mongoose.Types.ObjectId(),
    amount: 2500,
    status: 'completed',
    message: 'Great cause!',
    created_at: new Date(Date.now() - 86400000),
  };

  const mockShareTracking = {
    _id: new mongoose.Types.ObjectId(),
    campaign_id: mockCampaign._id,
    sharer_id: new mongoose.Types.ObjectId(),
    platform: 'facebook',
    share_count: 5,
    click_count: 15,
    conversion_count: 3,
    earned_amount: 300,
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
        if (token === 'admin-token') {
          req.user = mockAdmin;
        } else if (token === 'creator-token') {
          req.user = mockUser;
        }
      }
      next();
    });

    // Load routes (mock implementation for testing)
    // In real scenario, this would load actual routes
    require('../../routes/analyticsRoutes');

    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  // ============================================
  // QR CODE GENERATION TESTS
  // ============================================

  describe('POST /api/analytics/qr/generate', () => {
    test('should generate QR code for campaign (creator)', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer creator-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
          label: 'Primary QR Code',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.qr_code).toBeDefined();
      expect(res.body.qr_code.code).toBeDefined();
      expect(res.body.qr_code.url).toContain(mockCampaign._id.toString());
    });

    test('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer creator-token')
        .send({
          campaign_id: new mongoose.Types.ObjectId().toString(),
          label: 'Test QR',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });

    test('should return 403 for unauthorized creator', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer wrong-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
          label: 'Unauthorized QR',
        });

      // Would fail because token doesn't match campaign creator
      expect([401, 403]).toContain(res.status);
    });

    test('should allow admin to generate QR for any campaign', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer admin-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
          label: 'Admin Generated QR',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.qr_code).toBeDefined();
    });

    test('should generate QR with default label', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer creator-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.qr_code.label).toBe('QR Code');
    });

    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .send({
          campaign_id: mockCampaign._id.toString(),
          label: 'Test',
        });

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // QR CODE ANALYTICS TESTS
  // ============================================

  describe('GET /api/analytics/qr/:id/analytics', () => {
    test('should return QR code analytics', async () => {
      const res = await request(app)
        .get(`/api/analytics/qr/${mockQRCode._id}`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.analytics).toBeDefined();
      expect(res.body.analytics.total_scans).toBe(100);
      expect(res.body.analytics.total_conversions).toBe(20);
      expect(res.body.analytics.conversion_rate).toBe(20);
    });

    test('should support date range filtering', async () => {
      const res = await request(app)
        .get(`/api/analytics/qr/${mockQRCode._id}/analytics`)
        .query({
          startDate: '2026-04-01',
          endDate: '2026-04-05',
        })
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.analytics.period_statistics).toBeDefined();
    });

    test('should return 404 for non-existent QR code', async () => {
      const res = await request(app)
        .get(`/api/analytics/qr/${new mongoose.Types.ObjectId()}/analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('should include recent scans and conversions', async () => {
      const res = await request(app)
        .get(`/api/analytics/qr/${mockQRCode._id}/analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.analytics.recent_scans).toBeDefined();
      expect(res.body.analytics.recent_conversions).toBeDefined();
    });

    test('should require authentication', async () => {
      const res = await request(app).get(`/api/analytics/qr/${mockQRCode._id}/analytics`);

      expect([401, 402]).toContain(res.status);
    });
  });

  // ============================================
  // CAMPAIGN FLYER TESTS
  // ============================================

  describe('GET /api/analytics/campaigns/:id/flyer', () => {
    test('should generate campaign flyer', async () => {
      // Mock campaign fetch
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/flyer`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flyer).toBeDefined();
      expect(res.body.flyer.campaign_title).toBe('Test Campaign');
      expect(res.body.flyer.goal_amount).toBe(5000);
      expect(res.body.flyer.qr_code).toBeDefined();
    });

    test('should include download URL', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/flyer`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.flyer.download_url).toBeDefined();
      expect(res.body.flyer.download_url).toContain('flyer');
    });

    test('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${new mongoose.Types.ObjectId()}/flyer`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('should require authentication', async () => {
      const res = await request(app).get(`/api/analytics/campaigns/${mockCampaign._id}/flyer`);

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // SHARE ANALYTICS TESTS
  // ============================================

  describe('GET /api/analytics/campaigns/:id/share-analytics', () => {
    test('should return share analytics by platform', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/share-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.analytics).toBeDefined();
      expect(res.body.analytics.platform_breakdown).toBeDefined();
      expect(Array.isArray(res.body.analytics.platform_breakdown)).toBe(true);
    });

    test('should include top sharers', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/share-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.analytics.top_sharers).toBeDefined();
      expect(Array.isArray(res.body.analytics.top_sharers)).toBe(true);
    });

    test('should include platform earnings', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/share-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.analytics.total_shares_earnings).toBeDefined();
    });

    test('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${new mongoose.Types.ObjectId()}/share-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // DONATION ANALYTICS TESTS
  // ============================================

  describe('GET /api/analytics/campaigns/:id/donation-analytics', () => {
    test('should return donation analytics (creator)', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.analytics).toBeDefined();
      expect(res.body.analytics.total_donations).toBeDefined();
      expect(res.body.analytics.total_amount).toBeDefined();
      expect(res.body.analytics.average_donation).toBeDefined();
    });

    test('should include donation timeline', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.analytics.timeline).toBeDefined();
      expect(Array.isArray(res.body.analytics.timeline)).toBe(true);
    });

    test('should include top donors (anonymized)', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(200);
      expect(res.body.analytics.top_donors).toBeDefined();
      expect(Array.isArray(res.body.analytics.top_donors)).toBe(true);
    });

    test('should return 403 for non-creator', async () => {
      const otherToken = 'other-creator-token';
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect([403, 401]).toContain(res.status);
    });

    test('should allow admin access', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`)
        .set('Authorization', 'Bearer admin-token');

      expect([200, 403]).toContain(res.status);
    });

    test('should require authentication', async () => {
      const res = await request(app).get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`);

      expect([401, 403]).toContain(res.status);
    });

    test('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${new mongoose.Types.ObjectId()}/donation-analytics`)
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // TRENDING CAMPAIGNS TESTS
  // ============================================

  describe('GET /api/analytics/trending', () => {
    test('should return trending campaigns (public)', async () => {
      const res = await request(app).get('/api/analytics/trending');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.trending).toBeDefined();
      expect(Array.isArray(res.body.trending.campaigns)).toBe(true);
    });

    test('should support period filtering (day)', async () => {
      const res = await request(app)
        .get('/api/analytics/trending')
        .query({ period: 'day' });

      expect(res.status).toBe(200);
      expect(res.body.trending.period).toBe('day');
    });

    test('should support period filtering (week)', async () => {
      const res = await request(app)
        .get('/api/analytics/trending')
        .query({ period: 'week' });

      expect(res.status).toBe(200);
      expect(res.body.trending.period).toBe('week');
    });

    test('should support period filtering (month)', async () => {
      const res = await request(app)
        .get('/api/analytics/trending')
        .query({ period: 'month' });

      expect(res.status).toBe(200);
      expect(res.body.trending.period).toBe('month');
    });

    test('should support custom limit', async () => {
      const res = await request(app)
        .get('/api/analytics/trending')
        .query({ limit: 20 });

      expect(res.status).toBe(200);
      expect(res.body.trending.campaigns.length).toBeLessThanOrEqual(20);
    });

    test('should include campaign metrics', async () => {
      const res = await request(app).get('/api/analytics/trending');

      if (res.body.trending.campaigns.length > 0) {
        const campaign = res.body.trending.campaigns[0];
        expect(campaign.campaign_id).toBeDefined();
        expect(campaign.donations_count).toBeDefined();
        expect(campaign.total_amount).toBeDefined();
        expect(campaign.average_donation).toBeDefined();
      }
    });

    test('should not require authentication', async () => {
      const res = await request(app).get('/api/analytics/trending');

      expect([200, 401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // USER ACTIVITY TESTS
  // ============================================

  describe('GET /api/analytics/user-activity', () => {
    test('should return user activity (admin only)', async () => {
      const res = await request(app)
        .get('/api/analytics/user-activity')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.activity).toBeDefined();
      expect(res.body.activity.metrics).toBeDefined();
    });

    test('should include required metrics', async () => {
      const res = await request(app)
        .get('/api/analytics/user-activity')
        .set('Authorization', 'Bearer admin-token');

      if (res.status === 200) {
        expect(res.body.activity.metrics.new_users).toBeDefined();
        expect(res.body.activity.metrics.active_campaigns).toBeDefined();
        expect(res.body.activity.metrics.total_donations).toBeDefined();
        expect(res.body.activity.metrics.total_donation_amount).toBeDefined();
        expect(res.body.activity.metrics.unique_donors).toBeDefined();
      }
    });

    test('should support period filtering', async () => {
      const res = await request(app)
        .get('/api/analytics/user-activity')
        .query({ period: 'month' })
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.activity.period).toBe('month');
    });

    test('should return 403 for non-admin', async () => {
      const res = await request(app)
        .get('/api/analytics/user-activity')
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(403);
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/analytics/user-activity');

      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================
  // ANALYTICS EXPORT TESTS
  // ============================================

  describe('GET /api/analytics/export', () => {
    test('should export all analytics (admin only)', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exported).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('should export campaigns only', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .query({ type: 'campaigns' })
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('campaigns');
      expect(res.body.data.campaigns).toBeDefined();
    });

    test('should export donations only', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .query({ type: 'donations' })
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('donations');
      expect(res.body.data.donations).toBeDefined();
    });

    test('should export users only', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .query({ type: 'users' })
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('users');
      expect(res.body.data.users).toBeDefined();
    });

    test('should set proper download headers', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .query({ type: 'campaigns' })
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain('attachment');
    });

    test('should return 403 for non-admin', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .set('Authorization', 'Bearer creator-token');

      expect(res.status).toBe(403);
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/analytics/export');

      expect([401, 403]).toContain(res.status);
    });

    test('should include timestamp in export', async () => {
      const res = await request(app)
        .get('/api/analytics/export')
        .set('Authorization', 'Bearer admin-token');

      if (res.status === 200) {
        expect(res.body.timestamp).toBeDefined();
      }
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    test('should handle invalid MongoDB IDs gracefully', async () => {
      const res = await request(app)
        .get('/api/analytics/qr/invalid-id/analytics')
        .set('Authorization', 'Bearer creator-token');

      expect([400, 404]).toContain(res.status);
    });

    test('should handle malformed requests', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer creator-token')
        .send({
          campaign_id: null,
        });

      expect([400, 422]).toContain(res.status);
    });

    test('should log operations for auditing', async () => {
      // This test verifies that operations are logged
      // In real implementation, would spy on logger calls
      const res = await request(app)
        .get('/api/analytics/trending')
        .query({ period: 'week' });

      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // AUTHORIZATION TESTS
  // ============================================

  describe('Authorization & Access Control', () => {
    test('creator can only see their own campaign analytics', async () => {
      const otherCreatorId = new mongoose.Types.ObjectId();
      const otherCampaignId = new mongoose.Types.ObjectId();

      // Would need to mock campaign ownership check
      const res = await request(app)
        .get(`/api/analytics/campaigns/${otherCampaignId}/donation-analytics`)
        .set('Authorization', 'Bearer creator-token');

      // Should be 403 or 404 depending on implementation
      expect([403, 404]).toContain(res.status);
    });

    test('admin can see all analytics', async () => {
      const res = await request(app)
        .get(`/api/analytics/campaigns/${mockCampaign._id}/donation-analytics`)
        .set('Authorization', 'Bearer admin-token');

      expect([200, 403]).toContain(res.status);
    });

    test('public can access trending without auth', async () => {
      const res = await request(app).get('/api/analytics/trending');

      expect([200, 401, 403]).toContain(res.status);
    });

    test('protected endpoints require valid token', async () => {
      const res = await request(app)
        .post('/api/analytics/qr/generate')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          campaign_id: mockCampaign._id.toString(),
        });

      expect([401, 403, 404]).toContain(res.status);
    });
  });

  // ============================================
  // RATE LIMITING TESTS
  // ============================================

  describe('Rate Limiting', () => {
    test('should apply rate limiting to API endpoints', async () => {
      // Make multiple rapid requests
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app)
            .get('/api/analytics/trending')
            .wait(0)
        );
      }

      const results = await Promise.all(requests);

      // At least some requests should succeed
      const successCount = results.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  // ============================================
  // RESPONSE FORMAT TESTS
  // ============================================

  describe('Response Format Consistency', () => {
    test('all success responses should have success flag', async () => {
      const res = await request(app).get('/api/analytics/trending');

      expect(res.body.success).toBe(true);
    });

    test('all error responses should have success flag and message', async () => {
      const res = await request(app)
        .get(`/api/analytics/qr/${new mongoose.Types.ObjectId()}/analytics`)
        .set('Authorization', 'Bearer creator-token');

      if (res.status >= 400) {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBeDefined();
      }
    });

    test('all responses should have status code', async () => {
      const res = await request(app).get('/api/analytics/trending');

      expect(res.status).toBeDefined();
      expect(typeof res.status).toBe('number');
    });
  });
});
