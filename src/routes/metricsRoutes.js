/**
 * Metrics & Analytics Routes
 * Comprehensive API endpoints for all analytics and reporting features
 * 
 * Base: /api/analytics
 */

const express = require('express');
const router = express.Router();
const MetricsController = require('../controllers/MetricsController');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * TIME-SERIES ANALYTICS
 * Historical data aggregated by time period
 */
router.get('/campaigns/:id/time-series', authMiddleware, async (req, res) => {
  await MetricsController.getTimeSeriesAnalytics(req, res);
});

/**
 * TREND ANALYSIS
 * Growth direction, momentum, forecasting
 */
router.get('/campaigns/:id/trends', authMiddleware, async (req, res) => {
  await MetricsController.getTrendAnalytics(req, res);
});

/**
 * COHORT ANALYSIS
 * Supporter groups by acquisition period/channel
 * Shows retention, lifetime value, performance
 */
router.get('/campaigns/:id/cohorts', authMiddleware, async (req, res) => {
  await MetricsController.getCohortAnalytics(req, res);
});

/**
 * PREDICTIVE ANALYTICS
 * Forecast performance, success probability, budget timeline
 */
router.get('/campaigns/:id/predict', authMiddleware, async (req, res) => {
  await MetricsController.getPredictiveAnalytics(req, res);
});

/**
 * COMPREHENSIVE ANALYTICS DASHBOARD
 * Combines all analytics in one call
 * Query: ?days=30 (7, 14, 30, 60, 90)
 */
router.get('/campaigns/:id/comprehensive', authMiddleware, async (req, res) => {
  await MetricsController.getComprehensiveAnalytics(req, res);
});

/**
 * SUPPORTER-LEVEL ANALYTICS
 * Trends in earnings by individual supporter
 */
router.get('/user/trends', authMiddleware, async (req, res) => {
  await MetricsController.getUserTrendAnalytics(req, res);
});

/**
 * ACQUISITION COHORTS
 * All supporters grouped by acquisition period
 */
router.get('/user/cohorts', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  await MetricsController.getUserCohortAnalytics(req, res);
});

/**
 * SUPPORTER ACTIVITY PREDICTION
 * Will this supporter continue engaging?
 */
router.get('/user/:id/activity-predict', authMiddleware, async (req, res) => {
  await MetricsController.predictSupporterActivity(req, res);
});

/**
 * DATA EXPORT
 * Download analytics as CSV or JSON
 * Query: ?format=csv|json
 */
router.get('/export', authMiddleware, authorizeRoles('admin', 'creator'), async (req, res) => {
  await MetricsController.exportAnalytics(req, res);
});

/**
 * CREATOR ANALYTICS DASHBOARD
 * Aggregated analytics for all creator's campaigns
 * Query: ?startDate=ISO_DATE&endDate=ISO_DATE
 */
