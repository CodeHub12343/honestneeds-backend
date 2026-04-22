/**
 * Predictive Analytics Service
 * Forecasts campaign performance and supporter behavior
 * 
 * Models:
 * - Linear regression for trend continuation
 * - Exponential smoothing for seasonality
 * - Time series forecasting
 * - Success probability estimation
 * - Supporter activity prediction
 * - Budget depletion timeline
 */

const { ShareRecord } = require('../models/Share');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const { winstonLogger } = require('../utils/logger');

const PredictiveAnalyticsService = {
  /**
   * Predict campaign performance (shares, revenue)
   * Forecasts next N days based on historical trends
   */
  async predictCampaignPerformance(campaignId, forecastDays = 14) {
    try {
      winstonLogger.info('[PredictiveAnalyticsService] Predicting campaign performance', {
        campaignId,
        forecastDays,
      });

      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');

      // Get historical data (last 60 days)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60);
      startDate.setHours(0, 0, 0, 0);

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
              $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
            },
            count: { $sum: 1 },
            totalReward: { $sum: '$reward_amount' },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const historicalData = await ShareRecord.aggregate(pipeline).exec();
      const values = historicalData.map((d) => d.count);
      const rewards = historicalData.map((d) => d.totalReward);

      if (values.length < 7) {
        throw new Error('Insufficient historical data for prediction (need at least 7 days)');
      }

      // Calculate trend and seasonality
      const trend = this._calculateTrend(values);
      const seasonality = this._calculateSeasonality(values);
      const level = values[values.length - 1];

      // Generate forecast using exponential smoothing
      const forecast = this._forecastExponentialSmoothing(
        values,
        seasonality,
        trend,
        level,
        forecastDays
      );

      // Calculate confidence intervals
      const confidenceIntervals = this._calculateConfidenceIntervals(
        values,
        forecast,
        0.95
      );

      // Calculate success probability
      const successProbability = this._estimateSuccessProbability(
        campaign,
        forecast,
        values
      );

      // Budget depletion timeline
      let budgetDepletionDays = null;
      const remainingBudget =
        campaign.share_config.total_budget - campaign.share_config.total_reward_distributed;
      const avgRewardPerShare = campaign.share_config.amount_per_share;

      if (avgRewardPerShare > 0) {
        let cumulativeSpend = 0;
        for (let i = 0; i < forecast.length; i++) {
          cumulativeSpend += forecast[i] * avgRewardPerShare;
          if (cumulativeSpend >= remainingBudget) {
            budgetDepletionDays = i + 1;
            break;
          }
        }
      }

      return {
        success: true,
        campaignId,
        forecastPeriod: {
          start: new Date(),
          end: new Date(Date.now() + forecastDays * 24 * 60 * 60 * 1000),
          days: forecastDays,
        },
        historicalAverage: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
        forecast: {
          projectedShares: forecast.map((v) => Math.round(v)),
          totalProjectedShares: Math.round(forecast.reduce((a, b) => a + b, 0)),
          dailyAverage: (forecast.reduce((a, b) => a + b, 0) / forecastDays).toFixed(2),
          trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
          trendStrength: Math.abs(trend).toFixed(4),
        },
        confidence: {
          interval: '95%',
          upper: confidenceIntervals.map((ci) => Math.round(ci.upper)),
          lower: confidenceIntervals.map((ci) => Math.max(0, Math.round(ci.lower))),
        },
        successMetrics: {
          probability: successProbability.probability.toFixed(2),
          likelihood: successProbability.likelihood,
          baselineComparison: successProbability.comparison,
        },
        budgetProjection: {
          remainingBudgetUSD: (remainingBudget / 100).toFixed(2),
          projectedSpendUSD: (
            (forecast.reduce((a, b) => a + b, 0) *
              campaign.share_config.amount_per_share) /
            100
          ).toFixed(2),
          depletionDays: budgetDepletionDays,
          depletionDate:
            budgetDepletionDays !== null
              ? new Date(Date.now() + budgetDepletionDays * 24 * 60 * 60 * 1000)
              : 'Not expected',
        },
        recommendations: this._generateForecastRecommendations(
          forecast,
          successProbability,
          budgetDepletionDays,
          remainingBudget
        ),
      };
    } catch (error) {
      winstonLogger.error('[PredictiveAnalyticsService] Campaign performance prediction failed', {
        error,
      });
      throw error;
    }
  },

  /**
   * Predict supporter activity
   * Will this supporter continue sharing?
   */
  async predictSupporterActivity(supporterId, campaignId) {
    try {
      // Get supporter's sharing history for this campaign
      const shares = await ShareRecord.find({
        supporter_id: supporterId,
        campaign_id: campaignId,
      })
        .sort({ created_at: -1 })
        .limit(30)
        .lean();

      if (shares.length === 0) {
        return {
          success: true,
          prediction: 'No history',
          activityScore: 0,
          likelihood: 'Unknown',
        };
      }

      // Calculate activity metrics
      const lastShare = shares[0];
      const daysSinceLastShare = Math.floor(
        (Date.now() - new Date(lastShare.created_at)) / (24 * 60 * 60 * 1000)
      );
      const sharesPerWeek = this._calculateActivityFrequency(shares);
      const isActive = daysSinceLastShare <= 7;
      const momentum = this._calculateActivityMomentum(shares);

      // Score: 0-100
      let activityScore = 0;
      activityScore += isActive ? 40 : Math.max(0, 40 - daysSinceLastShare);
      activityScore += Math.min(30, sharesPerWeek * 5);
      activityScore += momentum > 0 ? 20 : 10;

      return {
        success: true,
        supporterId,
        campaignId,
        activityScore: Math.round(activityScore),
        metrics: {
          totalShares: shares.length,
          daysSinceLastShare,
          sharesPerWeek: sharesPerWeek.toFixed(2),
          momentum: momentum.toFixed(2),
          isActive,
        },
        prediction: {
          likelihood:
            activityScore >= 70
              ? 'Very likely'
              : activityScore >= 50
                ? 'Likely'
                : activityScore >= 30
                  ? 'Possible'
                  : 'Unlikely',
          nextShareWithin: this._predictNextShareDate(shares),
          expectedSharesNext30Days: this._projectFutureShares(shares, 30),
        },
      };
    } catch (error) {
      winstonLogger.error('[PredictiveAnalyticsService] Supporter activity prediction failed', {
        error,
      });
      throw error;
    }
  },

  /**
   * Predict optimal campaign parameters
   * What reward amount maximizes shares?
   */
  async optimizeRewardStrategy(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');

      // Get shares and their respective reward amounts
      const shares = await ShareRecord.aggregate([
        {
          $match: { campaign_id: campaignId },
        },
        {
          $group: {
            _id: null,
            totalShares: { $sum: 1 },
            avgReward: { $avg: '$reward_amount' },
            minReward: { $min: '$reward_amount' },
            maxReward: { $max: '$reward_amount' },
            byReward: {
              $push: {
                reward: '$reward_amount',
                earnedAt: '$created_at',
              },
            },
          },
        },
      ]).exec();

      if (!shares?.[0]) {
        return {
          success: true,
          recommendation: 'Insufficient data for optimization',
        };
      }

      const data = shares[0];

      // Analyze reward elasticity
      const rewardRanges = this._analyzeRewardElasticity(data.byReward);
      const optimalReward = this._findOptimalReward(rewardRanges);

      return {
        success: true,
        campaignId,
        currentReward: campaign.share_config.amount_per_share,
        analysis: {
          totalShares: data.totalShares,
          avgReward: Math.round(data.avgReward),
          avgRewardUSD: (data.avgReward / 100).toFixed(2),
        },
        recommendation: {
          optimalRewardCents: optimalReward.cents,
          optimalRewardUSD: (optimalReward.cents / 100).toFixed(2),
          expectedShareIncrease: `${optimalReward.expectedGrowth}%`,
          reasoning:
            optimalReward.cents > campaign.share_config.amount_per_share
              ? `Increasing reward to $${(optimalReward.cents / 100).toFixed(2)} could boost shares`
              : `Current reward of $${(campaign.share_config.amount_per_share / 100).toFixed(2)} is near-optimal`,
        },
        rewardBrackets: rewardRanges,
      };
    } catch (error) {
      winstonLogger.error('[PredictiveAnalyticsService] Reward optimization failed', { error });
      throw error;
    }
  },

  /**
   * PRIVATE METHODS
   */

  _calculateTrend(values) {
    if (values.length < 2) return 0;

    // Calculate average change
    let sum = 0;
    for (let i = 1; i < values.length; i++) {
      sum += values[i] - values[i - 1];
    }
    return sum / (values.length - 1);
  },

  _calculateSeasonality(values) {
    // Calculate 7-day seasonality pattern
    if (values.length < 14) return Array(7).fill(1);

    const pattern = Array(7).fill(0);
    const counts = Array(7).fill(0);

    for (let i = 0; i < values.length; i++) {
      const dayOfWeek = i % 7;
      pattern[dayOfWeek] += values[i];
      counts[dayOfWeek]++;
    }

    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    return pattern.map((p, i) => {
      const dayAvg = counts[i] > 0 ? p / counts[i] : avg;
      return dayAvg > 0 ? dayAvg / avg : 1;
    });
  },

  _forecastExponentialSmoothing(values, seasonality, trend, level, periods) {
    const alpha = 0.3; // Smoothing factor
    const gamma = 0.1; // Trend smoothing
    const forecast = [];

    let currentLevel = level;
    let currentTrend = trend;

    for (let i = 0; i < periods; i++) {
      const seasonalIndex = i % seasonality.length;
      const seasonalFactor = seasonality[seasonalIndex];

      const predicted = (currentLevel + currentTrend) * seasonalFactor;
      forecast.push(Math.max(0, predicted));

      // Update level and trend
      currentLevel = alpha * predicted + (1 - alpha) * (currentLevel + currentTrend);
      currentTrend = gamma * (currentLevel - level) + (1 - gamma) * currentTrend;

      level = currentLevel;
    }

    return forecast;
  },

  _calculateConfidenceIntervals(historical, forecast, confidence) {
    // Calculate standard error
    const residuals = [];
    let sum = 0;

    for (let i = 0; i < Math.min(historical.length, forecast.length); i++) {
      const residual = historical[i] - forecast[i];
      residuals.push(residual);
      sum += residual ** 2;
    }

    const rmse = Math.sqrt(sum / residuals.length);

    // Z-score for 95% confidence
    const zScore = confidence === 0.95 ? 1.96 : 1.645;

    return forecast.map((f) => ({
      prediction: f,
      upper: f + zScore * rmse,
      lower: f - zScore * rmse,
    }));
  },

  _estimateSuccessProbability(campaign, forecast, historical) {
    const goalAmount = campaign.share_config?.total_budget || 0;
    const projectedEarnings = forecast.reduce((a, b) => a + b, 0) *
      campaign.share_config?.amount_per_share || 0;
    const currentEarnings = campaign.share_config?.total_reward_distributed || 0;

    const progressToGoal = (currentEarnings / goalAmount) * 100;
    const projectedTotal = currentEarnings + projectedEarnings;
    const probabilityOfMeeting = Math.min(
      100,
      (projectedTotal / goalAmount) * 100
    );

    return {
      probability: Math.max(0, Math.min(100, probabilityOfMeeting)),
      likelihood:
        probabilityOfMeeting >= 80
          ? 'Highly likely'
          : probabilityOfMeeting >= 50
            ? 'Likely'
            : probabilityOfMeeting >= 20
              ? 'Possible'
              : 'Unlikely',
      comparison: `${progressToGoal.toFixed(1)}% of goal achieved so far`,
    };
  },

  _calculateActivityFrequency(shares) {
    if (shares.length < 2) return shares.length;

    const daysSpan = Math.floor(
      (new Date(shares[shares.length - 1].created_at) -
        new Date(shares[0].created_at)) /
        (24 * 60 * 60 * 1000)
    );

    return daysSpan > 0 ? (shares.length / daysSpan) * 7 : shares.length;
  },

  _calculateActivityMomentum(shares) {
    // Compare recent activity to older activity
    const mid = Math.floor(shares.length / 2);
    const recent = shares.slice(0, mid);
    const older = shares.slice(mid);

    const recentRate = recent.length / Math.max(1, mid);
    const olderRate = older.length / Math.max(1, shares.length - mid);

    return recentRate - olderRate;
  },

  _predictNextShareDate(shares) {
    if (shares.length === 0) return 'Unknown';

    const intervals = [];
    for (let i = 1; i < Math.min(shares.length, 10); i++) {
      const interval = Math.floor(
        (new Date(shares[i - 1].created_at) -
          new Date(shares[i].created_at)) /
          (24 * 60 * 60 * 1000)
      );
      intervals.push(interval);
    }

    const avgInterval =
      intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + avgInterval);

    return nextDate.toISOString().split('T')[0];
  },

  _projectFutureShares(shares, days) {
    const frequency = this._calculateActivityFrequency(shares);
    return Math.round((frequency / 7) * days);
  },

  _analyzeRewardElasticity(sharesByReward) {
    // Group by reward brackets
    const brackets = {};

    sharesByReward.forEach((s) => {
      const bracket = Math.floor(s.reward / 100) * 100; // Round to nearest dollar
      if (!brackets[bracket]) {
        brackets[bracket] = 0;
      }
      brackets[bracket]++;
    });

    return Object.entries(brackets)
      .map(([reward, count]) => ({
        rewardBracket: `$${(parseInt(reward) / 100).toFixed(2)}`,
        shareCount: count,
        elasticity: 'positive',
      }))
      .sort((a, b) => b.shareCount - a.shareCount);
  },

  _findOptimalReward(brackets) {
    if (brackets.length === 0) {
      return { cents: 1300, expectedGrowth: 0 };
    }

    const best = brackets[0];
    const average =
      brackets.reduce((sum, b) => sum + b.shareCount, 0) / brackets.length;

    const rewardCents = parseInt(best.rewardBracket) * 100;
    const growth = ((best.shareCount - average) / average) * 100;

    return {
      cents: rewardCents,
      expectedGrowth: Math.round(growth),
    };
  },

  _generateForecastRecommendations(forecast, success, depleteionDays, remainingBudget) {
    const recommendations = [];

    if (success.probability >= 80) {
      recommendations.push('✅ Campaign is on track to meet goals');
    } else if (success.probability >= 50) {
      recommendations.push('⚠️ Increase sharing incentive to boost engagement');
    } else {
      recommendations.push('❌ Consider adjusting strategy or extending campaign');
    }

    if (depletionDays && depletionDays < 7) {
      recommendations.push(`📊 Budget may deplete in ${depletionDays} days - consider reloading`);
    }

    const avgDaily = forecast.reduce((a, b) => a + b, 0) / forecast.length;
    if (avgDaily < 1) {
      recommendations.push('📢 Low predicted engagement - boost promotion');
    }

    return recommendations;
  },
};

module.exports = PredictiveAnalyticsService;
