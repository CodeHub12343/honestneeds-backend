/**
 * Donation Service
 * Business logic for all donation operations including analytics, refunds, exports, and receipts
 */

const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

class DonationService {
  /**
   * Get comprehensive donation analytics
   * @param {string} userId - User ID (optional, for user-specific analytics)
   * @param {string} role - User role (admin, creator, supporter)
   * @returns {object} Analytics data with platform, creator, or user metrics
   */
  static async getDonationAnalytics(userId = null, role = 'supporter') {
    try {
      const query = {};
      let creatorId = null;

      if (role === 'creator' && userId) {
        creatorId = userId;
        query.creator_id = userId;
      } else if (role === 'supporter' && userId) {
        query.supporter_id = userId;
      }

      // Get donation metrics
      const donations = await Transaction.find(query)
        .where('transaction_type').equals('donation')
        .where('status').in(['verified', 'pending'])
        .lean();

      // Calculate aggregates
      const totalDonations = donations.length;
      const totalAmount = donations.reduce((sum, d) => sum + d.amount_cents, 0);
      const avgAmount = totalDonations > 0 ? totalAmount / totalDonations : 0;
      const maxDonation = donations.length > 0 
        ? Math.max(...donations.map(d => d.amount_cents))
        : 0;
      const minDonation = donations.length > 0
        ? Math.min(...donations.map(d => d.amount_cents))
        : 0;

      // Group by payment method
      const byPaymentMethod = {};
      const byStatus = {};
      const byDate = {};

      donations.forEach((d) => {
        // Payment method aggregates
        if (!byPaymentMethod[d.payment_method]) {
          byPaymentMethod[d.payment_method] = { count: 0, amount_cents: 0 };
        }
        byPaymentMethod[d.payment_method].count += 1;
        byPaymentMethod[d.payment_method].amount_cents += d.amount_cents;

        // Status aggregates
        if (!byStatus[d.status]) {
          byStatus[d.status] = { count: 0, amount_cents: 0 };
        }
        byStatus[d.status].count += 1;
        byStatus[d.status].amount_cents += d.amount_cents;

        // Daily aggregates (last 30 days)
        const dateKey = d.created_at.toISOString().split('T')[0];
        if (!byDate[dateKey]) {
          byDate[dateKey] = { count: 0, amount_cents: 0 };
        }
        byDate[dateKey].count += 1;
        byDate[dateKey].amount_cents += d.amount_cents;
      });

      // Convert cents to dollars for display
      const convertToDollars = (obj) => {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'object' && 'amount_cents' in value) {
            result[key] = {
              ...value,
              amount_dollars: (value.amount_cents / 100).toFixed(2)
            };
          } else {
            result[key] = value;
          }
        }
        return result;
      };