router.get('/creator/dashboard', authMiddleware, async (req, res) => {
  try {
    console.log('🔍 [METRICS] /creator/dashboard hit', {
      path: req.path,
      method: req.method,
      user: req.user ? req.user.id : 'NO_USER',
      query: req.query,
    });
    
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    // Default to last 30 days if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get creator's campaigns
    const Campaign = require('../models/Campaign');
    const campaigns = await Campaign.find({ creator_id: userId });
    const campaignIds = campaigns.map(c => c._id);

    if (campaignIds.length === 0) {
      return res.json({
        success: true,
        data: {
          campaigns: [],
          summary: {
            totalRaised: 0, donationCount: 0, totalShares: 0, uniqueSupporters: 0,
            avgDonation: 0, totalClicks: 0, totalConversions: 0, conversionRate: 0,
          },
          trends: {
            totalShares: 0, totalDonations: 0, activeCampaigns: 0, averageEngagement: 0,
            donationGrowth: 0, shareGrowth: 0, supporterGrowth: 0, donationCountGrowth: 0,
          },
          timeSeries: [],
          forecastData: [],
          channelMetrics: [],
          topCampaigns: [],
          activityPredictions: [],
          recommendations: [],
          hourlyActivity: [],
          recentActivity: [],
          totalDonations: 0,
          totalShares: 0,
          totalEngagement: 0,
          dailyAverage: 0,
          peakDay: 0,
          donorCount: 0,
        }
      });
    }

    // Aggregate metrics across all campaigns
    const Transaction = require('../models/Transaction');
    const { ShareRecord } = require('../models/Share');

    // Previous period of equal length, immediately preceding [start, end].
    // Used to compute period-over-period growth percentages for the KPIs.
    const periodMs = Math.max(1, end.getTime() - start.getTime());
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - periodMs);

    const DONATION_STATUSES = ['verified', 'approved', 'completed', 'paid'];

    // Only count COMPLETED/VERIFIED donations (not pending, failed, refunded)
    const donations = await Transaction.find({
      creator_id: userId,
      status: { $in: DONATION_STATUSES },
      transaction_type: 'donation',
      created_at: { $gte: start, $lte: end }
    });

    // ShareRecord has no creator_id — shares are linked to a campaign. Resolve
    // the creator's shares through their campaign ids. (The previous query used
    // a non-existent creator_id field and therefore always returned zero.)
    const shares = await ShareRecord.find({
      campaign_id: { $in: campaignIds },
      created_at: { $gte: start, $lte: end }
    });

    // Previous-period donations/shares (counts + amounts only, for growth deltas)
    const prevDonations = await Transaction.find({
      creator_id: userId,
      status: { $in: DONATION_STATUSES },
      transaction_type: 'donation',
      created_at: { $gte: prevStart, $lt: prevEnd }
    }).select('amount_cents supporter_id created_at');

    const prevShares = await ShareRecord.countDocuments({
      campaign_id: { $in: campaignIds },
      created_at: { $gte: prevStart, $lt: prevEnd }
    });

    const totalDonations = donations.reduce((sum, d) => sum + (d.amount_cents || 0), 0) / 100;
    const totalShares = shares.length;
    const totalEngagement = donations.length + shares.length;

    // Unique supporters (distinct donors) this period and last period
    const uniqueSupporters = new Set(donations.map(d => String(d.supporter_id))).size;
    const prevUniqueSupporters = new Set(prevDonations.map(d => String(d.supporter_id))).size;
    const prevTotalDonationAmount = prevDonations.reduce((s, d) => s + (d.amount_cents || 0), 0) / 100;

    // Share engagement totals (clicks / conversions / reward spend / conversion value)
    const totalClicks = shares.reduce((s, sh) => s + (sh.clicks || 0), 0);
    const totalConversions = shares.reduce((s, sh) => s + (sh.conversions || 0), 0);
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Percentage growth helper (handles a zero baseline gracefully)
    const pctGrowth = (curr, prev) => {
      if (!prev) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const averageEngagement = donations.length > 0
      ? (totalConversions / Math.max(donations.length, 1)) * 100
      : 0;

    // Channel performance, supporter predictions and forecast are derived below
    const channelMetrics = buildChannelMetrics(shares);
    const topCampaigns = buildTopCampaigns(campaigns, donations);
    const activityPredictions = await buildActivityPredictions(donations, end);
    const timeSeries = generateTimeSeries(donations, shares, start, end);
    const forecastData = buildForecast(timeSeries);
    const recommendations = buildRecommendations({
      totalDonations,
      donationCount: donations.length,
      totalShares,
      totalClicks,
      totalConversions,
      conversionRate,
      channelMetrics,
      activeCampaigns,
      campaignCount: campaigns.length,
    });

    // ✅ FIX: Calculate daily average and peak day from actual data
    const dailyTotals = {};
    donations.forEach(d => {
      const date = new Date(d.created_at).toISOString().split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + (d.amount_cents || 0) / 100;
    });
    
    const dailyValues = Object.values(dailyTotals);
    const dailyAverage = dailyValues.length > 0
      ? totalDonations / dailyValues.length
      : 0;
    const peakDay = dailyValues.length > 0
      ? Math.max(...dailyValues)
      : 0;

    // Build a lookup of campaign id -> title for activity labelling
    const campaignTitleById = {};
    campaigns.forEach(c => { campaignTitleById[String(c._id)] = c.title; });

    // Real recent activity (most recent donations), no fabricated data
    const recentActivity = [...donations]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(d => ({
        id: String(d._id),
        type: 'donation',
        title: 'New Donation',
        campaignId: String(d.campaign_id),
        campaignTitle: campaignTitleById[String(d.campaign_id)] || 'Campaign',
        amount: Math.round((d.amount_cents || 0)) / 100,
        timestamp: d.created_at,
      }));

    res.json({
      success: true,
      data: {
        campaigns: campaigns.map(c => ({
          _id: c._id,
          title: c.title,
          status: c.status,
          goal: c.goal,
          type: c.campaign_type,
          image_url: c.image_url,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),

        // KPI summary (current period)
        summary: {
          totalRaised: Math.round(totalDonations * 100) / 100,
          donationCount: donations.length,
          totalShares,
          uniqueSupporters,
          avgDonation: donations.length > 0
            ? Math.round((totalDonations / donations.length) * 100) / 100
            : 0,
          totalClicks,
          totalConversions,
          conversionRate: Math.round(conversionRate * 10) / 10,
        },

        // Trend indicators (value + period-over-period growth %)
        trends: {
          totalShares,
          totalDonations: Math.round(totalDonations * 100) / 100,
          activeCampaigns,
          averageEngagement: Math.round(averageEngagement * 10) / 10,
          donationGrowth: Math.round(pctGrowth(totalDonations, prevTotalDonationAmount) * 10) / 10,
          shareGrowth: Math.round(pctGrowth(totalShares, prevShares) * 10) / 10,
          supporterGrowth: Math.round(pctGrowth(uniqueSupporters, prevUniqueSupporters) * 10) / 10,
          donationCountGrowth: Math.round(pctGrowth(donations.length, prevDonations.length) * 10) / 10,
        },

        timeSeries,
        forecastData,
        channelMetrics,
        topCampaigns,
        activityPredictions,
        recommendations,
        hourlyActivity: generateHourlyData(donations, shares),
        recentActivity,

        // Back-compat fields consumed by the dashboard's useDashboardMetrics hook
        totalDonations: Math.round(totalDonations * 100) / 100,
        totalShares,
        totalEngagement,
        dailyAverage: Math.round(dailyAverage * 100) / 100,
        peakDay: Math.round(peakDay * 100) / 100,
        donorCount: donations.length,
      }
    });
  } catch (error) {
    console.error('❌ [METRICS] /creator/dashboard ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATOR_ANALYTICS_ERROR'
    });
  }
});

// ── Helper functions ──────────────────────────────────────────────────────

/**
 * Build a daily time-series across [startDate, endDate]. Emits both the legacy
 * keys (value/count/donorCount — consumed by the dashboard) and the analytics
 * keys (donationAmount/donations/shares/displayDate) used by the charts.
 */
function generateTimeSeries(donations, shares, startDate, endDate) {
  const timeSeries = [];
  const amountMap = new Map();
  const countMap = new Map();
  const shareMap = new Map();

  donations.forEach(d => {
    const date = new Date(d.created_at).toISOString().split('T')[0];
    amountMap.set(date, (amountMap.get(date) || 0) + (d.amount_cents || 0) / 100);
    countMap.set(date, (countMap.get(date) || 0) + 1);
  });

  shares.forEach(s => {
    const date = new Date(s.created_at).toISOString().split('T')[0];
    shareMap.set(date, (shareMap.get(date) || 0) + 1);
  });

  // Cap the loop so an unbounded custom range can't spin forever (max ~366 pts)
  let cumulativeDonors = 0;
  let guard = 0;
  for (let d = new Date(startDate); d <= endDate && guard < 400; d.setDate(d.getDate() + 1), guard++) {
    const dateStr = d.toISOString().split('T')[0];
    const amount = Math.round((amountMap.get(dateStr) || 0) * 100) / 100;
    const count = countMap.get(dateStr) || 0;
    cumulativeDonors += count;
    timeSeries.push({
      date: dateStr,
      displayDate: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: amount,              // donation revenue in dollars (legacy key)
      count,                      // donations that day (legacy key)
      donorCount: cumulativeDonors, // cumulative donors to date (legacy key)
      donationAmount: amount,     // analytics alias
      donations: count,           // analytics alias
      shares: shareMap.get(dateStr) || 0,
    });
  }

  return timeSeries;
}

/**
 * Day-of-week x hour engagement heatmap built from real donation + share
 * timestamps. Returns one row per (dayOfWeek, hour) so the SeasonalHeatmap can
 * render a weekly grid keyed on { dayOfWeek, hour, engagement }.
 */
function generateHourlyData(donations, shares) {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const grid = new Map(); // key `${day}-${hour}` -> engagement

  const bump = (ts, weight) => {
    const d = new Date(ts);
    if (isNaN(d)) return;
    const key = `${DAYS[d.getDay()]}-${d.getHours()}`;
    grid.set(key, (grid.get(key) || 0) + weight);
  };

  donations.forEach(d => bump(d.created_at, 1));
  shares.forEach(s => bump(s.created_at, 0.5));

  const out = [];
  DAYS.forEach(day => {
    for (let hour = 0; hour < 24; hour++) {
      out.push({
        dayOfWeek: day,
        day,
        hour,
        engagement: Math.round((grid.get(`${day}-${hour}`) || 0) * 10) / 10,
      });
    }
  });
  return out;
}

/**
 * Per-channel share performance: spend (reward paid), revenue (conversion value),
 * ROI, impressions (share count), clicks and conversions.
 */
function buildChannelMetrics(shares) {
  const byChannel = {};
  shares.forEach(s => {
    const channel = s.channel || 'other';
    if (!byChannel[channel]) {
      byChannel[channel] = {
        channel, spend: 0, revenue: 0, roi: 0,
        impressions: 0, clicks: 0, conversions: 0,
      };
    }
    const c = byChannel[channel];
    c.impressions += 1;
    c.clicks += s.clicks || 0;
    c.conversions += s.conversions || 0;
    c.spend += (s.reward_amount || 0) / 100;            // cents -> dollars
    c.revenue += (s.total_conversion_value || 0) / 100; // cents -> dollars
  });

  return Object.values(byChannel).map(c => ({
    ...c,
    spend: Math.round(c.spend * 100) / 100,
    revenue: Math.round(c.revenue * 100) / 100,
    roi: c.spend > 0
      ? Math.round(((c.revenue - c.spend) / c.spend) * 100)
      : (c.revenue > 0 ? 100 : 0),
  })).sort((a, b) => b.revenue - a.revenue);
}

/**
 * Top campaigns by amount raised this period (amounts in dollars).
 */
function buildTopCampaigns(campaigns, donations) {
  const raisedById = {};
  const donorsById = {};
  donations.forEach(d => {
    const id = String(d.campaign_id);
    raisedById[id] = (raisedById[id] || 0) + (d.amount_cents || 0) / 100;
    (donorsById[id] = donorsById[id] || new Set()).add(String(d.supporter_id));
  });

  return campaigns
    .map(c => {
      const id = String(c._id);
      const raised = Math.round((raisedById[id] || 0) * 100) / 100;
      const goal = (c.goal || 0) / 100; // goal stored in cents
      return {
        _id: id,
        title: c.title,
        status: c.status,
        raised,
        goal: Math.round(goal * 100) / 100,
        donor_count: donorsById[id] ? donorsById[id].size : 0,
        pct: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
      };
    })
    .sort((a, b) => b.raised - a.raised)
    .slice(0, 5);
}

/**
 * Per-supporter activity prediction from donation history (recency + frequency
 * + value). Names are resolved from the User collection.
 */
async function buildActivityPredictions(donations, now) {
  const User = require('../models/User');
  const bySupporter = {};
  donations.forEach(d => {
    const id = String(d.supporter_id);
    if (!bySupporter[id]) {
      bySupporter[id] = { count: 0, value: 0, last: 0 };
    }
    const s = bySupporter[id];
    s.count += 1;
    s.value += (d.amount_cents || 0) / 100;
    s.last = Math.max(s.last, new Date(d.created_at).getTime());
  });

  const entries = Object.entries(bySupporter)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 8);
  if (entries.length === 0) return [];

  const ids = entries.map(([id]) => id);
  const users = await User.find({ _id: { $in: ids } }).select('display_name name').lean();
  const nameById = {};
  users.forEach(u => { nameById[String(u._id)] = u.display_name || u.name || 'Supporter'; });

  return entries.map(([id, s]) => {
    const daysSince = Math.floor((now.getTime() - s.last) / 86400000);
    // Score: frequency weighted, decayed by recency
    const recencyFactor = Math.max(0, 1 - daysSince / 60);
    const activityScore = Math.min(100, Math.round((s.count * 12 + s.value * 0.4) * (0.5 + 0.5 * recencyFactor)));
    const prediction = activityScore >= 66 ? 'high' : activityScore >= 33 ? 'medium' : 'low';
    const engagementTrend = s.count > 1 && daysSince < 14 ? 'increasing'
      : daysSince > 45 ? 'decreasing' : 'stable';
    const riskLevel = daysSince > 45 ? 'high' : daysSince > 21 ? 'medium' : 'low';
    return {
      userId: id,
      userName: nameById[id] || 'Supporter',
      activityScore,
      prediction,
      lastActivityDays: daysSince,
      engagementTrend,
      estimatedValue: Math.round((s.value / s.count) * 100) / 100,
      riskLevel,
    };
  });
}

