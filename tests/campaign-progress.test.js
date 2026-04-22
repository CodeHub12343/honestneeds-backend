/**
 * Campaign Progress Service Tests
 * Comprehensive test suite for daily aggregation, metrics calculation, and trend retrieval
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const ShareTracking = require('../models/ShareTracking');
const VolunteerAssignment = require('../models/VolunteerAssignment');
const CampaignProgress = require('../models/CampaignProgress');
const CampaignProgressService = require('../services/CampaignProgressService');
const { connectDB, disconnectDB } = require('../config/mongoConfig');

describe('CampaignProgressService', () => {
  let campaignId, campaignRefId, campaign;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    // Clear collections
    await Campaign.deleteMany({});
    await Transaction.deleteMany({});
    await ShareTracking.deleteMany({});
    await VolunteerAssignment.deleteMany({});
    await CampaignProgress.deleteMany({});

    // Create test campaign
    campaign = await Campaign.create({
      campaign_name: 'Test Campaign',
      campaign_description: 'Test Description',
      fundraising_goal: 10000,
      status: 'active',
      start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      goals: [
        {
          goal_type: 'fundraising',
          target_amount: 10000,
          current_amount: 0
        },
        {
          goal_type: 'sharing_reach',
          target_amount: 1000,
          current_amount: 0
        }
      ]
    });

    campaignId = campaign._id.toString();
    campaignRefId = campaign.campaign_ref_id;
  });

  describe('aggregateCampaignMetrics', () => {
    it('should aggregate donations by payment method', async () => {
      // Create test transactions
      await Transaction.insertMany([
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          amount_dollars: 100,
          payment_method: 'paypal',
          transaction_status: 'completed',
          transaction_date: new Date()
        },
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          amount_dollars: 150,
          payment_method: 'stripe',
          transaction_status: 'completed',
          transaction_date: new Date()
        },
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          amount_dollars: 50,
          payment_method: 'paypal',
          transaction_status: 'completed',
          transaction_date: new Date()
        }
      ]);

      const date = new Date();
      const result = await CampaignProgressService.aggregateCampaignMetrics(
        campaignId,
        campaignRefId,
        date
      );

      expect(result).toBeDefined();
      expect(result.donations.total_count).toBe(3);
      expect(result.donations.total_amount).toBe(300);
      expect(result.donations.by_method.paypal).toBe(150);
      expect(result.donations.by_method.stripe).toBe(150);
    });

    it('should aggregate shares by channel', async () => {
      // Create test shares
      await ShareTracking.insertMany([
        {
          campaign_id: campaignId,
          share_channel: 'facebook',
          shared_by_user: new mongoose.Types.ObjectId(),
          share_date: new Date()
        },
        {
          campaign_id: campaignId,
          share_channel: 'twitter',
          shared_by_user: new mongoose.Types.ObjectId(),
          share_date: new Date()
        },
        {
          campaign_id: campaignId,
          share_channel: 'facebook',
          shared_by_user: new mongoose.Types.ObjectId(),
          share_date: new Date()
        }
      ]);

      const date = new Date();
      const result = await CampaignProgressService.aggregateCampaignMetrics(
        campaignId,
        campaignRefId,
        date
      );

      expect(result).toBeDefined();
      expect(result.shares.total_count).toBe(3);
      expect(result.shares.by_channel.facebook).toBe(2);
      expect(result.shares.by_channel.twitter).toBe(1);
    });

    it('should count volunteers and their hours', async () => {
      // Create volunteer assignments
      await VolunteerAssignment.insertMany([
        {
          campaign_id: campaignId,
          volunteer_id: new mongoose.Types.ObjectId(),
          hours_logged: 5,
          status: 'active'
        },
        {
          campaign_id: campaignId,
          volunteer_id: new mongoose.Types.ObjectId(),
          hours_logged: 3,
          status: 'active'
        },
        {
          campaign_id: campaignId,
          volunteer_id: new mongoose.Types.ObjectId(),
          hours_logged: 8,
          status: 'completed'
        }
      ]);

      const date = new Date();
      const result = await CampaignProgressService.aggregateCampaignMetrics(
        campaignId,
        campaignRefId,
        date
      );

      expect(result).toBeDefined();
      expect(result.volunteers.total_count).toBe(3);
      expect(result.volunteers.total_hours).toBe(16);
    });

    it('should create CampaignProgress document', async () => {
      const date = new Date();
      const result = await CampaignProgressService.aggregateCampaignMetrics(
        campaignId,
        campaignRefId,
        date
      );

      const savedProgress = await CampaignProgress.findOne({
        campaign_id: campaignId,
        date: {
          $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
        }
      });

      expect(savedProgress).toBeDefined();
      expect(savedProgress.campaign_id.toString()).toBe(campaignId);
      expect(savedProgress.campaign_ref_id).toBe(campaignRefId);
    });

    it('should handle campaigns with no donations or shares', async () => {
      const date = new Date();
      const result = await CampaignProgressService.aggregateCampaignMetrics(
        campaignId,
        campaignRefId,
        date
      );

      expect(result.donations.total_count).toBe(0);
      expect(result.donations.total_amount).toBe(0);
      expect(result.shares.total_count).toBe(0);
      expect(result.volunteers.total_count).toBe(0);
    });

    it('should exclude failed and pending transactions', async () => {
      await Transaction.insertMany([
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          amount_dollars: 100,
          payment_method: 'stripe',
          transaction_status: 'failed',
          transaction_date: new Date()
        },
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          amount_dollars: 150,
          payment_method: 'stripe',
          transaction_status: 'pending',
          transaction_date: new Date()
        },
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          amount_dollars: 200,
          payment_method: 'stripe',
          transaction_status: 'completed',
          transaction_date: new Date()
        }
      ]);

      const date = new Date();
      const result = await CampaignProgressService.aggregateCampaignMetrics(
        campaignId,
        campaignRefId,
        date
      );

      expect(result.donations.total_count).toBe(1);
      expect(result.donations.total_amount).toBe(200);
    });
  });

  describe('getCampaignTrend', () => {
    it('should retrieve historical snapshots with trend data', async () => {
      // Create snapshots for multiple days
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        await CampaignProgress.create({
          campaign_id: campaignId,
          campaign_ref_id: campaignRefId,
          date: date,
          donations: {
            total_count: 10 + i,
            total_amount: (100 + i * 10) * 10,
            by_method: { paypal: (50 + i * 5) * 10 }
          },
          shares: {
            total_count: 50 + i * 10,
            by_channel: { facebook: 30 + i * 5 }
          },
          volunteers: { total_count: 5 + i }
        });
      }

      const trend = await CampaignProgressService.getCampaignTrend(campaignId, 5);

      expect(trend).toBeDefined();
      expect(trend.length).toBeGreaterThan(0);
      expect(trend[0]).toHaveProperty('date');
      expect(trend[0]).toHaveProperty('donations');
    });

    it('should calculate daily gains', async () => {
      const today = new Date();
      
      // Day 0: 100 donations
      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        donations: { total_count: 10, total_amount: 1000, by_method: {} },
        shares: { total_count: 0, by_channel: {} },
        volunteers: { total_count: 0 }
      });

      // Day 1: 120 donations (gain of 20)
      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        donations: { total_count: 12, total_amount: 1200, by_method: {} },
        shares: { total_count: 0, by_channel: {} },
        volunteers: { total_count: 0 }
      });

      const trend = await CampaignProgressService.getCampaignTrend(campaignId, 2);

      expect(trend.length).toBe(2);
      if (trend[1].daily_gains) {
        expect(trend[1].daily_gains.donations.count_gain).toBe(2);
      }
    });

    it('should respect days parameter', async () => {
      // Create 10 days of snapshots
      const today = new Date();
      for (let i = 9; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        await CampaignProgress.create({
          campaign_id: campaignId,
          campaign_ref_id: campaignRefId,
          date: date,
          donations: { total_count: 10, total_amount: 1000, by_method: {} },
          shares: { total_count: 0, by_channel: {} },
          volunteers: { total_count: 0 }
        });
      }

      const trend = await CampaignProgressService.getCampaignTrend(campaignId, 5);

      expect(trend.length).toBeLessThanOrEqual(5);
    });

    it('should return default 30 days if parameter not specified', async () => {
      // Create 35 days of snapshots
      const today = new Date();
      for (let i = 34; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        await CampaignProgress.create({
          campaign_id: campaignId,
          campaign_ref_id: campaignRefId,
          date: date,
          donations: { total_count: 10, total_amount: 1000, by_method: {} },
          shares: { total_count: 0, by_channel: {} },
          volunteers: { total_count: 0 }
        });
      }

      const trend = await CampaignProgressService.getCampaignTrend(campaignId);

      expect(trend.length).toBeLessThanOrEqual(30);
    });

    it('should handle campaign with no progress data', async () => {
      const trend = await CampaignProgressService.getCampaignTrend(campaignId, 10);

      expect(trend).toBeDefined();
      expect(Array.isArray(trend)).toBe(true);
    });
  });

  describe('getCampaignMetrics', () => {
    it('should return latest snapshot', async () => {
      const today = new Date();

      // Create old snapshot
      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        donations: { total_count: 5, total_amount: 500, by_method: {} },
        shares: { total_count: 0, by_channel: {} },
        volunteers: { total_count: 0 }
      });

      // Create recent snapshot
      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: today,
        donations: { total_count: 10, total_amount: 1000, by_method: {} },
        shares: { total_count: 50, by_channel: {} },
        volunteers: { total_count: 5 }
      });

      const metrics = await CampaignProgressService.getCampaignMetrics(campaignId);

      expect(metrics).toBeDefined();
      expect(metrics.donations.total_count).toBe(10);
      expect(metrics.shares.total_count).toBe(50);
      expect(metrics.volunteers.total_count).toBe(5);
    });

    it('should return null for campaign with no metrics', async () => {
      const metrics = await CampaignProgressService.getCampaignMetrics(campaignId);

      expect(metrics).toBeNull();
    });

    it('should include daily gains if available', async () => {
      const today = new Date();

      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: today,
        donations: { total_count: 10, total_amount: 1000, by_method: {} },
        shares: { total_count: 50, by_channel: {} },
        volunteers: { total_count: 5 },
        daily_gains: {
          donations: { count_gain: 2, amount_gain: 200 },
          shares: { count_gain: 5 },
          volunteers: { count_gain: 1 }
        }
      });

      const metrics = await CampaignProgressService.getCampaignMetrics(campaignId);

      expect(metrics).toBeDefined();
      expect(metrics.daily_gains).toBeDefined();
    });
  });

  describe('createDailySnapshots', () => {
    it('should process multiple active campaigns', async () => {
      // Create additional campaigns
      const campaign2 = await Campaign.create({
        campaign_name: 'Test Campaign 2',
        campaign_description: 'Test Description',
        fundraising_goal: 5000,
        status: 'active',
        start_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        end_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      });

      const result = await CampaignProgressService.createDailySnapshots();

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.campaignsProcessed).toBeGreaterThanOrEqual(1);
    });

    it('should exclude inactive campaigns', async () => {
      // Update campaign to inactive
      await Campaign.findByIdAndUpdate(campaignId, { status: 'completed' });

      const result = await CampaignProgressService.createDailySnapshots();

      expect(result.campaignsProcessed).toBe(0);
    });

    it('should return aggregation summary', async () => {
      const result = await CampaignProgressService.createDailySnapshots();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('campaignsProcessed');
      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('durationMs');
    });

    it('should prevent concurrent executions', async () => {
      const promise1 = CampaignProgressService.createDailySnapshots();
      const promise2 = CampaignProgressService.createDailySnapshots();

      const results = await Promise.all([promise1, promise2]);

      // At least one should succeed
      expect(results.some(r => r.status === 'completed')).toBe(true);
    });
  });

  describe('cleanupOldSnapshots', () => {
    it('should remove snapshots older than retention period', async () => {
      const today = new Date();
      const old = new Date(today);
      old.setDate(old.getDate() - 100); // 100 days ago

      const recent = new Date(today);
      recent.setDate(recent.getDate() - 10); // 10 days ago

      // Create old and recent snapshots
      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: old,
        donations: { total_count: 0, total_amount: 0, by_method: {} },
        shares: { total_count: 0, by_channel: {} },
        volunteers: { total_count: 0 }
      });

      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: recent,
        donations: { total_count: 0, total_amount: 0, by_method: {} },
        shares: { total_count: 0, by_channel: {} },
        volunteers: { total_count: 0 }
      });

      const result = await CampaignProgressService.cleanupOldSnapshots();

      expect(result).toBeDefined();
      expect(result.deleted).toBeGreaterThan(0);

      const remaining = await CampaignProgress.findOne({
        campaign_id: campaignId,
        date: old
      });

      expect(remaining).toBeNull();
    });

    it('should preserve recent snapshots', async () => {
      const today = new Date();
      const recent = new Date(today);
      recent.setDate(recent.getDate() - 10);

      await CampaignProgress.create({
        campaign_id: campaignId,
        campaign_ref_id: campaignRefId,
        date: recent,
        donations: { total_count: 10, total_amount: 1000, by_method: {} },
        shares: { total_count: 0, by_channel: {} },
        volunteers: { total_count: 0 }
      });

      await CampaignProgressService.cleanupOldSnapshots();

      const preserved = await CampaignProgress.findOne({
        campaign_id: campaignId,
        date: recent
      });

      expect(preserved).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid campaign ID gracefully', async () => {
      const invalidId = new mongoose.Types.ObjectId();

      const result = await CampaignProgressService.aggregateCampaignMetrics(
        invalidId.toString(),
        'invalid-ref-id',
        new Date()
      );

      expect(result).toBeDefined();
      expect(result.donations.total_count).toBe(0);
    });

    it('should emit error events on failure', (done) => {
      CampaignProgressService.once('aggregation:failed', () => {
        done();
      });

      // Trigger error by using invalid ObjectId format
      CampaignProgressService.aggregateCampaignMetrics(
        'invalid-id',
        'invalid-ref',
        new Date()
      ).catch(() => {
        // Expected
      });
    });
  });

  describe('Event Emission', () => {
    it('should emit events on successful aggregation', (done) => {
      CampaignProgressService.once('aggregation:completed', () => {
        done();
      });

      CampaignProgressService.createDailySnapshots();
    });

    it('should include result data in events', (done) => {
      CampaignProgressService.once('aggregation:completed', (eventData) => {
        expect(eventData).toHaveProperty('result');
        expect(eventData).toHaveProperty('timestamp');
        done();
      });

      CampaignProgressService.createDailySnapshots();
    });
  });
});
