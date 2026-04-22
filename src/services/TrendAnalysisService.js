/**
 * Comprehensive Trend Analysis Service
 * 
 * Features:
 * - Linear regression & trend detection
 * - Moving averages (7-day, 30-day, 90-day)
 * - Momentum & volatility calculation
 * - Anomaly detection
 * - Seasonality pattern recognition
 * - Campaign performance forecasting
 * - Cohort analysis
 * - Comparative insights
 * 
 * Required Dependencies: winstonLogger (logging)
 */

const { ShareRecord } = require('../models/Share');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const { winstonLogger } = require('../utils/logger');

const TrendAnalysisService = {
  /**
   * Analyze trends in share data
   * Returns: trend line, growth rate, momentum, forecast
   */
  async analyzeShareTrends(campaignId, days = 30) {
    try {
      winstonLogger.info('[TrendAnalysisService] Analyzing share trends', {
        campaignId,
        days,
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get daily share counts
      const dailyData = await this._getDailyMetrics(
        { campaign_id: campaignId, created_at: { $gte: startDate } },
        'shares'
      );

      if (dailyData.length < 2) {
        return { error: 'Insufficient data for trend analysis', data: dailyData };
      }

      // Calculate metrics
      const trend = this._calculateLinearTrend(dailyData);
      const movingAvg7 = this._calculateMovingAverage(dailyData, 7);
      const movingAvg30 = this._calculateMovingAverage(dailyData, 30);
      const momentum = this._calculateMomentum(dailyData);
      const volatility = this._calculateVolatility(dailyData);
      const anomalies = this._detectAnomalies(dailyData);

      // Determine trend direction
      const trendDirection = this._determineTrendDirection(trend, momentum);

      // Project forward
      const forecast = this._forecastMetric(dailyData, 7);

      return {
        success: true,
        campaignId,
        period: {
          start: new Date(startDate),
          end: new Date(),
          days,
        },
        trend: {
          slope: trend.slope.toFixed(4),
          intercept: trend.intercept.toFixed(2),
          r_squared: trend.r_squared.toFixed(4),
          direction: trendDirection, // 'increasing', 'decreasing', 'stable'
        },
        movingAverages: {
          avg_7day: movingAvg7.toFixed(2),
          avg_30day: movingAvg30.toFixed(2),
        },
        momentum: {
          value: momentum.toFixed(2),
          interpretation: momentum > 0 ? 'accelerating' : 'decelerating',
        },
        volatility: {
          standardDeviation: volatility.std.toFixed(2),
          coefficient: volatility.cv.toFixed(4),
          interpretation:
            volatility.cv > 0.5 ? 'high' : volatility.cv > 0.2 ? 'medium' : 'low',
        },
        anomalies: {
          count: anomalies.length,
          items: anomalies.slice(0, 5), // Top 5 anomalies
        },
        forecast: {
          next_7_days: forecast.projected,
          confidence_interval: {
            upper: forecast.upper.toFixed(2),
            lower: forecast.lower.toFixed(2),
          },
        },
        recommendation: this._generateTrendRecommendation(
          trendDirection,
          momentum,
          anomalies
        ),
      };
    } catch (error) {
      winstonLogger.error('[TrendAnalysisService] Share trend analysis failed', { error });
      throw error;
    }
  },

  /**
   * Analyze donation trends
   */
  async analyzeDonationTrends(campaignId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get daily donation amounts
      const dailyData = await this._getDailyMetrics(
        {
          campaign_id: campaignId,
          transaction_type: 'donation',
          status: { $in: ['completed', 'verified'] },
          created_at: { $gte: startDate },
        },
        'donations',
        'amount'
      );

      if (dailyData.length < 2) {
        return { error: 'Insufficient data for trend analysis', data: dailyData };
      }

      const trend = this._calculateLinearTrend(dailyData);
      const movingAvg = this._calculateMovingAverage(dailyData, 7);
      const momentum = this._calculateMomentum(dailyData);
      const volatility = this._calculateVolatility(dailyData);

      return {
        success: true,
        campaignId,
        trend: {
          slope: (trend.slope / 100).toFixed(2), // Convert cents to dollars
          direction: this._determineTrendDirection(trend, momentum),
          r_squared: trend.r_squared.toFixed(4),
        },
        movingAverages: {
          avg_7day_usd: (movingAvg / 100).toFixed(2),
        },
        momentum: momentum.toFixed(4),
        volatility: volatility.std.toFixed(2),
        dailyData,
      };
    } catch (error) {
      winstonLogger.error('[TrendAnalysisService] Donation trend analysis failed', { error });
      throw error;
    }
  },

  /**
   * Detect seasonality patterns (day of week, time of day, etc.)
   */
  async detectSeasonality(campaignId, lookbackDays = 60) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);

      // Aggregate by day of week
      const pipeline = [
        {
          $match: {
            campaign_id: campaignId,
            created_at: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              dayOfWeek: { $dayOfWeek: '$created_at' },
              hour: { $hour: '$created_at' },
            },
            count: { $sum: 1 },
            totalReward: { $sum: '$reward_amount' },
          },
        },
        { $sort: { '_id.dayOfWeek': 1, '_id.hour': 1 } },
      ];

      const seasonalData = await ShareRecord.aggregate(pipeline).exec();

      // Process by day of week
      const dayOfWeekPattern = this._groupByDayOfWeek(seasonalData);
      const hourOfDayPattern = this._groupByHourOfDay(seasonalData);

      // Identify peak days/hours
      const peakDay = this._findPeak(dayOfWeekPattern);
      const peakHour = this._findPeak(hourOfDayPattern);

      return {
        success: true,
        campaignId,
        dayOfWeekPattern: this._formatSeasonalPattern(dayOfWeekPattern),
        hourOfDayPattern: this._formatSeasonalPattern(hourOfDayPattern),
        peaks: {
          dayOfWeek: this._getDayName(peakDay.day),
          hour: `${peakDay.hour}:00`,
          recommendation: `Peak engagement on ${this._getDayName(
            peakDay.day
          )}s around ${peakDay.hour}:00`,
        },
      };
    } catch (error) {
      winstonLogger.error('[TrendAnalysisService] Seasonality detection failed', { error });
      throw error;
    }
  },

  /**
   * Compare performance across similar campaigns
   */
  async compareWithSimilarCampaigns(campaignId, metric = 'shares') {
    try {
      // Get current campaign
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');

      // Find similar campaigns (same category, similar duration)
      const similarCampaigns = await Campaign.find({
        _id: { $ne: campaignId },
        category: campaign.category,
        duration: {
          $gte: campaign.duration * 0.8,
          $lte: campaign.duration * 1.2,
        },
      })
        .limit(5)
        .lean();

      if (similarCampaigns.length === 0) {
        return { message: 'No similar campaigns found for comparison' };
      }

      // Get metrics for all campaigns
      const metrics = await Promise.all([
        this._getCampaignMetric(campaignId, metric),
        ...similarCampaigns.map((c) => this._getCampaignMetric(c._id, metric)),
      ]);

      const currentMetric = metrics[0];
      const similarMetrics = metrics.slice(1);

      const avg = similarMetrics.reduce((a, b) => a + b, 0) / similarMetrics.length;
      const percentile = ((metrics.filter((m) => m < currentMetric).length / metrics.length) * 100).toFixed(1);

      return {
        success: true,
        campaignId,
        metric,
        current: currentMetric,
        similar: {
          average: avg.toFixed(2),
          median: this._median(similarMetrics).toFixed(2),
          max: Math.max(...similarMetrics),
          min: Math.min(...similarMetrics),
        },
        percentile: `${percentile}th percentile`,
        recommendation:
          currentMetric > avg
            ? `🟢 Above average for similar campaigns (${(((currentMetric - avg) / avg) * 100).toFixed(1)}% higher)`
            : `🔴 Below average for similar campaigns (${(((avg - currentMetric) / avg) * 100).toFixed(1)}% lower)`,
      };
    } catch (error) {
      winstonLogger.error('[TrendAnalysisService] Campaign comparison failed', { error });
      throw error;
    }
  },

  /**
   * PRIVATE METHODS
   */

  async _getDailyMetrics(match, metricType, field = 'count') {
    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
          },
          value: field === 'count' ? { $sum: 1 } : { $sum: `$${field}` },
          date: {
            $first: '$created_at',
          },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 100 },
    ];

    const model = metricType === 'shares' ? ShareRecord : Transaction;
    const result = await model.aggregate(pipeline).exec();

    return result.map((item, index) => ({
      date: item._id,
      value: field === 'count' ? item.value : item.value,
      index: index,
    }));
  },

  _calculateLinearTrend(data) {
    if (data.length < 2) return null;

    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, item) => sum + item.value, 0);
    const sumXY = data.reduce((sum, item, i) => sum + i * item.value, 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = data.reduce((sum, item) => sum + Math.pow(item.value - yMean, 2), 0);
    const ssRes = data.reduce((sum, item, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(item.value - predicted, 2);
    }, 0);
    const r_squared = 1 - ssRes / ssTotal;

    return { slope, intercept, r_squared };
  },

  _calculateMovingAverage(data, period) {
    if (data.length < period) return data.reduce((sum, item) => sum + item.value, 0) / data.length;

    const lastItems = data.slice(-period);
    return lastItems.reduce((sum, item) => sum + item.value, 0) / period;
  },

  _calculateMomentum(data) {
    if (data.length < 2) return 0;

    const first = data.slice(0, Math.floor(data.length / 2)).reduce((sum, item) => sum + item.value, 0) / Math.floor(data.length / 2);
    const last = data.slice(-Math.floor(data.length / 2)).reduce((sum, item) => sum + item.value, 0) / Math.floor(data.length / 2);

    return last - first;
  },

  _calculateVolatility(data) {
    const mean = data.reduce((sum, item) => sum + item.value, 0) / data.length;
    const variance = data.reduce((sum, item) => sum + Math.pow(item.value - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 0;

    return { std, cv };
  },

  _detectAnomalies(data, threshold = 2.5) {
    const mean = data.reduce((sum, item) => sum + item.value, 0) / data.length;
    const { std } = this._calculateVolatility(data);

    return data
      .map((item, idx) => ({
        ...item,
        zscore: (item.value - mean) / std,
        isAnomaly: Math.abs((item.value - mean) / std) > threshold,
      }))
      .filter((item) => item.isAnomaly);
  },

  _determineTrendDirection(trend, momentum) {
    if (!trend) return 'unknown';

    const slope = trend.slope;
    const r2 = trend.r_squared;

    if (r2 < 0.3) return 'stable'; // Weak trend
    if (slope > 0 && momentum > 0) return 'increasing';
    if (slope < 0 && momentum < 0) return 'decreasing';
    if (slope > 0 && momentum <= 0) return 'declining_growth';
    if (slope < 0 && momentum > 0) return 'recovering';

    return 'mixed';
  },

  _forecastMetric(data, daysAhead) {
    const trend = this._calculateLinearTrend(data);
    if (!trend) return { projected: 0 };

    const lastIndex = data.length - 1;
    const projections = [];

    for (let i = 1; i <= daysAhead; i++) {
      projections.push(trend.slope * (lastIndex + i) + trend.intercept);
    }

    const avg = projections.reduce((a, b) => a + b, 0) / projections.length;
    const { std } = this._calculateVolatility(data);

    return {
      projected: avg.toFixed(2),
      upper: (avg + 1.96 * std).toFixed(2),
      lower: (avg - 1.96 * std).toFixed(2),
    };
  },

  _groupByDayOfWeek(data) {
    const days = {};
    data.forEach((item) => {
      const day = item._id.dayOfWeek;
      days[day] = (days[day] || 0) + item.count;
    });
    return days;
  },

  _groupByHourOfDay(data) {
    const hours = {};
    data.forEach((item) => {
      const hour = item._id.hour;
      hours[hour] = (hours[hour] || 0) + item.count;
    });
    return hours;
  },

  _findPeak(pattern) {
    let maxKey = null;
    let maxValue = 0;

    Object.entries(pattern).forEach(([key, value]) => {
      if (value > maxValue) {
        maxValue = value;
        maxKey = key;
      }
    });

    return { day: parseInt(maxKey), hour: parseInt(maxKey), value: maxValue };
  },

  _formatSeasonalPattern(pattern) {
    return Object.entries(pattern)
      .map(([key, value]) => ({
        period: key,
        count: value,
      }))
      .sort((a, b) => b.count - a.count);
  },

  _getDayName(dayOfWeek) {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return days[dayOfWeek - 1] || 'Unknown';
  },

  async _getCampaignMetric(campaignId, metric) {
    if (metric === 'shares') {
      const result = await ShareRecord.countDocuments({ campaign_id: campaignId });
      return result;
    } else if (metric === 'donations') {
      const result = await Transaction.aggregate([
        {
          $match: {
            campaign_id: campaignId,
            transaction_type: 'donation',
            status: 'completed',
          },
        },
        { $count: 'count' },
      ]);
      return result.length > 0 ? result[0].count : 0;
    }
  },

  _median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },

  _generateTrendRecommendation(direction, momentum, anomalies) {
    if (direction === 'increasing' && momentum > 0) {
      return '🚀 Strong upward momentum. Keep current strategy.';
    } else if (direction === 'increasing' && momentum <= 0) {
      return '⚠️ Growth is slowing. Consider new campaigns or strategies.';
    } else if (direction === 'decreasing') {
      return '📉 Downward trend detected. Review campaign messaging and timing.';
    } else if (anomalies.length > 0) {
      return `⚡ ${anomalies.length} anomalies detected. Investigate unusual spikes/drops.`;
    }
    return '✓ Metrics stable. Continue monitoring.';
  },
};

module.exports = TrendAnalysisService;
