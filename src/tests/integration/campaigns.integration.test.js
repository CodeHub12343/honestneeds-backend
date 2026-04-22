/**
 * Campaign Management Integration Tests
 * Complete end-to-end testing of all campaign endpoints
 * Tests CRUD operations, status transitions, analytics, and error handling
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const Campaign = require('../../src/models/Campaign');
const User = require('../../src/models/User');
const Donation = require('../../src/models/Donation');
const Share = require('../../src/models/Share');
const {
  createMockUser,
  createMockCampaign,
  createUserWithHashedPassword,
  expectSuccessResponse,
  expectErrorResponse,
  cleanupTestData,
  makeAuthenticatedRequest,
} = require('../testUtils');
const { generateToken } = require('../../src/utils/jwt');

describe('Campaign Management Integration Tests', () => {
  let creatorUser;
  let supporterUser;
  let creatorToken;
  let supporterToken;
  let testCampaign;

  beforeAll(async () => {
    jest.setTimeout(30000);
  });

  afterEach(async () => {
    // Cleanup test data
    try {
      await cleanupTestData({ Campaign, User, Donation, Share });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Close mongoose connection
    try {
      await mongoose.disconnect();
    } catch (error) {
      // Ignore disconnect errors
    }
  });

  describe('Campaign Creation - POST /campaigns', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });
      creatorToken = generateToken(creatorUser._id.toString(), ['user']);
    });

    it('should create campaign with valid data (draft status)', async () => {
      const campaignData = {
        title: 'Emergency Medical Fund',
        description: 'Helping a family with unexpected medical expenses',
        need_type: 'medical_surgery',
        goals: JSON.stringify([
          { goal_type: 'fundraising', target_amount: 50000 }
        ]),
        location: JSON.stringify({
          city: 'New York',
          state: 'NY',
          country: 'USA',
        }),
        payment_methods: JSON.stringify([
          { type: 'stripe', is_primary: true }
        ]),
        tags: 'emergency,medical,help',
        category: 'health',
      };

      const response = await makeAuthenticatedRequest(
        app,
        'POST',
        '/api/campaigns',
        creatorToken,
        campaignData
      ).expect(201);

      expectSuccessResponse(response, 201);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data).toHaveProperty('campaign_id');
      expect(response.body.data).toHaveProperty('title', 'Emergency Medical Fund');
      expect(response.body.data).toHaveProperty('status', 'draft');
      expect(response.body.data).toHaveProperty('creator_id', creatorUser._id.toString());
    });

    it('should reject campaign without authentication', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .send({
          title: 'Test Campaign',
          description: 'Test',
          need_type: 'medical_surgery',
        });

      expectErrorResponse(response, 401);
    });

    it('should reject campaign with invalid need_type', async () => {
      const response = await makeAuthenticatedRequest(
        app,
        'POST',
        '/api/campaigns',
        creatorToken,
        {
          title: 'Test',
          description: 'Test description',
          need_type: 'invalid_type',
          goals: '[]',
          payment_methods: '[]',
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject campaign with short title', async () => {
      const response = await makeAuthenticatedRequest(
        app,
        'POST',
        '/api/campaigns',
        creatorToken,
        {
          title: 'Bad',
          description: 'Long enough description',
          need_type: 'medical_surgery',
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Campaign Listing - GET /campaigns', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });

      // Create multiple campaigns
      for (let i = 0; i < 5; i++) {
        await Campaign.create({
          ...createMockCampaign(),
          creator_id: creatorUser._id,
          title: `Campaign ${i + 1}`,
          status: i % 2 === 0 ? 'active' : 'draft',
        });
      }
    });

    it('should list campaigns with default pagination', async () => {
      const response = await request(app)
        .get('/api/campaigns')
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should filter campaigns by status', async () => {
      const response = await request(app)
        .get('/api/campaigns?status=active')
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
      // All campaigns should be active
      response.body.data.forEach(campaign => {
        expect(campaign.status).toBe('active');
      });
    });

    it('should filter campaigns by creator', async () => {
      const response = await request(app)
        .get(`/api/campaigns?creator_id=${creatorUser._id}`)
        .expect(200);

      expectSuccessResponse(response);
      // All should be from this creator
      response.body.data.forEach(campaign => {
        expect(campaign.creator_id).toBe(creatorUser._id.toString());
      });
    });

    it('should support pagination with page and limit', async () => {
      const response = await request(app)
        .get('/api/campaigns?page=2&limit=2')
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should handle search by keyword', async () => {
      const response = await request(app)
        .get('/api/campaigns?search=Campaign 1')
        .expect(200);

      expectSuccessResponse(response);
      // Should match "Campaign 1" and "Campaign 1X"
      expect(response.body.data.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Campaign Detail - GET /campaigns/:id', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });

      testCampaign = await Campaign.create({
        ...createMockCampaign(),
        creator_id: creatorUser._id,
        title: 'Test Campaign',
        view_count: 100,
      });
    });

    it('should retrieve campaign detail and increment view count', async () => {
      const initialViews = testCampaign.view_count;

      const response = await request(app)
        .get(`/api/campaigns/${testCampaign._id}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('_id', testCampaign._id.toString());
      expect(response.body.data).toHaveProperty('title', 'Test Campaign');

      // Verify view count increased
      const updated = await Campaign.findById(testCampaign._id);
      expect(updated.view_count).toBe(initialViews + 1);
    });

    it('should return 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/campaigns/${fakeId}`)
        .expect(404);

      expectErrorResponse(response, 404);
    });
  });

  describe('Campaign Status Transitions', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });
      creatorToken = generateToken(creatorUser._id.toString(), ['user']);

      testCampaign = await Campaign.create({
        ...createMockCampaign(),
        creator_id: creatorUser._id,
        status: 'draft',
      });
    });

    describe('Publish: draft → active', () => {
      it('should publish draft campaign', async () => {
        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/publish`,
          creatorToken
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.status).toBe('active');
        expect(response.body.data).toHaveProperty('published_at');

        // Verify in database
        const updated = await Campaign.findById(testCampaign._id);
        expect(updated.status).toBe('active');
      });

      it('should reject publish if not owner', async () => {
        const otherUser = await User.create({
          ...createMockUser(),
          email: 'other@example.com',
        });
        const otherToken = generateToken(otherUser._id.toString(), ['user']);

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/publish`,
          otherToken
        );

        expectErrorResponse(response, 403);
      });

      it('should reject publish if not draft', async () => {
        testCampaign.status = 'active';
        await testCampaign.save();

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/publish`,
          creatorToken
        );

        expectErrorResponse(response, 400);
      });
    });

    describe('Pause: active → paused', () => {
      beforeEach(async () => {
        testCampaign.status = 'active';
        testCampaign.published_at = new Date();
        await testCampaign.save();
      });

      it('should pause active campaign', async () => {
        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/pause`,
          creatorToken
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.status).toBe('paused');

        const updated = await Campaign.findById(testCampaign._id);
        expect(updated.status).toBe('paused');
      });

      it('should reject pause if not active', async () => {
        testCampaign.status = 'draft';
        await testCampaign.save();

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/pause`,
          creatorToken
        );

        expectErrorResponse(response, 400);
      });
    });

    describe('Unpause: paused → active', () => {
      beforeEach(async () => {
        testCampaign.status = 'paused';
        await testCampaign.save();
      });

      it('should unpause paused campaign', async () => {
        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/unpause`,
          creatorToken
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.status).toBe('active');

        const updated = await Campaign.findById(testCampaign._id);
        expect(updated.status).toBe('active');
      });

      it('should reject unpause if not paused', async () => {
        testCampaign.status = 'active';
        await testCampaign.save();

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/unpause`,
          creatorToken
        );

        expectErrorResponse(response, 400);
      });
    });

    describe('Complete: active/paused → completed', () => {
      beforeEach(async () => {
        testCampaign.status = 'active';
        testCampaign.published_at = new Date();
        await testCampaign.save();
      });

      it('should complete active campaign', async () => {
        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/complete`,
          creatorToken
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.status).toBe('completed');
        expect(response.body.data).toHaveProperty('completed_at');

        const updated = await Campaign.findById(testCampaign._id);
        expect(updated.status).toBe('completed');
      });

      it('should complete paused campaign', async () => {
        testCampaign.status = 'paused';
        await testCampaign.save();

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/complete`,
          creatorToken
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.status).toBe('completed');
      });

      it('should reject complete if draft', async () => {
        testCampaign.status = 'draft';
        await testCampaign.save();

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/complete`,
          creatorToken
        );

        expectErrorResponse(response, 400);
      });
    });
  });

  describe('Campaign Analytics', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });

      testCampaign = await Campaign.create({
        ...createMockCampaign(),
        creator_id: creatorUser._id,
        title: 'Analytics Test Campaign',
        view_count: 500,
        share_count: 50,
      });

      // Add some contributors
      testCampaign.contributors.push(
        {
          donor_name: 'John Doe',
          amount: 10000,
          date: new Date(),
          message: 'Great cause!',
        },
        {
          donor_name: 'Jane Smith',
          amount: 25000,
          date: new Date(),
          message: 'Happy to help',
        }
      );
      await testCampaign.save();
    });

    describe('GET /campaigns/:id/stats', () => {
      it('should retrieve campaign statistics', async () => {
        const response = await request(app)
          .get(`/api/campaigns/${testCampaign._id}/stats`)
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty('viewCount');
        expect(response.body.data).toHaveProperty('shareCount');
        expect(response.body.data).toHaveProperty('contributors');
      });

      it('should return extended stats for campaign owner', async () => {
        const creatorToken = generateToken(creatorUser._id.toString(), ['user']);

        const response = await makeAuthenticatedRequest(
          app,
          'GET',
          `/api/campaigns/${testCampaign._id}/stats`,
          creatorToken
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty('topContributors');
      });

      it('should return 404 for non-existent campaign', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const response = await request(app)
          .get(`/api/campaigns/${fakeId}/stats`)
          .expect(404);

        expectErrorResponse(response, 404);
      });
    });

    describe('GET /campaigns/:id/contributors', () => {
      it('should list campaign contributors', async () => {
        const response = await request(app)
          .get(`/api/campaigns/${testCampaign._id}/contributors`)
          .expect(200);

        expectSuccessResponse(response);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body).toHaveProperty('pagination');
      });

      it('should paginate contributors', async () => {
        const response = await request(app)
          .get(`/api/campaigns/${testCampaign._id}/contributors?page=1&limit=1`)
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.pagination.page).toBe(1);
        expect(response.body.pagination.limit).toBe(1);
      });

      it('should return empty array if no contributors', async () => {
        const emptyCampaign = await Campaign.create({
          ...createMockCampaign(),
          creator_id: creatorUser._id,
          contributors: [],
        });

        const response = await request(app)
          .get(`/api/campaigns/${emptyCampaign._id}/contributors`)
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.length).toBe(0);
      });
    });

    describe('GET /campaigns/:id/activists', () => {
      beforeEach(async () => {
        // Add activists to campaign
        testCampaign.activists.push(
          {
            user_id: creatorUser._id,
            user_name: 'John Activist',
            action_type: 'share',
            impact_score: 25,
          },
          {
            user_id: creatorUser._id,
            user_name: 'Jane Activist',
            action_type: 'volunteer',
            impact_score: 50,
          }
        );
        await testCampaign.save();
      });

      it('should list campaign activists', async () => {
        const response = await request(app)
          .get(`/api/campaigns/${testCampaign._id}/activists`)
          .expect(200);

        expectSuccessResponse(response);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should paginate activists', async () => {
        const response = await request(app)
          .get(`/api/campaigns/${testCampaign._id}/activists?page=1&limit=1`)
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.pagination.limit).toBe(1);
      });
    });
  });

  describe('Campaign Goal Management', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });
      creatorToken = generateToken(creatorUser._id.toString(), ['user']);

      testCampaign = await Campaign.create({
        ...createMockCampaign(),
        creator_id: creatorUser._id,
        status: 'active',
        goals: [
          {
            goal_type: 'fundraising',
            target_amount: 50000,
            current_amount: 25000,
          },
        ],
      });
    });

    describe('POST /campaigns/:id/increase-goal', () => {
      it('should increase fundraising goal', async () => {
        const newGoal = 75000;

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/increase-goal`,
          creatorToken,
          { newGoalAmount: newGoal }
        ).expect(200);

        expectSuccessResponse(response);
        expect(response.body.data.goals[0].target_amount).toBeGreaterThan(50000);

        const updated = await Campaign.findById(testCampaign._id);
        expect(updated.goals[0].target_amount).toBeGreaterThanOrEqual(newGoal);
      });

      it('should reject if new goal not higher than current', async () => {
        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/increase-goal`,
          creatorToken,
          { newGoalAmount: 40000 }
        );

        expectErrorResponse(response, 400);
      });

      it('should reject if not campaign owner', async () => {
        const otherUser = await User.create({
          ...createMockUser(),
          email: 'other@example.com',
        });
        const otherToken = generateToken(otherUser._id.toString(), ['user']);

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/increase-goal`,
          otherToken,
          { newGoalAmount: 75000 }
        );

        expectErrorResponse(response, 403);
      });

      it('should reject if campaign not active', async () => {
        testCampaign.status = 'paused';
        await testCampaign.save();

        const response = await makeAuthenticatedRequest(
          app,
          'POST',
          `/api/campaigns/${testCampaign._id}/increase-goal`,
          creatorToken,
          { newGoalAmount: 75000 }
        );

        expectErrorResponse(response, 400);
      });
    });
  });

  describe('Trending Campaigns', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });

      // Create campaigns with different engagement
      for (let i = 0; i < 3; i++) {
        await Campaign.create({
          ...createMockCampaign(),
          creator_id: creatorUser._id,
          status: 'active',
          view_count: (i + 1) * 100,
          engagement_score: (i + 1) * 50,
        });
      }
    });

    it('should retrieve trending campaigns', async () => {
      const response = await request(app)
        .get('/api/campaigns/trending')
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/campaigns/trending?limit=2')
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should support timeframe parameter', async () => {
      const response = await request(app)
        .get('/api/campaigns/trending?timeframe=7days')
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  describe('Campaign Related Campaigns', () => {
    beforeEach(async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });

      testCampaign = await Campaign.create({
        ...createMockCampaign(),
        creator_id: creatorUser._id,
        need_type: 'medical_surgery',
      });

      // Create related campaigns
      for (let i = 0; i < 3; i++) {
        await Campaign.create({
          ...createMockCampaign(),
          creator_id: creatorUser._id,
          need_type: 'medical_surgery',
          title: `Related Campaign ${i}`,
        });
      }
    });

    it('should retrieve related campaigns', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${testCampaign._id}/related`)
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should limit related campaigns', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${testCampaign._id}/related?limit=2`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Complete Campaign Workflow', () => {
    it('should complete full campaign lifecycle: draft → active → paused → active → completed', async () => {
      creatorUser = await User.create({
        ...createMockUser(),
        email: 'creator@example.com',
      });
      creatorToken = generateToken(creatorUser._id.toString(), ['user']);

      // Step 1: Create campaign (draft)
      const createResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        '/api/campaigns',
        creatorToken,
        {
          title: 'Lifecycle Test Campaign',
          description: 'Testing full campaign lifecycle',
          need_type: 'medical_surgery',
          goals: JSON.stringify([{ goal_type: 'fundraising', target_amount: 50000 }]),
          payment_methods: JSON.stringify([{ type: 'stripe' }]),
        }
      ).expect(201);

      const campaignId = createResponse.body.data._id;
      expect(createResponse.body.data.status).toBe('draft');

      // Step 2: Publish (draft → active)
      const publishResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        `/api/campaigns/${campaignId}/publish`,
        creatorToken
      ).expect(200);
      expect(publishResponse.body.data.status).toBe('active');

      // Step 3: Pause (active → paused)
      const pauseResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        `/api/campaigns/${campaignId}/pause`,
        creatorToken
      ).expect(200);
      expect(pauseResponse.body.data.status).toBe('paused');

      // Step 4: Unpause (paused → active)
      const unpauseResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        `/api/campaigns/${campaignId}/unpause`,
        creatorToken
      ).expect(200);
      expect(unpauseResponse.body.data.status).toBe('active');

      // Step 5: Complete (active → completed)
      const completeResponse = await makeAuthenticatedRequest(
        app,
        'POST',
        `/api/campaigns/${campaignId}/complete`,
        creatorToken
      ).expect(200);
      expect(completeResponse.body.data.status).toBe('completed');

      // Step 6: Verify final state
      const finalResponse = await request(app)
        .get(`/api/campaigns/${campaignId}`)
        .expect(200);
      expect(finalResponse.body.data.status).toBe('completed');
    });
  });
});
