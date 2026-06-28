/**
 * Donation Service
 * Business logic for all donation operations including analytics, refunds, exports, and receipts
 */

const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const CampaignMetricsService = require('./CampaignMetricsService');
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
      // Optional ownership check (some callers verify the creator upstream and
      // omit userId; guard so we never crash on `undefined.toString()`).
      if (userId) {
        const campaign = await Campaign.findById(campaignId).select('creator_id').lean();
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
      }

      // Delegate to the canonical metrics service (R-3). Aggregation-based donor
      // names are null-safe, so a deleted donor no longer crashes the call (F-5).
      // "Raised" is GROSS verified-only — consistent with the meter (F-6).
      const m = await CampaignMetricsService.computeDonationMetrics(campaignId, {
        timeframe: 'all',
        includeBreakdown: true,
      });

      winstonLogger.info(`Retrieved campaign analytics for campaign ${campaignId}`);

      return {
        success: true,
        data: {
          campaignId: m.campaignId,
          campaignTitle: m.campaignTitle,
          donations: {
            total_count: m.totalDonations,
            unique_donors: m.uniqueDonors,
            total_raised_cents: m.raisedCents,
            total_raised_dollars: (m.raisedCents / 100).toFixed(2),
            total_fees_cents: m.feesCents,
            total_fees_dollars: (m.feesCents / 100).toFixed(2),
            avg_donation_cents: m.avgCents,
            avg_donation_dollars: (m.avgCents / 100).toFixed(2),
            // Pending pipeline (awaiting confirmation) — not part of raised.
            pending_count: m.pending.count,
            pending_cents: m.pending.amountCents,
            pending_dollars: (m.pending.amountCents / 100).toFixed(2),
          },
          timeline: m.timeline.map((t) => ({
            date: t.date,
            count: t.count,
            amount: (t.amountCents / 100).toFixed(2),
          })),
          topDonors: m.topDonors.map((d) => ({
            donorName: d.donorName,
            donorEmail: d.donorEmail,
            totalAmount: (d.amountCents / 100).toFixed(2),
            count: d.count,
            firstDonation: d.firstDonation,
            lastDonation: d.lastDonation,
          })),
          recentDonations: m.recent.map((d) => ({
            id: d.id,
            donorName: d.donorName,
            amount: (d.amountCents / 100).toFixed(2),
            paymentMethod: d.paymentMethod,
            status: d.status,
            date: d.date,
          })),
        },
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
      // Delegate to the canonical metrics service (R-3). This fixes F-4 (funded %
      // was always 0 due to reading a non-existent `goals.goal_amount_cents`) and
      // F-6 (raised is now GROSS verified-only, consistent with every other read).
      const m = await CampaignMetricsService.computeDonationMetrics(campaignId, {
        timeframe,
        includeBreakdown,
      });

      const response = {
        success: true,
        data: {
          campaignId: m.campaignId,
          timeframe: m.timeframe,
          metrics: {
            totalDonations: m.totalDonations,
            totalRaised: {
              cents: m.raisedCents,
              dollars: (m.raisedCents / 100).toFixed(2),
            },
            // Pending (awaiting creator confirmation) — surfaced, never counted in raised.
            pendingDonations: {
              count: m.pending.count,
              cents: m.pending.amountCents,
              dollars: (m.pending.amountCents / 100).toFixed(2),
            },
            uniqueDonors: m.uniqueDonors,
            averageDonation: {
              cents: m.avgCents,
              dollars: (m.avgCents / 100).toFixed(2),
            },
            largestDonation: {
              cents: m.largestCents,
              dollars: (m.largestCents / 100).toFixed(2),
            },
            smallestDonation: {
              cents: m.smallestCents,
              dollars: (m.smallestCents / 100).toFixed(2),
            },
            totalFees: {
              cents: m.feesCents,
              dollars: (m.feesCents / 100).toFixed(2),
            },
            fundProgress: {
              goalAmount: {
                cents: m.goalAmountCents,
                dollars: (m.goalAmountCents / 100).toFixed(2),
              },
              fundedPercentage: m.fundedPercentage,
            },
          },
        },
      };

      if (includeBreakdown) {
        response.data.breakdown = {
          byPaymentMethod: m.byPaymentMethod.reduce((acc, method) => {
            acc[method.method] = {
              count: method.count,
              amount: (method.amountCents / 100).toFixed(2),
            };
            return acc;
          }, {}),
        };
      }

      response.data.recentDonations = m.recent.map((d) => ({
        amount: d.amountCents / 100,
        paymentMethod: d.paymentMethod,
        status: d.status,
        date: d.date,
        donor: d.donorName,
      }));

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
        .populate('campaign_id', 'title description creator_id tax_deductible tax_id')
        .populate('supporter_id', 'email full_name')
        .populate('creator_id', 'full_name email');

      if (!donation) {
        const error = new Error('Donation not found');
        error.statusCode = 404;
        throw error;
      }

      // F-5: null-guard populated refs (donor may have been deleted).
      const supporter = donation.supporter_id;
      const campaign = donation.campaign_id;
      const creator = donation.creator_id;

      // Authorization: owner or admin
      if (!supporter || supporter._id.toString() !== userId.toString()) {
        const error = new Error('Can only view own receipts');
        error.statusCode = 403;
        throw error;
      }

      const campaignTitle = campaign?.title || 'Unknown campaign';

      // U-8: deductibility is a verified campaign/org attribute, not a blanket
      // assumption. Only claim it (and surface the tax ID) when truly deductible.
      const isDeductible = campaign?.tax_deductible === true;

      // Generate receipt
      const receipt = {
        receiptNumber: donation.transaction_id,
        receiptDate: donation.created_at,
        donorName: supporter.full_name || 'Donor',
        donorEmail: supporter.email || null,
        campaignTitle,
        campaignDescription: campaign?.description || null,
        creatorName: creator?.full_name || 'Campaign creator',
        creatorEmail: creator?.email || null,
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
        taxDeductible: isDeductible,
        taxId: isDeductible ? (campaign?.tax_id || null) : null,
        deductibilityNotice: isDeductible
          ? 'This donation may be tax-deductible. Consult your tax advisor; no goods or services were provided in exchange.'
          : 'This is a peer-to-peer gift and is generally NOT tax-deductible.',
        notes: `Thank you for your generous donation to ${campaignTitle}!`
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
        if (emailService && donor?.email) {
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

      // Format for export (F-5: null-guard refs to deleted donors/campaigns).
      const exportData = donations.map(d => ({
        transactionId: d.transaction_id,
        date: d.created_at,
        donor: d.supporter_id?.full_name || 'Deleted user',
        donorEmail: d.supporter_id?.email || null,
        campaign: d.campaign_id?.title || 'Unknown campaign',
        creator: d.creator_id?.full_name || 'Unknown creator',
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
            // campaign_id may be null when the referenced campaign was deleted,
            // or a raw ObjectId when populate found no matching document.
            campaignId: d.campaign_id?._id || d.campaign_id || null,
            campaignTitle: d.campaign_id?.title || 'Unknown campaign',
            amount: d.amount_cents,
            status: d.status,
            paymentMethod: d.payment_method,
            // CE-2: refund-request state for the donor dashboard list view.
            refundRequestStatus: d.refund_request?.status && d.refund_request.status !== 'none'
              ? d.refund_request.status
              : null,
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

      // F-5: null-guard populated refs (donor/campaign may have been deleted).
      const supporter = donation.supporter_id;
      const campaign = donation.campaign_id;

      // Check access: owner or admin
      if (!isAdmin && (!supporter || supporter._id.toString() !== userId.toString())) {
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
          campaignId: campaign?._id || donation.campaign_id || null,
          campaignTitle: campaign?.title || 'Unknown campaign',
          donorName: supporter?.full_name || 'Deleted user',
          donorEmail: supporter?.email || null,
          amount: (donation.amount_cents / 100).toFixed(2),
          fee: (donation.platform_fee_cents / 100).toFixed(2),
          netAmount: (donation.net_amount_cents / 100).toFixed(2),
          status: donation.status,
          paymentMethod: donation.payment_method,
          message: donation.notes.find(n => n.action === 'message')?.details?.message || '',
          // CE-2 / CE-7: surface refund-request state for the donor dashboard.
          refundRequest: donation.refund_request?.status && donation.refund_request.status !== 'none'
            ? {
                status: donation.refund_request.status,
                reason: donation.refund_request.reason,
                requestedAt: donation.refund_request.requested_at,
                decidedAt: donation.refund_request.decided_at,
                decisionNote: donation.refund_request.decision_note,
              }
            : null,
          canRequestRefund: ['pending', 'verified'].includes(donation.status) &&
            (!donation.refund_request || ['none', 'declined'].includes(donation.refund_request.status)),
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