/**
 * Simple linear-regression forecast of the next 14 days of daily revenue, with
 * a ±confidence band. Falls back to a flat mean when there isn't enough signal.
 */
function buildForecast(timeSeries) {
  const series = (timeSeries || []).map(t => t.value || 0);
  const n = series.length;
  if (n < 3) return [];

  // Least-squares slope/intercept over the index axis
  const xs = series.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = series.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * series[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  // Residual std-dev for the confidence band
  const mean = sumY / n;
  const variance = series.reduce((a, y, i) => {
    const pred = intercept + slope * i;
    return a + (y - pred) ** 2;
  }, 0) / n;
  const band = Math.sqrt(variance) || mean * 0.15;

  const lastDate = new Date(timeSeries[n - 1].date);
  const out = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    const forecast = Math.max(0, intercept + slope * (n - 1 + i));
    out.push({
      date: d.toISOString().split('T')[0],
      displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      forecast: Math.round(forecast * 100) / 100,
      upper: Math.round((forecast + band) * 100) / 100,
      lower: Math.round(Math.max(0, forecast - band) * 100) / 100,
      confidence: 90,
    });
  }
  return out;
}

/**
 * Data-driven optimization recommendations matching the OptimizationPanel shape
 * ({ id, title, description, impact, priority, category, ... }).
 */
