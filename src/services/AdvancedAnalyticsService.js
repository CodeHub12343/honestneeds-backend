/**
 * Advanced Analytics Service
 *
 * Implements PRD §3.10 analytics features that were previously "Planned":
 *  - AN-02  Platform Analytics (admin)
 *  - AN-04  Donor Analytics
 *  - AN-05  Business Impact Analytics
 *  - AN-06  Sponsor ROI Analytics
 *  - AN-07  Platform Impact Dashboard (public)
 *  - AN-08  City/Region Impact Reports
 *  - AN-09  AI Viral Score Predictor
 *
 * Money is sourced from the Transaction collection (amount_cents/fee_cents),
 * which is the authoritative ledger used by the creator analytics dashboard.
 * Successful donations are transactions with transaction_type 'donation' and a
 * settled status (verified/approved).
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Sponsorship = require('../models/Sponsorship');
const BusinessProfile = require('../models/BusinessProfile');
const BusinessGiveaway = require('../models/BusinessGiveaway');
const GiveawayClaim = require('../models/GiveawayClaim');
const VolunteerHourLog = require('../models/VolunteerHourLog');
const winstonLogger = require('../utils/winstonLogger');

// Transaction statuses that represent money that actually landed.
const SETTLED_STATUSES = ['verified', 'approved'];
// Sponsorship statuses that represent committed/active money.
const ACTIVE_SPONSORSHIP_STATUSES = ['active', 'suspended', 'expired'];

const PERIOD_DAYS = { day: 1, week: 7, month: 30, quarter: 90, year: 365, all: null };

/**
 * Resolve a period keyword into a {start, end} window.
 * `all` returns a null start (no lower bound).
 */
function resolvePeriod(period = 'month') {
  const end = new Date();
  const days = PERIOD_DAYS[period] !== undefined ? PERIOD_DAYS[period] : 30;
  if (days === null) return { start: null, end, period };
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, period };
}

function pct(part, whole) {
  if (!whole) return 0;
  return parseFloat(((part / whole) * 100).toFixed(2));
}

function centsToDollars(cents) {
  return parseFloat(((cents || 0) / 100).toFixed(2));
}

