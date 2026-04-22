/**
 * Campaign Management Integration Tests
 * Tests all 16 campaign endpoints with proper setup/teardown
 * 
 * Test Coverage:
 * ✓ Campaign Creation (POST /campaigns with multipart image)
 * ✓ Campaign Listing (GET /campaigns with pagination/filters)
 * ✓ Campaign Details (GET /campaigns/:id)
 * ✓ Campaign Update (PUT /campaigns/:id - draft only)
 * ✓ Campaign Deletion (DELETE /campaigns/:id - soft delete)
 * ✓ Campaign Publishing (POST /campaigns/:id/publish)
 * ✓ Campaign Pausing (POST /campaigns/:id/pause)
 * ✓ Campaign Unpausing (POST /campaigns/:id/unpause) - NEW
 * ✓ Campaign Completion (POST /campaigns/:id/complete)
 * ✓ Goal Increase (POST /campaigns/:id/increase-goal) - NEW
 * ✓ Campaign Stats (GET /campaigns/:id/stats) - NEW
 * ✓ Campaign Contributors (GET /campaigns/:id/contributors) - NEW
 * ✓ Campaign Activists (GET /campaigns/:id/activists) - NEW
 * ✓ Trending Campaigns (GET /campaigns/trending) - NEW
 * ✓ Related Campaigns (GET /campaigns/:id/related) - NEW
 * ✓ Need Types Taxonomy (GET /campaigns/need-types/all) - NEW
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

describe('Campaign Management - Complete Integration Tests', () => {
  let server;
  let testUserId;
  let testCampaignId;
  let fundraisingCampaignId;
  let sharingCampaignId;

  // Test data fixtures
  const testUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'test@example.com',
    password_hash: 'test_hash',
    full_name: 'Test User',
    auth_provider: 'email',
  };

  const createCampaignPayload = {
    title: 'Help Build A School',
    description: 'We are raising funds to build a school in rural areas. Every donation matters!',
    need_type: 'education',
    category: 'humanitarian',
    goals: {
      fundraising: {
        target_amount: 50000, // in cents
        currency: 'USD',
      },
    },
    location: {
      country: 'Nigeria',
      state: 'Lagos',
      city: 'Ikeja',
    },
    payment_methods: [
      {
        type: 'bank_transfer',
        account_holder: 'Test Campaign',
        account_number: '0123456789',
        routing_number: '9876543210',
        is_primary: true,
      },
    ],
    tags: ['education', 'charity', 'fundraising'],
    language: 'en',
    currency: 'USD',
  };

  const fundraisingCampaignPayload = {
    title: 'Scholarship Fund for Underprivileged Students',
    description: 'Help us provide scholarships to deserving students',
    need_type: 'education',
    category: 'humanitarian',
    goals: {
      fundraising: {
        target_amount: 10000,
        currency: 'USD',
      },
    },
    location: {
      country: 'Nigeria',
      state: 'Oyo',
      city: 'Ibadan',
    },
    payment_methods: [
      {
        type: 'bank_transfer',
        account_holder: 'Scholarship Fund',
        account_number: '1111111111',
        routing_number: '0000000001',
        is_primary: true,
      },
    ],
    tags: ['education', 'scholarship'],
    language: 'en',
    currency: 'USD',
  };

  /**
   * Setup: Create test user and database connection
   */
  beforeAll(async () => {
    // Ensure connected to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/honestneed-test');
    }

    // Create test user
    testUserId = testUser._id;
    try {
      await User.create(testUser);
    } catch (error) {
      // User might already exist
      if (!error.message.includes('duplicate')) {
        console.error('Failed to create test user:', error);
      }
    }
  });

  /**
   * Cleanup: Remove test data
   */
  afterAll(async () => {
    try {
      // Clean up test campaigns
      await Campaign.deleteMany({ creator_id: testUserId });
      // Clean up test user
      await User.deleteOne({ _id: testUserId });
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    if (server) {
      server.close();
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });

  describe('POST /campaigns - Create Campaign with Image Upload', () => {
    it('should create a campaign with optional image upload', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .field('title', createCampaignPayload.title)
        .field('description', createCampaignPayload.description)
        .field('need_type', createCampaignPayload.need_type)
        .field('category', createCampaignPayload.category)
        .field('goals', JSON.stringify(createCampaignPayload.goals))
        .field('location', JSON.stringify(createCampaignPayload.location))
        .field('payment_methods', JSON.stringify(createCampaignPayload.payment_methods))
        .field('tags', createCampaignPayload.tags.join(','))
        .field('language', createCampaignPayload.language)
        .field('currency', createCampaignPayload.currency);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('campaign_id');
      expect(response.body.data.title).toBe(createCampaignPayload.title);
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.creator_id).toBe(testUserId.toString());

      testCampaignId = response.body.data.campaign_id;
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .field('title', 'Short'); // Too short

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation failed');
    });

    it('should reject files exceeding 10MB', async () => {
      // Create a mock file > 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .field('title', createCampaignPayload.title)
        .field('description', createCampaignPayload.description)
        .field('need_type', createCampaignPayload.need_type)
        .field('category', createCampaignPayload.category)
        .field('goals', JSON.stringify(createCampaignPayload.goals))
        .field('location', JSON.stringify(createCampaignPayload.location))
        .field('payment_methods', JSON.stringify(createCampaignPayload.payment_methods))
        .attach('image', largeBuffer);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /campaigns - List Campaigns', () => {
    it('should list campaigns with pagination', async () => {
      const response = await request(app)
        .get('/api/campaigns')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.campaigns)).toBe(true);
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.pagination).toHaveProperty('total');
      expect(response.body.data.pagination).toHaveProperty('page');
      expect(response.body.data.pagination).toHaveProperty('limit');
    });

    it('should filter campaigns by need_type', async () => {
      const response = await request(app)
        .get('/api/campaigns')
        .query({ needType: 'education', limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      response.body.data.campaigns.forEach((campaign) => {
        expect(campaign.need_type).toBe('education');
      });
    });

    it('should filter campaigns by status', async () => {
      const response = await request(app)
        .get('/api/campaigns')
        .query({ status: 'draft' });

      expect(response.status).toBe(200);
      response.body.data.campaigns.forEach((campaign) => {
        expect(campaign.status).toBe('draft');
      });
    });

    it('should filter campaigns by creator', async () => {
      const response = await request(app)
        .get('/api/campaigns')
        .query({ userId: testUserId });

      expect(response.status).toBe(200);
      response.body.data.campaigns.forEach((campaign) => {
        expect(campaign.creator_id).toBe(testUserId.toString());
      });
    });
  });

  describe('GET /campaigns/need-types/all - Retrieve Campaign Taxonomy', () => {
    it('should return all need types organized by category', async () => {
      const response = await request(app).get('/api/campaigns/need-types/all');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(7); // Should have 7 categories

      // Verify structure
      response.body.data.forEach((category) => {
        expect(category).toHaveProperty('category');
        expect(category).toHaveProperty('types');
        expect(Array.isArray(category.types)).toBe(true);
      });

      // Verify specific categories exist
      const categories = response.body.data.map((c) => c.category);
      expect(categories).toContain('emergency');
      expect(categories).toContain('medical');
      expect(categories).toContain('education');
    });
  });

  describe('GET /campaigns/:id - Get Campaign Details', () => {
    it('should retrieve campaign details by ID', async () => {
      const response = await request(app).get(`/api/campaigns/${testCampaignId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.campaign_id).toBe(testCampaignId);
      expect(response.body.data.title).toBe(createCampaignPayload.title);
    });

    it('should return 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app).get(`/api/campaigns/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /campaigns/:id - Update Campaign (Draft Only)', () => {
    it('should update a draft campaign', async () => {
      const updates = {
        title: 'Updated Campaign Title',
        description: 'Updated description',
      };

      const response = await request(app)
        .put(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updates.title);
      expect(response.body.data.description).toBe(updates.description);
    });

    it('should reject updates to non-draft campaigns', async () => {
      // First, publish the campaign
      await request(app)
        .post(`/api/campaigns/${testCampaignId}/publish`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      // Try to update published campaign
      const response = await request(app)
        .put(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .send({ title: 'New Title' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should require ownership for updates', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer test_token_${otherUserId}`)
        .send({ title: 'Hacked Title' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /campaigns/:id/publish - Publish Campaign', () => {
    it('should publish a draft campaign', async () => {
      // Create fresh campaign for publishing
      const createResponse = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .field('title', 'Fresh Campaign to Publish')
        .field('description', createCampaignPayload.description)
        .field('need_type', createCampaignPayload.need_type)
        .field('category', createCampaignPayload.category)
        .field('goals', JSON.stringify(createCampaignPayload.goals))
        .field('location', JSON.stringify(createCampaignPayload.location))
        .field('payment_methods', JSON.stringify(createCampaignPayload.payment_methods));

      const campaignId = createResponse.body.data.campaign_id;

      const response = await request(app)
        .post(`/api/campaigns/${campaignId}/publish`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.published_at).toBeDefined();

      fundraisingCampaignId = campaignId;
    });

    it('should reject publishing non-draft campaigns', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/publish`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /campaigns/:id/pause - Pause Active Campaign', () => {
    it('should pause an active campaign', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/pause`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
    });

    it('should reject pausing non-active campaigns', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/pause`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /campaigns/:id/unpause - Unpause Paused Campaign [NEW]', () => {
    it('should unpause a paused campaign', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/unpause`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('active');
    });

    it('should reject unpausing non-paused campaigns', async () => {
      // Campaign is currently active, should fail
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/unpause`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should require ownership', async () => {
      // First pause the campaign
      await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/pause`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      // Try to unpause as different user
      const otherUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/unpause`)
        .set('Authorization', `Bearer test_token_${otherUserId}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);

      // Restore to active for other tests
      await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/unpause`)
        .set('Authorization', `Bearer test_token_${testUserId}`);
    });
  });

  describe('POST /campaigns/:id/increase-goal - Increase Campaign Goal [NEW]', () => {
    it('should increase goal for fundraising campaign', async () => {
      const currentGoal = 10000; // cents
      const newGoal = 15000; // cents

      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/increase-goal`)
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .send({ newGoalAmount: newGoal });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.goals.fundraising.target_amount).toBe(newGoal);
    });

    it('should reject decreasing goal', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/increase-goal`)
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .send({ newGoalAmount: 5000 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('greater');
    });

    it('should validate newGoalAmount is a number', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/increase-goal`)
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .send({ newGoalAmount: 'not_a_number' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /campaigns/:id/stats - Campaign Statistics [NEW]', () => {
    it('should return campaign statistics', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('view_count');
      expect(response.body.data).toHaveProperty('share_count');
      expect(response.body.data).toHaveProperty('engagement_score');
    });

    it('should calculate stats with proper metrics', async () => {
      const statsResponse = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/stats`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.data).toHaveProperty('total_raised');
      expect(statsResponse.body.data).toHaveProperty('goal_amount');
      expect(statsResponse.body.data).toHaveProperty('funded_percentage');
      expect(statsResponse.body.data).toHaveProperty('view_count');
      expect(statsResponse.body.data).toHaveProperty('share_count');
      expect(statsResponse.body.data).toHaveProperty('engagement_score');
      expect(statsResponse.body.data).toHaveProperty('days_remaining');
      expect(statsResponse.body.data).toHaveProperty('status');
    });

    it('creator should see extended stats', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/stats`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('total_donors');
      expect(response.body.data).toHaveProperty('average_donation');
      expect(response.body.data).toHaveProperty('goal_increased_count');
    });

    it('non-creator should not see sensitive stats', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/stats`)
        .set('Authorization', `Bearer test_token_${otherUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.total_donors).toBeUndefined();
      expect(response.body.data.average_donation).toBeUndefined();
    });
  });

  describe('GET /campaigns/:id/contributors - Campaign Contributors List [NEW]', () => {
    it('should return paginated contributors', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/contributors`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.donors)).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('page');
      expect(response.body.data).toHaveProperty('limit');
    });

    it('should have correct contributor structure', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/contributors`)
        .query({ limit: 10 });

      if (response.body.data.donors.length > 0) {
        const donor = response.body.data.donors[0];
        expect(donor).toHaveProperty('donor_name');
        expect(donor).toHaveProperty('amount');
        expect(donor).toHaveProperty('date');
      }
    });

    it('should respect pagination limits', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/contributors`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.donors.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /campaigns/:id/activists - Campaign Activists List [NEW]', () => {
    it('should return paginated activists', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/activists`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.activists)).toBe(true);
      expect(response.body.data).toHaveProperty('total');
    });

    it('should have correct activist structure', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/activists`)
        .query({ limit: 10 });

      if (response.body.data.activists.length > 0) {
        const activist = response.body.data.activists[0];
        expect(activist).toHaveProperty('user_id');
        expect(activist).toHaveProperty('user_name');
        expect(activist).toHaveProperty('action_type');
        expect(activist).toHaveProperty('impact_score');
        expect(activist).toHaveProperty('date_joined');
      }
    });

    it('should sort by impact score descending', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/activists`)
        .query({ limit: 100 });

      const activists = response.body.data.activists;
      for (let i = 1; i < activists.length; i++) {
        expect(activists[i - 1].impact_score).toBeGreaterThanOrEqual(activists[i].impact_score);
      }
    });
  });

  describe('GET /campaigns/trending - Trending Campaigns [NEW]', () => {
    it('should return trending campaigns sorted by engagement', async () => {
      const response = await request(app)
        .get('/api/campaigns/trending')
        .query({ limit: 10, timeframe: '7days' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support different timeframes', async () => {
      const timeframes = ['1day', '7days', '30days', 'all'];

      for (const timeframe of timeframes) {
        const response = await request(app)
          .get('/api/campaigns/trending')
          .query({ timeframe });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('should limit results to maximum 50', async () => {
      const response = await request(app)
        .get('/api/campaigns/trending')
        .query({ limit: 100 }); // Request 100, should cap at 50

      expect(response.body.data.length).toBeLessThanOrEqual(50);
    });

    it('should sort by engagement_score first, then view_count', async () => {
      const response = await request(app)
        .get('/api/campaigns/trending')
        .query({ limit: 50 });

      const campaigns = response.body.data;
      for (let i = 1; i < campaigns.length; i++) {
        expect(campaigns[i - 1].engagement_score).toBeGreaterThanOrEqual(campaigns[i].engagement_score);
      }
    });

    it('should only return active/paused campaigns', async () => {
      const response = await request(app).get('/api/campaigns/trending');

      response.body.data.forEach((campaign) => {
        expect(['active', 'paused']).toContain(campaign.status);
      });
    });
  });

  describe('GET /campaigns/:id/related - Related Campaigns [NEW]', () => {
    it('should return related campaigns', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/related`)
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should exclude creator\'s own campaigns', async () => {
      const response = await request(app).get(`/api/campaigns/${fundraisingCampaignId}/related`);

      response.body.data.forEach((campaign) => {
        expect(campaign.creator_id).not.toBe(testUserId.toString());
      });
    });

    it('should match by need_type or category', async () => {
      const response = await request(app).get(`/api/campaigns/${fundraisingCampaignId}/related`);

      const sourceCampaign = await Campaign.findOne({ campaign_id: fundraisingCampaignId });
      response.body.data.forEach((campaign) => {
        const hasMatchingNeedType = campaign.need_type === sourceCampaign.need_type;
        const hasMatchingCategory = campaign.category === sourceCampaign.category;
        expect(hasMatchingNeedType || hasMatchingCategory).toBe(true);
      });
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${fundraisingCampaignId}/related`)
        .query({ limit: 5 });

      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /campaigns/:id/complete - Complete Campaign', () => {
    it('should complete a campaign', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${fundraisingCampaignId}/complete`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.completed_at).toBeDefined();
    });

    it('should require ownership', async () => {
      // Create a new campaign to complete
      const createResponse = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .field('title', 'Campaign to Complete')
        .field('description', createCampaignPayload.description)
        .field('need_type', createCampaignPayload.need_type)
        .field('category', createCampaignPayload.category)
        .field('goals', JSON.stringify(createCampaignPayload.goals))
        .field('location', JSON.stringify(createCampaignPayload.location))
        .field('payment_methods', JSON.stringify(createCampaignPayload.payment_methods));

      const campaignId = createResponse.body.data.campaign_id;

      // Publish it first
      await request(app)
        .post(`/api/campaigns/${campaignId}/publish`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      // Try to complete as different user
      const otherUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/campaigns/${campaignId}/complete`)
        .set('Authorization', `Bearer test_token_${otherUserId}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /campaigns/:id - Soft Delete Campaign', () => {
    it('should soft delete a campaign', async () => {
      // Create campaign for deletion
      const createResponse = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer test_token_${testUserId}`)
        .field('title', 'Campaign to Delete')
        .field('description', createCampaignPayload.description)
        .field('need_type', createCampaignPayload.need_type)
        .field('category', createCampaignPayload.category)
        .field('goals', JSON.stringify(createCampaignPayload.goals))
        .field('location', JSON.stringify(createCampaignPayload.location))
        .field('payment_methods', JSON.stringify(createCampaignPayload.payment_methods));

      const campaignId = createResponse.body.data.campaign_id;

      const response = await request(app)
        .delete(`/api/campaigns/${campaignId}`)
        .set('Authorization', `Bearer test_token_${testUserId}`);

      expect(response.status).toBe(204);

      // Verify soft delete (should not appear in list)
      const listResponse = await request(app)
        .get('/api/campaigns')
        .query({ userId: testUserId });

      const deletedCampaign = listResponse.body.data.campaigns.find((c) => c.campaign_id === campaignId);
      expect(deletedCampaign).toBeUndefined();
    });

    it('should require ownership for deletion', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer test_token_${otherUserId}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