function buildRecommendations(m) {
  const recs = [];

  if (m.conversionRate < 5 && m.totalClicks > 0) {
    recs.push({
      id: 'conv-low', category: 'platform', impact: 'high', priority: 'major',
      title: 'Low share-to-donation conversion',
      description: `Only ${m.conversionRate.toFixed(1)}% of share clicks convert. Add a stronger call-to-action and a compelling campaign image to lift conversions.`,
      action: 'Improve campaign landing content',
      expectedImprovement: 15,
    });
  }

  if (m.channelMetrics.length > 0) {
    const best = m.channelMetrics.reduce((a, b) => (b.roi > a.roi ? b : a));
    if (best.roi > 0) {
      recs.push({
        id: 'channel-best', category: 'platform', impact: 'high', priority: 'major',
        title: `Double down on ${best.channel}`,
        description: `${best.channel} is your highest-ROI channel at ${best.roi}%. Concentrate share rewards and promotion there for the best return.`,
        action: `Prioritize ${best.channel}`,
        expectedImprovement: 20,
      });
    }
  }

  if (m.totalShares === 0) {
    recs.push({
      id: 'no-shares', category: 'audience', impact: 'high', priority: 'critical',
      title: 'No shares recorded yet',
      description: 'Enable Share-to-Earn rewards and invite supporters to share — referral traffic is the strongest driver of new donations.',
      action: 'Launch Share-to-Earn',
      expectedImprovement: 30,
    });
  } else if (m.totalShares > 0 && m.totalConversions === 0) {
    recs.push({
      id: 'shares-no-conv', category: 'timing', impact: 'medium', priority: 'minor',
      title: 'Shares are not converting',
      description: 'Your campaign is being shared but visitors are not donating. Review the first impression: headline, hero image and suggested amounts.',
      action: 'Audit campaign page',
      expectedImprovement: 10,
    });
  }

  if (m.donationCount > 0 && m.totalDonations / m.donationCount < 25) {
    recs.push({
      id: 'avg-donation', category: 'reward', impact: 'medium', priority: 'minor',
      title: 'Raise your average donation',
      description: `Average donation is $${(m.totalDonations / m.donationCount).toFixed(2)}. Add suggested amounts and tie tiers to tangible impact to nudge it higher.`,
      action: 'Add donation tiers',
      expectedImprovement: 12,
    });
  }

  if (m.activeCampaigns === 0 && m.campaignCount > 0) {
    recs.push({
      id: 'no-active', category: 'timing', impact: 'high', priority: 'critical',
      title: 'No active campaigns',
      description: 'None of your campaigns are currently active. Activate a campaign so supporters can donate and share.',
      action: 'Activate a campaign',
      expectedImprovement: 25,
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: 'all-good', category: 'audience', impact: 'low', priority: 'minor',
      title: 'Healthy performance',
      description: 'Your campaigns are performing well across donations and sharing. Keep engaging supporters with regular updates to sustain momentum.',
      action: 'Post a campaign update',
      expectedImprovement: 5,
    });
  }

  return recs;
}

