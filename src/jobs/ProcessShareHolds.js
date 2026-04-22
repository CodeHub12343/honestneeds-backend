/**
 * ProcessShareHolds Job
 * 
 * Scheduled background job that processes share reward holds
 * Runs hourly to approve/reject rewards after 30-day hold period
 * 
 * Security: Prevents fraud by holding rewards pending fraud review
 * Fraud checks run automatically after hold period expires
 */

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ShareRecord } = require('../models/Share');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');
const emailService = require('../services/emailService');
const ShareFraudDetectionService = require('../services/ShareFraudDetectionService');

class ProcessShareHoldsJob {
  /**
   * Main job execution method
   * Called hourly via node-cron
   */
  static async run() {
    const startTime = Date.now();
    
    try {
      winstonLogger.info('🔄 ProcessShareHoldsJob: Starting hold processing');
      
      // Find all transactions with expired holds
      const expiredHolds = await Transaction.find({
        status: 'pending_hold',
        hold_until_date: { $lte: new Date() }
      })
        .populate('supporter_id', 'email display_name')
        .populate('campaign_id', 'title creator_id')
        .lean();
      
      winstonLogger.info(`📊 ProcessShareHoldsJob: Found ${expiredHolds.length} expired holds to process`);
      
      if (expiredHolds.length === 0) {
        winstonLogger.info('✅ ProcessShareHoldsJob: No expired holds to process');
        return {
          success: true,
          processed: 0,
          approved: 0,
          rejected: 0,
          duration_ms: Date.now() - startTime
        };
      }
      
      let approvedCount = 0;
      let rejectedCount = 0;
      const errors = [];
      
      // Process each expired hold
      for (const transaction of expiredHolds) {
        try {
          const result = await this.processTransaction(transaction);
          
          if (result.status === 'approved') {
            approvedCount++;
          } else if (result.status === 'rejected') {
            rejectedCount++;
          }
        } catch (error) {
          winstonLogger.error('❌ ProcessShareHoldsJob: Error processing transaction', {
            transactionId: transaction._id,
            error: error.message,
            stack: error.stack
          });
          errors.push({
            transactionId: transaction._id,
            error: error.message
          });
        }
      }
      
      const duration = Date.now() - startTime;
      winstonLogger.info('✅ ProcessShareHoldsJob: Completed', {
        total: expiredHolds.length,
        approved: approvedCount,
        rejected: rejectedCount,
        errors: errors.length,
        duration_ms: duration
      });
      
      return {
        success: true,
        processed: expiredHolds.length,
        approved: approvedCount,
        rejected: rejectedCount,
        errors: errors.length > 0 ? errors : null,
        duration_ms: duration
      };
    } catch (error) {
      winstonLogger.error('❌ ProcessShareHoldsJob: Fatal error', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message,
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Process individual transaction
   * Detect fraud, then approve or reject
   */
  static async processTransaction(transaction) {
    // Use session for atomic updates if supported
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      winstonLogger.info('🔍 ProcessShareHoldsJob: Checking fraud for transaction', {
        transactionId: transaction._id,
        supporter_id: transaction.supporter_id?._id || transaction.supporter_id,
        amount: transaction.amount_cents
      });

      // Run fraud detection
      const fraudCheck = await ShareFraudDetectionService.checkTransactionForFraud(transaction);
      
      let result;
      
      if (fraudCheck.isFraud) {
        result = await this.rejectReward(transaction, fraudCheck, session);
      } else {
        result = await this.approveReward(transaction, session);
      }
      
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Approve a share reward after fraud check passes
   */
  static async approveReward(transaction, session) {
    try {
      winstonLogger.info('✅ ProcessShareHoldsJob: Approving reward', {
        transactionId: transaction._id,
        amount: transaction.amount_cents
      });

      // Update transaction to approved status
      const updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        {
          status: 'approved',
          approved_at: new Date(),
          hold_fraud_check_result: 'passed',
          $push: {
            notes: {
              timestamp: new Date(),
              action: 'hold_approved',
              detail: 'Share reward hold period completed - no fraud detected'
            }
          }
        },
        { new: true, session }
      );

      // Move amount to user's available balance
      await User.findByIdAndUpdate(
        transaction.supporter_id,
        {
          $inc: { 
            'wallet.available_cents': transaction.amount_cents,
            'stats.total_earned': transaction.amount_cents
          }
        },
        { session }
      );

      // Update campaign share stats if campaign exists
      if (transaction.campaign_id) {
        await Campaign.findByIdAndUpdate(
          transaction.campaign_id,
          {
            $inc: { 
              'share_config.total_rewards_paid': transaction.amount_cents,
              'share_config.total_approved_rewards': 1
            }
          },
          { session }
        );
      }

      // Send approval email to supporter (non-blocking)
      this.sendApprovalEmail(transaction);

      winstonLogger.info('✅ ProcessShareHoldsJob: Reward approved successfully', {
        transactionId: transaction._id,
        supporter_email: transaction.supporter_id?.email,
        amount: transaction.amount_cents / 100
      });

      return {
        status: 'approved',
        transactionId: transaction._id,
        amount: transaction.amount_cents
      };
    } catch (error) {
      winstonLogger.error('❌ ProcessShareHoldsJob: Error approving reward', {
        transactionId: transaction._id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reject a share reward due to fraud detection
   */
  static async rejectReward(transaction, fraudCheck, session) {
    try {
      winstonLogger.info('🚫 ProcessShareHoldsJob: Rejecting reward - FRAUD DETECTED', {
        transactionId: transaction._id,
        reason: fraudCheck.reason,
        severity: fraudCheck.severity
      });

      // Update transaction to rejected status
      const updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        {
          status: 'rejected',
          rejected_at: new Date(),
          rejection_reason: fraudCheck.reason,
          hold_fraud_check_result: 'rejected',
          hold_fraud_reason: fraudCheck.reason,
          $push: {
            notes: {
              timestamp: new Date(),
              action: 'hold_rejected_fraud',
              detail: `Fraud detected: ${fraudCheck.reason} (Severity: ${fraudCheck.severity})`
            }
          }
        },
        { new: true, session }
      );

      // If the share record exists, mark it as fraudulent
      if (transaction.campaign_id && transaction.supporter_id) {
        await ShareRecord.updateMany(
          {
            campaign_id: transaction.campaign_id,
            supporter_id: transaction.supporter_id
          },
          {
            $set: { fraud_flag: true, fraud_reason: fraudCheck.reason }
          },
          { session }
        );
      }

      // Update campaign fraud stats
      if (transaction.campaign_id) {
        await Campaign.findByIdAndUpdate(
          transaction.campaign_id,
          {
            $inc: { 
              'share_config.total_rejected_rewards': 1,
              'share_config.total_fraud_cases': 1
            }
          },
          { session }
        );
      }

      // Send rejection email to supporter (non-blocking)
      this.sendRejectionEmail(transaction, fraudCheck);

      winstonLogger.warn('🚫 ProcessShareHoldsJob: Reward rejected for fraud', {
        transactionId: transaction._id,
        supporter_email: transaction.supporter_id?.email,
        reason: fraudCheck.reason,
        severity: fraudCheck.severity
      });

      return {
        status: 'rejected',
        transactionId: transaction._id,
        reason: fraudCheck.reason,
        severity: fraudCheck.severity
      };
    } catch (error) {
      winstonLogger.error('❌ ProcessShareHoldsJob: Error rejecting reward', {
        transactionId: transaction._id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send approval email to supporter (non-blocking)
   */
  static async sendApprovalEmail(transaction) {
    try {
      if (!transaction.supporter_id?.email) {
        winstonLogger.warn('❌ ProcessShareHoldsJob: No email for reward approval', {
          transactionId: transaction._id
        });
        return;
      }

      await emailService.sendShareRewardApprovedEmail(
        transaction.supporter_id.email,
        {
          supporterName: transaction.supporter_id.display_name || 'Supporter',
          amount: (transaction.amount_cents / 100).toFixed(2),
          campaignTitle: transaction.campaign_id?.title || 'Campaign',
          holdDays: 30
        }
      );

      winstonLogger.info('📧 ProcessShareHoldsJob: Approval email sent', {
        transactionId: transaction._id,
        to: transaction.supporter_id.email
      });
    } catch (error) {
      winstonLogger.error('❌ ProcessShareHoldsJob: Failed to send approval email', {
        transactionId: transaction._id,
        error: error.message
      });
      // Don't throw - non-blocking operation
    }
  }

  /**
   * Send rejection email to supporter (non-blocking)
   */
  static async sendRejectionEmail(transaction, fraudCheck) {
    try {
      if (!transaction.supporter_id?.email) {
        winstonLogger.warn('❌ ProcessShareHoldsJob: No email for reward rejection', {
          transactionId: transaction._id
        });
        return;
      }

      await emailService.sendShareRewardRejectedEmail(
        transaction.supporter_id.email,
        {
          supporterName: transaction.supporter_id.display_name || 'Supporter',
          amount: (transaction.amount_cents / 100).toFixed(2),
          campaignTitle: transaction.campaign_id?.title || 'Campaign',
          reason: fraudCheck.reason,
          severity: fraudCheck.severity
        }
      );

      winstonLogger.info('📧 ProcessShareHoldsJob: Rejection email sent', {
        transactionId: transaction._id,
        to: transaction.supporter_id.email,
        reason: fraudCheck.reason
      });
    } catch (error) {
      winstonLogger.error('❌ ProcessShareHoldsJob: Failed to send rejection email', {
        transactionId: transaction._id,
        error: error.message
      });
      // Don't throw - non-blocking operation
    }
  }

  /**
   * Manually run job for testing or admin purposes
   */
  static async runManual() {
    winstonLogger.info('🔧 ProcessShareHoldsJob: Manual execution triggered');
    return this.run();
  }

  /**
   * Get statistics about pending holds
   */
  static async getStats() {
    try {
      const stats = await Transaction.aggregate([
        {
          $match: {
            status: 'pending_hold'
          }
        },
        {
          $group: {
            _id: null,
            total_pending: { $sum: 1 },
            total_amount_cents: { $sum: '$amount_cents' },
            expiring_today: {
              $sum: {
                $cond: [
                  {
                    $lte: ['$hold_until_date', new Date()]
                  },
                  1,
                  0
                ]
              }
            },
            expiring_this_week: {
              $sum: {
                $cond: [
                  {
                    $lte: [
                      '$hold_until_date',
                      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      return stats[0] || {
        total_pending: 0,
        total_amount_cents: 0,
        expiring_today: 0,
        expiring_this_week: 0
      };
    } catch (error) {
      winstonLogger.error('❌ ProcessShareHoldsJob: Error getting stats', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = ProcessShareHoldsJob;
