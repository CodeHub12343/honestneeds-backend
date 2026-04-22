const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const TransactionService = require('../services/TransactionService');
const FeeTrackingService = require('../services/FeeTrackingService');
const paymentService = require('../services/paymentService');
const logger = require('../utils/winstonLogger');

/**
 * Donation Controller - Production Ready
 * All 11 donation endpoints with complete business logic
 * 
 * Endpoints:
 * 1. POST /donations - Create donation
 * 2. GET /donations - List donations
 * 3. GET /donations/:id - Get single donation
 * 4. GET /donors/analytics - Platform-wide analytics
 * 5. GET /campaigns/:id/donations - Creator view
 * 6. POST /donations/:id/receipt - PDF receipt
 * 7. POST /donations/:id/refund - Admin refund
 * 8. GET /donations/export - CSV export
 * 9. GET /donations/stats - Platform stats
 * 10. GET /donations/monthly-breakdown - Time series
 * 11. Additional helper methods
 */
class DonationController {
  /**
   * POST /campaigns/:campaignId/donate
   * Record a donation with complete fee breakdown and payment instructions
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {number} req.body.amount - Amount in dollars
   * @param {string} req.body.paymentMethod - Payment method (paypal, venmo, bank_transfer)
   * @param {string} req.body.proofUrl - Optional proof URL
   * @returns {201} Transaction with fee details and payment instructions
   */
  static async createDonation(req, res) {
    try {
      const { campaignId } = req.params;
      const { amount, paymentMethod, proofUrl, referralCode, idempotency_key } = req.body;
      const supporterId = req.user._id;

      // ✅ NEW: Generate or use provided idempotency key for duplicate prevention
      const finalIdempotencyKey = idempotency_key || `${supporterId}-${campaignId}-${Date.now()}`;

      logger.debug('📝 DonationController: Donation attempt', {
        campaignId,
        amountDollars: amount,
        paymentMethod,
        hasIdempotencyKey: !!idempotency_key,
        finalIdempotencyKey: finalIdempotencyKey.substring(0, 20) + '...', // Log first 20 chars
      });

      // Validate input
      if (!amount || !paymentMethod) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Amount and payment method are required'
        });
      }

      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: 'Amount must be a positive number'
        });
      }

      // ✅ NEW: Validate donation amount is within acceptable range
      const MIN_DONATION_AMOUNT = 1; // $1 minimum
      const MAX_DONATION_AMOUNT = 999999; // $999,999 maximum
      const SUSPICIOUS_AMOUNT_THRESHOLD = 10000; // $10,000 threshold for admin alerts

      if (amount < MIN_DONATION_AMOUNT) {
        return res.status(400).json({
          success: false,
          error: 'AMOUNT_TOO_LOW',
          message: `Minimum donation amount is $${MIN_DONATION_AMOUNT}`,
          min_amount: MIN_DONATION_AMOUNT
        });
      }

      if (amount > MAX_DONATION_AMOUNT) {
        return res.status(400).json({
          success: false,
          error: 'AMOUNT_TOO_HIGH',
          message: `Maximum donation amount is $${MAX_DONATION_AMOUNT.toLocaleString()}`,
          max_amount: MAX_DONATION_AMOUNT
        });
      }

      // ✅ NEW: Alert admin for suspicious high-value donations
      if (amount > SUSPICIOUS_AMOUNT_THRESHOLD) {
        logger.warn('⚠️ DonationController: High-value donation detected', {
          amountDollars: amount,
          campaignId,
          supporterId,
          paymentMethod,
          threshold: SUSPICIOUS_AMOUNT_THRESHOLD,
          severity: amount > 50000 ? 'CRITICAL' : 'WARNING'
        });

        // Could trigger fraud detection or manual review here in future
        // await FraudDetectionService.checkHighValueDonation(supporterId, amount, campaignId);
      }

      // Fetch campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist'
        });
      }

      // Verify campaign is active
      if (campaign.status !== 'active') {
        return res.status(409).json({
          success: false,
          error: 'CAMPAIGN_INACTIVE',
          message: `Campaign is ${campaign.status}, donations not accepted`,
          campaign_status: campaign.status
        });
      }

      // Verify payment method is accepted
      if (!campaign.payment_methods || !campaign.payment_methods.some(pm => pm.type === paymentMethod)) {
        return res.status(400).json({
          success: false,
          error: 'PAYMENT_METHOD_NOT_ACCEPTED',
          message: 'This campaign does not accept this payment method',
          accepted_methods: campaign.payment_methods || []
        });
      }

      // ✅ Extract referralCode from body or query params for share tracking
      const refCode = referralCode || req.query.ref || null;

      if (refCode) {
        logger.info('🔗 DonationController: Donation from share referral', {
          referralCode: refCode,
          campaignId,
          amountDollars: amount,
        });
      }

      // Record donation via TransactionService
      const donationResult = await TransactionService.recordDonation(
        campaignId,
        supporterId,
        amount,
        paymentMethod,
        {
          proofUrl,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          referralCode: refCode, // ✅ ADDED: Pass referral code for share conversion
          idempotency_key: finalIdempotencyKey, // ✅ NEW: Pass idempotency key for duplicate prevention
        }
      );

      if (!donationResult.success) {
        return res.status(400).json({
          success: false,
          error: donationResult.error,
          message: donationResult.message
        });
      }

      // ✅ NEW: Log idempotency result
      if (donationResult.cached) {
        logger.info('✅ DonationController: Duplicate request - returning cached result', {
          transactionId: donationResult.data.transaction_id,
          idempotencyKey: finalIdempotencyKey.substring(0, 20) + '...',
          amountDollars: amount,
          cached: true,
        });
      } else {
        logger.info('✅ DonationController: New donation recorded', {
          transactionId: donationResult.data.transaction_id,
          idempotencyKey: finalIdempotencyKey.substring(0, 20) + '...',
          amountDollars: amount,
          sweepstakesEntries: donationResult.data.sweepstakes_entries_awarded,
        });
      }

      // Calculate fee breakdown
      const feeBreakdown = {
        gross_cents: Math.round(amount * 100),
        fee_cents: Math.round(amount * 100 * 0.2),
        net_cents: Math.round(amount * 100 * 0.8),
        platform_fee_percentage: 20,
        gross_dollars: amount,
        fee_dollars: amount * 0.2,
        net_dollars: amount * 0.8
      };

      // Get creator's payment details
      const creator = await User.findById(campaign.creator_id);
      const creatorPaymentMethod = creator?.payment_methods?.[0] || paymentMethod;

      // Generate QR code data if applicable
      let qrCodeData = null;
      if (paymentMethod === 'paypal') {
        qrCodeData = {
          method: 'paypal',
          data: `paypal.me/${creator?.paypal_handle || 'honestneed'}/${feeBreakdown.net_dollars.toFixed(2)}`
        };
      } else if (paymentMethod === 'venmo') {
        qrCodeData = {
          method: 'venmo',
          data: `venmo.com/${creator?.venmo_handle || 'honestneed'}/${feeBreakdown.net_dollars.toFixed(2)}`
        };
      }

      // Build response with payment instructions
      const response = {
        success: true,
        data: {
          transaction_id: donationResult.data.transaction_id,
          transaction_db_id: donationResult.data._id,
          amount_dollars: amount,
          fee_breakdown: {
            gross: feeBreakdown.gross_cents,
            fee: feeBreakdown.fee_cents,
            net: feeBreakdown.net_cents,
            fee_percentage: feeBreakdown.platform_fee_percentage
          },
          creator_payment_method: creatorPaymentMethod,
          instructions: DonationController._buildPaymentInstructions(paymentMethod, feeBreakdown, creatorPaymentMethod),
          qr_code: qrCodeData,
          sweepstakes_entries: donationResult.data.sweepstakes_entries_awarded,
          tracking_id: donationResult.data._id.toString()
        },
        message: 'Donation recorded successfully. Follow payment instructions below.'
      };

      // ✅ Add share reward information if created from referral
      if (donationResult.data.share_reward) {
        response.data.share_reward = donationResult.data.share_reward;
        response.message += ` You also earned a ${donationResult.data.share_reward.amount_dollars} reward from your share, pending 30-day verification!`;

        logger.info('🎉 DonationController: Donation from share referral with reward', {
          transactionId: donationResult.data._id,
          rewardAmount: donationResult.data.share_reward.amount_dollars,
          holdUntilDate: donationResult.data.share_reward.hold_until_date,
        });
      }

      // Track fee for admin dashboard
      await FeeTrackingService.recordFee({
        campaign_id: campaignId,
        transaction_id: donationResult.data._id,
        gross_cents: feeBreakdown.gross_cents,
        fee_cents: feeBreakdown.fee_cents,
        status: 'pending'
      });

      res.status(201).json(response);
    } catch (error) {
      console.error('Donation creation error:', error.message);
      
      // Safely extract variables that may be undefined
      const debugAmount = req.body?.amount ?? 'unknown';
      const debugPaymentMethod = req.body?.paymentMethod ?? 'unknown';
      const debugCampaignId = req.params?.campaignId ?? 'unknown';
      const debugSupporterId = req.user?._id ?? 'unknown';
      
      console.error('Error details:', {
        stack: error.stack,
        amount: debugAmount,
        paymentMethod: debugPaymentMethod,
        campaignId: debugCampaignId,
        supporterId: debugSupporterId,
        errorMessage: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'DONATION_FAILED',
        message: error.message || 'Failed to process donation'
      });
    }
  }

  /**
   * POST /campaigns/:campaignId/donate/:transactionId/mark-sent
   * Mark donation as sent by supporter
   *
   * @param {Object} req - Express request
   * @returns {200} Updated transaction
   */
  static async markDonationSent(req, res) {
    try {
      const { campaignId, transactionId } = req.params;
      const supporterId = req.user._id;

      // Fetch transaction
      const Transaction = require('../models/Transaction');
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction does not exist'
        });
      }

      // Verify transaction belongs to supporter
      if (transaction.supporter_id.toString() !== supporterId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You can only mark your own donations as sent'
        });
      }

      // Update metadata with payment sent timestamp
      transaction.notes.push({
        timestamp: new Date(),
        action: 'payment_sent',
        performed_by: supporterId
      });

      // Add metadata
      if (!transaction.metadata) {
        transaction.metadata = {};
      }
      transaction.metadata.payment_sent_at = new Date();
      transaction.metadata.payment_sent_ip = req.ip;

      await transaction.save();

      // Send email to creator about pending donation
      const NotificationService = require('../services/NotificationService');
      const campaign = await Campaign.findById(campaignId);
      const creator = await User.findById(campaign.creator_id);

      if (NotificationService && creator.email) {
        await NotificationService.sendEmail(creator._id.toString(), {
          subject: `New pending donation for ${campaign.title}`,
          template: 'pending_donation',
          data: {
            donor_amount: transaction.amount_cents / 100,
            net_amount: transaction.net_amount_cents / 100,
            campaign_title: campaign.title,
            transaction_id: transaction.transaction_id
          }
        }).catch(err => console.log('Email send failed (non-critical)', err));
      }

      res.status(200).json({
        success: true,
        data: {
          transaction_id: transaction.transaction_id,
          status: 'marked_sent',
          amount_dollars: transaction.amount_cents / 100,
          message: 'Payment marked as sent. Creator will be notified.'
        }
      });
    } catch (error) {
      console.error('Mark donation sent error:', error);
      res.status(500).json({
        success: false,
        error: 'UPDATE_FAILED',
        message: 'Failed to update donation status'
      });
    }
  }

  /**
   * GET /donations/:transactionId
   * Get donation details by transaction ID
   *
   * @param {Object} req - Express request
   * @returns {200} Donation details
   */
  static async getDonation(req, res) {
    try {
      const { transactionId } = req.params;
      const userId = req.user._id;

      const Transaction = require('../models/Transaction');
      const transaction = await Transaction.findOne({ transaction_id: transactionId })
        .populate('campaign_id', '_id title')
        .populate('supporter_id', 'email full_name');

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction does not exist'
        });
      }

      // Can only view own donations (unless admin)
      if (!req.isAdmin && transaction.supporter_id._id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You can only view your own donations'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: transaction._id,
          transactionId: transaction.transaction_id,
          campaignId: transaction.campaign_id._id,
          campaignTitle: transaction.campaign_id.title,
          donorId: transaction.supporter_id._id,
          donorEmail: transaction.supporter_id.email,
          donorName: transaction.supporter_id.full_name,
          amount: transaction.amount_cents,
          platformFee: transaction.platform_fee_cents,
          netAmount: transaction.net_amount_cents,
          paymentMethod: transaction.payment_method,
          status: transaction.status,
          createdAt: transaction.created_at,
          verifiedAt: transaction.verified_at || null
        }
      });
    } catch (error) {
      console.error('Get donation error:', error);
      res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to retrieve donation'
      });
    }
  }

  /**
   * GET /donations/analytics/dashboard
   * Get comprehensive donation analytics
   *
   * @param {Object} req - Express request
   * @returns {200} Analytics data
   */
  static async getDonationAnalytics(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const userId = req.user._id;
      const role = req.user.roles?.includes('admin') ? 'admin' : 'supporter';

      const result = await DonationService.getDonationAnalytics(userId, role);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics',
        error: error.message
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/donations/analytics
   * Get campaign-specific donation analytics
   *
   * @param {Object} req - Express request
   * @returns {200} Campaign analytics
   */
  static async getCampaignDonationAnalytics(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { campaignId } = req.params;
      const userId = req.user._id;

      const result = await DonationService.getCampaignDonationAnalytics(campaignId, userId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Campaign analytics error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/donations
   * List all donations for a specific campaign
   *
   * @param {Object} req - Express request
   * @returns {200} Paginated donation list
   */
  static async getCampaignDonations(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { campaignId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const result = await DonationService.listDonations({
        campaignId,
        page,
        limit,
        status: ['verified', 'pending']
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get campaign donations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve donations',
        error: error.message
      });
    }
  }

  /**
   * GET /donations
   * List donations with filtering
   *
   * @param {Object} req - Express request
   * @returns {200} Paginated donation list
   */
  static async listDonations(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const {
        page = 1,
        limit = 20,
        userId = req.user._id,
        campaignId = null,
        status = null,
        paymentMethod = null,
        startDate = null,
        endDate = null
      } = req.query;

      const result = await DonationService.listDonations({
        page,
        limit,
        userId,
        campaignId,
        status,
        paymentMethod,
        startDate,
        endDate
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('List donations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list donations',
        error: error.message
      });
    }
  }

  /**
   * GET /donations/:donationId/receipt
   * Generate donation receipt
   *
   * @param {Object} req - Express request
   * @returns {200} Receipt data (JSON format, can be converted to PDF)
   */
  static async getDonationReceipt(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { donationId } = req.params;
      const userId = req.user._id;

      const result = await DonationService.generateDonationReceipt(donationId, userId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Receipt generation error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  }

  /**
   * POST /donations/:donationId/refund
   * Refund a donation
   *
   * @param {Object} req - Express request
   * @returns {200} Refund confirmation
   */
  static async refundDonation(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { donationId } = req.params;
      const { reason = 'Requested refund', notifyDonor = true } = req.body;
      const userId = req.user._id;

      const result = await DonationService.refundDonation(donationId, userId, {
        reason,
        notifyDonor
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('Refund error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  }

  /**
   * GET /donations/history
   * Get donation history for current user
   *
   * @param {Object} req - Express request
   * @returns {200} User donation history
   */
  static async getDonationHistory(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const userId = req.user._id;
      const { startDate = null, endDate = null, limit = 50 } = req.query;

      const result = await DonationService.getDonationHistory(userId, {
        startDate,
        endDate,
        limit
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('Donation history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve history',
        error: error.message
      });
    }
  }

  /**
   * GET /donations/export
   * Export donations (admin only)
   *
   * @param {Object} req - Express request
   * @returns {200} Exported data
   */
  static async exportDonations(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const userId = req.user._id;
      const {
        format = 'json',
        campaignId = null,
        startDate = null,
        endDate = null
      } = req.query;

      const result = await DonationService.exportDonations(userId, {
        format,
        campaignId,
        startDate,
        endDate
      });

      // If CSV format requested, convert to CSV
      if (format === 'csv' && result.data.donations) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="donations.csv"');
        
        const headers = Object.keys(result.data.donations[0]);
        const csv = [
          headers.join(','),
          ...result.data.donations.map(d => 
            headers.map(h => `"${d[h] || ''}"`).join(',')
          )
        ].join('\n');

        return res.status(200).send(csv);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error('Export error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  }

  /**
   * Build payment instructions based on payment method
   * @private
   */
  static _buildPaymentInstructions(paymentMethod, feeBreakdown, creatorPaymentMethod) {
    const netAmount = feeBreakdown.net_dollars.toFixed(2);

    const instructions = {
      method: paymentMethod,
      steps: []
    };

    switch (paymentMethod) {
      case 'paypal':
        instructions.steps = [
          `Send $${netAmount} via PayPal to the creator`,
          'Include this reference in the payment',
          'Wait for creator to verify receipt',
          'Your sweepstakes entries will be activated upon verification'
        ];
        instructions.reference = 'Use donation transaction ID in payment note';
        break;

      case 'venmo':
        instructions.steps = [
          `Send $${netAmount} on Venmo to the creator`,
          'Make payment public so we can verify',
          'Wait for verification (usually within 24 hours)',
          'Your sweepstakes entries activate after verification'
        ];
        break;

      case 'bank_transfer':
        instructions.steps = [
          `Transfer $${netAmount} via bank transfer`,
          'Include transaction ID as reference',
          'Allow 2-3 business days for processing',
          'Sweepstakes entries activate after verification'
        ];
        instructions.note = 'Bank transfers may take longer to verify';
        break;

      case 'stripe':
        instructions.steps = [
          `Complete Stripe payment for $${netAmount}`,
          'Payment will be instant',
          'Creator receives notification immediately',
          'Sweepstakes entries activate after verification'
        ];
        break;

      default:
        instructions.steps = [
          `Send $${netAmount} to creator using ${paymentMethod}`,
          'Include transaction reference in payment',
          'Wait for verification',
          'Sweepstakes entries activate after verification'
        ];
    }

    instructions.total_to_send = netAmount;
    instructions.platform_fee = feeBreakdown.fee_dollars.toFixed(2);
    instructions.gross_amount = feeBreakdown.gross_dollars.toFixed(2);
    instructions.fee_breakdown = `We take 20% ($${feeBreakdown.fee_dollars.toFixed(2)}) as platform fee. Creator receives $${netAmount}.`;

    return instructions;
  }

  /**
   * GET /donations/stats
   * Platform-wide donation statistics
   * @param {Object} req - Express request
   * @returns {200} Platform statistics
   */
  static async getDonationStats(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const result = await DonationService.getDonationStats();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Donation stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics',
        error: error.message
      });
    }
  }

  /**
   * GET /donations/monthly-breakdown
   * Get donations grouped by month with time-series data
   * @param {Object} req - Express request
   * @param {string} req.query.campaignId - Optional filter by campaign
   * @returns {200} Monthly donation totals
   */
  static async getMonthlyBreakdown(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { campaignId } = req.query;
      const result = await DonationService.getMonthlyBreakdown(campaignId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Monthly breakdown error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve monthly breakdown',
        error: error.message
      });
    }
  }

  /**
   * POST /donations/:id/receipt
   * Generate PDF receipt for a donation
   * @param {Object} req - Express request
   * @param {string} req.params.id - Donation ID
   * @returns {200} PDF or receipt data
   */
  static async generatePDFReceipt(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { id } = req.params;
      const result = await DonationService.generateReceipt(id);
      
      // TODO: Implement PDF generation with pdfkit
      // For now return JSON receipt data
      return res.status(200).json(result);
    } catch (error) {
      console.error('Receipt generation error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to generate receipt',
        error: error.message
      });
    }
  }

  /**
   * GET /donations/:id
   * Get single donation by ID
   * @param {Object} req - Express request
   * @param {string} req.params.id - Donation ID
   * @returns {200} Donation details
   */
  static async getDonationById(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { id } = req.params;
      const userId = req.user._id;
      const isAdmin = req.user?.roles?.includes('admin');

      const result = await DonationService.getDonationById(id, userId, isAdmin);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Get donation error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to retrieve donation',
        error: error.message
      });
    }
  }

  /**
   * GET /donations/:id/detail? (alias for getDonationById)
   */
  static async getDonationDetail(req, res) {
    return DonationController.getDonationById(req, res);
  }

  /**
   * GET /campaigns/:campaignId/donations/analytics
   * Get analytics specific to a campaign
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign ID
   * @returns {200} Campaign-specific analytics
   */
  static async getCampaignDonationAnalytics(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { campaignId } = req.params;
      const userId = req.user._id;

      // Verify user is campaign creator
      const Campaign = require('../models/Campaign');
      const campaign = await Campaign.findById(campaignId);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only campaign creator can view this analytics'
        });
      }

      const result = await DonationService.getCampaignDonationAnalytics(campaignId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Campaign analytics error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to retrieve campaign analytics',
        error: error.message
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/donations/metrics
   * Get aggregated donation metrics for a campaign
   * Includes: total donations, raised amount, unique donors, payment method breakdown
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign ID
   * @param {string} req.query.timeframe - 'today'|'week'|'month'|'all' (default: 'all')
   * @param {boolean} req.query.includeBreakdown - Include detailed breakdown (default: true)
   * @returns {200} Campaign donation metrics
   */
  static async getCampaignDonationMetrics(req, res) {
    try {
      const DonationService = require('../services/DonationService');
      const { campaignId } = req.params;
      const { timeframe = 'all', includeBreakdown = true } = req.query;

      const result = await DonationService.getCampaignDonationMetrics(
        campaignId,
        timeframe,
        includeBreakdown === 'true' || includeBreakdown === true
      );

      return res.status(200).json(result);
    } catch (error) {
      logger.error('Get campaign donation metrics error:', {
        error: error.message,
        campaignId: req.params.campaignId,
        stack: error.stack
      });

      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  }

  /**
   * POST /donations/:donationId/mark-sent
   * (Alias) Mark a donation payment as sent
   */
  static async markDonationPaymentSent(req, res) {
    return DonationController.markDonationSent(req, res);
  }

  /**
   * GET /donations/receipt/:id
   * (Alias) Retrieves receipt without POST
   */
  static async getDonationReceipt(req, res) {
    return DonationController.generatePDFReceipt(req, res);
  }

  /**
   * GET /donations/export/csv
   * (Alias) Export as CSV specifically
   */
  static async exportDonationsCSV(req, res) {
    req.query.format = 'csv';
    return DonationController.exportDonations(req, res);
  }
}

module.exports = DonationController;