/**
 * PLATFORM TRENDS (from existing implementation)
 * Which channels are trending?
 */
router.get(
  '/campaigns/:id/platform-trends',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;
      const { days = 30 } = req.query;

      const TrendAnalysisService = require('../services/TrendAnalysisService');
      const platformTrends = await TrendAnalysisService.getPlatformTrendAnalysis(
        campaignId,
        parseInt(days)
      );

      res.status(200).json({
        success: true,
        data: platformTrends,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * SEASONAL ANALYSIS
 * Best days/times for engagement
 */
router.get(
  '/campaigns/:id/seasonal',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;
      const { days = 60 } = req.query;

      const TrendAnalysisService = require('../services/TrendAnalysisService');
      const seasonal = await TrendAnalysisService.getSeasonalTrendAnalysis(
        campaignId,
        parseInt(days)
      );

      res.status(200).json({
        success: true,
        data: seasonal,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PERIOD COMPARISON
 * Compare weeks, months, or years
 * Query: ?type=WoW|MoM|YoY
 */
router.get(
  '/campaigns/:id/compare-periods',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;
      const { type = 'WoW' } = req.query;

      const TimeSeriesAnalyticsService = require('../services/TimeSeriesAnalyticsService');
      const comparison = await TimeSeriesAnalyticsService.getPeriodComparison(
        campaignId,
        'shares',
        type
      );

      res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * CHANNEL COHORT PERFORMANCE
 * How do different traffic sources perform?
 */
router.get(
  '/campaigns/:id/channel-cohorts',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;

      const CohortAnalysisService = require('../services/CohortAnalysisService');
      const channelCohorts = await CohortAnalysisService.analyzeChannelCohorts(campaignId);

      res.status(200).json({
        success: true,
        data: channelCohorts,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * REWARD OPTIMIZATION
 * What reward amount maximizes shares?
 */
router.get(
  '/campaigns/:id/optimize-rewards',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;

      const PredictiveAnalyticsService = require('../services/PredictiveAnalyticsService');
      const optimization = await PredictiveAnalyticsService.optimizeRewardStrategy(campaignId);

      res.status(200).json({
        success: true,
        data: optimization,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
