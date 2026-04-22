/**
 * Transaction Service
 * Handles donation recording, verification, and rejection
 * Includes metrics updates and sweepstakes integration
 */

const EventEmitter = require('events');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const ShareRewardService = require('./ShareRewardService');
const SweepstakesService = require('./SweepstakesService');
const winstonLogger = require('../utils/winstonLogger');

class TransactionService extends EventEmitter {
  constructor() {
    super();
    this.platformFeePercent = 0.2; // 20%
  }

  /**
   * Record a donation transaction
   * @param {ObjectId} campaignId - Campaign ID
   * @param {ObjectId} supporterId - Supporter/Donor ID
   * @param {Number} amountDollars - Amount in dollars (e.g., 10.50)
   * @param {String} paymentMethod - Payment method (paypal, stripe, etc.)
   * @param {Object} options - Additional options
   * @param {String} options.proofUrl - Optional proof URL
   * @param {String} options.ipAddress - Donor IP address
   * @param {String} options.userAgent - Donor user agent
   * @returns {Promise<Object>} Transaction record or rollback
   */
  async recordDonation(
    campaignId,
    supporterId,
    amountDollars,
    paymentMethod,
    options = {}
  ) {
    // ✅ NEW: Start MongoDB session for ACID transaction support with rollback
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ===== IDEMPOTENCY CHECK =====
      // Prevent duplicate donations if request is retried (check before session to save resources)
      if (options.idempotency_key) {
        const existingTransaction = await Transaction.findOne({
          idempotency_key: options.idempotency_key
        });

        if (existingTransaction) {
          // Session not needed for read-only cached result - end session early
          await session.abortTransaction();
          session.endSession();

          winstonLogger.info('✅ TransactionService.recordDonation: Idempotent request - returning cached result', {
            idempotency_key: options.idempotency_key,
            transaction_id: existingTransaction.transaction_id,
            existing_amount_cents: existingTransaction.amount_cents,
            cached: true,
          });

          // Return cached result (simulating response structure)
          return {
            success: true,
            cached: true,
            data: {
              transaction_id: existingTransaction.transaction_id,
              _id: existingTransaction._id,
              status: existingTransaction.status,
              amount_cents: existingTransaction.amount_cents,
              platform_fee_cents: existingTransaction.platform_fee_cents,
              net_amount_cents: existingTransaction.net_amount_cents,
              sweepstakes_entries_awarded: existingTransaction.sweepstakes_entries_awarded || 0,
            },
            message: 'Donation already recorded. Returning cached result.',
          };
        }
      }

      // ===== VALIDATION =====
      
      // Validate amount
      if (amountDollars < 1 || amountDollars > 10000) {
        throw new Error(`DONATION_AMOUNT_INVALID: Amount must be between $1 and $10,000. Got: $${amountDollars}`);
      }

      // Campaign validation  
      const campaign = await Campaign.findById(campaignId).session(session);
      if (!campaign) {
        throw new Error('CAMPAIGN_NOT_FOUND: Campaign does not exist');
      }
      if (campaign.status !== 'active') {
        throw new Error(`CAMPAIGN_NOT_ACTIVE: Campaign is ${campaign.status}, cannot accept donations`);
      }

      // Supporter validation
      const supporter = await User.findById(supporterId).session(session);
      if (!supporter) {
        throw new Error(`SUPPORTER_NOT_FOUND: Supporter "${supporterId}" does not exist`);
      }

      // Prevent self-donation
      if (campaign.creator_id.toString() === supporterId.toString()) {
        throw new Error('SELF_DONATION_NOT_ALLOWED: Cannot donate to your own campaign');
      }

      // Validate payment method
      const acceptedMethods = campaign.payment_methods?.map(pm => pm.type) || [];
      if (!acceptedMethods.includes(paymentMethod)) {
        throw new Error(`PAYMENT_METHOD_NOT_ACCEPTED: Campaign does not accept ${paymentMethod}`);
      }

      // ===== CALCULATIONS =====

      // Convert dollars to cents and calculate fees
      const amountCents = Math.round(amountDollars * 100);
      const platformFeeCents = Math.round(amountCents * this.platformFeePercent);
      const netAmountCents = amountCents - platformFeeCents;

      // ===== DATABASE WRITE (ATOMIC TRANSACTION) =====

      // Generate idempotency key if not provided
      const idempotencyKey = options.idempotency_key || `${supporterId}-${campaignId}-${Date.now()}`;

      const transactionData = {
        campaign_id: campaignId,
        supporter_id: supporterId,
        creator_id: campaign.creator_id,
        transaction_type: 'donation',
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        net_amount_cents: netAmountCents,
        payment_method: paymentMethod,
        status: 'verified', // Automatically verified
        proof_url: options.proofUrl,
        ip_address: options.ipAddress,
        user_agent: options.userAgent,
        idempotency_key: idempotencyKey,
      };

      // ✅ NEW: Create transaction within MongoDB session
      const transaction = new Transaction(transactionData);
      await transaction.save({ session });

      // ✅ NEW: Update campaign metrics within same transaction
      // Build dynamic update object for donations_by_method
      const incUpdate = {
        'metrics.total_donations': 1,
        'metrics.total_donation_amount': amountCents,
      };
      const donationMethodKey = `metrics.donations_by_method.${paymentMethod}`;
      incUpdate[donationMethodKey] = 1;

      const updatedCampaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $inc: incUpdate,
          $addToSet: {
            'metrics.unique_supporters': supporterId,
          },
        },
        { new: true, session } // ✅ NEW: Add session parameter for atomic operations
      );

      if (!updatedCampaign) {
        // ✅ NEW: Rollback happens automatically - no manual deletion needed
        throw new Error('CAMPAIGN_UPDATE_FAILED: Failed to update campaign metrics');
      }

      // ===== UPDATE TOP-LEVEL CAMPAIGN FIELDS =====
      // Calculate top-level aggregates based on updated metrics
      const totalDonations = updatedCampaign.metrics.total_donations || 0;
      const totalDonationAmount = updatedCampaign.metrics.total_donation_amount || 0;
      const uniqueDonors = updatedCampaign.metrics.unique_supporters?.length || 0;
      const avgDonation = totalDonations > 0 ? Math.round(totalDonationAmount / totalDonations) : 0;

      // Use another update to set top-level aggregates
      const topLevelUpdate = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          total_donors: uniqueDonors,
          average_donation: avgDonation,
          total_donations: totalDonationAmount,
        },
        { new: true, session }
      );

      if (!topLevelUpdate) {
        throw new Error('CAMPAIGN_TOP_LEVEL_UPDATE_FAILED: Failed to update campaign top-level fields');
      }

      winstonLogger.info('📊 Campaign donation metrics updated', {
        campaignId,
        metrics: {
          total_donations: totalDonations,
          total_donation_amount: totalDonationAmount / 100,
          unique_donors: uniqueDonors,
          average_donation: avgDonation / 100,
          payment_method: paymentMethod,
        }
      });

      // ===== UPDATE CAMPAIGN GOALS =====
      try {
        const goalUpdateResult = await Campaign.findByIdAndUpdate(
          campaignId,
          [
            {
              $set: {
                goals: {
                  $map: {
                    input: '$goals',
                    as: 'goal',
                    in: {
                      $cond: [
                        { $eq: ['$$goal.goal_type', 'fundraising'] },
                        {
                          goal_type: '$$goal.goal_type',
                          goal_name: '$$goal.goal_name',
                          target_amount: '$$goal.target_amount',
                          current_amount: {
                            $add: [
                              { $ifNull: ['$$goal.current_amount', 0] },
                              amountCents
                            ]
                          },
                        },
                        '$$goal'
                      ]
                    }
                  }
                },
                updated_at: new Date()
              }
            }
          ],
          { new: true, session } // ✅ NEW: Add session parameter
        );

        if (goalUpdateResult && goalUpdateResult.goals) {
          const fundraisingGoals = goalUpdateResult.goals.filter(g => g.goal_type === 'fundraising');
          fundraisingGoals.forEach(goal => {
            console.info(`[GOAL UPDATE] Campaign funding progress: ${goal.goal_name}`, {
              campaignId,
              goalType: 'fundraising',
              progress: `$${(goal.current_amount / 100).toFixed(2)}/$${(goal.target_amount / 100).toFixed(2)}`,
              donationAdded: `$${amountDollars}`,
              timestamp: new Date().toISOString()
            });
          });
        }
      } catch (goalError) {
        // Goal update failure should trigger rollback
        throw new Error(`GOAL_UPDATE_FAILED: ${goalError.message}`);
      }

      // ===== SWEEPSTAKES =====
      // Sweepstakes entry recording disabled - using new simplified sweepstakes system
      // No entries are tracked for donations anymore

      // ===== SHARE REWARD PROCESSING (if from referral link) =====

      let shareRewardResult = null;
      if (options.referralCode) {
        try {
          winstonLogger.info('🔗 TransactionService.recordDonation: Processing share conversion', {
            transactionId: transaction._id,
            referralCode: options.referralCode,
            campaignId,
            amountCents,
          });

          // Process share conversion and create reward transaction
          shareRewardResult = await ShareRewardService.processShareConversion({
            campaignId,
            donationTransactionId: transaction._id,
            referralCode: options.referralCode,
            amountCents,
            supporterId,
            paymentMethod,
            session, // ✅ NEW: Pass session for atomic operations
          });

          if (shareRewardResult.success && shareRewardResult.reward_created) {
            winstonLogger.info('✅ TransactionService: Share reward created successfully', {
              transactionId: transaction._id,
              rewardTransactionId: shareRewardResult.data.transaction_id,
              rewardAmount: shareRewardResult.data.amount_dollars,
              holdUntilDate: shareRewardResult.data.hold_until_date,
            });

            // Link the reward transaction to the donation transaction
            transaction.related_reward_id = shareRewardResult.data.transaction_id;
            await transaction.save({ session });
          } else if (shareRewardResult.success && !shareRewardResult.reward_created) {
            winstonLogger.info('ℹ️ TransactionService: Share conversion processed but no reward eligible', {
              transactionId: transaction._id,
              reason: shareRewardResult.reason,
            });
          } else {
            // Share reward failure should trigger rollback
            throw new Error(`SHARE_REWARD_FAILED: ${shareRewardResult.error}`);
          }
        } catch (error) {
          // Rollback on share reward error
          throw new Error(`SHARE_CONVERSION_ERROR: ${error.message}`);
        }
      }

      // ===== COMMIT TRANSACTION =====
      // ✅ NEW: All operations succeeded - commit the transaction
      await session.commitTransaction();
      session.endSession();

      // ===== EVENTS (after successful commit, no longer in transaction) =====

      // Emit event for downstream handlers (email, notifications, etc.)
      // Note: These are fire-and-forget, errors don't rollback the donation
      try {
        this.emit('donation:recorded', {
          transaction_id: transaction.transaction_id,
          campaign_id: campaignId,
          creator_id: campaign.creator_id,
          supporter_id: supporterId,
          amount_dollars: amountDollars,
          platform_fee_dollars: platformFeeCents / 100,
          net_amount_dollars: netAmountCents / 100,
          campaign_name: campaign.title,
          supporter_name: supporter.full_name || supporter.email,
        });
      } catch (eventError) {
        winstonLogger.warn('⚠️ TransactionService: Event emission failed (non-blocking)', {
          campaignId,
          error: eventError.message,
        });
      }

      // ✅ NEW: Broadcast real-time donation update via Socket.io
      try {
        const RealTimeService = require('./RealTimeService');
        RealTimeService.broadcastDonation(campaignId, {
          transaction_id: transaction.transaction_id,
          amount_dollars: amountDollars,
          amount_cents: amountCents,
          donor_name: supporter.full_name || supporter.email,
          message: null,
        });
      } catch (error) {
        winstonLogger.warn('⚠️ TransactionService: Real-time broadcast failed (non-blocking)', {
          campaignId,
          error: error.message,
        });
        // Don't fail the donation if real-time broadcast fails (non-critical)
      }

      // ===== RETURN SUCCESS =====

      const returnData = {
        success: true,
        data: {
          transaction_id: transaction.transaction_id,
          _id: transaction._id,
          status: transaction.status,
          amount_cents: transaction.amount_cents,
          platform_fee_cents: transaction.platform_fee_cents,
          net_amount_cents: transaction.net_amount_cents,
        },
        message: 'Donation recorded successfully. Awaiting admin verification.',
      };

      // Add share reward info if created
      if (shareRewardResult && shareRewardResult.success && shareRewardResult.reward_created) {
        returnData.data.share_reward = {
          transaction_id: shareRewardResult.data.transaction_id,
          amount_cents: shareRewardResult.data.amount_cents,
          amount_dollars: shareRewardResult.data.amount_dollars,
          status: shareRewardResult.data.status,
          hold_until_date: shareRewardResult.data.hold_until_date,
          hold_days_remaining: shareRewardResult.data.hold_days_remaining,
          message: shareRewardResult.message,
        };
      }

      return returnData;
    } catch (error) {
      // ✅ NEW: Automatic rollback on any error (only if session is still active)
      try {
        await session.abortTransaction();
      } catch (abortError) {
        winstonLogger.warn('⚠️ TransactionService: Session cleanup (transaction already committed or ended)', {
          abortError: abortError.message,
        });
      }
      
      try {
        session.endSession();
      } catch (endError) {
        winstonLogger.warn('⚠️ TransactionService: Session end failed', {
          endError: endError.message,
        });
      }

      winstonLogger.error('❌ TransactionService.recordDonation: Transaction rolled back', {
        error: error.message,
        campaignId,
        supporterId,
        amountDollars: amountDollars || 'unknown',
        timestamp: new Date().toISOString(),
      });

      console.error('recordDonation error (automatic rollback):', error.message);
      return {
        success: false,
        error: error.message.split(':')[0] || 'DONATION_RECORD_FAILED',
        message: error.message,
      };
    }
  }

  /**
   * Verify a transaction (admin only)
   * @param {ObjectId} transactionId - Transaction ID
   * @param {ObjectId} adminId - Admin ID
   * @returns {Promise<Object>} Verified transaction
   */
  async verifyTransaction(transactionId, adminId) {
    try {
      // Check admin permission
      const admin = await User.findById(adminId);
      if (!admin || !admin.is_admin) {
        throw new Error('UNAUTHORIZED: Only admins can verify transactions');
      }

      // Find transaction
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error('TRANSACTION_NOT_FOUND: Transaction does not exist');
      }

      // Validate transaction state
      if (transaction.status !== 'pending') {
        throw new Error(`INVALID_STATE: Cannot verify ${transaction.status} transaction`);
      }

      // Spot-check: Verify amount looks reasonable
      if (transaction.amount_cents < 100 || transaction.amount_cents > 1000000) {
        throw new Error('SUSPICIOUS_AMOUNT: Amount outside normal range');
      }

      // Verify campaign still exists and is active
      const campaign = await Campaign.findById(transaction.campaign_id);
      if (!campaign) {
        throw new Error('CAMPAIGN_DELETED: Associated campaign no longer exists');
      }

      // Verify supporter exists
      const supporter = await User.findById(transaction.supporter_id);
      if (!supporter) {
        throw new Error('SUPPORTER_DELETED: Associated supporter no longer exists');
      }

      // Verify amount is not excessive relative to campaign
      const avgDonation = campaign.metrics?.total_donations > 0
        ? campaign.metrics.total_donation_amount / campaign.metrics.total_donations / 100
        : 0;
      if (avgDonation > 0 && transaction.amount_dollars > avgDonation * 5) {
        // Log warning but don't fail - admin decision
        transaction.addNote('warning', 'Donation 5x larger than average', adminId);
      }

      // Update transaction
      transaction.verify(adminId);
      await transaction.save();

      // Emit verification event
      this.emit('transaction:verified', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        verified_by: adminId,
        amount_dollars: transaction.amount_dollars,
      });

      return transaction;
    } catch (error) {
      console.error('verifyTransaction error:', error.message);
      throw new Error(`VERIFY_FAILED: ${error.message}`);
    }
  }

  /**
   * Reject a transaction (admin only)
   * @param {ObjectId} transactionId - Transaction ID
   * @param {ObjectId} adminId - Admin ID
   * @param {String} reason - Rejection reason
   * @returns {Promise<Object>} Rejected transaction
   */
  async rejectTransaction(transactionId, adminId, reason) {
    try {
      // Check admin permission
      const admin = await User.findById(adminId);
      if (!admin || !admin.is_admin) {
        throw new Error('UNAUTHORIZED: Only admins can reject transactions');
      }

      if (!reason || reason.trim().length === 0) {
        throw new Error('REASON_REQUIRED: Rejection reason is required');
      }

      // Find transaction
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error('TRANSACTION_NOT_FOUND: Transaction does not exist');
      }

      // Validate transaction state
      if (transaction.status !== 'pending' && transaction.status !== 'verified') {
        throw new Error(`INVALID_STATE: Cannot reject ${transaction.status} transaction`);
      }

      const wasVerified = transaction.status === 'verified';

      // Revert metrics if transaction was already being counted
      if (!wasVerified) {
        // Only revert if metrics were already applied
        // (they're applied on recording, so revert on rejection)
        await Campaign.findByIdAndUpdate(
          transaction.campaign_id,
          {
            $inc: {
              'metrics.total_donations': -1,
              'metrics.total_donation_amount': -transaction.amount_cents,
            },
            $pull: {
              'metrics.unique_supporters': transaction.supporter_id,
            },
          }
        );

        // Revert sweepstakes entries
        if (transaction.sweepstakes_entries_awarded > 0) {
          try {
            if (this.sweepstakesService?.removeEntry) {
              await this.sweepstakesService.removeEntry(
                transaction.campaign_id,
                transaction.supporter_id,
                transaction.sweepstakes_entries_awarded
              );
            }
          } catch (error) {
            console.warn('Sweepstakes entry reversal failed:', error.message);
          }
        }
      }

      // Update transaction
      transaction.reject(adminId, reason);
      await transaction.save();

      // Emit event for notification
      this.emit('transaction:rejected', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        supporter_id: transaction.supporter_id,
        reason,
        amount_dollars: transaction.amount_dollars,
      });

      // Send notification to supporter
      // (In production, this would trigger an email)
      try {
        if (this.notificationService?.notify) {
          await this.notificationService.notify(transaction.supporter_id, {
            type: 'donation_rejected',
            title: 'Donation Not Approved',
            message: `Your donation of $${transaction.amount_dollars} to the campaign has not been approved. Reason: ${reason}`,
            transaction_id: transaction.transaction_id,
          });
        }
      } catch (error) {
        console.warn('Notification failed:', error.message);
      }

      return transaction;
    } catch (error) {
      console.error('rejectTransaction error:', error.message);
      throw new Error(`REJECT_FAILED: ${error.message}`);
    }
  }

  /**
   * Get transaction details
   * @param {ObjectId} transactionId - Transaction ID
   * @returns {Promise<Object>} Transaction details
   */
  async getTransaction(transactionId) {
    const transaction = await Transaction.findById(transactionId)
      .populate('campaign_id', 'campaign_id title status')
      .populate('supporter_id', 'email full_name')
      .populate('creator_id', 'email full_name')
      .exec();

    if (!transaction) {
      throw new Error('TRANSACTION_NOT_FOUND');
    }

    return transaction;
  }

  /**
   * Get user's transactions
   * @param {ObjectId} userId - User ID
   * @param {Number} page - Page number (default 1)
   * @param {Number} limit - Results per page (default 10)
   * @returns {Promise<Object>} Paginated transactions
   */
  async getUserTransactions(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({
      supporter_id: userId,
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('campaign_id', 'campaign_id title')
      .exec();

    const total = await Transaction.countDocuments({ supporter_id: userId });

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all transactions (admin)
   * @param {ObjectId} adminId - Admin ID
   * @param {Object} filters - Filter criteria
   * @param {String} filters.status - Transaction status
   * @param {String} filters.campaign_id - Campaign ID
   * @param {Number} filters.page - Page number
   * @param {Number} filters.limit - Results per page
   * @returns {Promise<Object>} Paginated transactions
   */
  async getAllTransactions(adminId, filters = {}) {
    // Check admin permission
    const admin = await User.findById(adminId);
    if (!admin || !admin.is_admin) {
      throw new Error('UNAUTHORIZED: Only admins can view all transactions');
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    const query = {};
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.campaign_id) {
      query.campaign_id = filters.campaign_id;
    }
    if (filters.start_date || filters.end_date) {
      query.created_at = {};
      if (filters.start_date) {
        query.created_at.$gte = new Date(filters.start_date);
      }
      if (filters.end_date) {
        query.created_at.$lte = new Date(filters.end_date);
      }
    }

    const transactions = await Transaction.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('campaign_id', 'campaign_id title')
      .populate('supporter_id', 'email full_name')
      .populate('creator_id', 'email full_name')
      .exec();

    const total = await Transaction.countDocuments(query);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: query,
    };
  }

  /**
   * Get transaction statistics
   * @param {ObjectId} campaignId - Campaign ID
   * @returns {Promise<Object>} Statistics
   */
  async getTransactionStats(campaignId) {
    const stats = await Transaction.aggregate([
      {
        $match: { campaign_id: campaignId },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total_amount_cents: { $sum: '$amount_cents' },
          total_fees_cents: { $sum: '$platform_fee_cents' },
          total_net_cents: { $sum: '$net_amount_cents' },
        },
      },
    ]);

    // Format response
    const formatted = {
      total_transactions: 0,
      total_amount_dollars: 0,
      total_fees_dollars: 0,
      total_net_dollars: 0,
      by_status: {},
    };

    stats.forEach(stat => {
      formatted.total_transactions += stat.count;
      formatted.total_amount_dollars += stat.total_amount_cents / 100;
      formatted.total_fees_dollars += stat.total_fees_cents / 100;
      formatted.total_net_dollars += stat.total_net_cents / 100;
      formatted.by_status[stat._id] = {
        count: stat.count,
        amount_dollars: (stat.total_amount_cents / 100).toFixed(2),
      };
    });

    return formatted;
  }

  /**
   * Set external service references
   */
  setSweepstakesService(service) {
    this.sweepstakesService = service;
    return this;
  }

  setNotificationService(service) {
    this.notificationService = service;
    return this;
  }

  /**
   * Get event emitter
   */
  getEventEmitter() {
    return this;
  }
}

// Export singleton
module.exports = new TransactionService();
