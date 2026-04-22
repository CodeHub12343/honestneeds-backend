/**
 * Campaign Analytics Service & Helpers
 * Business logic for campaign analytics calculations
 * 
 * Aggregates donation data, share data, and engagement metrics
 * Used by campaignController.getAnalytics endpoint
 */

const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const { ShareRecord } = require('../models/Share');
const CampaignUpdate = require('../models/CampaignUpdate');

const CampaignAnalyticsService = {
  /**
   * Get comprehensive campaign analytics
   * Aggregates: donations, shares, views, engagement
   * 
   * @param {string} campaignId - Campaign MongoDB ID
   * @returns {Object} Complete analytics object
   */
  async getCampaignAnalytics(campaignId) {
    const startTime = Date.now();
    try {
      console.log('\n📊 [Service] CampaignAnalyticsService.getCampaignAnalytics started', {
        campaignId,
        timestamp: new Date().toISOString(),
      });

      // Get campaign details
      console.log('🔍 [Service] Fetching campaign details...', { campaignId });
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        console.error('❌ [Service] Campaign not found', { campaignId });
        throw new Error('Campaign not found');
      }
      console.log('✅ [Service] Campaign details fetched', {
        campaignId,
        campaignTitle: campaign.title,
        campaignStatus: campaign.status,
        elapsedTime: `${Date.now() - startTime}ms`,
      });

      // Aggregate donation data
      console.log('💰 [Service] Aggregating donation statistics...', { campaignId });
      const donationStats = await this.getDonationStats(campaignId);
      console.log('✅ [Service] Donation stats aggregated', {
        campaignId,
        totalDonations: donationStats.totalCount,
        totalAmount: donationStats.totalAmount,
        uniqueDonors: donationStats.uniqueDonorCount || 0,
      });

      // Aggregate sharing data
      console.log('📢 [Service] Aggregating share statistics...', { campaignId });
      const shareStats = await this.getShareStats(campaignId);
      console.log('✅ [Service] Share stats aggregated', {
        campaignId,
        totalShares: shareStats.totalCount,
        channels: Object.keys(shareStats.byChannel || {}),
      });

      // Get engagement metrics
      console.log('📈 [Service] Calculating engagement metrics...', { campaignId });
      const engagement = await this.getEngagementMetrics(campaignId);
      console.log('✅ [Service] Engagement metrics calculated', {
        campaignId,
        totalViews: engagement.totalViews || 0,
        conversionRate: engagement.conversionRate || 0,
      });

      // Get update metrics
      console.log('📝 [Service] Fetching campaign updates...', { campaignId });
      const updateStats = await this.getUpdateStats(campaignId);
      console.log('✅ [Service] Update stats calculated', {
        campaignId,
        totalUpdates: updateStats.totalCount,
      });

      // Calculate conversion rate
      const uniqueDonors = donationStats.uniqueDonorCount || campaign.total_donors || 0;
      const viewCount = campaign.view_count || 0;
      const conversionRate = viewCount > 0 ? (uniqueDonors / viewCount) * 100 : 0;

      // Get daily/weekly trends
      console.log('📊 [Service] Calculating trends...', { campaignId });
      const trends = await this.getTrends(campaignId);
      console.log('✅ [Service] Trends calculated', {
        campaignId,
        dailyDataPoints: trends.dailyDonations?.length || 0,
      });

      // Calculate goal progress from goals array (sum all target amounts)
      let goalProgress = 0;
      let goalTarget = 0;
      
      // Log goals array for debugging
      console.log('🔍 [Service] Goals array content:', {
        campaignId,
        goalsCount: campaign.goals?.length || 0,
        goals: campaign.goals?.map(g => ({
          target_amount: g.target_amount,
          current_amount: g.current_amount,
          goal_type: g.goal_type,
        })),
        campaignGoalAmountField: campaign.goal_amount,
      });
      
      if (campaign.goals && campaign.goals.length > 0) {
        // Sum all goal target amounts with sanity check for corrupted values
        // Sanity check: if any goal is > $500M (50000000000 cents), it's likely corrupted
        // Supports large international campaigns up to half a billion dollars
        const MAX_REASONABLE_GOAL = 50000000000; // $500M in cents - supports major capital campaigns
        
        const validGoals = campaign.goals.filter(goal => {
          const amount = goal.target_amount || 0;
          if (amount > MAX_REASONABLE_GOAL) {
            console.warn('⚠️ [Service] Corrupted goal amount detected and FILTERED OUT:', {
              goalAmount: amount,
              goalAmountInDollars: amount / 100,
              maxAllowed: MAX_REASONABLE_GOAL,
              maxAllowedInDollars: MAX_REASONABLE_GOAL / 100,
              goalId: goal._id,
            });
            return false; // Filter out corrupted goals
          }
          return true;
        });
        
        console.log('📋 [Service] Goal validation result:', {
          totalGoals: campaign.goals.length,
          validGoals: validGoals.length,
          filteredOut: campaign.goals.length - validGoals.length,
          validGoalAmounts: validGoals.map(g => g.target_amount),
        });
        
        // Calculate goal target from valid goals
        goalTarget = validGoals.reduce((sum, goal) => sum + (goal.target_amount || 0), 0);
        
        if (goalTarget === 0 && campaign.goals.length > validGoals.length) {
          console.warn('⚠️ [Service] All goals were corrupted, using fallback:', {
            totalGoals: campaign.goals.length,
            validGoals: validGoals.length,
            corruptedAmount: campaign.goals[0]?.target_amount,
          });
          // Use a default goal if all were corrupted
          goalTarget = 0;
        }
        
        // Use actual raised amount divided by goal
        goalProgress = goalTarget > 0 ? (donationStats.totalAmount / goalTarget) * 100 : 0;
      }
      
      console.log('🎯 [Service] Goal progress calculated', {
        campaignId,
        goalProgress: `${goalProgress.toFixed(2)}%`,
        goalTarget,
        totalRaised: donationStats.totalAmount,
        goalsCount: campaign.goals?.length || 0,
      });

      const analyticsResult = {
        campaignId: campaignId,
        title: campaign.title,
        status: campaign.status,
        createdAt: campaign.created_at,
        publishedAt: campaign.published_at,

        // Financial metrics
        financial: {
          totalRaised: donationStats.totalAmount,
          goalAmount: goalTarget,
          goalProgress: Math.min(goalProgress, 100),
          averageDonation: donationStats.averageAmount,
          largestDonation: donationStats.maxAmount,
          smallestDonation: donationStats.minAmount,
          platformFee: Math.round(donationStats.totalAmount * 0.2), // 20% fee
          donorNetAmount: Math.round(donationStats.totalAmount * 0.8),
        },

        // Donation metrics
        donations: {
          totalDonations: donationStats.totalCount,
          totalRaised: donationStats.totalAmount,
          uniqueDonors: uniqueDonors,
          averageDonation: donationStats.averageAmount,
          averageDonorsPerDay: donationStats.donorsPerDay,
          donationsByDate: donationStats.byDate,
        },

        // Share metrics
        shares: {
          totalShares: shareStats.totalCount,
          sharesByChannel: shareStats.byChannel,
          averageSharesPerDay: shareStats.sharesPerDay,
          topChannel: shareStats.topChannel,
          shareGrowth: shareStats.growthTrend,
        },

        // Engagement metrics
        engagement: {
          totalViews: viewCount,
          viewsPerDay: engagement.viewsPerDay,
          conversionRate: parseFloat(conversionRate.toFixed(2)),
          bounceRate: engagement.bounceRate,
          avgTimeOnPage: engagement.avgTimeOnPage,
          returningVisitors: engagement.returningVisitors,
        },

        // Update metrics
        updates: {
          totalUpdates: updateStats.totalCount,
          averageUpdateEngagement: updateStats.averageEngagement,
          latestUpdateDate: updateStats.latestDate,
          updatesByType: updateStats.byType,
        },

        // Trending data
        trends: {
          dailyDonations: trends.dailyDonations,
          dailyShares: trends.dailyShares,
          dailyViews: trends.dailyViews,
          donationTrend: trends.donationTrend,
          shareTrend: trends.shareTrend,
          engagementTrend: trends.engagementTrend,
        },

        // Summary
        summary: {
          momentum: this.calculateMomentum(trends),
          health: this.calculateCampaignHealth(campaign, donationStats, shareStats, engagement),
          recommendations: this.generateRecommendations(campaign, donationStats, shareStats),
        },

        // Generated timestamp
        generatedAt: new Date(),
      };

      const totalElapsedTime = Date.now() - startTime;
      console.log('✅ [Service] getCampaignAnalytics completed successfully', {
        campaignId,
        totalElapsedTime: `${totalElapsedTime}ms`,
        analyticsKeys: Object.keys(analyticsResult),
      });

      return analyticsResult;
    } catch (error) {
      const totalElapsedTime = Date.now() - startTime;
      console.error('❌ [Service] getCampaignAnalytics failed', {
        campaignId,
        error: error.message,
        elapsedTime: `${totalElapsedTime}ms`,
        stack: error.stack,
      });
      throw new Error(`Failed to get campaign analytics: ${error.message}`);
    }
  },

  /**
   * Get donation statistics
   * IMPORTANT: Uses campaign built-in fields as primary source of truth
   * Falls back to Transaction queries if needed
   */
  async getDonationStats(campaignId) {
    try {
      // Get campaign data to use as primary source
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      console.log('💰 [Analytics] getDonationStats using campaign data:', {
        campaignId,
        total_donation_amount: campaign.total_donation_amount,
        total_donations: campaign.total_donations,
        average_donation: campaign.average_donation,
        total_donors: campaign.total_donors,
      });

      // FIX: Use campaign's built-in fields as primary source
      // But add fallback logic when total_donation_amount is missing
      let totalAmount = campaign.total_donation_amount || 0;
      let totalCount = campaign.total_donations || 0;
      const averageAmount = campaign.average_donation || 0;
      const uniqueDonorCount = campaign.total_donors || 0;

      // FALLBACK: If total_donation_amount is missing but we have average_donation and total_donors
      // Calculate the total amount from these fields
      if ((!totalAmount || totalAmount === 0) && averageAmount > 0 && uniqueDonorCount > 0) {
        console.log('💡 [Analytics] Calculating totalAmount from average_donation * total_donors:', {
          averageAmount,
          uniqueDonorCount,
        });
        totalAmount = averageAmount * uniqueDonorCount;
      }

      // FALLBACK: If total_donations count is missing but we have total_donors
      // Use total_donors as the count if average indicates there are donations
      if ((!totalCount || totalCount === 0) && averageAmount > 0 && uniqueDonorCount > 0) {
        console.log('💡 [Analytics] Setting totalCount to total_donors because avgAmount > 0:', {
          uniqueDonorCount,
          averageAmount,
        });
        totalCount = uniqueDonorCount;
      }

      // Try to get donations by date from Transaction records for trend analysis
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let donationsByDate = [];
      
      try {
        donationsByDate = await Transaction.aggregate([
          {
            $match: {
              campaign_id: campaignId,
              status: { $in: ['verified', 'pending'] },
              created_at: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
              },
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]);
      } catch (txError) {
        console.warn('⚠️ [Analytics] Could not fetch donation by date from transactions:', txError.message);
        // Continue without transaction details - use campaign totals
      }

      const donorsPerDay =
        donationsByDate.length > 0
          ? totalCount / Math.max(donationsByDate.length, 1)
          : 0;

      console.log('✅ [Analytics] getDonationStats calculated:', {
        campaignId,
        totalAmount,
        totalCount,
        averageAmount,
        uniqueDonorCount,
        donorsPerDay,
        dataTrendPoints: donationsByDate.length,
      });

      return {
        totalAmount: totalAmount,
        totalCount: totalCount,
        averageAmount: averageAmount,
        maxAmount: Math.max(averageAmount, 0), // Use average as max if only avg available
        minAmount: totalCount > 0 ? Math.round(totalAmount / totalCount) : 0, // Approximate min
        uniqueDonorCount: uniqueDonorCount,
        donorsPerDay: parseFloat(donorsPerDay.toFixed(2)),
        byDate: donationsByDate || [],
      };
    } catch (error) {
      console.error('❌ Error getting donation stats:', error);
      return {
        totalAmount: 0,
        totalCount: 0,
        averageAmount: 0,
        maxAmount: 0,
        minAmount: 0,
        uniqueDonorCount: 0,
        donorsPerDay: 0,
        byDate: [],
      };
    }
  },

  /**
   * Get share statistics
   * IMPORTANT: Uses campaign built-in fields as primary source of truth
   * Falls back to ShareRecord queries if needed
   */
  async getShareStats(campaignId) {
    try {
      // Get campaign data to use as primary source
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      console.log('📢 [Analytics] getShareStats using campaign data:', {
        campaignId,
        share_count: campaign.share_count,
        shares_paid: campaign.shares_paid,
        shares_free: campaign.shares_free,
        shares_by_channel: campaign.shares_by_channel,
      });

      // FIX: Use campaign's built-in fields as primary source
      const totalShares = (campaign.shares_paid || 0) + (campaign.shares_free || 0) || campaign.share_count || 0;

      // Initialize channel counts from campaign data if available
      let byChannel = {
        facebook: 0,
        twitter: 0,
        linkedin: 0,
        email: 0,
        whatsapp: 0,
        link: 0,
      };

      // If campaign has shares_by_channel data, use it
      if (campaign.shares_by_channel && typeof campaign.shares_by_channel === 'object') {
        byChannel = { ...byChannel, ...campaign.shares_by_channel };
      }

      // Try to get share details from ShareRecord for enhanced data
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let sharesByDate = [];
      
      try {
        const sharesByPlatform = await ShareRecord.aggregate([
          {
            $match: {
              campaign_id: campaignId,
              created_at: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: '$platform',
              count: { $sum: 1 },
            },
          },
        ]);

        // Merge ShareRecord data with campaign data
        sharesByPlatform.forEach((share) => {
          if (byChannel.hasOwnProperty(share._id)) {
            // Use ShareRecord count if more recent 
            byChannel[share._id] = Math.max(byChannel[share._id] || 0, share.count);
          }
        });

        // Get shares by date trend
        sharesByDate = await ShareRecord.aggregate([
          {
            $match: {
              campaign_id: campaignId,
              created_at: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]);
      } catch (shareError) {
        console.warn('⚠️ [Analytics] Could not fetch share details from ShareRecord:', shareError.message);
        // Continue with campaign data
      }

      // Find top channel
      let topChannel = 'facebook';
      let topCount = 0;
      Object.entries(byChannel).forEach(([channel, count]) => {
        if (count > topCount) {
          topCount = count;
          topChannel = channel;
        }
      });

      const sharesPerDay = sharesByDate.length > 0 ? totalShares / sharesByDate.length : 0;
      const growthTrend = this.calculateTrend(sharesByDate.map((s) => s.count));

      console.log('✅ [Analytics] getShareStats calculated:', {
        campaignId,
        totalShares,
        topChannel,
        sharesPerDay,
        growthTrend,
        channelData: byChannel,
      });

      return {
        totalCount: totalShares,
        byChannel,
        topChannel,
        sharesPerDay: parseFloat(sharesPerDay.toFixed(2)),
        growthTrend,
        byDate: sharesByDate,
      };
    } catch (error) {
      console.error('❌ Error getting share stats:', error);
      return {
        totalCount: 0,
        byChannel: {
          facebook: 0,
          twitter: 0,
          linkedin: 0,
          email: 0,
          whatsapp: 0,
          link: 0,
        },
        topChannel: 'facebook',
        sharesPerDay: 0,
        growthTrend: 'stable',
        byDate: [],
      };
    }
  },

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(campaignId) {
    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      return {
        viewsPerDay: 0,
        bounceRate: 0,
        avgTimeOnPage: 0,
        returningVisitors: 0,
      };
    }

    // Estimate metrics based on campaign data
    const daysActive = campaign.published_at
      ? Math.ceil((Date.now() - new Date(campaign.published_at)) / (1000 * 60 * 60 * 24))
      : 1;

    const viewsPerDay = campaign.view_count / Math.max(daysActive, 1);
    const returningVisitors = Math.round(campaign.view_count * 0.3); // Estimate 30% returning

    return {
      viewsPerDay: parseFloat(viewsPerDay.toFixed(2)),
      bounceRate: 25, // Placeholder
      avgTimeOnPage: 120, // Seconds (placeholder)
      returningVisitors,
    };
  },

  /**
   * Get update metrics
   */
  async getUpdateStats(campaignId) {
    try {
      const updates = await CampaignUpdate.find({
        campaign_id: campaignId,
        is_deleted: false,
        status: 'published',
      }).lean();

      if (updates.length === 0) {
        return {
          totalCount: 0,
          averageEngagement: 0,
          latestDate: null,
          byType: {},
        };
      }

      const latestDate = updates.reduce((latest, current) => {
        return new Date(current.created_at) > new Date(latest.created_at) ? current : latest;
      }).created_at;

      const totalEngagement = updates.reduce((sum, update) => {
        return (
          sum +
          (update.engagement.view_count +
            update.engagement.share_count +
            update.engagement.like_count +
            update.engagement.comment_count)
        );
      }, 0);

      const averageEngagement = Math.round(totalEngagement / updates.length);

      const byType = {};
      updates.forEach((update) => {
        byType[update.update_type] = (byType[update.update_type] || 0) + 1;
      });

      return {
        totalCount: updates.length,
        averageEngagement,
        latestDate,
        byType,
      };
    } catch (error) {
      console.error('Error getting update stats:', error);
      return {
        totalCount: 0,
        averageEngagement: 0,
        latestDate: null,
        byType: {},
      };
    }
  },

  /**
   * Get trends over time
   */
  async getTrends(campaignId) {
    try {
      // Get last 30 days of data
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Donation trend
      const donationTrend = await Transaction.aggregate([
        {
          $match: {
            campaign_id: campaignId,
            created_at: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
            },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Share trend
      const shareTrend = await ShareRecord.aggregate([
        {
          $match: {
            campaign_id: campaignId,
            created_at: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        dailyDonations: donationTrend.map((d) => ({ date: d._id, amount: d.amount })),
        dailyShares: shareTrend.map((s) => ({ date: s._id, count: s.count })),
        dailyViews: [], // Would be populated from analytics service
        donationTrend: this.calculateTrend(donationTrend.map((d) => d.amount)),
        shareTrend: this.calculateTrend(shareTrend.map((s) => s.count)),
        engagementTrend: 'stable',
      };
    } catch (error) {
      console.error('Error getting trends:', error);
      return {
        dailyDonations: [],
        dailyShares: [],
        dailyViews: [],
        donationTrend: 'stable',
        shareTrend: 'stable',
        engagementTrend: 'stable',
      };
    }
  },

  /**
   * Calculate trend direction
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';

    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const percentChange = ((avgSecond - avgFirst) / avgFirst) * 100;

    if (percentChange > 20) return 'increasing';
    if (percentChange < -20) return 'decreasing';
    return 'stable';
  },

  /**
   * Calculate campaign momentum
   */
  calculateMomentum(trends) {
    const donationTrend = trends.donationTrend === 'increasing' ? 1 : trends.donationTrend === 'decreasing' ? -1 : 0;
    const shareTrend = trends.shareTrend === 'increasing' ? 1 : trends.shareTrend === 'decreasing' ? -1 : 0;

    const momentum = (donationTrend + shareTrend) / 2;

    if (momentum > 0.3) return 'strong_positive';
    if (momentum > 0) return 'positive';
    if (momentum < -0.3) return 'strong_negative';
    if (momentum < 0) return 'negative';
    return 'stable';
  },

  /**
   * Calculate overall campaign health
   */
  calculateCampaignHealth(campaign, donations, shares, engagement) {
    let healthScore = 50; // Base score

    // Factor in goal progress
    if (campaign.goals && campaign.goals.length > 0) {
      const fundraisingGoal = campaign.goals.find((g) => g.goal_type === 'fundraising');
      if (fundraisingGoal) {
        const progress = (fundraisingGoal.current_amount / fundraisingGoal.target_amount) * 100;
        healthScore += Math.min(progress / 2, 20); // Max +20 points
      }
    }

    // Factor in engagement
    if (engagement.conversionRate > 5) {
      healthScore += 15;
    } else if (engagement.conversionRate > 2) {
      healthScore += 10;
    } else if (engagement.conversionRate > 1) {
      healthScore += 5;
    }

    // Factor in shares
    if (shares.totalCount > 50) {
      healthScore += 15;
    } else if (shares.totalCount > 20) {
      healthScore += 10;
    } else if (shares.totalCount > 5) {
      healthScore += 5;
    }

    healthScore = Math.min(healthScore, 100);

    if (healthScore >= 75) return 'excellent';
    if (healthScore >= 50) return 'good';
    if (healthScore >= 25) return 'fair';
    return 'needs_improvement';
  },

  /**
   * Generate recommendations
   */
  generateRecommendations(campaign, donations, shares) {
    const recommendations = [];

    if (donations.totalCount === 0) {
      recommendations.push('No donations yet. Consider sharing on social media to increase visibility.');
    }

    if (shares.totalCount < 10) {
      recommendations.push('Low share count. Try posting campaign updates to boost engagement.');
    }

    if (shares.byChannel.facebook === 0 && shares.byChannel.twitter === 0) {
      recommendations.push('Not reaching Facebook/Twitter audiences. Consider targeting these platforms.');
    }

    if (donations.averageAmount < 5000) {
      // assuming in cents, so $50
      recommendations.push('Average donation is low. Try highlighting the impact of larger donations.');
    }

    if (!campaign.published_at) {
      recommendations.push('Campaign not published yet. Publish to reach potential donors.');
    }

    return recommendations;
  },
};

module.exports = CampaignAnalyticsService;
