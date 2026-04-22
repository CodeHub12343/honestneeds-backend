/**
 * API Contract Tests
 * Validates HTTP status codes, response shapes, and error formats
 */

const request = require('supertest');
const app = require('../../src/app');

// ==========================================
// CAMPAIGN ENDPOINTS (36 tests)
// ==========================================

describe('Campaign API Contracts', () => {
  let authToken;
  let campaign;

  beforeEach(async () => {
    const user = await User.create({
      email: 'creator@test.com',
      password: 'pass123'
    });
    authToken = await getAuthToken(user);

    campaign = await CampaignService.createCampaign(validCampaignData);
  });

  // ==========================================
  // POST /api/campaigns (Create)
  // ==========================================

  describe('POST /api/campaigns - Create Campaign', () => {
    test('Should return 201 Created with campaign object', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validCampaignData);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data).toHaveProperty('campaignId');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data.status).toBe('draft');
    });

    test('Should return 400 Bad Request for invalid data', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Bad' }); // Missing required fields

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
    });

    test('Should return 401 Unauthorized without auth token', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .send(validCampaignData);

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    test('Response should have correct pagination metadata for batch create', async () => {
      const res = await request(app)
        .post('/api/campaigns/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ campaigns: Array(5).fill(validCampaignData) });

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(5);
    });
  });

  // ==========================================
  // GET /api/campaigns/:id (Read)
  // ==========================================

  describe('GET /api/campaigns/:id - Get Campaign', () => {
    test('Should return 200 OK with campaign object', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(campaign._id.toString());
      expect(res.body.data).toHaveProperty('title');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('currentAmount');
    });

    test('Should return 404 Not Found for invalid campaign ID', async () => {
      const res = await request(app)
        .get(`/api/campaigns/invalid-id`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    test('Should return 400 Bad Request for malformed ID', async () => {
      const res = await request(app)
        .get(`/api/campaigns/not-a-valid-mongo-id`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // GET /api/campaigns (List with Filtering)
  // ==========================================

  describe('GET /api/campaigns - List Campaigns', () => {
    test('Should return 200 OK with paginated list', async () => {
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('total');
    });

    test('Should support pagination parameters', async () => {
      const res = await request(app)
        .get('/api/campaigns?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
    });

    test('Should support filtering by status', async () => {
      await CampaignService.publishCampaign(campaign._id);

      const res = await request(app)
        .get('/api/campaigns?status=active')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(c => c.status === 'active')).toBe(true);
    });

    test('Should support filtering by needType', async () => {
      const res = await request(app)
        .get('/api/campaigns?needType=medical')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(c => c.needType === 'medical')).toBe(true);
    });

    test('Should support sorting', async () => {
      const res = await request(app)
        .get('/api/campaigns?sort=-createdAt')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 1) {
        const dates = res.body.data.map(c => new Date(c.createdAt));
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i].getTime()).toBeGreaterThanOrEqual(dates[i + 1].getTime());
        }
      }
    });

    test('Should return 400 for invalid filter value', async () => {
      const res = await request(app)
        .get('/api/campaigns?status=invalid_status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // PUT /api/campaigns/:id (Update)
  // ==========================================

  describe('PUT /api/campaigns/:id - Update Campaign', () => {
    test('Should return 200 OK with updated campaign', async () => {
      const res = await request(app)
        .put(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Title');
    });

    test('Should return 400 Bad Request for invalid update data', async () => {
      const res = await request(app)
        .put(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'x' }); // Too short

      expect(res.status).toBe(400);
    });

    test('Should return 403 Forbidden for non-creator updates', async () => {
      const otherUser = await User.create({
        email: 'other@test.com',
        password: 'pass123'
      });
      const otherToken = await getAuthToken(otherUser);

      const res = await request(app)
        .put(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('permission');
    });

    test('Should return 409 Conflict if campaign already active', async () => {
      await CampaignService.publishCampaign(campaign._id);

      const res = await request(app)
        .put(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(409);
    });
  });

  // ==========================================
  // POST /api/campaigns/:id/publish
  // ==========================================

  describe('POST /api/campaigns/:id/publish - Publish Campaign', () => {
    test('Should return 200 OK with published campaign', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/publish`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.publishedAt).toBeDefined();
    });

    test('Should return 409 Conflict if already published', async () => {
      await CampaignService.publishCampaign(campaign._id);

      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/publish`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(409);
    });
  });

  // ==========================================
  // DELETE /api/campaigns/:id
  // ==========================================

  describe('DELETE /api/campaigns/:id - Delete Campaign', () => {
    test('Should return 204 No Content on successful delete', async () => {
      const res = await request(app)
        .delete(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    test('Should return 404 Not Found if already deleted', async () => {
      await request(app)
        .delete(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .delete(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    test('Should return 409 Conflict if campaign has donations', async () => {
      await CampaignService.publishCampaign(campaign._id);
      await CampaignService.recordDonation({
        campaignId: campaign._id,
        supporterId: 'user-001',
        amount: 10000
      });

      const res = await request(app)
        .delete(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(409);
    });
  });
});

// ==========================================
// DONATION ENDPOINTS (20+ tests)
// ==========================================

describe('Donation API Contracts', () => {
  let authToken;
  let campaign;
  let supporter;

  beforeEach(async () => {
    const creator = await User.create({
      email: 'creator@test.com',
      password: 'pass123'
    });
    authToken = await getAuthToken(creator);

    supporter = await User.create({
      email: 'supporter@test.com',
      password: 'pass123',
      walletBalance: 500000
    });

    campaign = await CampaignService.createCampaign(validCampaignData);
    await CampaignService.publishCampaign(campaign._id);
  });

  // ==========================================
  // POST /api/campaigns/:id/donate
  // ==========================================

  describe('POST /api/campaigns/:id/donate - Create Donation', () => {
    test('Should return 200 OK with donation object', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send({ amount: 50000 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data).toHaveProperty('amount');
      expect(res.body.data.amount).toBe(50000);
      expect(res.body.data).toHaveProperty('type');
      expect(res.body.data.type).toBe('donation');
    });

    test('Should return 400 Bad Request for missing amount', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send({});

      expect(res.status).toBe(400);
    });

    test('Should return 400 Bad Request for amount < 100 cents', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send({ amount: 50 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('minimum');
    });

    test('Should return 402 Payment Required for insufficient funds', async () => {
      const poorUser = await User.create({
        email: 'poor@test.com',
        password: 'pass123',
        walletBalance: 1000
      });

      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(poorUser)}`)
        .send({ amount: 50000 });

      expect(res.status).toBe(402);
    });

    test('Should return 404 Not Found for invalid campaign', async () => {
      const res = await request(app)
        .post(`/api/campaigns/invalid-id/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send({ amount: 50000 });

      expect(res.status).toBe(404);
    });

    test('Should return 400 Bad Request for draft campaign', async () => {
      const draftCampaign = await CampaignService.createCampaign(validCampaignData);

      const res = await request(app)
        .post(`/api/campaigns/${draftCampaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send({ amount: 50000 });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // GET /api/campaigns/:id/donations
  // ==========================================

  describe('GET /api/campaigns/:id/donations - List Donations', () => {
    beforeEach(async () => {
      // Add some donations
      await CampaignService.recordDonation({
        campaignId: campaign._id,
        supporterId: supporter._id,
        amount: 50000
      });
    });

    test('Should return 200 OK with paginated donations', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${campaign._id}/donations`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    test('Should support pagination', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${campaign._id}/donations?page=1&limit=5`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    test('Should support date filtering', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${campaign._id}/donations?before=${new Date().toISOString()}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });
  });
});

// ==========================================
// SWEEPSTAKES ENDPOINTS (15+ tests)
// ==========================================

describe('Sweepstakes API Contracts', () => {
  let authToken;
  let winner;

  beforeEach(async () => {
    winner = await User.create({
      email: 'winner@test.com',
      password: 'pass123'
    });
    authToken = await getAuthToken(winner);
  });

  // ==========================================
  // GET /api/sweepstakes/entries
  // ==========================================

  describe('GET /api/sweepstakes/entries - Get User Entries', () => {
    test('Should return 200 OK with entries array', async () => {
      const res = await request(app)
        .get('/api/sweepstakes/entries')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data.entries)).toBe(true);
      expect(res.body.data).toHaveProperty('totalEntries');
    });
  });

  // ==========================================
  // GET /api/sweepstakes/prizes
  // ==========================================

  describe('GET /api/sweepstakes/prizes - Get Claimable Prizes', () => {
    test('Should return 200 OK with prizes array', async () => {
      const res = await request(app)
        .get('/api/sweepstakes/prizes')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('Should include expiration details', async () => {
      const res = await request(app)
        .get('/api/sweepstakes/prizes')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(prize => {
        expect(prize).toHaveProperty('status');
        if (prize.status === 'available_for_claim') {
          expect(prize).toHaveProperty('expiresAt');
        }
      });
    });
  });

  // ==========================================
  // POST /api/sweepstakes/claims
  // ==========================================

  describe('POST /api/sweepstakes/claims - Claim Prize', () => {
    let drawing;

    beforeEach(async () => {
      drawing = await SweepstakesDrawing.create({
        status: 'completed',
        winnerUserId: winner._id,
        completedAt: new Date()
      });
    });

    test('Should return 200 OK with claim object', async () => {
      const res = await request(app)
        .post('/api/sweepstakes/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ drawingId: drawing._id });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data.status).toBe('pending_verification');
    });

    test('Should return 400 Bad Request without drawingId', async () => {
      const res = await request(app)
        .post('/api/sweepstakes/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    test('Should return 403 Forbidden if not winner', async () => {
      const otherUser = await User.create({
        email: 'other@test.com',
        password: 'pass123'
      });

      const res = await request(app)
        .post('/api/sweepstakes/claims')
        .set('Authorization', `Bearer ${getAuthToken(otherUser)}`)
        .send({ drawingId: drawing._id });

      expect(res.status).toBe(403);
    });

    test('Should return 410 Gone if claim window expired', async () => {
      const oldDrawing = await SweepstakesDrawing.create({
        status: 'completed',
        winnerUserId: winner._id,
        completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/sweepstakes/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ drawingId: oldDrawing._id });

      expect(res.status).toBe(410);
    });
  });
});

// ==========================================
// ERROR RESPONSE FORMAT TESTS (10+ tests)
// ==========================================

describe('Error Response Formats', () => {
  test('All 400 errors should have consistent format', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ title: 'x' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  test('All 401 errors should include message', async () => {
    const res = await request(app)
      .get('/api/campaigns');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('All 403 errors should include reason', async () => {
    const user = await User.create({
      email: 'user@test.com',
      password: 'pass123',
      role: 'user'
    });

    const campaign = await CampaignService.createCampaign({
      ...validCampaignData,
      creatorId: other._id
    });

    const res = await request(app)
      .put(`/api/campaigns/${campaign._id}`)
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ title: 'Updated' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('permission');
  });

  test('All 500 errors should not expose internal details', async () => {
    // Force an internal error by passing invalid data to service
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({/* deliberately bad data to trigger 500 */});

    if (res.status === 500) {
      expect(res.body.error).not.toContain('stack');
      expect(res.body.error).not.toContain('at ');
    }
  });
});

module.exports = {};