      // Get trending campaigns (for admin/creator dashboard)
      const topCampaigns = await Transaction.aggregate([
        { $match: query },
        { $match: { transaction_type: 'donation', status: { $in: ['verified', 'pending'] } } },
        { $group: {
            _id: '$campaign_id',
            totalAmount: { $sum: '$amount_cents' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount_cents' }
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 10 },
        { $lookup: {
            from: 'campaigns',
            localField: '_id',
            foreignField: '_id',
            as: 'campaign'
          }
        },
        { $unwind: '$campaign' },
        { $project: {
            campaignId: '$_id',
            campaignTitle: '$campaign.title',
            totalAmount: 1,
            count: 1,
            avgAmount: 1
          }
        }
      ]);

      winstonLogger.info(`Retrieved donation analytics for ${role}`, {
        userId,
        totalDonations,
        totalAmount
      });

      return {
        success: true,
        data: {
          summary: {
            total_donations: totalDonations,
            total_amount_cents: totalAmount,
            total_amount_dollars: (totalAmount / 100).toFixed(2),
            average_donation_cents: Math.round(avgAmount),
            average_donation_dollars: (avgAmount / 100).toFixed(2),
            max_donation_cents: maxDonation,
            max_donation_dollars: (maxDonation / 100).toFixed(2),
            min_donation_cents: minDonation,
            min_donation_dollars: (minDonation / 100).toFixed(2),
            total_fees_cents: donations.reduce((sum, d) => sum + d.platform_fee_cents, 0),
            total_creator_earnings_cents: donations.reduce((sum, d) => sum + d.net_amount_cents, 0)
          },
          byPaymentMethod: convertToDollars(byPaymentMethod),
          byStatus: convertToDollars(byStatus),
          byDate: convertToDollars(byDate),
          topCampaigns: topCampaigns.map(c => ({
            ...c,
            totalAmount: (c.totalAmount / 100).toFixed(2),
            avgAmount: (c.avgAmount / 100).toFixed(2)
          }))
        }
      };
    } catch (error) {
      winstonLogger.error(`Donation analytics error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign-specific donation analytics
   * @param {string} campaignId - Campaign ID
   * @param {string} userId - User ID requesting (for authorization)
   * @returns {object} Campaign donation metrics
   */
  static async getCampaignDonationAnalytics(campaignId, userId) {
    try {
      // Verify campaign ownership
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (campaign.creator_id.toString() !== userId.toString()) {
        const error = new Error('Only campaign creator can view analytics');
        error.statusCode = 403;
        throw error;
      }

      // Get all donations for this campaign
      const donations = await Transaction.find({
        campaign_id: campaignId,
        transaction_type: 'donation',
        status: { $in: ['verified', 'pending'] }
      })
        .populate('supporter_id', 'email full_name')
        .sort({ created_at: -1 });

      // Calculate metrics
      const totalDonations = donations.length;
      const totalRaised = donations.reduce((sum, d) => sum + d.net_amount_cents, 0);
      const totalFees = donations.reduce((sum, d) => sum + d.platform_fee_cents, 0);
      const avgDonation = totalDonations > 0 ? totalRaised / totalDonations : 0;
      const uniqueDonors = new Set(donations.map(d => d.supporter_id._id.toString())).size;

      // Group by date for timeline
      const timeline = {};
      donations.forEach(d => {
        const dateKey = d.created_at.toISOString().split('T')[0];
        if (!timeline[dateKey]) {
          timeline[dateKey] = { count: 0, amount_cents: 0 };
        }
        timeline[dateKey].count += 1;
        timeline[dateKey].amount_cents += d.net_amount_cents;
      });

      // Get top donors
      const donorAggregates = {};
      donations.forEach(d => {
        const donorId = d.supporter_id._id.toString();
        if (!donorAggregates[donorId]) {
          donorAggregates[donorId] = {
            donorName: d.supporter_id.full_name,
            donorEmail: d.supporter_id.email,
            totalAmount: 0,
            count: 0,
            firstDonation: d.created_at,
            lastDonation: d.created_at
          };
        }
        donorAggregates[donorId].totalAmount += d.net_amount_cents;
        donorAggregates[donorId].count += 1;
        donorAggregates[donorId].lastDonation = d.created_at;
      });

      const topDonors = Object.values(donorAggregates)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10)
        .map(d => ({
          ...d,
          totalAmount: (d.totalAmount / 100).toFixed(2)
        }));

      winstonLogger.info(`Retrieved campaign analytics for campaign ${campaignId}`);

      return {
        success: true,
        data: {
          campaignId,
          campaignTitle: campaign.title,
          donations: {
            total_count: totalDonations,
            unique_donors: uniqueDonors,
            total_raised_cents: totalRaised,
            total_raised_dollars: (totalRaised / 100).toFixed(2),
            total_fees_cents: totalFees,
            total_fees_dollars: (totalFees / 100).toFixed(2),
            avg_donation_cents: Math.round(avgDonation),
            avg_donation_dollars: (avgDonation / 100).toFixed(2)
          },
          timeline: Object.entries(timeline)
            .map(([date, data]) => ({
              date,
              count: data.count,
              amount: (data.amount_cents / 100).toFixed(2)
            }))
            .reverse(),
          topDonors,
          recentDonations: donations.slice(0, 20).map(d => ({
            id: d._id,
            donorName: d.supporter_id.full_name,
            amount: (d.net_amount_cents / 100).toFixed(2),
            paymentMethod: d.payment_method,
            status: d.status,
            date: d.created_at
          }))
        }
      };
    } catch (error) {
      winstonLogger.error(`Campaign donation analytics error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign donation metrics (simplified aggregation)
   * Similar to getCampaignDonationAnalytics but with lighter payload
   *
   * @param {string} campaignId - Campaign ID
   * @param {string} timeframe - 'today'|'week'|'month'|'all' (default: 'all')
   * @param {boolean} includeBreakdown - Include breakdown by payment method and status
   * @returns {object} Campaign donation metrics
   */
  static async getCampaignDonationMetrics(campaignId, timeframe = 'all', includeBreakdown = true) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Build date filter based on timeframe
      const dateFilter = {};
      const now = new Date();
      switch (timeframe) {
        case 'today':
          dateFilter.$gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          dateFilter.$gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateFilter.$gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
        default:
          // No date filter
          break;
      }

      const matchQuery = {
        campaign_id: campaign._id,
        transaction_type: 'donation',
        status: { $in: ['verified', 'pending'] }
      };

      if (Object.keys(dateFilter).length > 0) {
        matchQuery.created_at = dateFilter;
      }

      // Aggregate donation metrics
      const aggregation = [
        { $match: matchQuery },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalDonations: { $sum: 1 },
                  totalRaisedCents: { $sum: '$amount_cents' },
                  averageDonationCents: { $avg: '$amount_cents' },
                  largestDonationCents: { $max: '$amount_cents' },
                  smallestDonationCents: { $min: '$amount_cents' },
                  uniqueDonors: { $addToSet: '$supporter_id' }
                }
              }
            ],
            byPaymentMethod: includeBreakdown ? [
              {
                $group: {
                  _id: '$payment_method',
                  count: { $sum: 1 },
                  amount: { $sum: '$amount_cents' }
                }
              },
              { $sort: { amount: -1 } }
            ] : [],
            byStatus: includeBreakdown ? [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  amount: { $sum: '$amount_cents' }
                }
              },
              { $sort: { count: -1 } }
            ] : [],
            recentDonations: [
              { $sort: { created_at: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: 'users',
                  localField: 'supporter_id',
                  foreignField: '_id',
                  as: 'donor'
                }
              },
              {
                $project: {
                  amount: { $divide: ['$amount_cents', 100] },
                  paymentMethod: 1,
                  status: 1,
                  date: '$created_at',
                  donor: { $arrayElemAt: ['$donor.full_name', 0] }
                }
              }
            ]
          }
        }
      ];

      const results = await Transaction.aggregate(aggregation);
      const metrics = results[0];

      // Calculate funded percentage
      let fundedPercentage = 0;
      let goalAmount = 0;
      if (campaign.goals && campaign.goals.goal_amount_cents) {
        goalAmount = campaign.goals.goal_amount_cents;
        fundedPercentage = metrics.summary[0]
          ? Math.min(100, Math.round((metrics.summary[0].totalRaisedCents / goalAmount) * 100))
          : 0;
      }

      // Build response
      const response = {
        success: true,
        data: {
          campaignId: campaignId,
          timeframe: timeframe,
          metrics: {
            totalDonations: metrics.summary[0]?.totalDonations || 0,
            totalRaised: {
              cents: metrics.summary[0]?.totalRaisedCents || 0,
              dollars: ((metrics.summary[0]?.totalRaisedCents || 0) / 100).toFixed(2)
            },
            uniqueDonors: metrics.summary[0]?.uniqueDonors?.length || 0,
            averageDonation: {
              cents: Math.round(metrics.summary[0]?.averageDonationCents || 0),
              dollars: ((metrics.summary[0]?.averageDonationCents || 0) / 100).toFixed(2)
            },
            largestDonation: {
              cents: metrics.summary[0]?.largestDonationCents || 0,
              dollars: ((metrics.summary[0]?.largestDonationCents || 0) / 100).toFixed(2)
            },
            smallestDonation: {
              cents: metrics.summary[0]?.smallestDonationCents || 0,
              dollars: ((metrics.summary[0]?.smallestDonationCents || 0) / 100).toFixed(2)
            },
            fundProgress: {
              goalAmount: {
                cents: goalAmount,
                dollars: (goalAmount / 100).toFixed(2)
              },
              fundedPercentage: fundedPercentage
            }
          }
        }
      };

      // Add breakdown if requested
      if (includeBreakdown) {
        response.data.breakdown = {
          byPaymentMethod: metrics.byPaymentMethod?.reduce((acc, method) => {
            acc[method._id] = {
              count: method.count,
              amount: (method.amount / 100).toFixed(2)
            };
            return acc;
          }, {}) || {},
          byStatus: metrics.byStatus?.reduce((acc, status) => {
            acc[status._id] = {
              count: status.count,
              amount: (status.amount / 100).toFixed(2)
            };
            return acc;
          }, {}) || {}
        };
      }

      // Add recent donations
      response.data.recentDonations = metrics.recentDonations || [];

      return response;
    } catch (error) {
      winstonLogger.error(`Campaign donation metrics error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate donation receipt (PDF/JSON)
   * @param {string} donationId - Donation/Transaction ID
   * @param {string} userId - User requesting receipt
   * @returns {object} Receipt data
   */
  static async generateDonationReceipt(donationId, userId) {
    try {
      const donation = await Transaction.findById(donationId)
        .populate('campaign_id', 'title description creator_id')
        .populate('supporter_id', 'email full_name')
        .populate('creator_id', 'full_name email');

      if (!donation) {
        const error = new Error('Donation not found');
        error.statusCode = 404;
        throw error;
      }

      // Authorization: owner or admin
      if (donation.supporter_id._id.toString() !== userId.toString()) {
        const error = new Error('Can only view own receipts');
        error.statusCode = 403;
        throw error;
      }

      // Generate receipt
      const receipt = {
        receiptNumber: donation.transaction_id,
        receiptDate: donation.created_at,
        donorName: donation.supporter_id.full_name,
        donorEmail: donation.supporter_id.email,
        campaignTitle: donation.campaign_id.title,
        campaignDescription: donation.campaign_id.description,
        creatorName: donation.creator_id.full_name,
        creatorEmail: donation.creator_id.email,
        donationAmount: {
          gross_cents: donation.amount_cents,
          gross_dollars: (donation.amount_cents / 100).toFixed(2),
          platform_fee_cents: donation.platform_fee_cents,
          platform_fee_dollars: (donation.platform_fee_cents / 100).toFixed(2),
          net_amount_cents: donation.net_amount_cents,
          net_amount_dollars: (donation.net_amount_cents / 100).toFixed(2)
        },
        paymentMethod: donation.payment_method,
        status: donation.status,
        taxDeductible: true, // Set based on campaign type
        taxId: 'TBD', // Set based on organization
        notes: `Thank you for your generous donation to ${donation.campaign_id.title}!`
      };

      winstonLogger.info(`Generated receipt for donation ${donationId}`);

      return {
        success: true,
        data: receipt
      };
    } catch (error) {
      winstonLogger.error(`Receipt generation error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process donation refund
   * @param {string} donationId - Transaction ID to refund
   * @param {string} userId - User requesting refund (must be admin or creator)
   * @param {object} options - Refund options
   * @returns {object} Refund result
   */
  static async refundDonation(donationId, userId, options = {}) {
    try {
      const { reason = 'Requested refund', notifyDonor = true } = options;

      const donation = await Transaction.findById(donationId);
      if (!donation) {
        const error = new Error('Donation not found');
        error.statusCode = 404;
        throw error;
      }

      // Authorization: only creator or admin can refund
      const user = await User.findById(userId);
      if (!user.roles.includes('admin') && donation.creator_id.toString() !== userId.toString()) {
        const error = new Error('Only creator or admin can refund donations');
        error.statusCode = 403;
        throw error;
      }

      // Validation: can only refund verified or pending donations
      if (!['verified', 'pending'].includes(donation.status)) {
        const error = new Error(`Cannot refund donation with status: ${donation.status}`);
        error.statusCode = 400;
        throw error;
      }

      // Validation: cannot refund if already refunded
      if (donation.refunded_at) {
        const error = new Error('Donation already refunded');
        error.statusCode = 400;
        throw error;
      }

      // Update donation with refund details
      donation.status = 'refunded';
      donation.refund_reason = reason;
      donation.refunded_by = userId;
      donation.refunded_at = new Date();
      donation.notes.push({
        timestamp: new Date(),
        action: 'refunded',
        detail: reason,
        performed_by: userId
      });

      await donation.save();

      // Log refund
      winstonLogger.info(`Refund processed for donation ${donationId}`, {
        refundedBy: userId,
        reason,
        amount: donation.amount_cents / 100
      });

      // Notify donor about refund if requested
      if (notifyDonor) {
        const donor = await User.findById(donation.supporter_id);
        const emailService = require('./emailService');
        if (emailService && donor.email) {
          await emailService.sendRefundEmail(donor.email, {
            donationId: donation.transaction_id,
            amount: (donation.amount_cents / 100).toFixed(2),
            reason,
            date: new Date()
          }).catch(err => winstonLogger.warn('Refund email send failed', err));
        }
      }

      return {
        success: true,
        data: {
          donationId: donation.transaction_id,
          status: 'refunded',
          refundedAmount: (donation.amount_cents / 100).toFixed(2),
          refundDate: donation.refunded_at,
          reason
        }
      };
    } catch (error) {
      winstonLogger.error(`Refund error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export donations (CSV/JSON)
   * @param {string} userId - User requesting export (must be admin or creator)
   * @param {object} options - Export options
   * @returns {object} Export data
   */
  static async exportDonations(userId, options = {}) {
    try {
      const { format = 'json', campaignId = null, startDate = null, endDate = null } = options;

      // Authorization: only admin or creator can export
      const user = await User.findById(userId);
      if (!user.roles.includes('admin')) {
        const error = new Error('Only admins can export donations');
        error.statusCode = 403;
        throw error;
      }

      // Build query
      const query = { transaction_type: 'donation' };
      if (campaignId) {
        query.campaign_id = campaignId;
      }
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) query.created_at.$gte = new Date(startDate);
        if (endDate) query.created_at.$lte = new Date(endDate);
      }

      // Fetch donations
      const donations = await Transaction.find(query)
        .populate('campaign_id', 'title')
        .populate('supporter_id', 'email full_name')
        .populate('creator_id', 'full_name')
        .sort({ created_at: -1 })
        .lean();

      // Format for export
      const exportData = donations.map(d => ({
        transactionId: d.transaction_id,
        date: d.created_at,
        donor: d.supporter_id.full_name,
        donorEmail: d.supporter_id.email,
        campaign: d.campaign_id.title,
        creator: d.creator_id.full_name,
        amountGross: (d.amount_cents / 100).toFixed(2),
        platformFee: (d.platform_fee_cents / 100).toFixed(2),
        amountNet: (d.net_amount_cents / 100).toFixed(2),
        paymentMethod: d.payment_method,
        status: d.status
      }));

      winstonLogger.info(`Exported ${exportData.length} donations`, {
        exportedBy: userId,
        format
      });

      return {
        success: true,
        data: {
          format,
          count: exportData.length,
          donations: exportData
        }
      };
    } catch (error) {
      winstonLogger.error(`Export error: ${error.message}`);
      throw error;
    }
  }

  /**
   * List donations with advanced filtering
   * @param {object} filters - Filter options
   * @returns {object} Paginated donation list
   */
  static async listDonations(filters = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        userId = null,
        campaignId = null,
        status = null,
        paymentMethod = null,
        startDate = null,
        endDate = null,
        sortBy = '-created_at'
      } = filters;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query = { transaction_type: 'donation' };
      
      if (userId) {
        query.supporter_id = userId;
      }
      if (campaignId) {
        query.campaign_id = campaignId;
      }
      if (status) {
        query.status = Array.isArray(status) ? { $in: status } : status;
      }
      if (paymentMethod) {
        query.payment_method = paymentMethod;
      }

      // Date range filtering
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) query.created_at.$gte = new Date(startDate);
        if (endDate) query.created_at.$lte = new Date(endDate);
      }

      // Execute query with pagination
      const total = await Transaction.countDocuments(query);
      const donations = await Transaction.find(query)
        .populate('campaign_id', 'title')
        .populate('supporter_id', 'email full_name')
        .sort(sortBy)
        .skip(skip)
        .limit(limitNum)
        .lean();

      winstonLogger.info(`Listed donations`, {
        total,
        page: pageNum,
        limit: limitNum,
        filters
      });

      return {
        success: true,
        data: {
          donations: donations.map(d => ({
            id: d._id,
            transactionId: d.transaction_id,
            campaignId: d.campaign_id._id,
            campaignTitle: d.campaign_id.title,
            amount: d.amount_cents,
            status: d.status,
            paymentMethod: d.payment_method,
            createdAt: d.created_at
          })),
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      };
    } catch (error) {
      winstonLogger.error('Error listing donations', { error: error.message });
      throw {
        statusCode: 500,
        message: 'Failed to list donations',
        error: error.message
      };
    }
  }

  /**
   * Get donation by ID (for detail view)
   * @param {string} donationId - Donation ID
   * @param {string} userId - Current user ID
   * @param {boolean} isAdmin - Is user admin
   * @returns {object} Donation details
   */
  static async getDonationById(donationId, userId, isAdmin = false) {
    try {
      const donation = await Transaction.findById(donationId)
        .populate('campaign_id', 'title description')
        .populate('supporter_id', 'full_name email');

      if (!donation) {
        throw {
          statusCode: 404,
          message: 'Donation not found'
        };
      }

      // Check access: owner or admin
      if (!isAdmin && donation.supporter_id._id.toString() !== userId.toString()) {
        throw {
          statusCode: 403,
          message: 'You can only view your own donations'
        };
      }

      return {
        success: true,
        data: {
          id: donation._id,
          transactionId: donation.transaction_id,
          campaignId: donation.campaign_id._id,
          campaignTitle: donation.campaign_id.title,
          donorName: donation.supporter_id.full_name,
          donorEmail: donation.supporter_id.email,
          amount: (donation.amount_cents / 100).toFixed(2),
          fee: (donation.platform_fee_cents / 100).toFixed(2),
          netAmount: (donation.net_amount_cents / 100).toFixed(2),
          status: donation.status,
          paymentMethod: donation.payment_method,
          message: donation.notes.find(n => n.action === 'message')?.details?.message || '',
          date: donation.created_at
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get platform-wide donation statistics
   * @returns {object} Platform statistics
   */
  static async getDonationStats() {
    try {
      const donations = await Transaction.find({
        transaction_type: 'donation',
        status: { $in: ['verified', 'pending'] }
      });

      const totalDonations = donations.length;
      const totalAmount = donations.reduce((sum, d) => sum + d.amount_cents, 0);
      const totalFees = donations.reduce((sum, d) => sum + d.platform_fee_cents, 0);
      const netRevenue = totalAmount - totalFees;

      return {
        success: true,
        data: {
          totalDonations: totalAmount,
          totalFees,
          netRevenue,
          donationCount: totalDonations,
          avgDonation: totalDonations > 0 ? Math.round(totalAmount / totalDonations) : 0,
          uniqueDonors: new Set(donations.map(d => d.supporter_id.toString())).size
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting donation stats', { error: error.message });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve statistics',
        error: error.message
      };
    }
  }

  /**
   * Get donations grouped by month (time series)
   * @param {string} campaignId - Optional campaign filter
   * @returns {object} Monthly breakdown data
   */
  static async getMonthlyBreakdown(campaignId = null) {
    try {
      const matchStage = {
        transaction_type: 'donation',
        status: { $in: ['verified', 'pending'] }
      };

      if (campaignId) {
        matchStage.campaign_id = new (require('mongoose')).Types.ObjectId(campaignId);
      }

      const breakdown = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              year: { $year: '$created_at' },
              month: { $month: '$created_at' }
            },
            total: { $sum: '$amount_cents' },
            fees: { $sum: '$platform_fee_cents' },
            count: { $sum: 1 },
            avgDonation: { $avg: '$amount_cents' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        },
        {
          $project: {
            _id: 0,
            month: {
              $dateToString: {
                format: '%Y-%m',
                date: {
                  $dateFromParts: {
                    year: '$_id.year',
                    month: '$_id.month',
                    day: 1
                  }
                }
              }
            },
            total: 1,
            fees: 1,
            count: 1,
            avgDonation: { $round: ['$avgDonation', 0] },
            net: { $subtract: ['$total', '$fees'] }
          }
        }
      ]);

      return {
        success: true,
        data: breakdown
      };
    } catch (error) {
      winstonLogger.error('Error getting monthly breakdown', { error: error.message });
      throw {
        statusCode: 500,
        message: 'Failed to retrieve monthly breakdown',
        error: error.message
      };
    }
  }
}

module.exports = DonationService;
