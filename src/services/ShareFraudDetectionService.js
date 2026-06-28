/**
 * ShareFraudDetectionService
 * 
 * Comprehensive fraud detection for share rewards
 * Checks multiple patterns and indicators to identify fraudulent activity
 */

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { ShareRecord } = require('../models/Share');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');

// SE-5 sharer-fraud dashboard thresholds (admin tooling extends the per-tx
// 24h / 10× checks into aggregate signals).
const SHARER_FRAUD = {
  VELOCITY_DAYS: 7,
  VELOCITY_FLAG_COUNT: 10, // ≥ this many rewards in the window → high velocity
  CLUSTER_MIN_ACCOUNTS: 3, // ≥ this many distinct accounts on one IP/device → cluster
  REJECTION_FLAG_COUNT: 2, // ≥ this many rejected rewards → rejection anomaly
  LIMIT: 20,
};

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

  /**
   * SE-5: Sharer fraud dashboard (admin). Aggregates the share-reward fraud
   * signals — summary, velocity, IP/device clusters, and rejection anomalies —
   * into a single payload for admin tooling.
   *
   * @param {Object} [opts] - { velocityDays, limit }
   * @returns {Promise<Object>}
   */
  static async getSharerFraudDashboard(opts = {}) {
    const velocityDays = opts.velocityDays || SHARER_FRAUD.VELOCITY_DAYS;
    const limit = Math.min(opts.limit || SHARER_FRAUD.LIMIT, 100);
    const windowStart = new Date(Date.now() - velocityDays * 24 * 60 * 60 * 1000);

    const REWARD = { transaction_type: 'share_reward' };

    const [summaryAgg, velocity, ipClusters, deviceClusters, rejectionAnomalies] = await Promise.all([
      // ── Summary ──
      Transaction.aggregate([
        { $match: REWARD },
        {
          $group: {
            _id: null,
            total_rewards: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            pending_hold: { $sum: { $cond: [{ $eq: ['$status', 'pending_hold'] }, 1, 0] } },
            total_amount_cents: { $sum: '$amount_cents' },
            rejected_amount_cents: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, '$amount_cents', 0] } },
          },
        },
      ]),

      // ── Velocity: top earners in the window ──
      Transaction.aggregate([
        { $match: { ...REWARD, created_at: { $gte: windowStart } } },
        {
          $group: {
            _id: '$supporter_id',
            reward_count: { $sum: 1 },
            total_cents: { $sum: '$amount_cents' },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            last_at: { $max: '$created_at' },
            ips: { $addToSet: '$ip_address' },
          },
        },
        { $sort: { reward_count: -1 } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        {
          $project: {
            supporter_id: '$_id',
            reward_count: 1,
            total_dollars: { $round: [{ $divide: ['$total_cents', 100] }, 2] },
            rejected: 1,
            distinct_ips: { $size: { $filter: { input: '$ips', cond: { $ne: ['$$this', null] } } } },
            last_at: 1,
            name: { $ifNull: [{ $arrayElemAt: ['$u.display_name', 0] }, { $arrayElemAt: ['$u.email', 0] }] },
            email: { $arrayElemAt: ['$u.email', 0] },
            flagged: { $gte: ['$reward_count', SHARER_FRAUD.VELOCITY_FLAG_COUNT] },
          },
        },
      ]),

      // ── IP clusters: one IP, many distinct sharer accounts ──
      Transaction.aggregate([
        { $match: { ...REWARD, ip_address: { $ne: null } } },
        { $group: { _id: '$ip_address', accounts: { $addToSet: '$supporter_id' }, reward_count: { $sum: 1 } } },
        { $project: { ip: '$_id', unique_accounts: { $size: '$accounts' }, reward_count: 1, _id: 0 } },
        { $match: { unique_accounts: { $gte: SHARER_FRAUD.CLUSTER_MIN_ACCOUNTS } } },
        { $sort: { unique_accounts: -1 } },
        { $limit: limit },
      ]),

      // ── Device clusters: one device fingerprint, many accounts (from ShareRecord) ──
      ShareRecord.aggregate([
        { $match: { device_info: { $ne: null } } },
        { $group: { _id: '$device_info', accounts: { $addToSet: '$supporter_id' }, share_count: { $sum: 1 } } },
        { $project: { device: '$_id', unique_accounts: { $size: '$accounts' }, share_count: 1, _id: 0 } },
        { $match: { unique_accounts: { $gte: SHARER_FRAUD.CLUSTER_MIN_ACCOUNTS } } },
        { $sort: { unique_accounts: -1 } },
        { $limit: limit },
      ]),

      // ── Rejection anomalies: sharers with repeated rejected rewards ──
      Transaction.aggregate([
        { $match: REWARD },
        {
          $group: {
            _id: '$supporter_id',
            total: { $sum: 1 },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          },
        },
        { $match: { rejected: { $gte: SHARER_FRAUD.REJECTION_FLAG_COUNT } } },
        { $sort: { rejected: -1 } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        {
          $project: {
            supporter_id: '$_id',
            total: 1,
            rejected: 1,
            rejection_rate: { $round: [{ $multiply: [{ $divide: ['$rejected', '$total'] }, 100] }, 1] },
            name: { $ifNull: [{ $arrayElemAt: ['$u.display_name', 0] }, { $arrayElemAt: ['$u.email', 0] }] },
            email: { $arrayElemAt: ['$u.email', 0] },
          },
        },
      ]),
    ]);

    const s = summaryAgg[0] || {};
    const total = s.total_rewards || 0;
    return {
      summary: {
        total_rewards: total,
        approved: s.approved || 0,
        rejected: s.rejected || 0,
        pending_hold: s.pending_hold || 0,
        total_amount_dollars: ((s.total_amount_cents || 0) / 100).toFixed(2),
        rejected_amount_dollars: ((s.rejected_amount_cents || 0) / 100).toFixed(2),
        fraud_rate_percent: total > 0 ? (((s.rejected || 0) / total) * 100).toFixed(1) : '0.0',
      },
      thresholds: {
        velocity_days: velocityDays,
        velocity_flag_count: SHARER_FRAUD.VELOCITY_FLAG_COUNT,
        cluster_min_accounts: SHARER_FRAUD.CLUSTER_MIN_ACCOUNTS,
        rejection_flag_count: SHARER_FRAUD.REJECTION_FLAG_COUNT,
      },
      velocity,
      ip_clusters: ipClusters,
      device_clusters: deviceClusters,
      rejection_anomalies: rejectionAnomalies,
    };
  }

  /**
   * SE-5: Per-sharer drill-down for the fraud dashboard.
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  static async getSharerProfile(userId) {
    const supporterId = new mongoose.Types.ObjectId(userId);

    const [user, rewardAgg, shareAgg, donationCount, recentRewards] = await Promise.all([
      User.findById(supporterId).select('email display_name created_at').lean(),
      Transaction.aggregate([
        { $match: { supporter_id: supporterId, transaction_type: 'share_reward' } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            pending_hold: { $sum: { $cond: [{ $eq: ['$status', 'pending_hold'] }, 1, 0] } },
            total_cents: { $sum: '$amount_cents' },
            ips: { $addToSet: '$ip_address' },
          },
        },
      ]),
      ShareRecord.aggregate([
        { $match: { supporter_id: supporterId } },
        { $group: { _id: null, shares: { $sum: 1 }, devices: { $addToSet: '$device_info' }, ips: { $addToSet: '$ip_address' } } },
      ]),
      Transaction.countDocuments({ supporter_id: supporterId, transaction_type: 'donation' }),
      Transaction.find({ supporter_id: supporterId, transaction_type: 'share_reward' })
        .sort({ created_at: -1 })
        .limit(20)
        .select('transaction_id amount_cents status ip_address created_at')
        .lean(),
    ]);

    if (!user) {
      const e = new Error('USER_NOT_FOUND: Sharer not found');
      e.statusCode = 404;
      throw e;
    }

    const r = rewardAgg[0] || {};
    const sh = shareAgg[0] || {};
    const accountAgeDays = user.created_at
      ? ((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
      : null;

    return {
      sharer: {
        id: user._id,
        name: user.display_name || user.email,
        email: user.email,
        account_age_days: accountAgeDays,
      },
      rewards: {
        total: r.total || 0,
        approved: r.approved || 0,
        rejected: r.rejected || 0,
        pending_hold: r.pending_hold || 0,
        total_dollars: ((r.total_cents || 0) / 100).toFixed(2),
        distinct_ips: (r.ips || []).filter(Boolean).length,
      },
      shares: {
        total: sh.shares || 0,
        distinct_devices: (sh.devices || []).filter(Boolean).length,
        distinct_ips: (sh.ips || []).filter(Boolean).length,
      },
      // Pure-affiliate signal: earns from shares but never donates.
      donation_count: donationCount,
      pure_affiliate: donationCount === 0 && (r.total || 0) > 0,
      recent_rewards: recentRewards.map((t) => ({
        transaction_id: t.transaction_id,
        amount_dollars: (t.amount_cents / 100).toFixed(2),
        status: t.status,
        ip_address: t.ip_address || null,
        created_at: t.created_at,
      })),
    };
  }
}

module.exports = ShareFraudDetectionService;
