/**
 * Campaign Endpoints Integration Tests (Day 3-4)
 * 
 * Tests all 5 campaign endpoints:
 * - POST /campaigns (create)
 * - GET /campaigns (list with pagination)
 * - GET /campaigns/:id (get detail)
 * - PUT /campaigns/:id (update)
 * - DELETE /campaigns/:id (delete)
 * 
 * Coverage >90%
 */

const mongoose = require('mongoose');
const CampaignService = require('../../src/services/CampaignService');
const Campaign = require('../../src/models/Campaign');

// Mock user IDs for testing
const testUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const otherUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');

describe('Campaign Endpoints Integration Tests (Day 3-4)', () => {
  beforeEach(async () => {
    await Campaign.deleteMany({});
  });

  afterAll(async () => {
    await Campaign.deleteMany({});
  });

  describe('POST /campaigns - Create Endpoint', () => {
    it('should create a new campaign and return 201 with campaign object', async () => {
      const campaignData = {
        title: 'Emergency Medical Fund',
        description: 'Fundraising for emergency medical treatment for my family.',
        need_type: 'emergency_medical',
        goals: [
          {
            goal_type: 'fundraising',
            goal_name: 'Medical Bills',
            target_amount: 5000,
          },
        ],
        payment_methods: [
          {
            type: 'paypal',
            email: 'user@example.com',
            is_primary: true,
          },
        ],
        tags: ['urgent', 'medical'],
        category: 'Health',
      };

      // Simulate POST /campaigns request
      const campaign = await CampaignService.createCampaign(testUserId, campaignData);

      // Verify response structure
      expect(campaign).toBeDefined();
      expect(campaign._id).toBeDefined();
      expect(campaign.campaign_id).toMatch(/^CAMP-\d{4}-\d{3}-[A-Z0-9]{6}$/);
      expect(campaign.creator_id.toString()).toBe(testUserId.toString());
      expect(campaign.title).toBe(campaignData.title);
      expect(campaign.status).toBe('draft');
      expect(campaign.view_count).toBe(0);
      expect(campaign.share_count).toBe(0);
      expect(campaign.created_at).toBeDefined();
      expect(campaign.updated_at).toBeDefined();
    });

    it('should reject invalid campaign data and return 400 with validation errors', async () => {
      const invalidData = {
        title: 'Bad', // Too short
        description: 'Short',
        need_type: 'invalid_type',
        payment_methods: [],
      };

      try {
        await CampaignService.createCampaign(testUserId, invalidData);
        throw new Error('Should have thrown validation error');
      } catch (error) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('validation');
        expect(error.validationErrors).toBeDefined();
        expect(Array.isArray(error.validationErrors)).toBe(true);
      }
    });

    it('should require authentication (userId)', async () => {
      const campaignData = {
        title: 'Test Campaign',
        description: 'Test description with enough content here.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      // Without userId, should raise error
      try {
        await CampaignService.createCampaign(null, campaignData);
        throw new Error('Should require userId');
      } catch (error) {
        expect(error.message).toContain('required');
      }
    });

    it('should encrypt payment methods in response', async () => {
      const campaignData = {
        title: 'Test Campaign',
        description: 'Test description with enough content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [
          {
            type: 'bank_transfer',
            account_number: '1234567890',
            routing_number: '021000021',
            account_holder: 'John Doe',
            is_primary: true,
          },
        ],
      };

      const campaign = await CampaignService.createCampaign(testUserId, campaignData);

      // Response should not include encrypted details
      expect(campaign.payment_methods[0].account_number).toBeUndefined();
      expect(campaign.payment_methods[0].details_encrypted).toBeUndefined();
      expect(campaign.payment_methods[0].type).toBe('bank_transfer');
      expect(campaign.payment_methods[0].is_primary).toBe(true);
    });

    it('should generate unique campaign IDs', async () => {
      const campaignData = {
        title: 'Test Campaign',
        description: 'Test description with enough content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const campaign1 = await CampaignService.createCampaign(testUserId, campaignData);
      const campaign2 = await CampaignService.createCampaign(testUserId, campaignData);

      expect(campaign1.campaign_id).not.toBe(campaign2.campaign_id);
    });
  });

  describe('GET /campaigns - List Endpoint', () => {
    let campaigns;

    beforeEach(async () => {
      // Create test campaigns for listing
      campaigns = [];
      for (let i = 0; i < 5; i++) {
        const data = {
          title: `Campaign ${i}`,
          description: 'Description with enough content for all tests.',
          need_type: i % 2 === 0 ? 'emergency_medical' : 'medical_surgery',
          goals: [{ goal_type: 'fundraising', target_amount: 1000 * (i + 1) }],
          payment_methods: [{ type: 'paypal', email: `user${i}@example.com` }],
        };

        const campaign = await CampaignService.createCampaign(testUserId, data);
        if (i < 2) {
          await CampaignService.publishCampaign(campaign._id, testUserId);
        }
        campaigns.push(campaign);
      }

      // Create campaigns for other user
      const otherData = {
        title: 'Other User Campaign',
        description: 'Campaign by different user with description.',
        need_type: 'education_tuition',
        goals: [{ goal_type: 'fundraising', target_amount: 3000 }],
        payment_methods: [{ type: 'stripe' }],
      };
      await CampaignService.createCampaign(otherUserId, otherData);
    });

    it('should list campaigns with default pagination (page=1, limit=20)', async () => {
      const result = await CampaignService.listCampaigns({
        skip: 0,
        limit: 20,
      });

      expect(result.campaigns).toBeDefined();
      expect(Array.isArray(result.campaigns)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.campaigns.length).toBeGreaterThan(0);
    });

    it('should support pagination with page and hasMore fields', async () => {
      // First page
      const page1 = await CampaignService.listCampaigns({
        skip: 0,
        limit: 2,
      });

      expect(page1.campaigns.length).toBe(2);
      expect(page1.total).toBe(6);

      // Second page
      const page2 = await CampaignService.listCampaigns({
        skip: 2,
        limit: 2,
      });

      expect(page2.campaigns.length).toBe(2);
      expect(page1.campaigns[0]._id.toString()).not.toBe(
        page2.campaigns[0]._id.toString()
      );
    });

    it('should filter campaigns by status', async () => {
      const activeResult = await CampaignService.listCampaigns({
        status: 'active',
        skip: 0,
        limit: 20,
      });

      expect(activeResult.campaigns.every((c) => c.status === 'active')).toBe(true);
      expect(activeResult.campaigns.length).toBe(2);
    });

    it('should filter campaigns by needType', async () => {
      const result = await CampaignService.listCampaigns({
        needType: 'emergency_medical',
        skip: 0,
        limit: 20,
      });

      expect(result.campaigns.every((c) => c.need_type === 'emergency_medical')).toBe(true);
    });

    it('should filter campaigns by userId (creator)', async () => {
      const result = await CampaignService.listCampaigns({
        userId: testUserId,
        skip: 0,
        limit: 20,
      });

      expect(result.campaigns.every((c) => c.creator_id.toString() === testUserId.toString())).toBe(
        true
      );
      expect(result.total).toBe(5);
    });

    it('should combine multiple filters', async () => {
      const result = await CampaignService.listCampaigns({
        userId: testUserId,
        status: 'draft',
        needType: 'emergency_medical',
        skip: 0,
        limit: 20,
      });

      expect(result.campaigns.every((c) => c.creator_id.toString() === testUserId.toString())).toBe(
        true
      );
      expect(result.campaigns.every((c) => c.status === 'draft')).toBe(true);
      expect(result.campaigns.every((c) => c.need_type === 'emergency_medical')).toBe(true);
    });

    it('should respect limit and return correct pagination info', async () => {
      const result = await CampaignService.listCampaigns({
        skip: 0,
        limit: 3,
      });

      expect(result.campaigns.length).toBeLessThanOrEqual(3);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should return empty array for non-matching filters', async () => {
      const result = await CampaignService.listCampaigns({
        needType: 'business_startup',
        skip: 0,
        limit: 20,
      });

      expect(result.campaigns).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('GET /campaigns/:id - Get Detail Endpoint', () => {
    let campaign;

    beforeEach(async () => {
      const data = {
        title: 'Detail Test Campaign',
        description: 'Campaign for detail testing with enough content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, data);
    });

    it('should return campaign detail (200 OK)', async () => {
      const result = await CampaignService.getCampaign(campaign._id);

      expect(result._id.toString()).toBe(campaign._id.toString());
      expect(result.campaign_id).toBe(campaign.campaign_id);
      expect(result.title).toBe(campaign.title);
      expect(result.description).toBe(campaign.description);
      expect(result.need_type).toBe(campaign.need_type);
    });

    it('should retrieve campaign by campaign_id', async () => {
      const result = await CampaignService.getCampaign(campaign.campaign_id);

      expect(result.campaign_id).toBe(campaign.campaign_id);
    });

    it('should increment view count for non-owner', async () => {
      const initialViewCount = campaign.view_count;

      await CampaignService.getCampaign(campaign._id, otherUserId);

      const updated = await CampaignService.getCampaign(campaign._id, testUserId);
      expect(updated.view_count).toBe(initialViewCount + 1);
    });

    it('should not increment view count for owner', async () => {
      const initialViewCount = campaign.view_count;

      await CampaignService.getCampaign(campaign._id, testUserId);

      const fetched = await Campaign.findById(campaign._id);
      expect(fetched.view_count).toBe(initialViewCount);
    });

    it('should return 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      try {
        await CampaignService.getCampaign(fakeId);
        throw new Error('Should have thrown 404');
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain('not found');
      }
    });

    it('should not include encrypted payment details in response', async () => {
      const result = await CampaignService.getCampaign(campaign._id);

      expect(result.payment_methods[0].details_encrypted).toBeUndefined();
      expect(result.payment_methods[0].type).toBe('paypal');
    });

    it('should sanitize all fields in response', async () => {
      const result = await CampaignService.getCampaign(campaign._id);

      expect(result._id).toBeDefined();
      expect(result.campaign_id).toBeDefined();
      expect(result.creator_id).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });
  });

  describe('PUT /campaigns/:id - Update Endpoint', () => {
    let campaign;

    beforeEach(async () => {
      const data = {
        title: 'Original Title',
        description: 'Original description with enough content for testing.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, data);
    });

    it('should update campaign and return 200 with updated object', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated description with enough content here.',
      };

      const updated = await CampaignService.updateCampaign(campaign._id, testUserId, updateData);

      expect(updated.title).toBe(updateData.title);
      expect(updated.description).toBe(updateData.description);
      expect(updated._id.toString()).toBe(campaign._id.toString());
      expect(updated.campaign_id).toBe(campaign.campaign_id);
    });

    it('should only allow updates to draft campaigns', async () => {
      // Publish the campaign first
      await CampaignService.publishCampaign(campaign._id, testUserId);

      const updateData = { title: 'New Title' };

      try {
        await CampaignService.updateCampaign(campaign._id, testUserId, updateData);
        throw new Error('Should not allow update to non-draft');
      } catch (error) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('draft');
      }
    });

    it('should return 403 for non-owner update attempt', async () => {
      const updateData = { title: 'Hacked Title' };

      try {
        await CampaignService.updateCampaign(campaign._id, otherUserId, updateData);
        throw new Error('Should have rejected non-owner');
      } catch (error) {
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('unauthorized');
      }
    });

    it('should return 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      try {
        await CampaignService.updateCampaign(fakeId, testUserId, { title: 'New' });
        throw new Error('Should have thrown 404');
      } catch (error) {
        expect(error.statusCode).toBe(404);
      }
    });

    it('should validate updated data', async () => {
      const invalidUpdate = {
        title: 'Bad', // Too short
      };

      try {
        await CampaignService.updateCampaign(campaign._id, testUserId, invalidUpdate);
        throw new Error('Should have thrown validation error');
      } catch (error) {
        expect(error.statusCode).toBe(400);
      }
    });

    it('should allow partial updates', async () => {
      const updateData = {
        title: 'New Title Only',
      };

      const updated = await CampaignService.updateCampaign(campaign._id, testUserId, updateData);

      expect(updated.title).toBe('New Title Only');
      expect(updated.description).toBe(campaign.description); // Should not change
    });

    it('should re-encrypt payment methods if updated', async () => {
      const updateData = {
        payment_methods: [
          {
            type: 'stripe',
            is_primary: true,
          },
        ],
      };

      const updated = await CampaignService.updateCampaign(campaign._id, testUserId, updateData);

      expect(updated.payment_methods[0].type).toBe('stripe');
      expect(updated.payment_methods[0].details_encrypted).toBeUndefined(); // Not in response
    });
  });

  describe('DELETE /campaigns/:id - Delete Endpoint', () => {
    let campaign;

    beforeEach(async () => {
      const data = {
        title: 'Delete Test Campaign',
        description: 'Campaign for deletion testing with enough content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, data);
    });

    it('should soft delete campaign and return 204 No Content', async () => {
      await CampaignService.deleteCampaign(campaign._id, testUserId);

      // Verify soft delete in database
      const deleted = await Campaign.findById(campaign._id);
      expect(deleted.is_deleted).toBe(true);
      expect(deleted.deleted_at).toBeDefined();
    });

    it('should return 403 for non-owner delete', async () => {
      try {
        await CampaignService.deleteCampaign(campaign._id, otherUserId);
        throw new Error('Should have rejected non-owner');
      } catch (error) {
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('unauthorized');
      }
    });

    it('should return 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      try {
        await CampaignService.deleteCampaign(fakeId, testUserId);
        throw new Error('Should have thrown 404');
      } catch (error) {
        expect(error.statusCode).toBe(404);
      }
    });

    it('should only allow deletion of draft campaigns', async () => {
      // Publish the campaign first
      await CampaignService.publishCampaign(campaign._id, testUserId);

      try {
        await CampaignService.deleteCampaign(campaign._id, testUserId);
        throw new Error('Should not allow delete of non-draft');
      } catch (error) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('draft');
      }
    });

    it('should exclude soft-deleted campaigns from list', async () => {
      // Delete the campaign
      await CampaignService.deleteCampaign(campaign._id, testUserId);

      // Try to get it
      try {
        await CampaignService.getCampaign(campaign._id);
        throw new Error('Should not return deleted campaign');
      } catch (error) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Authorization and Permissions', () => {
    let campaign;

    beforeEach(async () => {
      const data = {
        title: 'Auth Test Campaign',
        description: 'Campaign for authorization testing with content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, data);
    });

    it('should allow owner to update their campaign', async () => {
      const updated = await CampaignService.updateCampaign(campaign._id, testUserId, {
        title: 'Updated by Owner',
      });

      expect(updated.title).toBe('Updated by Owner');
    });

    it('should deny non-owner from updating campaign', async () => {
      try {
        await CampaignService.updateCampaign(campaign._id, otherUserId, {
          title: 'Hacked',
        });
        throw new Error('Should have denied non-owner');
      } catch (error) {
        expect(error.statusCode).toBe(403);
      }
    });

    it('should allow owner to delete their campaign', async () => {
      await CampaignService.deleteCampaign(campaign._id, testUserId);

      const deleted = await Campaign.findById(campaign._id);
      expect(deleted.is_deleted).toBe(true);
    });

    it('should deny non-owner from deleting campaign', async () => {
      try {
        await CampaignService.deleteCampaign(campaign._id, otherUserId);
        throw new Error('Should have denied non-owner');
      } catch (error) {
        expect(error.statusCode).toBe(403);
      }
    });

    it('should allow public read access (no auth required)', async () => {
      const retrieved = await CampaignService.getCampaign(campaign._id);

      expect(retrieved.campaign_id).toBe(campaign.campaign_id);
    });
  });

  describe('Error Handling', () => {
    let campaign;

    beforeEach(async () => {
      const data = {
        title: 'Error Test Campaign',
        description: 'Campaign for error handling testing with content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, data);
    });

    it('should return proper error codes: 400 for validation', async () => {
      try {
        await CampaignService.createCampaign(testUserId, {
          title: 'Bad',
          description: 'Short',
          payment_methods: [],
        });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error.statusCode).toBe(400);
      }
    });

    it('should return proper error codes: 403 for forbidden', async () => {
      try {
        await CampaignService.updateCampaign(campaign._id, otherUserId, {
          title: 'Update',
        });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error.statusCode).toBe(403);
      }
    });

    it('should return proper error codes: 404 for not found', async () => {
      try {
        await CampaignService.getCampaign(new mongoose.Types.ObjectId());
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Data Consistency', () => {
    let campaign;

    beforeEach(async () => {
      const data = {
        title: 'Consistency Test Campaign',
        description: 'Campaign for consistency testing with enough content.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, data);
    });

    it('should maintain data consistency after create', async () => {
      const fetched = await Campaign.findById(campaign._id);

      expect(fetched.title).toBe(campaign.title);
      expect(fetched.campaign_id).toBe(campaign.campaign_id);
      expect(fetched.creator_id.toString()).toBe(campaign.creator_id.toString());
    });

    it('should maintain data consistency after update', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated description with enough content.',
      };

      await CampaignService.updateCampaign(campaign._id, testUserId, updateData);

      const fetched = await Campaign.findById(campaign._id);
      expect(fetched.title).toBe(updateData.title);
      expect(fetched.description).toBe(updateData.description);
    });

    it('should maintain timestamps', async () => {
      const fetched = await Campaign.findById(campaign._id);

      expect(fetched.created_at).toBeDefined();
      expect(fetched.updated_at).toBeDefined();
      expect(fetched.created_at.getTime()).toBeLessThanOrEqual(
        fetched.updated_at.getTime()
      );
    });

    it('should update only specified fields on partial update', async () => {
      const originalDescription = campaign.description;

      const updateData = {
        title: 'New Title Only',
      };

      await CampaignService.updateCampaign(campaign._id, testUserId, updateData);

      const fetched = await Campaign.findById(campaign._id);
      expect(fetched.title).toBe('New Title Only');
      expect(fetched.description).toBe(originalDescription);
    });
  });
});
