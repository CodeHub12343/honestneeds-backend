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
const feeEngine = require('../utils/feeEngine');
const winstonLogger = require('../utils/winstonLogger');

class TransactionService extends EventEmitter {
  constructor() {
    super();
    // F-9 / R-4: single source of truth for the donation fee rate.
    this.platformFeePercent = feeEngine.DONATION_FEE_RATE;
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
      // CF-5: enforce end_date at the donation chokepoint. The daily expiry
      // worker flips status to 'completed', but between expiry and the next run
      // a campaign would otherwise still accept donations — block them here.
      if (campaign.end_date && new Date(campaign.end_date).getTime() <= Date.now()) {
        throw new Error('CAMPAIGN_EXPIRED: Campaign has ended and can no longer accept donations');
      }
      // CF-6: never accept money for a campaign that trust & safety rejected.
      if (campaign.moderation && campaign.moderation.review_status === 'rejected') {
        throw new Error('CAMPAIGN_NOT_AVAILABLE: Campaign is not available for donations');
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

      // Convert dollars to cents and calculate fees via the canonical engine.
      const amountCents = Math.round(amountDollars * 100);
      const { feeCents: platformFeeCents, netCents: netAmountCents } =
        feeEngine.calculateDonationFee(amountCents);

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
        // F-1: Manual donations are NOT auto-verified. The platform never sees
        // the money (it moves donor → creator off-platform), so a donation only
        // becomes `verified` once the creator/admin confirms receipt. Until then
        // it must not count toward goal progress or public meters.
        status: 'pending',
        proof_url: options.proofUrl,
        // Persist the referral code so share-to-Earn conversion can be processed
        // at verification time (never for an unconfirmed donation).
        referral_code: options.referralCode || null,
        ip_address: options.ipAddress,
        user_agent: options.userAgent,
        idempotency_key: idempotencyKey,
      };

      // ✅ Create transaction within MongoDB session
      const transaction = new Transaction(transactionData);
      await transaction.save({ session });

      // ===== PENDING-PIPELINE ACCOUNTING (NOT counted publicly) =====
      // Only track the "awaiting confirmation" pipeline. Verified totals,
      // unique supporters, donations_by_method, and goal current_amount are all
      // applied later in verifyTransaction() once receipt is confirmed.
      const pendingUpdate = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $inc: {
            'metrics.pending_donations': 1,
            'metrics.pending_donation_amount': amountCents,
          },
        },
        { new: true, session }
      );

      if (!pendingUpdate) {
        // Rollback happens automatically
        throw new Error('CAMPAIGN_UPDATE_FAILED: Failed to update campaign pending metrics');
      }

      winstonLogger.info('📊 Campaign pending-donation recorded (awaiting confirmation)', {
        campaignId,
        transactionId: transaction.transaction_id,
        amount_dollars: amountCents / 100,
        pending_donations: pendingUpdate.metrics.pending_donations,
        pending_donation_amount: (pendingUpdate.metrics.pending_donation_amount || 0) / 100,
      });

      // ===== COMMIT TRANSACTION =====
      await session.commitTransaction();
      session.endSession();

      // ===== EVENTS (after successful commit) =====
      // Notify the creator that a donation is awaiting their confirmation.
      // No share reward, milestone, or public broadcast is emitted here — those
      // only happen on verification, so unverified/fake intents cannot trigger
      // rewards, celebrations, or social-proof activity.
      try {
        this.emit('donation:pending', {
          transaction_id: transaction.transaction_id,
          campaign_id: campaignId,
          creator_id: campaign.creator_id,
          supporter_id: supporterId,
          amount_dollars: amountDollars,
          platform_fee_dollars: platformFeeCents / 100,
          net_amount_dollars: netAmountCents / 100,
          campaign_name: campaign.title,
          supporter_name: supporter.full_name || supporter.email,
          has_referral: !!transaction.referral_code,
        });
      } catch (eventError) {
        winstonLogger.warn('⚠️ TransactionService: Event emission failed (non-blocking)', {
          campaignId,
          error: eventError.message,
        });
      }

      // ===== RETURN SUCCESS =====
      const returnData = {
        success: true,
        data: {
          transaction_id: transaction.transaction_id,
          _id: transaction._id,
          status: transaction.status, // 'pending'
          amount_cents: transaction.amount_cents,
          platform_fee_cents: transaction.platform_fee_cents,
          net_amount_cents: transaction.net_amount_cents,
          requires_confirmation: true,
        },
        message:
          'Donation recorded. Send your payment to the creator, then it will appear once the creator confirms they received it.',
      };

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
   * Map a raw payment method to one of the 4 schema-defined
   * `metrics.donations_by_method` buckets so $inc never writes an
   * off-schema key (which strict-mode updates would silently drop).
   * @param {String} paymentMethod
   * @returns {String} one of paypal|stripe|bank_transfer|other
   * @private
   */
  _methodBucket(paymentMethod) {
    if (['paypal', 'stripe', 'bank_transfer'].includes(paymentMethod)) {
      return paymentMethod;
    }
    return 'other';
  }

  /**
   * Apply or reverse the *verified* campaign accounting for a single donation.
   * This is the one place that mutates verified totals, unique supporters,
   * donations_by_method, the fundraising goal's current_amount, and the
   * denormalized top-level aggregates — keeping them a single, reversible
   * source of truth (fixes F-2 / F-7).
   *
   * @param {ObjectId} campaignId
   * @param {Object} transaction - The donation transaction
   * @param {Number} sign - +1 to apply (on verify), -1 to reverse (on reject)
   * @param {Object} session - Mongo session for atomicity
   * @private
   */
  async _adjustVerifiedDonationAccounting(campaignId, transaction, sign, session) {
    const amountCents = transaction.amount_cents;
    const supporterId = transaction.supporter_id;
    const bucket = this._methodBucket(transaction.payment_method);

    // 1) Counters + per-method breakdown
    const inc = {
      'metrics.total_donations': sign,
      'metrics.total_donation_amount': sign * amountCents,
    };
    inc[`metrics.donations_by_method.${bucket}`] = sign;

    const update = { $inc: inc };
    if (sign > 0) {
      update.$addToSet = { 'metrics.unique_supporters': supporterId };
    }
    await Campaign.findByIdAndUpdate(campaignId, update, { session });

    // 2) Unique-supporter removal on reversal — but only if this donor has no
    //    OTHER verified donation on the campaign, so we never undercount.
    if (sign < 0) {
      const otherVerified = await Transaction.countDocuments({
        campaign_id: campaignId,
        supporter_id: supporterId,
        transaction_type: 'donation',
        status: 'verified',
        _id: { $ne: transaction._id },
      }).session(session);

      if (otherVerified === 0) {
        await Campaign.findByIdAndUpdate(
          campaignId,
          { $pull: { 'metrics.unique_supporters': supporterId } },
          { session }
        );
      }
    }

    // 3) Fundraising goal current_amount (clamped at >= 0 on reversal)
    await Campaign.findByIdAndUpdate(
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
                        $max: [
                          0,
                          {
                            $add: [
                              { $ifNull: ['$$goal.current_amount', 0] },
                              sign * amountCents,
                            ],
                          },
                        ],
                      },
                    },
                    '$$goal',
                  ],
                },
              },
            },
            updated_at: new Date(),
          },
        },
      ],
      { session }
    );

    // 4) Recompute denormalized top-level aggregates from the fresh metrics
    const fresh = await Campaign.findById(campaignId).session(session);
    const totalDonations = fresh.metrics.total_donations || 0;
    const totalDonationAmount = fresh.metrics.total_donation_amount || 0;
    const uniqueDonors = fresh.metrics.unique_supporters?.length || 0;
    const avgDonation = totalDonations > 0 ? Math.round(totalDonationAmount / totalDonations) : 0;

    // NOTE: the canonical count/amount live in metrics.total_donations (count)
    // and metrics.total_donation_amount (amount). We intentionally do NOT mirror
    // them into a root `total_donations` field — that name is ambiguous and the
    // field isn't in the schema (strict mode would drop the write anyway).
    // `total_donors` and `average_donation` ARE real schema fields, so keep them.
    await Campaign.findByIdAndUpdate(
      campaignId,
      {
        total_donors: uniqueDonors,
        average_donation: avgDonation,
      },
      { session }
    );

    return fresh;
  }

  /**
   * Resolve whether an actor may confirm/reject a campaign's donations.
   * Allowed for the campaign creator ("I received this") or a platform admin.
   * @param {ObjectId} actorId
   * @param {Object} campaign
   * @returns {Promise<{role: 'creator'|'admin'}>}
   * @private
   */
  async _resolveDonationActor(actorId, campaign) {
    if (!actorId) {
      throw new Error('UNAUTHORIZED: Authentication required');
    }
    const actor = await User.findById(actorId);
    if (!actor) {
      throw new Error('UNAUTHORIZED: Actor not found');
    }
    const isAdmin = !!(actor.is_admin || (Array.isArray(actor.roles) && actor.roles.includes('admin')));
    const isCreator = campaign.creator_id.toString() === actorId.toString();
    if (!isAdmin && !isCreator) {
      throw new Error('UNAUTHORIZED: Only the campaign creator or an admin can confirm or reject donations');
    }
    // Prefer the 'admin' label when the actor holds admin rights.
    return { role: isAdmin ? 'admin' : 'creator' };
  }

  /**
   * Confirm receipt of a manual donation (creator or admin).
   * Moves the donation from `pending` → `verified`, applies verified accounting
   * atomically, then (post-commit, non-fatal) processes any share-to-Earn
   * conversion, milestone celebrations, real-time broadcast and fee tracking.
   *
   * @param {ObjectId} transactionId - Transaction _id
   * @param {ObjectId} actorId - Creator or admin confirming receipt
   * @returns {Promise<Object>} Verified transaction
   */
  async verifyTransaction(transactionId, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    let transaction;
    let campaign;
    let actorRole = 'admin';
    try {
      transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) {
        throw new Error('TRANSACTION_NOT_FOUND: Transaction does not exist');
      }
      if (transaction.transaction_type !== 'donation') {
        throw new Error('INVALID_TYPE: Only donations can be confirmed here');
      }
      if (transaction.status !== 'pending') {
        throw new Error(`INVALID_STATE: Cannot confirm ${transaction.status} transaction`);
      }

      campaign = await Campaign.findById(transaction.campaign_id).session(session);
      if (!campaign) {
        throw new Error('CAMPAIGN_DELETED: Associated campaign no longer exists');
      }

      // Authorization: creator or admin
      const actor = await this._resolveDonationActor(actorId, campaign);
      actorRole = actor.role;

      const supporter = await User.findById(transaction.supporter_id).session(session);
      if (!supporter) {
        throw new Error('SUPPORTER_DELETED: Associated supporter no longer exists');
      }

      // Spot-check: flag (don't block) an unusually large donation
      const avgDonation = campaign.metrics?.total_donations > 0
        ? campaign.metrics.total_donation_amount / campaign.metrics.total_donations / 100
        : 0;
      if (avgDonation > 0 && transaction.amount_dollars > avgDonation * 5) {
        transaction.addNote('warning', 'Donation 5x larger than average', actorId);
      }

      // Move pending → verified accounting atomically:
      // 1) drop from pending pipeline, 2) apply verified accounting (+1)
      await Campaign.findByIdAndUpdate(
        transaction.campaign_id,
        {
          $inc: {
            'metrics.pending_donations': -1,
            'metrics.pending_donation_amount': -transaction.amount_cents,
          },
        },
        { session }
      );
      await this._adjustVerifiedDonationAccounting(transaction.campaign_id, transaction, +1, session);

      transaction.verify(actorId, actorRole);
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();
    } catch (error) {
      try { await session.abortTransaction(); } catch (_) { /* already ended */ }
      try { session.endSession(); } catch (_) { /* noop */ }
      console.error('verifyTransaction error:', error.message);
      throw new Error(`VERIFY_FAILED: ${error.message}`);
    }

    // ===== POST-COMMIT side effects (non-fatal; never roll back a confirmation) =====

    // Share-to-Earn conversion — only now, for confirmed real money.
    if (transaction.referral_code) {
      try {
        const result = await ShareRewardService.processShareConversion({
          campaignId: transaction.campaign_id,
          donationTransactionId: transaction._id,
          referralCode: transaction.referral_code,
          amountCents: transaction.amount_cents,
          supporterId: transaction.supporter_id,
          paymentMethod: transaction.payment_method,
        });
        winstonLogger.info('🔗 verifyTransaction: Share conversion processed', {
          transactionId: transaction.transaction_id,
          reward_created: result?.reward_created || false,
          reason: result?.reason || result?.error,
        });
      } catch (err) {
        winstonLogger.error('⚠️ verifyTransaction: Share conversion failed (non-fatal)', {
          transactionId: transaction.transaction_id,
          error: err.message,
        });
      }
    }

    // Boost conversion tracking — a confirmed donation is a conversion. Powers
    // the boost dashboard's "Conversions" stat and real (revenue-based) ROI.
    // Best-effort: tracking must never roll back a confirmed donation.
    try {
      const CampaignBoost = require('../models/CampaignBoost');
      await CampaignBoost.recordBoostEvent(transaction.campaign_id, 'conversion', {
        revenueCents: transaction.amount_cents,
      });
    } catch (err) {
      winstonLogger.warn('⚠️ verifyTransaction: Boost conversion tracking failed (non-fatal)', {
        transactionId: transaction.transaction_id,
        error: err.message,
      });
    }

    // CA-19 milestone celebrations — only fire on confirmed totals.
    try {
      const CampaignMilestoneService = require('./CampaignMilestoneService');
      CampaignMilestoneService.checkAndCreateMilestones(transaction.campaign_id).catch((err) => {
        winstonLogger.warn('⚠️ verifyTransaction: Milestone check failed (non-blocking)', {
          campaignId: transaction.campaign_id,
          error: err.message,
        });
      });
    } catch (err) {
      winstonLogger.warn('⚠️ verifyTransaction: Milestone check threw (non-blocking)', {
        error: err.message,
      });
    }

    // Real-time social-proof broadcast — only for confirmed donations.
    try {
      const RealTimeService = require('./RealTimeService');
      RealTimeService.broadcastDonation(transaction.campaign_id, {
        transaction_id: transaction.transaction_id,
        amount_dollars: transaction.amount_dollars,
        amount_cents: transaction.amount_cents,
        donor_name: null,
        message: null,
      });
    } catch (err) {
      winstonLogger.warn('⚠️ verifyTransaction: Real-time broadcast failed (non-blocking)', {
        error: err.message,
      });
    }

    // CF-3: the platform fee is now genuinely OWED by the creator (the donation
    // is confirmed). Record it on the fee-settlement ledger as 'verified' (owed),
    // attributed to the creator. Idempotent, so re-confirmation can't double-bill.
    try {
      const FeeTrackingService = require('./FeeTrackingService');
      if (FeeTrackingService?.recordFee) {
        await FeeTrackingService.recordFee({
          campaign_id: transaction.campaign_id,
          creator_id: transaction.creator_id,
          transaction_id: transaction._id,
          gross_cents: transaction.amount_cents,
          fee_cents: transaction.platform_fee_cents,
          status: 'verified',
        });
      }
    } catch (err) {
      winstonLogger.warn('⚠️ verifyTransaction: Fee tracking failed (non-blocking)', {
        error: err.message,
      });
    }

    // Verification event for notifications/analytics.
    try {
      this.emit('transaction:verified', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        supporter_id: transaction.supporter_id,
        verified_by: actorId,
        verified_by_role: actorRole,
        amount_dollars: transaction.amount_dollars,
      });

      // Gamification (XP/streaks/missions/challenges) is bridged off
      // 'donation:recorded'. It must only fire for CONFIRMED donations — never
      // for unverified intents — so we emit it here at verification time, not
      // when the donation was first recorded.
      this.emit('donation:recorded', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        creator_id: transaction.creator_id,
        supporter_id: transaction.supporter_id,
        amount_dollars: transaction.amount_dollars,
        amount_cents: transaction.amount_cents,
      });
    } catch (err) {
      winstonLogger.warn('⚠️ verifyTransaction: Event emission failed (non-blocking)', {
        error: err.message,
      });
    }

    // CE-6: thank-you / receipt email — fires only on CONFIRMED donations, with
    // the correct (campaign-driven) tax-deductibility note. Non-blocking.
    try {
      const [donor, campaign] = await Promise.all([
        User.findById(transaction.supporter_id).select('email display_name first_name last_name').lean(),
        Campaign.findById(transaction.campaign_id).select('title tax_deductible tax_id').lean(),
      ]);
      if (donor?.email) {
        const emailService = require('../utils/emailService');
        const donorName =
          donor.display_name ||
          [donor.first_name, donor.last_name].filter(Boolean).join(' ') ||
          'Supporter';
        await emailService.sendDonationConfirmationEmail(donor.email, {
          campaignTitle: campaign?.title || 'a HonestNeed campaign',
          amount: transaction.amount_cents,
          donorName,
          transactionId: transaction.transaction_id,
          taxDeductible: campaign?.tax_deductible === true,
          taxId: campaign?.tax_deductible === true ? (campaign?.tax_id || null) : null,
        });
      }
    } catch (err) {
      winstonLogger.warn('⚠️ verifyTransaction: Thank-you email failed (non-blocking)', {
        transactionId: transaction.transaction_id,
        error: err.message,
      });
    }

    return transaction;
  }

  /**
   * Reject a manual donation (creator or admin) — reversible.
   * If the donation was still `pending`, only the pending pipeline is reduced.
   * If it had already been `verified`, the full verified accounting is reversed
   * (fixes F-2: rejected/charged-back donations no longer leave inflated totals).
   *
   * @param {ObjectId} transactionId - Transaction _id
   * @param {ObjectId} actorId - Creator or admin rejecting
   * @param {String} reason - Required rejection reason
   * @returns {Promise<Object>} Rejected transaction
   */
  async rejectTransaction(transactionId, actorId, reason) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('REJECT_FAILED: REASON_REQUIRED: Rejection reason is required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    let transaction;
    let wasVerified = false;
    try {
      transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) {
        throw new Error('TRANSACTION_NOT_FOUND: Transaction does not exist');
      }
      if (transaction.transaction_type !== 'donation') {
        throw new Error('INVALID_TYPE: Only donations can be rejected here');
      }
      if (transaction.status !== 'pending' && transaction.status !== 'verified') {
        throw new Error(`INVALID_STATE: Cannot reject ${transaction.status} transaction`);
      }
      wasVerified = transaction.status === 'verified';

      const campaign = await Campaign.findById(transaction.campaign_id).session(session);
      if (!campaign) {
        throw new Error('CAMPAIGN_DELETED: Associated campaign no longer exists');
      }

      // Authorization: creator or admin
      await this._resolveDonationActor(actorId, campaign);

      if (transaction.status === 'pending') {
        // Only in the pending pipeline — remove it from there.
        await Campaign.findByIdAndUpdate(
          transaction.campaign_id,
          {
            $inc: {
              'metrics.pending_donations': -1,
              'metrics.pending_donation_amount': -transaction.amount_cents,
            },
          },
          { session }
        );
      } else {
        // Was verified and publicly counted — reverse the full accounting.
        await this._adjustVerifiedDonationAccounting(transaction.campaign_id, transaction, -1, session);
      }

      transaction.reject(actorId, reason);
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();
    } catch (error) {
      try { await session.abortTransaction(); } catch (_) { /* already ended */ }
      try { session.endSession(); } catch (_) { /* noop */ }
      console.error('rejectTransaction error:', error.message);
      // Preserve REASON_REQUIRED prefix passthrough; otherwise wrap.
      if (error.message.startsWith('REJECT_FAILED:')) throw error;
      throw new Error(`REJECT_FAILED: ${error.message}`);
    }

    // ===== POST-COMMIT side effects (non-fatal) =====

    // CF-3: if the donation had been confirmed, a platform fee was recorded as
    // owed — reverse it so the creator is no longer billed for a rejected /
    // charged-back donation. (Pending donations never recorded a fee.)
    if (wasVerified) {
      try {
        const FeeTrackingService = require('./FeeTrackingService');
        await FeeTrackingService.reverseFee(transaction._id, `Donation rejected: ${reason}`, actorId);
      } catch (err) {
        winstonLogger.warn('⚠️ rejectTransaction: Fee reversal failed (non-blocking)', {
          transactionId: transaction.transaction_id,
          error: err.message,
        });
      }
    }

    try {
      this.emit('transaction:rejected', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        supporter_id: transaction.supporter_id,
        reason,
        amount_dollars: transaction.amount_dollars,
      });
    } catch (err) {
      winstonLogger.warn('⚠️ rejectTransaction: Event emission failed (non-blocking)', {
        error: err.message,
      });
    }

    try {
      if (this.notificationService?.notify) {
        await this.notificationService.notify(transaction.supporter_id, {
          type: 'donation_rejected',
          title: 'Donation Not Confirmed',
          message: `Your donation of $${transaction.amount_dollars} was not confirmed by the campaign. Reason: ${reason}`,
          transaction_id: transaction.transaction_id,
        });
      }
    } catch (err) {
      winstonLogger.warn('⚠️ rejectTransaction: Notification failed (non-blocking)', {
        error: err.message,
      });
    }

    return transaction;
  }

  /**
   * CE-7: Donor requests a refund on their own donation.
   * @param {ObjectId} transactionId
   * @param {ObjectId} donorId - must be the donation's supporter
   * @param {string} reason
   * @returns {Promise<Object>} updated transaction
   */
  async requestRefund(transactionId, donorId, reason) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED: A refund reason is required');
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) throw new Error('TRANSACTION_NOT_FOUND: Transaction does not exist');
    if (transaction.transaction_type !== 'donation') {
      throw new Error('INVALID_TYPE: Only donations can be refunded');
    }
    if (transaction.supporter_id.toString() !== donorId.toString()) {
      throw new Error('UNAUTHORIZED: You can only request refunds for your own donations');
    }
    if (!['pending', 'verified'].includes(transaction.status)) {
      throw new Error(`INVALID_STATE: Cannot request a refund for a ${transaction.status} donation`);
    }
    const rr = transaction.refund_request;
    if (rr && rr.status === 'requested') {
      throw new Error('INVALID_STATE: A refund request is already pending for this donation');
    }
    if (rr && rr.status === 'approved') {
      throw new Error('INVALID_STATE: This donation has already been refunded');
    }

    transaction.refund_request = {
      status: 'requested',
      reason: reason.trim(),
      requested_at: new Date(),
      decided_by: null,
      decided_at: null,
      decision_note: null,
    };
    transaction.addNote('refund_requested', reason.trim(), donorId);
    await transaction.save();

    // Notify the creator that a refund request is awaiting their decision.
    try {
      this.emit('donation:refund_requested', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        creator_id: transaction.creator_id,
        supporter_id: transaction.supporter_id,
        amount_dollars: transaction.amount_dollars,
        reason: reason.trim(),
      });
    } catch (_) { /* non-blocking */ }

    return transaction;
  }

  /**
   * CE-7: Creator/admin decides a donor's refund request.
   * Approve = money returned off-platform; donation reversed (accounting + fee)
   * and marked `refunded`. Decline = request closed with a note. Reversible &
   * consistent with reject/verify accounting.
   *
   * @param {ObjectId} transactionId
   * @param {ObjectId} actorId - creator or admin
   * @param {'approve'|'decline'} decision
   * @param {string} [note]
   * @returns {Promise<Object>} updated transaction
   */
  async decideRefundRequest(transactionId, actorId, decision, note = '') {
    if (!['approve', 'decline'].includes(decision)) {
      throw new Error('INVALID_DECISION: decision must be "approve" or "decline"');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    let transaction;
    let didReverseVerified = false;
    try {
      transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) throw new Error('TRANSACTION_NOT_FOUND: Transaction does not exist');
      if (transaction.transaction_type !== 'donation') {
        throw new Error('INVALID_TYPE: Only donations can be refunded');
      }
      if (!transaction.refund_request || transaction.refund_request.status !== 'requested') {
        throw new Error('INVALID_STATE: No pending refund request for this donation');
      }

      const campaign = await Campaign.findById(transaction.campaign_id).session(session);
      if (!campaign) throw new Error('CAMPAIGN_DELETED: Associated campaign no longer exists');

      // Authorization: campaign creator or admin
      await this._resolveDonationActor(actorId, campaign);

      if (decision === 'approve') {
        if (transaction.status === 'verified') {
          // Was publicly counted — reverse the full accounting.
          await this._adjustVerifiedDonationAccounting(transaction.campaign_id, transaction, -1, session);
          didReverseVerified = true;
        } else if (transaction.status === 'pending') {
          // Only in the pending pipeline — drop it from there.
          await Campaign.findByIdAndUpdate(
            transaction.campaign_id,
            { $inc: { 'metrics.pending_donations': -1, 'metrics.pending_donation_amount': -transaction.amount_cents } },
            { session }
          );
        } else {
          throw new Error(`INVALID_STATE: Cannot refund a ${transaction.status} donation`);
        }

        transaction.status = 'refunded';
        transaction.refund_reason = transaction.refund_request.reason || 'Donor refund request approved';
        transaction.refunded_by = actorId;
        transaction.refunded_at = new Date();
        transaction.refund_request.status = 'approved';
        transaction.refund_request.decided_by = actorId;
        transaction.refund_request.decided_at = new Date();
        transaction.refund_request.decision_note = note || null;
        transaction.addNote('refund_approved', note || 'Refund request approved', actorId);
      } else {
        transaction.refund_request.status = 'declined';
        transaction.refund_request.decided_by = actorId;
        transaction.refund_request.decided_at = new Date();
        transaction.refund_request.decision_note = note || null;
        transaction.addNote('refund_declined', note || 'Refund request declined', actorId);
      }

      await transaction.save({ session });
      await session.commitTransaction();
      session.endSession();
    } catch (error) {
      try { await session.abortTransaction(); } catch (_) { /* already ended */ }
      try { session.endSession(); } catch (_) { /* noop */ }
      throw new Error(`REFUND_DECISION_FAILED: ${error.message}`);
    }

    // ===== POST-COMMIT (non-fatal) =====
    // Reverse the owed platform fee for a refunded, previously-verified donation.
    if (decision === 'approve' && didReverseVerified) {
      try {
        const FeeTrackingService = require('./FeeTrackingService');
        await FeeTrackingService.reverseFee(transaction._id, 'Donation refunded (donor request)', actorId);
      } catch (err) {
        winstonLogger.warn('⚠️ decideRefundRequest: fee reversal failed (non-blocking)', {
          transactionId: transaction.transaction_id,
          error: err.message,
        });
      }
    }

    try {
      this.emit(decision === 'approve' ? 'donation:refunded' : 'donation:refund_declined', {
        transaction_id: transaction.transaction_id,
        campaign_id: transaction.campaign_id,
        supporter_id: transaction.supporter_id,
        decided_by: actorId,
        amount_dollars: transaction.amount_dollars,
        note: note || null,
      });
    } catch (_) { /* non-blocking */ }

    return transaction;
  }

  /**
   * CE-7: List refund requests for a campaign (creator or admin).
   * @param {ObjectId} campaignId
   * @param {ObjectId} actorId
   * @param {Object} [opts] - { status='requested', page=1, limit=25 }
   * @returns {Promise<Object>} { requests, pagination }
   */
  async getCampaignRefundRequests(campaignId, actorId, opts = {}) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      const e = new Error('CAMPAIGN_NOT_FOUND: Campaign does not exist');
      e.statusCode = 404;
      throw e;
    }
    await this._resolveDonationActor(actorId, campaign);

    const status = opts.status || 'requested';
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const query = {
      campaign_id: campaign._id,
      transaction_type: 'donation',
      'refund_request.status': status,
    };

    const [rows, total] = await Promise.all([
      Transaction.find(query)
        .sort({ 'refund_request.requested_at': -1 })
        .skip(skip)
        .limit(limit)
        .populate('supporter_id', 'email display_name first_name last_name')
        .lean(),
      Transaction.countDocuments(query),
    ]);

    const requests = rows.map((t) => {
      const d = t.supporter_id;
      const donorName = d
        ? (d.display_name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.email || 'Donor')
        : 'Deleted user';
      return {
        transaction_id: t.transaction_id,
        _id: t._id,
        donor_name: donorName,
        donor_email: d?.email || null,
        amount_dollars: (t.amount_cents / 100).toFixed(2),
        amount_cents: t.amount_cents,
        donation_status: t.status,
        refund_request: {
          status: t.refund_request?.status,
          reason: t.refund_request?.reason,
          requested_at: t.refund_request?.requested_at,
          decided_at: t.refund_request?.decided_at,
          decision_note: t.refund_request?.decision_note,
        },
        created_at: t.created_at,
      };
    });

    return {
      requests,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
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
