/**
 * Creator Reliability Service (Phase 5, trust-based Share-to-Earn)
 *
 * Since the platform never escrows sharer rewards, sharers need a way to judge
 * how reliably a creator pays BEFORE they share. This service maintains raw
 * counters on User.creator_reliability (updated when a creator confirms a payout,
 * a sharer confirms receipt, or a creator disputes a claim) and derives a public
 * reliability score/label from them.
 */

const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

// A payout counts as "on time" if settled within this window of the request.
const ON_TIME_WINDOW_HOURS = 7 * 24; // 7 days
// Below this many confirmed payouts a creator is "Unrated" (not enough signal).
const MIN_PAYOUTS_FOR_RATING = 3;

class CreatorReliabilityService {
  /**
   * Record that a creator settled a payout slice (marked it paid).
   * @param {ObjectId|string} creatorId
   * @param {Date} requestedAt - when the sharer requested the payout
   * @param {Date} paidAt - when the creator marked it paid
   * @param {number} amountCents - slice amount settled
   */
  static async recordPaid(creatorId, requestedAt, paidAt, amountCents = 0) {
    try {
      const paid = paidAt ? new Date(paidAt) : new Date();
      const requested = requestedAt ? new Date(requestedAt) : paid;
      const hours = Math.max(0, (paid.getTime() - requested.getTime()) / (1000 * 60 * 60));
      const onTime = hours <= ON_TIME_WINDOW_HOURS ? 1 : 0;

      await User.updateOne(
        { _id: creatorId },
        {
          $inc: {
            'creator_reliability.payouts_confirmed': 1,
            'creator_reliability.total_pay_time_hours': hours,
            'creator_reliability.on_time_count': onTime,
            'creator_reliability.total_paid_cents': amountCents || 0,
          },
          $set: { 'creator_reliability.last_payout_at': paid },
        }
      );
    } catch (error) {
      // Reliability is a non-critical signal — never break a payment for it.
      winstonLogger.error('CreatorReliabilityService.recordPaid error', {
        error: error.message,
        creatorId,
      });
    }
  }

  /** Record that a sharer confirmed receiving a payout. */
  static async recordReceived(creatorId) {
    try {
      await User.updateOne(
        { _id: creatorId },
        { $inc: { 'creator_reliability.payouts_received': 1 } }
      );
    } catch (error) {
      winstonLogger.error('CreatorReliabilityService.recordReceived error', {
        error: error.message,
        creatorId,
      });
    }
  }

  /** Record that a creator disputed a payout claim. */
  static async recordDisputed(creatorId) {
    try {
      await User.updateOne(
        { _id: creatorId },
        { $inc: { 'creator_reliability.payouts_disputed': 1 } }
      );
    } catch (error) {
      winstonLogger.error('CreatorReliabilityService.recordDisputed error', {
        error: error.message,
        creatorId,
      });
    }
  }

  /**
   * Derive the public-facing reliability score from raw counters.
   * @param {Object} reliability - User.creator_reliability sub-doc
   * @returns {{
   *   rating: 'unrated'|'building'|'fair'|'good'|'excellent',
   *   label: string,
   *   score: number|null,            // 0–100, null when unrated
   *   payouts_confirmed: number,
   *   payouts_received: number,
   *   payouts_disputed: number,
   *   on_time_rate: number|null,     // 0–1
   *   avg_time_to_pay_hours: number|null,
   *   total_paid_cents: number,
   * }}
   */
  static getScore(reliability = {}) {
    const confirmed = reliability.payouts_confirmed || 0;
    const received = reliability.payouts_received || 0;
    const disputed = reliability.payouts_disputed || 0;
    const onTime = reliability.on_time_count || 0;
    const totalHours = reliability.total_pay_time_hours || 0;
    const totalPaid = reliability.total_paid_cents || 0;

    const onTimeRate = confirmed > 0 ? onTime / confirmed : null;
    const avgHours = confirmed > 0 ? totalHours / confirmed : null;

    if (confirmed < MIN_PAYOUTS_FOR_RATING) {
      return {
        rating: 'unrated',
        label: 'New creator',
        score: null,
        payouts_confirmed: confirmed,
        payouts_received: received,
        payouts_disputed: disputed,
        on_time_rate: onTimeRate,
        avg_time_to_pay_hours: avgHours != null ? Math.round(avgHours) : null,
        total_paid_cents: totalPaid,
      };
    }

    // Score = on-time rate, penalised by dispute rate. 0–100.
    const totalClaims = confirmed + disputed;
    const disputeRate = totalClaims > 0 ? disputed / totalClaims : 0;
    const raw = (onTimeRate != null ? onTimeRate : 0) * 100 - disputeRate * 40;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    let rating = 'fair';
    let label = 'Pays reliably';
    if (score >= 90) {
      rating = 'excellent';
      label = 'Pays sharers fast';
    } else if (score >= 75) {
      rating = 'good';
      label = 'Pays reliably';
    } else if (score >= 50) {
      rating = 'fair';
      label = 'Mostly pays on time';
    } else {
      rating = 'building';
      label = 'Mixed payout history';
    }

    return {
      rating,
      label,
      score,
      payouts_confirmed: confirmed,
      payouts_received: received,
      payouts_disputed: disputed,
      on_time_rate: onTimeRate,
      avg_time_to_pay_hours: avgHours != null ? Math.round(avgHours) : null,
      total_paid_cents: totalPaid,
    };
  }

  /** Convenience: load a creator and return their derived score. */
  static async getScoreForCreator(creatorId) {
    const user = await User.findById(creatorId).select('creator_reliability').lean();
    return CreatorReliabilityService.getScore(user?.creator_reliability || {});
  }
}

module.exports = CreatorReliabilityService;
