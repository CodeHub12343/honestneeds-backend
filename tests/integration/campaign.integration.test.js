/**
 * Campaign Integration Tests
 * Tests for complete campaign workflows and API endpoints
 */

const mongoose = require('mongoose');
const CampaignService = require('../../src/services/CampaignService');
const Campaign = require('../../src/models/Campaign');

// Mock user ID for testing
const testUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const otherUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');

describe('Campaign Service Integration Tests', () => {
  beforeEach(async () => {
    // Clear campaigns collection before each test
    await Campaign.deleteMany({});
  });

  afterAll(async () => {
    // Clean up after all tests
    await Campaign.deleteMany({});
  });

  describe('createCampaign workflow', () => {
    it('should successfully create a campaign with all fields', async () => {
      const campaignData = {
        title: 'Emergency Medical Fund',
        description: 'Fundraising for emergency medical treatment for my family member.',
        need_type: 'emergency_medical',
        goals: [
          {
            goal_type: 'fundraising',
            goal_name: 'Medical Bills',
            target_amount: 5000,
          },
        ],
        location: {
          city: 'New York',
          state: 'NY',
          country: 'USA',
        },
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

      const campaign = await CampaignService.createCampaign(testUserId, campaignData);

      expect(campaign).toBeDefined();
      expect(campaign.campaign_id).toMatch(/^CAMP-\d{4}-\d{3}-[A-Z0-9]{6}$/);
      expect(campaign.creator_id.toString()).toBe(testUserId.toString());
      expect(campaign.title).toBe(campaignData.title);
      expect(campaign.description).toBe(campaignData.description);
      expect(campaign.need_type).toBe(campaignData.need_type);
      expect(campaign.status).toBe('draft');
      expect(campaign.goals[0].target_amount).toBe(500000); // In cents
      expect(campaign.tags).toEqual(campaignData.tags);

      // Verify campaign saved to database
      const savedCampaign = await Campaign.findById(campaign._id);
      expect(savedCampaign).toBeDefined();
      expect(savedCampaign.campaign_id).toBe(campaign.campaign_id);
    });

    it('should emit campaign:created event', async () => {
      const emitter = CampaignService.getEventEmitter();
      const mockListener = jest.fn();
      emitter.on('campaign:created', mockListener);

      const campaignData = {
        title: 'Help Needed',
        description: 'This is a detailed description that is long enough.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      await CampaignService.createCampaign(testUserId, campaignData);

      expect(mockListener).toHaveBeenCalled();
      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          creator_id: testUserId,
          campaign_id: expect.stringMatching(/^CAMP-\d{4}-\d{3}-[A-Z0-9]{6}$/),
        })
      );

      emitter.removeListener('campaign:created', mockListener);
    });

    it('should reject campaign creation with invalid schema', async () => {
      const invalidData = {
        title: 'Bad', // Too short
        description: 'Short',
        need_type: 'invalid_type',
        payment_methods: [],
      };

      await expect(CampaignService.createCampaign(testUserId, invalidData)).rejects.toThrow();
    });

    it('should create campaigns with unique IDs', async () => {
      const campaignData = {
        title: 'Help Needed First',
        description: 'This is a detailed description that is long enough.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const campaign1 = await CampaignService.createCampaign(testUserId, campaignData);
      const campaign2 = await CampaignService.createCampaign(testUserId, campaignData);

      expect(campaign1.campaign_id).not.toBe(campaign2.campaign_id);
    });

    it('should encrypt payment methods on creation', async () => {
      const campaignData = {
        title: 'Help Needed',
        description: 'This is a detailed description that is long enough.',
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

      // Verify encrypted data is not in response
      expect(campaign.payment_methods[0].account_number).toBeUndefined();
      expect(campaign.payment_methods[0].details_encrypted).toBeUndefined();

      // Verify encrypted data is in database
      const savedCampaign = await Campaign.findById(campaign._id);
      expect(savedCampaign.payment_methods[0].details_encrypted).toBeDefined();
      expect(savedCampaign.payment_methods[0].details_encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    });
  });

  describe('updateCampaign workflow', () => {
    let draftCampaign;

    beforeEach(async () => {
      const campaignData = {
        title: 'Original Title',
        description: 'Original description that is long enough to pass validation.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      draftCampaign = await CampaignService.createCampaign(testUserId, campaignData);
    });

    it('should successfully update draft campaign', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated description that is long enough to pass validation.',
      };

      const updated = await CampaignService.updateCampaign(
        draftCampaign._id,
        testUserId,
        updateData
      );

      expect(updated.title).toBe(updateData.title);
      expect(updated.description).toBe(updateData.description);
      expect(updated.campaign_id).toBe(draftCampaign.campaign_id); // ID should not change
    });

    it('should emit campaign:updated event', async () => {
      const emitter = CampaignService.getEventEmitter();
      const mockListener = jest.fn();
      emitter.on('campaign:updated', mockListener);

      const updateData = { title: 'New Title' };
      await CampaignService.updateCampaign(draftCampaign._id, testUserId, updateData);

      expect(mockListener).toHaveBeenCalled();
      emitter.removeListener('campaign:updated', mockListener);
    });

    it('should reject unauthorized update', async () => {
      const updateData = { title: 'Hacked Title' };

      await expect(
        CampaignService.updateCampaign(draftCampaign._id, otherUserId, updateData)
      ).rejects.toThrow('Unauthorized');
    });

    it('should reject update to non-draft campaign', async () => {
      // Publish the campaign
      await CampaignService.publishCampaign(draftCampaign._id, testUserId);

      const updateData = { title: 'New Title' };

      await expect(
        CampaignService.updateCampaign(draftCampaign._id, testUserId, updateData)
      ).rejects.toThrow('only be edited in draft status');
    });

    it('should update only provided fields', async () => {
      const updateData = { title: 'New Title Only' };
      const updated = await CampaignService.updateCampaign(
        draftCampaign._id,
        testUserId,
        updateData
      );

      expect(updated.title).toBe('New Title Only');
      expect(updated.description).toBe(draftCampaign.description); // Should not change
    });
  });

  describe('getCampaign workflow', () => {
    let campaign;

    beforeEach(async () => {
      const campaignData = {
        title: 'Test Campaign',
        description: 'This is a test campaign with enough description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      campaign = await CampaignService.createCampaign(testUserId, campaignData);
    });

    it('should retrieve campaign by MongoDB ID', async () => {
      const retrieved = await CampaignService.getCampaign(campaign._id);

      expect(retrieved._id.toString()).toBe(campaign._id.toString());
      expect(retrieved.campaign_id).toBe(campaign.campaign_id);
      expect(retrieved.title).toBe(campaign.title);
    });

    it('should retrieve campaign by campaign_id', async () => {
      const retrieved = await CampaignService.getCampaign(campaign.campaign_id);

      expect(retrieved._id.toString()).toBe(campaign._id.toString());
      expect(retrieved.campaign_id).toBe(campaign.campaign_id);
    });

    it('should throw 404 for non-existent campaign', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(CampaignService.getCampaign(fakeId)).rejects.toThrow('not found');
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

    it('should not increment view count for anonymous user', async () => {
      const initialViewCount = campaign.view_count;

      await CampaignService.getCampaign(campaign._id);

      const fetched = await Campaign.findById(campaign._id);
      expect(fetched.view_count).toBe(initialViewCount);
    });
  });

  describe('listCampaigns workflow', () => {
    beforeEach(async () => {
      // Create campaigns for different users and statuses
      for (let i = 0; i < 5; i++) {
        const campaignData = {
          title: `Campaign ${i}`,
          description: 'This is a detailed description that meets requirements.',
          need_type: i % 2 === 0 ? 'emergency_medical' : 'medical_surgery',
          goals: [{ goal_type: 'fundraising', target_amount: 1000 * (i + 1) }],
          payment_methods: [{ type: 'paypal', email: `user${i}@example.com` }],
        };

        const campaign = await CampaignService.createCampaign(testUserId, campaignData);

        if (i < 2) {
          await CampaignService.publishCampaign(campaign._id, testUserId);
        }
      }

      // Create campaigns for other user
      const otherCampaignData = {
        title: 'Other User Campaign',
        description: 'Campaign by another user with detailed description here.',
        need_type: 'education_tuition',
        goals: [{ goal_type: 'fundraising', target_amount: 3000 }],
        payment_methods: [{ type: 'stripe' }],
      };

      await CampaignService.createCampaign(otherUserId, otherCampaignData);
    });

    it('should list all campaigns', async () => {
      const result = await CampaignService.listCampaigns();

      expect(result.campaigns.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.pagination).toBeDefined();
    });

    it('should filter by user ID', async () => {
      const result = await CampaignService.listCampaigns({ userId: testUserId });

      expect(result.campaigns.every((c) => c.creator_id.toString() === testUserId.toString())).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should filter by status', async () => {
      const result = await CampaignService.listCampaigns({ status: 'draft' });

      expect(result.campaigns.every((c) => c.status === 'draft')).toBe(true);
      expect(result.total).toBe(3);
    });

    it('should filter by need type', async () => {
      const result = await CampaignService.listCampaigns({ needType: 'emergency_medical' });

      expect(result.campaigns.every((c) => c.need_type === 'emergency_medical')).toBe(true);
    });

    it('should support pagination', async () => {
      const page1 = await CampaignService.listCampaigns({ skip: 0, limit: 2 });
      const page2 = await CampaignService.listCampaigns({ skip: 2, limit: 2 });

      expect(page1.campaigns.length).toBe(2);
      expect(page2.campaigns.length).toBe(2);
      expect(page1.pagination.hasMore).toBe(true);
    });
  });

  describe('publishCampaign workflow', () => {
    let draftCampaign;

    beforeEach(async () => {
      const campaignData = {
        title: 'Campaign to Publish',
        description: 'Campaign description with enough content for validation.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      draftCampaign = await CampaignService.createCampaign(testUserId, campaignData);
    });

    it('should publish draft campaign successfully', async () => {
      const published = await CampaignService.publishCampaign(draftCampaign._id, testUserId);

      expect(published.status).toBe('active');
      expect(published.published_at).toBeDefined();
    });

    it('should emit campaign:published event', async () => {
      const emitter = CampaignService.getEventEmitter();
      const mockListener = jest.fn();
      emitter.on('campaign:published', mockListener);

      await CampaignService.publishCampaign(draftCampaign._id, testUserId);

      expect(mockListener).toHaveBeenCalled();
      emitter.removeListener('campaign:published', mockListener);
    });

    it('should reject publish by non-owner', async () => {
      await expect(
        CampaignService.publishCampaign(draftCampaign._id, otherUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should reject publish of non-draft campaign', async () => {
      await CampaignService.publishCampaign(draftCampaign._id, testUserId);

      await expect(
        CampaignService.publishCampaign(draftCampaign._id, testUserId)
      ).rejects.toThrow('only draft campaigns can be published');
    });
  });

  describe('pauseCampaign workflow', () => {
    let activeCampaign;

    beforeEach(async () => {
      const campaignData = {
        title: 'Campaign to Pause',
        description: 'Campaign description with enough content for tests.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const campaign = await CampaignService.createCampaign(testUserId, campaignData);
      activeCampaign = await CampaignService.publishCampaign(campaign._id, testUserId);
    });

    it('should pause active campaign successfully', async () => {
      const paused = await CampaignService.pauseCampaign(activeCampaign._id, testUserId);

      expect(paused.status).toBe('paused');
    });

    it('should emit campaign:paused event', async () => {
      const emitter = CampaignService.getEventEmitter();
      const mockListener = jest.fn();
      emitter.on('campaign:paused', mockListener);

      await CampaignService.pauseCampaign(activeCampaign._id, testUserId);

      expect(mockListener).toHaveBeenCalled();
      emitter.removeListener('campaign:paused', mockListener);
    });

    it('should reject pause by non-owner', async () => {
      await expect(
        CampaignService.pauseCampaign(activeCampaign._id, otherUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should reject pause of non-active campaign', async () => {
      // Draft campaign
      const draftCampaignData = {
        title: 'Draft Campaign',
        description: 'Draft campaign with enough description text here.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const draftCampaign = await CampaignService.createCampaign(testUserId, draftCampaignData);

      await expect(
        CampaignService.pauseCampaign(draftCampaign._id, testUserId)
      ).rejects.toThrow('Only active campaigns can be paused');
    });
  });

  describe('deleteCampaign workflow', () => {
    let draftCampaign;

    beforeEach(async () => {
      const campaignData = {
        title: 'Campaign to Delete',
        description: 'Campaign description with enough content for validation here.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      draftCampaign = await CampaignService.createCampaign(testUserId, campaignData);
    });

    it('should soft delete draft campaign', async () => {
      const result = await CampaignService.deleteCampaign(draftCampaign._id, testUserId);

      expect(result.message).toBe('Campaign deleted successfully');

      // Verify soft delete in database
      const deleted = await Campaign.findById(draftCampaign._id);
      expect(deleted.is_deleted).toBe(true);
      expect(deleted.deleted_at).toBeDefined();
    });

    it('should emit campaign:deleted event', async () => {
      const emitter = CampaignService.getEventEmitter();
      const mockListener = jest.fn();
      emitter.on('campaign:deleted', mockListener);

      await CampaignService.deleteCampaign(draftCampaign._id, testUserId);

      expect(mockListener).toHaveBeenCalled();
      emitter.removeListener('campaign:deleted', mockListener);
    });

    it('should reject delete by non-owner', async () => {
      await expect(
        CampaignService.deleteCampaign(draftCampaign._id, otherUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should reject delete of non-draft campaign', async () => {
      // Publish first
      await CampaignService.publishCampaign(draftCampaign._id, testUserId);

      await expect(
        CampaignService.deleteCampaign(draftCampaign._id, testUserId)
      ).rejects.toThrow('Only draft campaigns can be deleted');
    });
  });

  describe('Campaign Status Flow', () => {
    it('should follow correct status progression: draft -> active -> paused', async () => {
      const campaignData = {
        title: 'Status Flow Test',
        description: 'Campaign to test status flow with proper descriptions.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const campaign = await CampaignService.createCampaign(testUserId, campaignData);
      expect(campaign.status).toBe('draft');

      const published = await CampaignService.publishCampaign(campaign._id, testUserId);
      expect(published.status).toBe('active');

      const paused = await CampaignService.pauseCampaign(campaign._id, testUserId);
      expect(paused.status).toBe('paused');
    });

    it('should handle multiple pause/unpause operations', async () => {
      const campaignData = {
        title: 'Pause Test',
        description: 'Campaign for testing pause operations with detailed data.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const campaign = await CampaignService.createCampaign(testUserId, campaignData);
      const published = await CampaignService.publishCampaign(campaign._id, testUserId);

      expect(published.status).toBe('active');

      const paused = await CampaignService.pauseCampaign(published._id, testUserId);
      expect(paused.status).toBe('paused');

      // Should not be able to pause again (not active)
      await expect(
        CampaignService.pauseCampaign(paused._id, testUserId)
      ).rejects.toThrow('Only active campaigns can be paused');
    });
  });
});

describe('Campaign Permissions and Authorization', () => {
  let campaign;

  beforeEach(async () => {
    const campaignData = {
      title: 'Permission Test Campaign',
      description: 'Campaign for testing permissions with proper description text.',
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
    };

    campaign = await CampaignService.createCampaign(testUserId, campaignData);
  });

  it('should allow campaign owner full access', async () => {
    // Owner should be able to update
    const updated = await CampaignService.updateCampaign(campaign._id, testUserId, {
      title: 'Updated by Owner',
    });
    expect(updated.title).toBe('Updated by Owner');

    // Owner should be able to publish
    const published = await CampaignService.publishCampaign(campaign._id, testUserId);
    expect(published.status).toBe('active');
  });

  it('should deny non-owner update access', async () => {
    await expect(
      CampaignService.updateCampaign(campaign._id, otherUserId, { title: 'Hacked' })
    ).rejects.toThrow('Unauthorized');
  });

  it('should deny non-owner publish access', async () => {
    await expect(
      CampaignService.publishCampaign(campaign._id, otherUserId)
    ).rejects.toThrow('Unauthorized');
  });

  it('should allow public read access to campaigns', async () => {
    // Anyone should be able to read (without userId)
    const retrieved = await CampaignService.getCampaign(campaign._id);
    expect(retrieved.campaign_id).toBe(campaign.campaign_id);
  });
});