const AdvancedAnalyticsService = {
  // ============================================================
  // AN-02  Platform Analytics (admin)
  // ============================================================
  /**
   * Comprehensive platform-wide analytics for the admin dashboard.
   * Combines users, campaigns, the donation funnel, sponsorship/business
   * revenue, category mix and geographic distribution into one payload.
   */
  async getPlatformAnalytics({ period = 'month' } = {}) {
    const { start, end } = resolvePeriod(period);
    const createdInPeriod = start ? { $gte: start, $lte: end } : { $lte: end };
    const donationMatch = {
      transaction_type: 'donation',
      status: { $in: SETTLED_STATUSES },
    };
    const donationPeriodMatch = { ...donationMatch, created_at: createdInPeriod };

    const [
      totalUsers,
      newUsers,
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      newCampaigns,
      donationAgg,
      donorAgg,
      sponsorshipAgg,
      totalBusinesses,
      categoryMix,
      geoDistribution,
    ] = await Promise.all([
      User.countDocuments({ deleted_at: null }),
      User.countDocuments({ deleted_at: null, created_at: createdInPeriod }),
      Campaign.countDocuments({ is_deleted: { $ne: true } }),
      Campaign.countDocuments({ status: 'active', is_deleted: { $ne: true } }),
      Campaign.countDocuments({ status: 'completed', is_deleted: { $ne: true } }),
      Campaign.countDocuments({ is_deleted: { $ne: true }, created_at: createdInPeriod }),
      Transaction.aggregate([
        { $match: donationPeriodMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross_cents: { $sum: '$amount_cents' },
            fee_cents: { $sum: '$platform_fee_cents' },
          },
        },
      ]),
      Transaction.distinct('supporter_id', donationPeriodMatch),
      Sponsorship.aggregate([
        { $match: { status: { $in: ACTIVE_SPONSORSHIP_STATUSES } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: '$grossAmount' },
            platform_fee: { $sum: '$platformFee' },
          },
        },
      ]),
      BusinessProfile.countDocuments({ deleted_at: null }),
      this._campaignCategoryMix(donationMatch),
      this._campaignGeoDistribution(),
    ]);

    const donations = donationAgg[0] || { count: 0, gross_cents: 0, fee_cents: 0 };
    const sponsorships = sponsorshipAgg[0] || { count: 0, gross: 0, platform_fee: 0 };

    return {
      period,
      generated_at: new Date().toISOString(),
      users: {
        total: totalUsers,
        new_this_period: newUsers,
        active_donors_this_period: donorAgg.length,
      },
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        completed: completedCampaigns,
        new_this_period: newCampaigns,
        completion_rate: pct(completedCampaigns, totalCampaigns),
      },
      donations: {
        count: donations.count,
        gross_cents: donations.gross_cents,
        gross_dollars: centsToDollars(donations.gross_cents),
        platform_fees_cents: donations.fee_cents,
        platform_fees_dollars: centsToDollars(donations.fee_cents),
        average_donation_dollars:
          donations.count > 0 ? centsToDollars(donations.gross_cents / donations.count) : 0,
      },
      revenue: {
        donation_fees_dollars: centsToDollars(donations.fee_cents),
        sponsorship_fees_dollars: centsToDollars(sponsorships.platform_fee),
        total_platform_revenue_dollars:
          centsToDollars(donations.fee_cents) + centsToDollars(sponsorships.platform_fee),
      },
      sponsorships: {
        active: sponsorships.count,
        gross_dollars: centsToDollars(sponsorships.gross),
      },
      businesses: { total: totalBusinesses },
      top_categories: categoryMix,
      geographic_distribution: geoDistribution,
    };
  },

  /**
   * Raised + campaign count grouped by campaign category (top 10).
   * @private
   */
  async _campaignCategoryMix() {
    const rows = await Campaign.aggregate([
      { $match: { is_deleted: { $ne: true } } },
      {
        $group: {
          _id: { $ifNull: ['$category', 'uncategorized'] },
          campaigns: { $sum: 1 },
          raised_cents: { $sum: '$metrics.total_donation_amount' },
        },
      },
      { $sort: { raised_cents: -1 } },
      { $limit: 10 },
    ]);
    return rows.map((r) => ({
      category: r._id,
      campaigns: r.campaigns,
      raised_dollars: centsToDollars(r.raised_cents),
    }));
  },

  /**
   * Campaign + raised totals grouped by country/state (top 15).
   * @private
   */
  async _campaignGeoDistribution() {
    const rows = await Campaign.aggregate([
      { $match: { is_deleted: { $ne: true } } },
      {
        $group: {
          _id: {
            country: { $ifNull: ['$location.country', 'Unknown'] },
            state: { $ifNull: ['$location.state', 'Unknown'] },
          },
          campaigns: { $sum: 1 },
          raised_cents: { $sum: '$metrics.total_donation_amount' },
        },
      },
      { $sort: { raised_cents: -1 } },
      { $limit: 15 },
    ]);
    return rows.map((r) => ({
      country: r._id.country,
      state: r._id.state,
      campaigns: r.campaigns,
      raised_dollars: centsToDollars(r.raised_cents),
    }));
  },

  // ============================================================
  // AN-04  Donor Analytics
  // ============================================================
  /**
   * Personal giving analytics for a single donor: lifetime totals, the
   * campaigns and categories they support, a monthly giving timeline and a
   * per-tax-year breakdown for receipts.
   */
  async getDonorAnalytics(donorId, { period = 'all' } = {}) {
    const supporterId = new mongoose.Types.ObjectId(donorId);
    const { start, end } = resolvePeriod(period);
    const baseMatch = {
      supporter_id: supporterId,
      transaction_type: 'donation',
      status: { $in: SETTLED_STATUSES },
    };
    const periodMatch = start ? { ...baseMatch, created_at: { $gte: start, $lte: end } } : baseMatch;

    const [summaryAgg, campaignsSupported, byCategory, timeline, byYear, recent] =
      await Promise.all([
        Transaction.aggregate([
          { $match: periodMatch },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total_cents: { $sum: '$amount_cents' },
              max_cents: { $max: '$amount_cents' },
              first_at: { $min: '$created_at' },
              last_at: { $max: '$created_at' },
            },
          },
        ]),
        Transaction.distinct('campaign_id', periodMatch),
        Transaction.aggregate([
          { $match: periodMatch },
          {
            $lookup: {
              from: 'campaigns',
              localField: 'campaign_id',
              foreignField: '_id',
              as: 'campaign',
            },
          },
          { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { $ifNull: ['$campaign.category', 'uncategorized'] },
              count: { $sum: 1 },
              total_cents: { $sum: '$amount_cents' },
            },
          },
          { $sort: { total_cents: -1 } },
        ]),
        Transaction.aggregate([
          { $match: periodMatch },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$created_at' } },
              count: { $sum: 1 },
              total_cents: { $sum: '$amount_cents' },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Transaction.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: { $year: '$created_at' },
              count: { $sum: 1 },
              total_cents: { $sum: '$amount_cents' },
            },
          },
          { $sort: { _id: -1 } },
        ]),
        Transaction.find(periodMatch)
          .sort({ created_at: -1 })
          .limit(10)
          .populate('campaign_id', 'title campaign_id category')
          .select('amount_cents created_at campaign_id payment_method')
          .lean(),
      ]);

    const summary = summaryAgg[0] || { count: 0, total_cents: 0, max_cents: 0 };

    return {
      donor_id: donorId,
      period,
      generated_at: new Date().toISOString(),
      summary: {
        total_donations: summary.count,
        total_donated_dollars: centsToDollars(summary.total_cents),
        average_donation_dollars:
          summary.count > 0 ? centsToDollars(summary.total_cents / summary.count) : 0,
        largest_donation_dollars: centsToDollars(summary.max_cents),
        campaigns_supported: campaignsSupported.length,
        first_donation_at: summary.first_at || null,
        last_donation_at: summary.last_at || null,
      },
      by_category: byCategory.map((c) => ({
        category: c._id,
        donations: c.count,
        total_dollars: centsToDollars(c.total_cents),
      })),
      monthly_timeline: timeline.map((t) => ({
        month: t._id,
        donations: t.count,
        total_dollars: centsToDollars(t.total_cents),
      })),
      tax_year_summary: byYear.map((y) => ({
        year: y._id,
        donations: y.count,
        total_dollars: centsToDollars(y.total_cents),
      })),
      recent_donations: recent.map((r) => ({
        amount_dollars: centsToDollars(r.amount_cents),
        campaign_title: r.campaign_id?.title || 'Unknown campaign',
        campaign_id: r.campaign_id?.campaign_id || r.campaign_id?._id,
        payment_method: r.payment_method,
        date: r.created_at,
      })),
    };
  },

  // ============================================================
  // AN-05  Business Impact Analytics
  // ============================================================
  /**
   * Social-impact / CSR rollup for a business: sponsorship dollars committed,
   * giveaways run and their reach (entries) and declared prize value, plus a
   * monthly contribution timeline. Resolved from either a business profile id
   * or the owning user id.
   */
  async getBusinessImpactAnalytics(businessProfileId) {
    const business = await BusinessProfile.findOne({
      _id: businessProfileId,
      deleted_at: null,
    }).lean();

    if (!business) {
      const err = new Error('Business profile not found');
      err.statusCode = 404;
      throw err;
    }

    const businessObjId = business._id;

    const [sponsorshipAgg, giveawayAgg, claimAgg, sponsorshipTimeline] = await Promise.all([
      Sponsorship.aggregate([
        { $match: { businessId: businessObjId, status: { $in: ACTIVE_SPONSORSHIP_STATUSES } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: '$grossAmount' },
            net: { $sum: '$netAmount' },
          },
        },
      ]),
      BusinessGiveaway.aggregate([
        { $match: { business_id: businessObjId, deleted_at: null } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total_entries: { $sum: '$entries_count' },
            total_winners: { $sum: '$winners_count' },
            total_prize_value_cents: { $sum: '$estimated_value_cents' },
          },
        },
      ]),
      // Winners who actually received their prize.
      GiveawayClaim.countDocuments({
        business_id: businessObjId,
        status: { $in: ['fulfilled', 'redeemed', 'shipped'] },
      }),
      Sponsorship.aggregate([
        { $match: { businessId: businessObjId, status: { $in: ACTIVE_SPONSORSHIP_STATUSES } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            gross: { $sum: '$grossAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const sp = sponsorshipAgg[0] || { count: 0, gross: 0, net: 0 };
    const gv = giveawayAgg[0] || {
      count: 0,
      total_entries: 0,
      total_winners: 0,
      total_prize_value_cents: 0,
    };

    const totalContributedCents = (sp.gross || 0) + (gv.total_prize_value_cents || 0);

    return {
      business_id: businessObjId.toString(),
      business_name: business.business_name,
      industry: business.industry,
      generated_at: new Date().toISOString(),
      impact_summary: {
        total_contributed_dollars: centsToDollars(totalContributedCents),
        people_reached: gv.total_entries,
        prizes_fulfilled: claimAgg,
        profile_views: business.stats?.profile_views || 0,
      },
      sponsorships: {
        count: sp.count,
        gross_dollars: centsToDollars(sp.gross),
        net_to_causes_dollars: centsToDollars(sp.net),
      },
      giveaways: {
        count: gv.count,
        total_entries: gv.total_entries,
        winners: gv.total_winners,
        prize_value_dollars: centsToDollars(gv.total_prize_value_cents),
      },
      contribution_timeline: sponsorshipTimeline.map((t) => ({
        month: t._id,
        sponsorships: t.count,
        gross_dollars: centsToDollars(t.gross),
      })),
    };
  },

  // ============================================================
  // AN-06  Sponsor ROI Analytics
  // ============================================================
  /**
   * Return-on-investment view for a sponsor: dollars invested vs. the exposure
   * and engagement it bought (profile views, giveaway reach, causes supported),
   * with a simple cost-per-impression / cost-per-engagement readout.
   */
  async getSponsorROIAnalytics(sponsorUserId) {
    const userObjId = new mongoose.Types.ObjectId(sponsorUserId);
    const business = await BusinessProfile.findOne({
      user_id: userObjId,
      deleted_at: null,
    }).lean();

    // Sponsorships are linked by userId and/or businessId.
    const sponsorshipFilter = { status: { $in: ACTIVE_SPONSORSHIP_STATUSES } };
    if (business) {
      sponsorshipFilter.$or = [{ userId: userObjId }, { businessId: business._id }];
    } else {
      sponsorshipFilter.userId = userObjId;
    }

    const [investAgg, tierBreakdown] = await Promise.all([
      Sponsorship.aggregate([
        { $match: sponsorshipFilter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: '$grossAmount' },
            net: { $sum: '$netAmount' },
          },
        },
      ]),
      Sponsorship.aggregate([
        { $match: sponsorshipFilter },
        {
          $group: {
            _id: '$tierName',
            count: { $sum: 1 },
            gross: { $sum: '$grossAmount' },
          },
        },
        { $sort: { gross: -1 } },
      ]),
    ]);

    const invest = investAgg[0] || { count: 0, gross: 0, net: 0 };

    // Exposure metrics from the linked business profile (if any).
    const profileViews = business?.stats?.profile_views || 0;
    let giveawayReach = 0;
    if (business) {
      const reach = await BusinessGiveaway.aggregate([
        { $match: { business_id: business._id, deleted_at: null } },
        { $group: { _id: null, entries: { $sum: '$entries_count' } } },
      ]);
      giveawayReach = reach[0]?.entries || 0;
    }

    const totalImpressions = profileViews + giveawayReach;
    const grossDollars = centsToDollars(invest.gross);

    return {
      sponsor_user_id: sponsorUserId,
      business_id: business?._id?.toString() || null,
      generated_at: new Date().toISOString(),
      investment: {
        sponsorships: invest.count,
        gross_invested_dollars: grossDollars,
        net_to_causes_dollars: centsToDollars(invest.net),
      },
      exposure: {
        profile_views: profileViews,
        giveaway_reach: giveawayReach,
        total_impressions: totalImpressions,
      },
      roi: {
        cost_per_impression_dollars:
          totalImpressions > 0 ? parseFloat((grossDollars / totalImpressions).toFixed(4)) : null,
        impressions_per_dollar:
          grossDollars > 0 ? parseFloat((totalImpressions / grossDollars).toFixed(2)) : null,
        net_to_causes_ratio: invest.gross > 0 ? pct(invest.net, invest.gross) : 0,
      },
      tier_breakdown: tierBreakdown.map((t) => ({
        tier: t._id,
        count: t.count,
        gross_dollars: centsToDollars(t.gross),
      })),
    };
  },

  // ============================================================
  // AN-07  Platform Impact Dashboard (public)
  // ============================================================
  /**
   * Public, non-sensitive headline impact numbers for the marketing/landing
   * dashboard. Exposes counts and raised totals only — no per-user data.
   */
  async getPublicImpactDashboard() {
    const [
      donationAgg,
      donorCount,
      campaignsFunded,
      activeCampaigns,
      businesses,
      volunteerAgg,
      topCauses,
    ] = await Promise.all([
      Transaction.aggregate([
        { $match: { transaction_type: 'donation', status: { $in: SETTLED_STATUSES } } },
        { $group: { _id: null, count: { $sum: 1 }, gross_cents: { $sum: '$amount_cents' } } },
      ]),
      Transaction.distinct('supporter_id', {
        transaction_type: 'donation',
        status: { $in: SETTLED_STATUSES },
      }),
      Campaign.countDocuments({ status: 'completed', is_deleted: { $ne: true } }),
      Campaign.countDocuments({ status: 'active', is_deleted: { $ne: true } }),
      BusinessProfile.countDocuments({ deleted_at: null }),
      VolunteerHourLog.aggregate([
        { $match: { status: 'verified' } },
        { $group: { _id: null, hours: { $sum: '$hours' }, logs: { $sum: 1 } } },
      ]),
      this._campaignCategoryMix(),
    ]);

    const donations = donationAgg[0] || { count: 0, gross_cents: 0 };
    const volunteers = volunteerAgg[0] || { hours: 0, logs: 0 };

    return {
      generated_at: new Date().toISOString(),
      total_raised_dollars: centsToDollars(donations.gross_cents),
      total_donations: donations.count,
      total_donors: donorCount.length,
      campaigns_funded: campaignsFunded,
      active_campaigns: activeCampaigns,
      partner_businesses: businesses,
      volunteer_hours_logged: volunteers.hours,
      top_causes: topCauses,
    };
  },

  // ============================================================
  // AN-08  City/Region Impact Reports
  // ============================================================
  /**
   * Impact aggregated geographically. `groupBy` selects the granularity
   * (country | state | city). Optional country/state filters narrow the scope.
   */
  async getRegionImpactReport({ groupBy = 'state', country, state, limit = 50 } = {}) {
    const field = { country: '$location.country', state: '$location.state', city: '$location.city' }[
      groupBy
    ] || '$location.state';

    const match = { is_deleted: { $ne: true } };
    if (country) match['location.country'] = country;
    if (state) match['location.state'] = state;

    const rows = await Campaign.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: [field, 'Unknown'] },
          campaigns: { $sum: 1 },
          active_campaigns: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          completed_campaigns: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          raised_cents: { $sum: '$metrics.total_donation_amount' },
          donations: { $sum: '$metrics.total_donations' },
          volunteers: { $sum: '$metrics.total_volunteers' },
          goal_cents: { $sum: '$goal_amount' },
        },
      },
      { $sort: { raised_cents: -1 } },
      { $limit: Math.min(200, parseInt(limit, 10) || 50) },
    ]);

    return {
      group_by: groupBy,
      filters: { country: country || null, state: state || null },
      generated_at: new Date().toISOString(),
      regions: rows.map((r) => ({
        region: r._id,
        campaigns: r.campaigns,
        active_campaigns: r.active_campaigns,
        completed_campaigns: r.completed_campaigns,
        donations: r.donations,
        volunteers: r.volunteers,
        raised_dollars: centsToDollars(r.raised_cents),
        goal_dollars: centsToDollars(r.goal_cents),
        funding_progress: pct(r.raised_cents, r.goal_cents),
      })),
    };
  },

  // ============================================================
  // AN-09  AI Viral Score Predictor
  // ============================================================
  /**
   * Predict a campaign's viral potential as a transparent, explainable score
   * (0-100). The model is a weighted blend of signals known to drive organic
   * spread: viral coefficient, referral conversion efficiency, share velocity,
   * media richness, share-reward incentive, geographic reach and freshness.
   * Returns the score, a per-factor breakdown and actionable recommendations.
   */
  async getViralScorePrediction(campaignId) {
    let campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      campaign = await Campaign.findOne({ campaign_id: campaignId }).lean();
    }
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      throw err;
    }

    const v = campaign.virality || {};
    const metrics = campaign.metrics || {};

    // Age in days (used for velocity + freshness).
    const createdAt = campaign.created_at || campaign.published_at || new Date();
    const ageDays = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000));

    // --- Factor 1: Viral coefficient (the strongest signal). ---
    // K >= 1.0 means self-sustaining growth -> full marks.
    const viralCoefficient = v.viral_coefficient || 0;
    const f_coefficient = Math.min(1, viralCoefficient / 1.0);

    // --- Factor 2: Referral conversion efficiency. ---
    const referralClicks = v.referral_clicks || 0;
    const referralConversions = v.referral_conversions || 0;
    const conversionRate = referralClicks > 0 ? referralConversions / referralClicks : 0;
    // 25% click->conversion is excellent for fundraising referrals.
    const f_conversion = Math.min(1, conversionRate / 0.25);

    // --- Factor 3: Share velocity (shares per day). ---
    const shareCount = campaign.share_count || 0;
    const sharesPerDay = shareCount / ageDays;
    // 20 shares/day is treated as "viral velocity".
    const f_velocity = Math.min(1, sharesPerDay / 20);

    // --- Factor 4: Media richness (video + image boosts sharing). ---
    const hasVideo = !!(campaign.video && (campaign.video.url || campaign.video.embed_url));
    const hasImage = !!campaign.image_url;
    const f_media = (hasVideo ? 0.6 : 0) + (hasImage ? 0.4 : 0);

    // --- Factor 5: Share-reward incentive funding (trust-based liability pool). ---
    const sc5 = campaign.share_config || {};
    const shareBudget = sc5.total_budget || 0;
    const budgetRemaining =
      sc5.committed_budget_remaining ??
      Math.max(0, shareBudget - (sc5.committed_total || 0));
    const f_incentive = shareBudget > 0 ? Math.min(1, budgetRemaining / shareBudget) : 0;

    // --- Factor 6: Geographic reach. ---
    const scopeScore = { global: 1, national: 0.6, local: 0.3 }[campaign.geographic_scope] || 0.6;
    const f_reach = scopeScore;

    // --- Factor 7: Freshness (decays over ~60 days). ---
    const f_freshness = Math.max(0, 1 - ageDays / 60);

    // --- Factor 8: Secondary sharer depth (network effect). ---
    const secondarySharers = v.secondary_sharers || 0;
    const f_depth = shareCount > 0 ? Math.min(1, secondarySharers / shareCount) : 0;

    const weights = {
      viral_coefficient: 0.28,
      referral_conversion: 0.16,
      share_velocity: 0.16,
      media_richness: 0.1,
      incentive_funding: 0.1,
      geographic_reach: 0.08,
      freshness: 0.06,
      network_depth: 0.06,
    };

    const factors = {
      viral_coefficient: f_coefficient,
      referral_conversion: f_conversion,
      share_velocity: f_velocity,
      media_richness: f_media,
      incentive_funding: f_incentive,
      geographic_reach: f_reach,
      freshness: f_freshness,
      network_depth: f_depth,
    };

    const score = Object.keys(weights).reduce(
      (sum, k) => sum + factors[k] * weights[k] * 100,
      0
    );
    const viralScore = Math.round(Math.min(100, Math.max(0, score)));

    let rating;
    if (viralScore >= 75) rating = 'high';
    else if (viralScore >= 50) rating = 'moderate';
    else if (viralScore >= 25) rating = 'low';
    else rating = 'minimal';

    // Build recommendations from the weakest weighted contributors.
    const contributions = Object.keys(weights).map((k) => ({
      factor: k,
      score: parseFloat((factors[k] * 100).toFixed(1)),
      weighted_points: parseFloat((factors[k] * weights[k] * 100).toFixed(2)),
      weight: weights[k],
    }));

    const recommendations = this._viralRecommendations(factors, {
      hasVideo,
      hasImage,
      shareBudget,
    });

    return {
      campaign_id: campaign.campaign_id || campaign._id.toString(),
      title: campaign.title,
      generated_at: new Date().toISOString(),
      viral_score: viralScore,
      rating,
      factor_breakdown: contributions.sort((a, b) => b.weighted_points - a.weighted_points),
      signals: {
        viral_coefficient: parseFloat(viralCoefficient.toFixed(3)),
        referral_clicks: referralClicks,
        referral_conversions: referralConversions,
        referral_conversion_rate: pct(referralConversions, referralClicks),
        total_shares: shareCount,
        shares_per_day: parseFloat(sharesPerDay.toFixed(2)),
        secondary_sharers: secondarySharers,
        age_days: Math.round(ageDays),
        has_video: hasVideo,
        has_image: hasImage,
      },
      recommendations,
    };
  },

  /**
   * Generate up to 4 prioritized, plain-language recommendations from the
   * weakest viral factors.
   * @private
   */
  _viralRecommendations(factors, ctx) {
    const recs = [];
    if (factors.media_richness < 0.6 && !ctx.hasVideo) {
      recs.push('Add a short campaign video — video posts are shared significantly more often.');
    }
    if (factors.incentive_funding < 0.3 && ctx.shareBudget === 0) {
      recs.push('Fund a share-to-earn reward budget to incentivize organic sharing.');
    }
    if (factors.share_velocity < 0.4) {
      recs.push('Share velocity is low — run an outreach push to early supporters to build momentum.');
    }
    if (factors.referral_conversion < 0.4) {
      recs.push('Referral visitors are not converting — strengthen the campaign story and call-to-action.');
    }
    if (factors.viral_coefficient < 0.5) {
      recs.push('Encourage existing sharers to re-share by adding social proof and milestone updates.');
    }
    if (recs.length === 0) {
      recs.push('Strong viral signals — keep the momentum going with regular milestone updates.');
    }
    return recs.slice(0, 4);
  },
};

module.exports = AdvancedAnalyticsService;
