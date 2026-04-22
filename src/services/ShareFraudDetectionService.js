/**
 * ShareFraudDetectionService
 * 
 * Comprehensive fraud detection for share rewards
 * Checks multiple patterns and indicators to identify fraudulent activity
 */

const Transaction = require('../models/Transaction');
const { ShareRecord } = require('../models/Share');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');

class ShareFraudDetectionService {
  /**
   * Comprehensive fraud check for a transaction
   * Returns { isFraud: boolean, reason: string, severity: 'low'|'medium'|'high' }
   */
  static async checkTransactionForFraud(transaction) {
    try {
      winstonLogger.info('🔍 ShareFraudDetectionService: Starting fraud checks', {
        transactionId: transaction._id,
        supporter_id: transaction.supporter_id?._id || transaction.supporter_id
      });

      // Run all fraud checks in parallel
      const checks = await Promise.all([
        this.checkROIAnomaly(transaction),
        this.checkAccountAge(transaction),
        this.checkMultipleConversions(transaction),
        this.checkIPReputation(transaction),
        this.checkBehavioralPatterns(transaction)
      ]);

      // Find the most severe fraud indicator
      const fraudulentChecks = checks.filter(c => c.isFraud);
      
      if (fraudulentChecks.length === 0) {
        winstonLogger.info('✅ ShareFraudDetectionService: No fraud detected', {
          transactionId: transaction._id
        });
        
        return {
          isFraud: false,
          reason: 'All fraud checks passed',
          severity: 'none'
        };
      }

      // Sort by severity
      fraudulentChecks.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });

      const worstCheck = fraudulentChecks[0];

      winstonLogger.warn('🚫 ShareFraudDetectionService: FRAUD DETECTED', {
        transactionId: transaction._id,
        reason: worstCheck.reason,
        severity: worstCheck.severity,
        checksTriggered: fraudulentChecks.length
      });

