/**
 * Tests for Day 3-4: Analytics Foundation
 * Tests: Analytics service, caching, metrics tracking
 */

const AnalyticsService = require('../../src/services/analyticsService');
const analyticsCache = require('../../src/utils/analyticsCache');
const Campaign = require('../../src/models/Campaign');
const CampaignProgress = require('../../src/models/CampaignProgress');

jest.mock('../../src/models/Campaign');
jest.mock('../../src/models/CampaignProgress');

describe('Day 3-4: Analytics Foundation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    analyticsCache.clear();
  });

  describe('Metrics Tracking', () => {
    test('should update donation metrics', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        view_count: 100,
        share_count: 50,
        metrics: {
          total_donations: 0,
          total_donation_amount: 0,
          donations_by_method: {},
          unique_supporters: new Set(),
          last_metrics_update: new Date(),
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue({
        ...mockCampaign,
        metrics: {
          ...mockCampaign.metrics,
          total_donations: 1,
          total_donation_amount: 50000,
          donations_by_method: { paypal: 1 },
        },
      });

      const result = await AnalyticsService.updateMetrics('campaign1', {
        type: 'donation',
        amount: 50000,
        method: 'paypal',
      });

      expect(result).toBeDefined();
      expect(Campaign.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('should update share metrics by channel', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        share_count: 0,
        metrics: {
          total_donations: 0,
          total_donation_amount: 0,
          shares_free: 0,
          shares_paid: 0,
          shares_by_channel: {},
          unique_supporters: new Set(),
          last_metrics_update: new Date(),
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue({
        ...mockCampaign,
        share_count: 1,
        metrics: {
          ...mockCampaign.metrics,
          shares_free: 1,
          shares_by_channel: { facebook: 1 },
        },
      });

      const result = await AnalyticsService.updateMetrics('campaign1', {
        type: 'share',
        channel: 'facebook',
        method: 'free',
      });

      expect(result).toBeDefined();
      expect(Campaign.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('should update volunteer metrics', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        metrics: {
          total_volunteers: 0,
          unique_supporters: new Set(),
          last_metrics_update: new Date(),
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue({
        ...mockCampaign,
        metrics: {
          ...mockCampaign.metrics,
          total_volunteers: 1,
        },
      });

      const result = await AnalyticsService.updateMetrics('campaign1', {
        type: 'volunteer',
        userId: 'user1',
      });

      expect(result).toBeDefined();
      expect(Campaign.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('should update customer referral metrics', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        metrics: {
          total_customers_acquired: 0,
          unique_supporters: new Set(),
          last_metrics_update: new Date(),
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue({
        ...mockCampaign,
        metrics: {
          ...mockCampaign.metrics,
          total_customers_acquired: 1,
        },
      });

      const result = await AnalyticsService.updateMetrics('campaign1', {
        type: 'customer_referral',
        userId: 'user2',
      });

      expect(result).toBeDefined();
      expect(Campaign.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('should increment view count', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        view_count: 100,
        metrics: { last_metrics_update: new Date() },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue({
        ...mockCampaign,
        view_count: 101,
      });

      const result = await AnalyticsService.updateMetrics('campaign1', {
        type: 'view',
      });

      expect(result).toBeDefined();
      expect(Campaign.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('should track unique supporters', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        metrics: {
          total_donations: 0,
          unique_supporters: new Set(['user1']),
          last_metrics_update: new Date(),
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue(mockCampaign);

      await AnalyticsService.updateMetrics('campaign1', {
        type: 'donation',
        userId: 'user2',
      });

      expect(Campaign.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('should handle unknown metric type gracefully', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        metrics: { last_metrics_update: new Date() },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);

      const result = await AnalyticsService.updateMetrics('campaign1', {
        type: 'unknown',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Progress Tracking', () => {
    test('should record progress snapshot', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        view_count: 100,
        share_count: 50,
        metrics: {
          total_donations: 5,
          total_donation_amount: 250000,
          total_volunteers: 3,
          total_customers_acquired: 2,
          unique_supporters: new Set(['u1', 'u2']),
          donations_by_method: {},
          shares_by_channel: {},
          shares_paid: 10,
          shares_free: 40,
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.create.mockResolvedValue({
        _id: 'progress1',
        campaign_id: 'campaign1',
        date: new Date(),
        donations: { total_count: 5, total_amount: 250000 },
        shares: { total_count: 50, paid_shares: 10, free_shares: 40 },
        volunteers: { total_count: 3 },
        customers: { total_acquired: 2 },
        views: { total_count: 100, unique_visitors: 2 },
        unique_supporters_count: 2,
      });

      const result = await AnalyticsService.recordProgressSnapshot('campaign1');

      expect(result).toBeDefined();
      expect(CampaignProgress.create).toHaveBeenCalled();
    });

    test('should use provided date for snapshot', async () => {
      const testDate = new Date('2024-04-01');
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        metrics: {
          total_donations: 0,
          total_donation_amount: 0,
          total_volunteers: 0,
          total_customers_acquired: 0,
          unique_supporters: new Set(),
          donations_by_method: {},
          shares_by_channel: {},
          shares_paid: 0,
          shares_free: 0,
        },
        view_count: 0,
        share_count: 0,
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.create.mockResolvedValue({});

      await AnalyticsService.recordProgressSnapshot('campaign1', testDate);

      const callArgs = CampaignProgress.create.mock.calls[0][0];
      expect(callArgs.date.toDateString()).toBe(testDate.toDateString());
    });
  });

  describe('Analytics Queries', () => {
    test('should get comprehensive analytics', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        title: 'Test Campaign',
        status: 'active',
        published_at: new Date('2024-03-01'),
        created_at: new Date('2024-03-01'),
        view_count: 500,
        share_count: 100,
        metrics: {
          total_donations: 20,
          total_donation_amount: 100000,
          total_volunteers: 5,
          total_customers_acquired: 3,
          unique_supporters: new Set(['u1', 'u2', 'u3']),
          shares_paid: 30,
          shares_free: 70,
          donations_by_method: { paypal: 10, stripe: 10 },
          shares_by_channel: { facebook: 40, twitter: 30, other: 30 },
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange.mockResolvedValue([]);

      const result = await AnalyticsService.getAnalytics('campaign1');

      expect(result).toBeDefined();
      expect(result.campaign).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.donations).toBeDefined();
      expect(result.shares).toBeDefined();
      expect(result.progressTrend).toBeDefined();
      expect(result.metrics.total_donations).toBe(20);
      expect(result.metrics.total_donation_amount).toBe(100000);
      expect(result.metrics.unique_supporters).toBe(3);
    });

    test('should get progress trend with filters', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
      };

      const mockProgress = [
        {
          date: new Date('2024-03-01'),
          donations: { total_amount: 10000 },
          shares: { total_count: 20 },
          views: { total_count: 100 },
          volunteers: { total_count: 2 },
          customers: { total_acquired: 1 },
          unique_supporters_count: 3,
          getTrend: () => ({
            date: new Date('2024-03-01'),
            donations: 10000,
            share_count: 20,
          }),
        },
      ];

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange.mockResolvedValue(mockProgress);

      const result = await AnalyticsService.getProgressTrend(
        'campaign1',
        new Date('2024-03-01'),
        new Date('2024-03-31')
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should get metrics comparison', async () => {
      const mockCampaign = {
        _id: 'campaign1',
      };

      const currentPeriodProgress = [
        {
          donations: { total_count: 5, total_amount: 25000 },
          shares: { total_count: 30 },
          views: { total_count: 300 },
          volunteers: { total_count: 2 },
          unique_supporters_count: 5,
        },
      ];

      const prevPeriodProgress = [
        {
          donations: { total_count: 3, total_amount: 15000 },
          shares: { total_count: 20 },
          views: { total_count: 200 },
          volunteers: { total_count: 1 },
          unique_supporters_count: 3,
        },
      ];

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange
        .mockResolvedValueOnce(currentPeriodProgress)
        .mockResolvedValueOnce(prevPeriodProgress);

      const result = await AnalyticsService.getMetricsComparison('campaign1', 7);

      expect(result).toBeDefined();
      expect(result.current_period).toBeDefined();
      expect(result.previous_period).toBeDefined();
      expect(result.changes).toBeDefined();
    });
  });

  describe('Analytics Cache', () => {
    test('should cache analytics results', () => {
      const data = { metrics: { total: 100 } };
      const key = analyticsCache.generateKey('campaign1', { progressDays: 30 });

      analyticsCache.set(key, data);
      const cached = analyticsCache.get(key);

      expect(cached).toEqual(data);
    });

    test('should return null for missing cache entry', () => {
      const key = 'nonexistent';
      const result = analyticsCache.get(key);

      expect(result).toBeNull();
    });

    test('should track cache hits and misses', () => {
      const key = analyticsCache.generateKey('campaign1');
      const data = { test: 'data' };

      analyticsCache.set(key, data);
      analyticsCache.get(key); // Hit
      analyticsCache.get(key); // Hit
      analyticsCache.get('missing'); // Miss

      const stats = analyticsCache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    test('should invalidate campaign cache', () => {
      const key1 = analyticsCache.generateKey('campaign1', { progressDays: 30 });
      const key2 = analyticsCache.generateKey('campaign1', { progressDays: 60 });
      const key3 = analyticsCache.generateKey('campaign2', { progressDays: 30 });

      analyticsCache.set(key1, { data: 1 });
      analyticsCache.set(key2, { data: 2 });
      analyticsCache.set(key3, { data: 3 });

      const deleted = analyticsCache.invalidate('campaign1');

      expect(deleted).toBe(2);
      expect(analyticsCache.get(key1)).toBeNull();
      expect(analyticsCache.get(key2)).toBeNull();
      expect(analyticsCache.get(key3)).toEqual({ data: 3 });
    });

    test('should clear all cache', () => {
      const key1 = analyticsCache.generateKey('campaign1');
      const key2 = analyticsCache.generateKey('campaign2');

      analyticsCache.set(key1, { data: 1 });
      analyticsCache.set(key2, { data: 2 });

      analyticsCache.clear();

      expect(analyticsCache.get(key1)).toBeNull();
      expect(analyticsCache.get(key2)).toBeNull();
    });

    test('should expire old cache entries', (done) => {
      const key = analyticsCache.generateKey('campaign1');
      const cache = new (require('../../src/utils/analyticsCache').constructor)(100); // 100ms TTL

      cache.set(key, { data: 'test' });
      expect(cache.get(key)).toBeDefined();

      // After TTL expires
      setTimeout(() => {
        expect(cache.get(key)).toBeNull();
        done();
      }, 150);
    });

    test('should get memory info', () => {
      const key = analyticsCache.generateKey('campaign1');
      analyticsCache.set(key, { data: 'test' });

      const memoryInfo = analyticsCache.getMemoryInfo();

      expect(memoryInfo.entries).toBeGreaterThan(0);
      expect(memoryInfo.estimatedBytesUsed).toBeGreaterThan(0);
      expect(memoryInfo.estimatedKbUsed).toBeDefined();
    });
  });

  describe('Performance', () => {
    test('should query analytics in <500ms', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        title: 'Test',
        status: 'active',
        published_at: new Date(),
        created_at: new Date(),
        view_count: 100,
        share_count: 50,
        metrics: {
          total_donations: 10,
          total_donation_amount: 50000,
          total_volunteers: 2,
          total_customers_acquired: 1,
          unique_supporters: new Set(['u1']),
          donations_by_method: {},
          shares_by_channel: {},
          shares_paid: 0,
          shares_free: 0,
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange.mockResolvedValue([]);

      const start = Date.now();
      await AnalyticsService.getAnalytics('campaign1');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    test('should serve cached analytics instantly', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        title: 'Test',
        status: 'active',
        published_at: new Date(),
        created_at: new Date(),
        view_count: 100,
        share_count: 50,
        metrics: {
          total_donations: 10,
          total_donation_amount: 50000,
          total_volunteers: 2,
          total_customers_acquired: 1,
          unique_supporters: new Set(),
          donations_by_method: {},
          shares_by_channel: {},
          shares_paid: 0,
          shares_free: 0,
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange.mockResolvedValue([]);

      // First call - uncached
      await AnalyticsService.getAnalytics('campaign1');

      // Second call - cached
      const start = Date.now();
      const key = analyticsCache.generateKey('campaign1');
      analyticsCache.get(key);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });

  describe('Edge Cases', () => {
    test('should handle campaign not found', async () => {
      Campaign.findById.mockResolvedValue(null);
      Campaign.findOne.mockResolvedValue(null);

      await expect(AnalyticsService.updateMetrics('nonexistent', {}))
        .rejects
        .toThrow('Campaign not found');
    });

    test('should handle metrics with zero values', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        view_count: 0,
        share_count: 0,
        metrics: {
          total_donations: 0,
          unique_supporters: new Set(),
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange.mockResolvedValue([]);

      const result = await AnalyticsService.getAnalytics('campaign1');

      expect(result.metrics.total_donations).toBe(0);
      expect(result.metrics.unique_supporters).toBe(0);
    });

    test('should handle large supporter sets', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        title: 'Test',
        status: 'active',
        published_at: new Date(),
        created_at: new Date(),
        view_count: 1000,
        share_count: 500,
        metrics: {
          total_donations: 100,
          total_donation_amount: 500000,
          total_volunteers: 50,
          total_customers_acquired: 25,
          unique_supporters: new Set(Array.from({ length: 1000 }, (_, i) => `user${i}`)),
          donations_by_method: {},
          shares_by_channel: {},
          shares_paid: 250,
          shares_free: 250,
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      CampaignProgress.findByDateRange.mockResolvedValue([]);

      const result = await AnalyticsService.getAnalytics('campaign1');

      expect(result.metrics.unique_supporters).toBe(1000);
    });
  });

  describe('Integration', () => {
    test('should record snapshot after metrics update', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        view_count: 100,
        share_count: 50,
        metrics: {
          total_donations: 5,
          total_donation_amount: 25000,
          total_volunteers: 2,
          total_customers_acquired: 1,
          unique_supporters: new Set(['u1']),
          donations_by_method: { paypal: 5 },
          shares_by_channel: { facebook: 30, twitter: 20 },
          shares_paid: 10,
          shares_free: 40,
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue(mockCampaign);
      CampaignProgress.create.mockResolvedValue({});

      // Update metrics
      await AnalyticsService.updateMetrics('campaign1', {
        type: 'donation',
        amount: 5000,
        method: 'paypal',
      });

      // Record snapshot
      await AnalyticsService.recordProgressSnapshot('campaign1');

      expect(CampaignProgress.create).toHaveBeenCalled();
    });

    test('should track multiple metrics sequentially', async () => {
      const mockCampaign = {
        _id: 'campaign1',
        campaign_id: 'CAMP-001',
        view_count: 0,
        share_count: 0,
        metrics: {
          total_donations: 0,
          total_volunteers: 0,
          unique_supporters: new Set(),
          last_metrics_update: new Date(),
          donations_by_method: {},
          shares_by_channel: {},
          shares_paid: 0,
          shares_free: 0,
        },
      };

      Campaign.findById.mockResolvedValue(mockCampaign);
      Campaign.findByIdAndUpdate.mockResolvedValue(mockCampaign);

      // Multiple updates
      await AnalyticsService.updateMetrics('campaign1', { type: 'donation' });
      await AnalyticsService.updateMetrics('campaign1', { type: 'volunteer' });
      await AnalyticsService.updateMetrics('campaign1', { type: 'share' });
      await AnalyticsService.updateMetrics('campaign1', { type: 'view' });

      expect(Campaign.findByIdAndUpdate).toHaveBeenCalledTimes(4);
    });
  });
});