      return {
        isFraud: true,
        reason: worstCheck.reason,
        severity: worstCheck.severity,
        details: fraudulentChecks // All triggered checks for logging
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error during fraud check', {
        transactionId: transaction._id,
        error: error.message
      });

      // On error, be conservative - flag for manual review
      return {
        isFraud: true,
        reason: 'Fraud check error - manual review required',
        severity: 'high'
      };
    }
  }

  /**
   * CHECK 1: ROI Anomaly
   * Reward shouldn't exceed 50% of related donation amount
   * Example: $100 reward for $1 donation = 10,000% ROI (FRAUD)
   */
  static async checkROIAnomaly(transaction) {
    try {
      // Get share record to find related donations
      const shareRecord = await ShareRecord.findOne({
        _id: transaction._id || {
          campaign_id: transaction.campaign_id,
          supporter_id: transaction.supporter_id,
          created_at: { $gte: new Date(transaction.created_at.getTime() - 60000) } // Within 1 minute
        }
      });

      if (!shareRecord) {
        // Can't verify, don't flag
        return {
          isFraud: false,
          reason: 'No share record found for ROI check'
        };
      }

      // Find related donation (most recent after share)
      const relatedDonation = await Transaction.findOne({
        campaign_id: transaction.campaign_id,
        supporter_id: transaction.supporter_id,
        transaction_type: 'donation',
        created_at: {
          $gte: shareRecord.created_at,
          $lte: new Date(shareRecord.created_at.getTime() + 24 * 60 * 60 * 1000) // Within 24 hours
        }
      }).sort({ created_at: -1 });

      if (!relatedDonation) {
        // Can't find donation link, suspicious but not conclusive
        return {
          isFraud: false,
          reason: 'No linked donation found (but not conclusive)'
        };
      }

      // Calculate ROI
      const roi = transaction.amount_cents / (relatedDonation.amount_cents || 1);

      // If reward > donation amount, it's suspicious
      if (roi > 0.5) {
        return {
          isFraud: true,
          reason: `Excessive reward ROI: Reward $${(transaction.amount_cents / 100).toFixed(2)} vs Donation $${(relatedDonation.amount_cents / 100).toFixed(2)} (${(roi * 100).toFixed(0)}%)`,
          severity: roi > 2 ? 'high' : 'medium',
          roi
        };
      }

      return {
        isFraud: false,
        reason: `ROI within limits (${(roi * 100).toFixed(0)}%)`
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error in ROI check', {
        error: error.message
      });
      return {
        isFraud: false,
        reason: 'ROI check error (skipped)'
      };
    }
  }

  /**
   * CHECK 2: Account Age
   * New accounts (< 24 hours) shouldn't earn large rewards
   */
  static async checkAccountAge(transaction) {
    try {
      const user = await User.findById(transaction.supporter_id);

      if (!user) {
        return {
          isFraud: true,
          reason: 'User account not found',
          severity: 'high'
        };
      }

      const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
      const accountAgeHours = accountAgeMs / (1000 * 60 * 60);
      const accountAgeDays = accountAgeHours / 24;

      // Brand new account (< 1 hour) - very suspicious
      if (accountAgeHours < 1) {
        return {
          isFraud: true,
          reason: `Account created ${Math.floor(accountAgeHours * 60)} minutes ago`,
          severity: 'high',
          accountAgeHours
        };
      }

      // Very new account (< 24 hours) with large reward - suspicious
      if (accountAgeDays < 1 && transaction.amount_cents > 5000) { // > $50
        return {
          isFraud: true,
          reason: `New account (${accountAgeHours.toFixed(1)} hours) earning high reward ($${(transaction.amount_cents / 100).toFixed(2)})`,
          severity: 'medium',
          accountAgeHours
        };
      }

      return {
        isFraud: false,
        reason: `Account age acceptable (${accountAgeDays.toFixed(1)} days)`,
        accountAgeDays
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error in account age check', {
        error: error.message
      });
      return {
        isFraud: false,
        reason: 'Account age check error (skipped)'
      };
    }
  }

  /**
   * CHECK 3: Multiple Conversions
   * Same account earning from same campaign multiple times in short period
   */
  static async checkMultipleConversions(transaction) {
    try {
      // Count share rewards from this supporter on this campaign in past 24 hours
      const recentRewards = await Transaction.countDocuments({
        campaign_id: transaction.campaign_id,
        supporter_id: transaction.supporter_id,
        transaction_type: 'share_reward',
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        _id: { $ne: transaction._id } // Exclude current transaction
      });

      if (recentRewards > 2) {
        return {
          isFraud: true,
          reason: `Multiple rewards in 24 hours: ${recentRewards + 1} total (expected: 1 per person per campaign per day)`,
          severity: recentRewards > 5 ? 'high' : 'medium',
          count: recentRewards + 1
        };
      }

      return {
        isFraud: false,
        reason: `No suspicious multiple conversions (${recentRewards} in past 24h)`,
        count: recentRewards
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error in multiple conversions check', {
        error: error.message
      });
      return {
        isFraud: false,
        reason: 'Multiple conversions check error (skipped)'
      };
    }
  }

  /**
   * CHECK 4: IP Reputation
   * Multiple accounts using same IP earning rewards
   */
  static async checkIPReputation(transaction) {
    try {
      if (!transaction.ip_address) {
        return {
          isFraud: false,
          reason: 'No IP address available for reputation check'
        };
      }

      // Count how many accounts earned rewards from this IP in past 30 days
      const accountsFromIP = await Transaction.aggregate([
        {
          $match: {
            transaction_type: 'share_reward',
            ip_address: transaction.ip_address,
            created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: '$supporter_id',
            count: { $sum: 1 }
          }
        },
        {
          $count: 'unique_accounts'
        }
      ]);

      const uniqueAccounts = accountsFromIP[0]?.unique_accounts || 1;

      // If many accounts from same IP earning rewards - suspicious
      if (uniqueAccounts > 5) {
        return {
          isFraud: true,
          reason: `Multiple accounts from same IP earning rewards: ${uniqueAccounts} accounts (likely bot farm)`,
          severity: 'high',
          uniqueAccounts
        };
      }

      // Moderate concern
      if (uniqueAccounts > 2) {
        return {
          isFraud: true,
          reason: `Several accounts from same IP earning rewards: ${uniqueAccounts} accounts (potential manipulation)`,
          severity: 'medium',
          uniqueAccounts
        };
      }

      return {
        isFraud: false,
        reason: `IP reputation acceptable (${uniqueAccounts} account(s) from this IP)`,
        uniqueAccounts
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error in IP reputation check', {
        error: error.message
      });
      return {
        isFraud: false,
        reason: 'IP reputation check error (skipped)'
      };
    }
  }

  /**
   * CHECK 5: Behavioral Patterns
   * Unusual sharing/earning patterns indicating bot activity
   */
  static async checkBehavioralPatterns(transaction) {
    try {
      const supporter = await User.findById(transaction.supporter_id);
      const campaign = await Campaign.findById(transaction.campaign_id);

      if (!supporter || !campaign) {
        return {
          isFraud: false,
          reason: 'Cannot check behavioral patterns - missing user or campaign'
        };
      }

      // Check if user has made any donations (legitimate users donate too)
      const userDonations = await Transaction.countDocuments({
        supporter_id: transaction.supporter_id,
        transaction_type: 'donation'
      });

      // User who ONLY earns rewards and never donates is suspicious
      if (userDonations === 0) {
        // Check share count to determine severity
        const userShares = await Transaction.countDocuments({
          supporter_id: transaction.supporter_id,
          transaction_type: 'share_reward'
        });

        if (userShares > 5) {
          return {
            isFraud: true,
            reason: `Account only earns from shares, never donates. Earned ${userShares} times (pure affiliate pattern)`,
            severity: 'medium',
            shares: userShares,
            donations: 0
          };
        }
      }

      return {
        isFraud: false,
        reason: 'Behavioral patterns acceptable',
        userDonationCount: userDonations
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error in behavioral patterns check', {
        error: error.message
      });
      return {
        isFraud: false,
        reason: 'Behavioral patterns check error (skipped)'
      };
    }
  }

  /**
   * Bulk check multiple transactions
   * Used for batch processing or analysis
   */
  static async checkBatch(transactions) {
    const results = [];
    
    for (const transaction of transactions) {
      const result = await this.checkTransactionForFraud(transaction);
      results.push({
        transactionId: transaction._id,
        ...result
      });
    }
    
    return results;
  }

  /**
   * Get fraud statistics
   */
  static async getStats() {
    try {
      const stats = await Transaction.aggregate([
        {
          $match: {
            transaction_type: 'share_reward'
          }
        },
        {
          $group: {
            _id: null,
            total_rewards: { $sum: 1 },
            total_approved: {
              $sum: {
                $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
              }
            },
            total_rejected: {
              $sum: {
                $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0]
              }
            },
            fraud_rate: {
              $avg: {
                $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0]
              }
            }
          }
        }
      ]);

      return stats[0] || {
        total_rewards: 0,
        total_approved: 0,
        total_rejected: 0,
        fraud_rate: 0
      };
    } catch (error) {
      winstonLogger.error('❌ ShareFraudDetectionService: Error getting stats', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = ShareFraudDetectionService;
