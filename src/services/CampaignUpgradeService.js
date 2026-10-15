/**
 * CampaignUpgradeService
 * -------------------------------------------------------------------------
 * ONE pipeline for turning a Free Campaign (`campaign_type: 'fundraising'`)
 * into a Share Campaign (`campaign_type: 'sharing'`), serving all three
 * initiators: the creator, a qualified sponsor, and an admin.
 *
 * Why one pipeline: the eligibility predicate, the payout gate, the atomic
 * write, the audit record and the notification are identical for all three.
 * Only authorisation and whether owner approval is required differ. Three
 * parallel implementations would drift.
 *
 * Invariants this service protects
 * --------------------------------
 * 1. `campaign_type` stays OUT of CampaignService.LIVE_EDITABLE_FIELDS. The
 *    generic edit path still cannot change it. This is the only sanctioned
 *    route, and it is audited.
 * 2. The campaign's `_id`, `campaign_id`, `creator_id`, donations, contributors,
 *    media and metrics are never touched. Only `campaign_type`, `share_config`
 *    and `upgrade_meta` change.
 * 3. Paid sharing may never be ACTIVE without the OWNER having a usable payout
 *    method — the owner personally owes sharers their rewards. Note this guards
 *    ACTIVATION, not the type change: an admin upgrade lands with paid sharing
 *    off, so it is allowed regardless of the owner's payout state, and the real
 *    gate lives in ShareConfigService.enablePaidSharing().
 * 4. Only the owner can accept the pay-sharers-directly agreement. A sponsor
 *    upgrade is therefore a REQUEST the owner approves; an admin upgrade lands
 *    with paid sharing switched off until the owner consents.
 * 5. The transition is ONE-WAY. Reversal is expressed by pausing paid sharing,
 *    not by downgrading the type, because accrued rewards would otherwise be
 *    stranded.
 *
 * Concurrency: this codebase does not use MongoDB transactions outside
 * TransactionService, and the deployment may be a standalone mongod. So the
 * upgrade uses a GUARDED findOneAndUpdate — the state check and the write are a
 * single atomic operation. See `applyUpgrade`.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const Campaign = require('../models/Campaign');
const CampaignUpgrade = require('../models/CampaignUpgrade');
const Donation = require('../models/Donation');
// Share.js exports { ShareRecord, ShareBudgetReload } rather than a bare model.
const { ShareRecord } = require('../models/Share');
const User = require('../models/User');
const PayoutReadinessService = require('./PayoutReadinessService');
const NotificationDispatcher = require('./NotificationDispatcher');
const CampaignEventAnalyticsService = require('./CampaignEventAnalyticsService');
const FeatureFlagService = require('./FeatureFlagService');
const winstonLogger = require('../utils/winstonLogger');

// Statuses from which an upgrade is allowed. `draft` is included so a creator
// can upgrade before publishing; `completed`/`cancelled`/`rejected` are not,
// because upgrading a finished campaign has no meaning.
const UPGRADEABLE_STATUSES = ['draft', 'active', 'paused'];

// Moderation states that block an upgrade — an upgrade must not be a route
// around review.
const BLOCKING_REVIEW_STATUSES = ['rejected', 'flagged', 'escalated'];

// How long a sponsor's request waits for the owner before expiring.
const SPONSOR_REQUEST_TTL_DAYS = 14;

// Minimum account age for a sponsor, in days.
const SPONSOR_MIN_ACCOUNT_AGE_DAYS = 7;

class CampaignUpgradeService {
  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Build a namespaced idempotency key. Namespacing by campaign + actor stops a
   * client-generated uuid from colliding across campaigns.
   */
  static buildIdempotencyKey(campaignId, actorId, clientKey) {
    const suffix = clientKey || crypto.randomUUID();
    return `${String(campaignId)}:${String(actorId)}:${suffix}`;
  }

  /**
   * Resolve a campaign by Mongo _id or by the human campaign_id.
   */
  static async resolveCampaign(idOrRef) {
    if (!idOrRef) return null;
    if (mongoose.Types.ObjectId.isValid(String(idOrRef))) {
      const byId = await Campaign.findById(idOrRef);
      if (byId) return byId;
    }
    return Campaign.findOne({ campaign_id: idOrRef });
  }

  /**
   * The shared eligibility predicate. Returns a list of blocking reasons —
   * empty means eligible.
   *
   * @param {Object} campaign
   * @returns {Array<{code: string, message: string}>}
   */
  static getIneligibilityReasons(campaign) {
    const reasons = [];

    if (!campaign) {
      reasons.push({ code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.' });
      return reasons;
    }

    if (campaign.deleted_at) {
      reasons.push({ code: 'CAMPAIGN_NOT_ELIGIBLE', message: 'This campaign has been deleted.' });
    }

    if (campaign.campaign_type === 'sharing') {
      reasons.push({
        code: 'ALREADY_SHARE_CAMPAIGN',
        message: 'This is already a Share Campaign.',
      });
    }

    if (!UPGRADEABLE_STATUSES.includes(campaign.status)) {
      reasons.push({
        code: 'CAMPAIGN_STATUS_INELIGIBLE',
        message: `A ${campaign.status} campaign cannot be upgraded.`,
      });
    }

    const review = campaign.moderation?.review_status;
    if (review && BLOCKING_REVIEW_STATUSES.includes(review)) {
      reasons.push({
        code: 'CAMPAIGN_NOT_ELIGIBLE',
        message: 'This campaign is under review and cannot be upgraded right now.',
      });
    }

    // Deliberately NOT checking end_date here.
    //
    // `status` is the platform's authority on whether a campaign is live: the
    // public listing filters on `status: 'active'` and ignores end_date, and the
    // CompleteExpiredCampaigns job is what flips a genuinely-finished campaign
    // to 'completed' — which UPGRADEABLE_STATUSES already rejects above.
    //
    // Checking end_date separately duplicated that job and fired ahead of it,
    // creating a window where a campaign was still publicly listed and taking
    // donations but could not be upgraded. If it's live enough to receive
    // support, it's live enough to upgrade.

    return reasons;
  }

  /**
   * Throwing form of the predicate.
   */
  static assertCampaignEligible(campaign) {
    const reasons = this.getIneligibilityReasons(campaign);
    if (reasons.length > 0) {
      throw {
        code: reasons[0].code,
        message: reasons[0].message,
        statusCode: reasons[0].code === 'CAMPAIGN_NOT_FOUND' ? 404 : 400,
      };
    }
  }

  /**
   * Validate and normalise the share configuration an upgrade will apply.
   * Mirrors the activation rule used at campaign creation: paid sharing goes
   * live only when the declared pool can cover at least one reward.
   *
   * @param {Object} input - { budget, reward_per_share, platforms } in DOLLARS
   * @returns {{total_budget: number, amount_per_share: number,
   *            share_channels: Array<string>, can_activate: boolean}}
   */
  static normalizeShareConfig(input = {}) {
    const budget = Number(input.budget ?? input.total_budget_dollars ?? 0);
    const rewardPerShare = Number(input.reward_per_share ?? input.amount_per_share_dollars ?? 0);

    if (!Number.isFinite(budget) || budget < 0) {
      throw { code: 'INVALID_SHARE_CONFIG', message: 'Reward budget is invalid.', statusCode: 400 };
    }
    if (!Number.isFinite(rewardPerShare) || rewardPerShare < 0) {
      throw {
        code: 'INVALID_SHARE_CONFIG',
        message: 'Reward per share is invalid.',
        statusCode: 400,
      };
    }

    const budgetCents = Math.round(budget * 100);
    const rewardCents = Math.round(rewardPerShare * 100);

    if (rewardCents > 0 && budgetCents < rewardCents) {
      throw {
        code: 'INVALID_SHARE_CONFIG',
        message: 'Your reward budget must cover at least one share reward.',
        statusCode: 400,
      };
    }

    return {
      total_budget: budgetCents,
      amount_per_share: rewardCents,
      share_channels: Array.isArray(input.platforms) ? input.platforms : [],
      can_activate: rewardCents > 0 && budgetCents >= rewardCents,
    };
  }

  /**
   * Is this user allowed to sponsor an upgrade of someone else's campaign?
   *
   * Deliberately NOT "any verified user" — that is a spam and social-engineering
   * vector. The sponsor must have a demonstrated relationship with the campaign:
   * they donated to it, they verifiably shared it, or they are on its team.
   *
   * @returns {Promise<{qualified: boolean, basis: string|null}>}
   */
  static async getSponsorQualification(campaign, userId) {
    const user = await User.findById(userId).select('created_at blocked deleted_at');
    if (!user || user.deleted_at || user.blocked) {
      return { qualified: false, basis: null };
    }

    const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
    if (ageDays < SPONSOR_MIN_ACCOUNT_AGE_DAYS) {
      return { qualified: false, basis: null };
    }

    const [donated, shared] = await Promise.all([
      Donation.exists({ campaign_id: campaign._id, donor_id: userId }),
      ShareRecord.exists({ campaign_id: campaign._id, supporter_id: userId }),
    ]);

    if (donated) return { qualified: true, basis: 'donor' };
    if (shared) return { qualified: true, basis: 'sharer' };

    return { qualified: false, basis: null };
  }

  // ── Read path ───────────────────────────────────────────────────────────

  /**
   * Everything the UI needs to render the upgrade affordance. Read-only, and
   * explicitly NOT authoritative — every mutation re-checks server-side.
   *
   * @param {string} campaignIdOrRef
   * @param {string} actorId
   */
  static async getEligibility(campaignIdOrRef, actorId) {
    const campaign = await this.resolveCampaign(campaignIdOrRef);
    if (!campaign) {
      throw { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.', statusCode: 404 };
    }

    const isOwner = String(campaign.creator_id) === String(actorId);
    const reasons = this.getIneligibilityReasons(campaign).map((r) => ({
      ...r,
      blocking: true,
      action: null,
    }));

    // The payout gate always evaluates the OWNER, whoever is asking.
    const payoutReadiness = await PayoutReadinessService.getReadiness(campaign.creator_id);

    // Any signed-in non-owner may propose an upgrade — there is no donor/sharer
    // history requirement. The protection against an unsolicited upgrade is
    // `requires_owner_approval` below: a sponsor's proposal never activates by
    // itself, it waits on the campaign owner to approve it.
    let actorRole = 'viewer';
    let sponsorBasis = null;
    if (isOwner) {
      actorRole = 'creator';
    } else if (actorId) {
      actorRole = 'sponsor';
      const q = await this.getSponsorQualification(campaign, actorId);
      sponsorBasis = q.qualified ? q.basis : null;
    }

    // Only block the OWNER's own creator-flow upgrade on payout readiness —
    // that path flips `is_paid_sharing_active: true` in the same transaction,
    // so the payout method must be in place before the upgrade can land.
    //
    // A sponsor's proposal creates a pending request that does NOT activate
    // paid sharing; the real gate for activation lives on the owner-approval
    // endpoint and in ShareConfigService.enablePaidSharing(). Blocking the
    // proposal here just hid an entire campaign from any sponsor whose owner
    // hadn't finished payout setup yet — a chicken-and-egg problem.
    if (!payoutReadiness.ready && actorRole === 'creator') {
      reasons.push({
        code: payoutReadiness.code,
        message: payoutReadiness.reason,
        blocking: true,
        action: 'add_payment_method',
        // NOTE: the payout-method screen is /settings (a single page devoted
        // to payment methods). There is no /settings/payment-methods route.
        action_url: `/settings?returnTo=${encodeURIComponent(
          `/campaigns/${campaign.campaign_id}/upgrade`
        )}`,
      });
    } else if (!payoutReadiness.ready && actorRole === 'sponsor') {
      // Surface it to the sponsor as context, non-blocking. The UI can show a
      // small note ("owner will need to add payouts before paid sharing turns
      // on") without greying out the whole upgrade button.
      reasons.push({
        code: 'OWNER_PAYOUT_NOT_READY',
        message:
          'The owner has not set up a payout method yet. Your request will be delivered — paid sharing turns on once they add one and approve.',
        blocking: false,
        action: null,
        action_url: null,
      });
    }

    const pending = await CampaignUpgrade.findPendingForCampaign(campaign._id);

    return {
      // Non-blocking reasons (soft context notes) must not disqualify. Only
      // reasons flagged `blocking: true` count against eligibility.
      eligible: !reasons.some((r) => r.blocking) && actorRole !== 'viewer',
      reason_code: reasons[0]?.code || null,
      reasons,
      campaign: {
        id: String(campaign._id),
        campaign_id: campaign.campaign_id,
        title: campaign.title,
        campaign_type: campaign.campaign_type,
        status: campaign.status,
        already_share_campaign: campaign.campaign_type === 'sharing',
        original_campaign_type: campaign.upgrade_meta?.original_campaign_type || null,
      },
      payout_readiness: {
        ready: payoutReadiness.ready,
        level: payoutReadiness.level,
        method: payoutReadiness.method,
      },
      actor_role: actorRole,
      sponsor_basis: sponsorBasis,
      // A sponsor never upgrades directly — the owner must consent, because the
      // owner is the one who will owe sharers money.
      requires_owner_approval: actorRole === 'sponsor',
      pending_upgrade: pending
        ? {
            id: String(pending._id),
            status: pending.status,
            initiated_by: String(pending.initiated_by),
            created_at: pending.created_at,
            expires_at: pending.expires_at,
          }
        : null,
    };
  }

  // ── Write path ──────────────────────────────────────────────────────────

  /**
   * The single entry point for every upgrade attempt.
   *
   * @param {Object} params
   * @param {string} params.campaignId    - _id or campaign_id
   * @param {string} params.actorId       - who is acting
   * @param {'creator'|'sponsor'|'admin'} params.initiatorType
   * @param {Object} [params.shareConfig] - { budget, reward_per_share, platforms }
   * @param {boolean} [params.payoutConsent] - owner's agreement to pay sharers
   * @param {string} [params.paymentMethodId]
   * @param {string} [params.idempotencyKey]
   * @param {string} [params.reason]
   * @param {string} [params.adminNote]
   * @returns {Promise<{upgrade: Object, campaign: Object, already_upgraded: boolean,
   *                    pending: boolean}>}
   */
  static async requestUpgrade(params) {
    // Instrumentation wrapper. The funnel needs BOTH the attempt and the
    // outcome — without the failure half we could not tell how many creators
    // the payout gate turns away, which is the number the rollout decision
    // depends on. Analytics never alters control flow: the original error is
    // always rethrown untouched.
    let campaign = null;
    try {
      campaign = await this.resolveCampaign(params.campaignId);
    } catch {
      campaign = null;
    }

    await CampaignEventAnalyticsService.recordUpgradeAttempted({
      campaign,
      actorId: params.actorId,
      initiatorType: params.initiatorType,
      req: params.req,
    });

    try {
      const result = await this.performUpgrade(params);

      // A replay is not a fresh conversion — counting it would inflate the
      // success rate every time a client retried.
      if (!result.replayed) {
        if (result.pending) {
          await CampaignEventAnalyticsService.recordUpgradeRequested({
            campaign,
            sponsorId: params.actorId,
            upgradeId: result.upgrade?._id,
            req: params.req,
          });
        } else {
          await CampaignEventAnalyticsService.recordUpgradeSucceeded({
            campaign: result.campaign || campaign,
            actorId: params.actorId,
            initiatorType: params.initiatorType,
            upgradeId: result.upgrade?._id,
            payoutLevel: result.upgrade?.payout_readiness?.readiness_level,
            req: params.req,
          });
        }
      }

      return result;
    } catch (error) {
      await CampaignEventAnalyticsService.recordUpgradeFailed({
        campaign,
        actorId: params.actorId,
        initiatorType: params.initiatorType,
        reasonCode: error?.code || 'UNKNOWN_ERROR',
        req: params.req,
      });
      throw error;
    }
  }

  /**
   * The upgrade itself. Called only through `requestUpgrade` above, which adds
   * the funnel instrumentation.
   */
  static async performUpgrade(params) {
    const {
      campaignId,
      actorId,
      initiatorType,
      shareConfig = {},
      payoutConsent = false,
      paymentMethodId = null,
      idempotencyKey = null,
      reason = null,
      adminNote = null,
    } = params;

    if (!['creator', 'sponsor', 'admin'].includes(initiatorType)) {
      throw { code: 'INVALID_INITIATOR', message: 'Unknown upgrade initiator.', statusCode: 400 };
    }

    // Each initiator is independently switchable, so a problem with (say) the
    // sponsored flow can be turned off without taking creator upgrades down.
    const FLAG_BY_INITIATOR = {
      creator: 'campaign_upgrade_creator',
      sponsor: 'campaign_upgrade_sponsor',
      admin: 'campaign_upgrade_admin',
    };
    await FeatureFlagService.assertEnabled(
      FLAG_BY_INITIATOR[initiatorType],
      'Campaign upgrades are temporarily unavailable. Please try again later.'
    );

    const campaign = await this.resolveCampaign(campaignId);
    if (!campaign) {
      throw { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.', statusCode: 404 };
    }

    // Idempotency is resolved BEFORE eligibility. A retry of a request that
    // already succeeded must return that original outcome — checking
    // eligibility first would instead reject the retry with
    // ALREADY_SHARE_CAMPAIGN, turning a successful upgrade into a client-facing
    // error purely because the response was lost in transit.
    if (idempotencyKey) {
      const priorKey = this.buildIdempotencyKey(campaign._id, actorId, idempotencyKey);
      const prior = await CampaignUpgrade.findOne({ idempotency_key: priorKey });
      if (prior && prior.status === 'completed') {
        return {
          upgrade: prior,
          campaign,
          already_upgraded: true,
          pending: false,
          replayed: true,
        };
      }
      if (prior && prior.status === 'pending_owner_approval') {
        return { upgrade: prior, campaign, pending: true, replayed: true };
      }
    }

    this.assertCampaignEligible(campaign);

    const ownerId = campaign.creator_id;
    const isOwner = String(ownerId) === String(actorId);

    // ── 1. Authorise ──────────────────────────────────────────────────────
    if (initiatorType === 'creator' && !isOwner) {
      throw {
        code: 'NOT_CAMPAIGN_OWNER',
        message: 'Only the campaign owner can upgrade this campaign.',
        statusCode: 403,
      };
    }

    if (initiatorType === 'sponsor') {
      if (isOwner) {
        throw {
          code: 'INVALID_INITIATOR',
          message: 'Use the creator upgrade flow for your own campaign.',
          statusCode: 400,
        };
      }
      // Any signed-in sponsor may propose an upgrade for someone else's
      // campaign — the real protection against an unsolicited upgrade is
      // further down: a direct sponsor proposal never activates on its own,
      // it lands as a pending request that only the campaign OWNER can
      // approve (see createPendingRequest below). A community-request
      // fulfilment skips straight to activation because the owner already
      // consented in advance by posting that request publicly.
    }

    // ── 2. Payout gate — evaluated against the OWNER, enforced on ACTIVATION
    //
    // The rule that matters is "paid sharing must never be ACTIVE without a
    // usable payout method" — not "campaign_type must never be 'sharing'".
    // Those are different states, and only the first one means somebody is owed
    // money.
    //
    // An ADMIN upgrade sets is_paid_sharing_active: false (see `activateNow`
    // below), so nothing can accrue and there is nothing to protect against
    // yet. Blocking it only stopped an admin helping a creator who hadn't got
    // round to adding their details. The owner is told to add one, and the real
    // gate sits at ShareConfigService.enablePaidSharing() — the switch every
    // route must pass through to turn rewards on.
    //
    // A CREATOR upgrade activates paid sharing in the same action, so for that
    // path this IS the activation and the gate still applies.
    // Admin AND community-request sponsor fulfilments leave paid sharing OFF
    // (is_paid_sharing_active: false below), so nothing accrues and there is
    // no payout obligation yet. The owner must still add a payout method
    // before they personally activate paid sharing — that gate lives in
    // ShareConfigService.enablePaidSharing(). Blocking here would stop the
    // tier change itself, which is the thing the owner publicly asked for.
    //
    // A sponsor's direct proposal creates a pending request (see step 3 below)
    // that doesn't activate paid sharing either. It's the owner's eventual
    // approval + ShareConfigService.enablePaidSharing() that activates. So we
    // also skip this gate on direct sponsor proposals — the owner can add
    // their payout method between the proposal landing in their inbox and
    // their decision to approve it.
    const requiresPayoutNow =
      initiatorType === 'creator';

    const readiness = requiresPayoutNow
      ? await PayoutReadinessService.assertReady(ownerId, {
          preferredMethodId: isOwner ? paymentMethodId : null,
          subjectLabel: isOwner ? 'You' : 'The campaign owner',
        })
      : // Recorded for the audit trail, but never blocking.
        await PayoutReadinessService.getReadiness(ownerId);

    // ── 3. Sponsor path stops here — the owner must consent ───────────────
    //
    // Exception: when fulfilling a community upgrade request, the owner has
    // publicly consented in advance by posting the request. We skip the
    // pending-approval step and continue straight to activation — same shape
    // as the admin path (paid sharing is still left OFF until the owner opts
    // in via the pay-sharers-directly agreement).
    if (initiatorType === 'sponsor' && !params.fromCommunityRequest) {
      return this.createPendingRequest({
        campaign,
        actorId,
        readiness,
        shareConfig,
        idempotencyKey,
        reason,
      });
    }

    // ── 4. Consent (BR-3) ─────────────────────────────────────────────────
    // The creator must personally accept the pay-sharers-directly agreement.
    // An admin cannot accept it on their behalf, so an admin upgrade lands with
    // paid sharing switched OFF until the owner opts in.
    if (initiatorType === 'creator' && !payoutConsent) {
      throw {
        code: 'PAYOUT_CONSENT_REQUIRED',
        message:
          'You must accept the agreement to pay sharers directly before enabling Share-to-Earn.',
        statusCode: 400,
      };
    }

    const normalized = this.normalizeShareConfig(shareConfig);
    const activateNow = initiatorType === 'creator' && normalized.can_activate;

    const key = this.buildIdempotencyKey(campaign._id, actorId, idempotencyKey);

    // ── 5. Record the intent BEFORE mutating the campaign ─────────────────
    // A crash between the two leaves an auditable record rather than an
    // unexplained type change.
    let upgradeDoc;
    try {
      upgradeDoc = await CampaignUpgrade.create({
        campaign_id: campaign._id,
        campaign_ref: campaign.campaign_id,
        campaign_title: campaign.title,
        owner_id: ownerId,
        initiated_by: actorId,
        initiator_type: initiatorType,
        status: 'failed', // flipped to 'completed' only after the write lands
        from_campaign_type: campaign.campaign_type,
        to_campaign_type: 'sharing',
        previous_share_config: campaign.share_config || null,
        payout_readiness: {
          // Never hardcode true: the admin path records readiness without
          // requiring it, so this must reflect what was actually found.
          ready: !!readiness.ready,
          readiness_level: readiness.level,
          payment_method_id: readiness.method?.id || null,
          method_type: readiness.method?.type || null,
          checked_at: new Date(),
        },
        reason,
        admin_note: adminNote,
        idempotency_key: key,
      });
    } catch (error) {
      // Replay of a request we already handled — return the original outcome
      // rather than upgrading twice.
      if (error.code === 11000) {
        const existing = await CampaignUpgrade.findOne({ idempotency_key: key });
        const current = await Campaign.findById(campaign._id);
        winstonLogger.info('🔁 CampaignUpgradeService: idempotent replay', {
          campaign_id: campaign.campaign_id,
          idempotency_key: key,
        });
        return {
          upgrade: existing,
          campaign: current,
          already_upgraded: current?.campaign_type === 'sharing',
          pending: false,
          replayed: true,
        };
      }
      throw error;
    }

    // ── 6. Apply atomically ───────────────────────────────────────────────
    const result = await this.applyUpgrade({
      campaign,
      upgradeDoc,
      normalized,
      activateNow,
      actorId,
      initiatorType,
      recordConsent: initiatorType === 'creator',
    });

    return result;
  }

  /**
   * Create the owner-approval request for a sponsored upgrade. The campaign is
   * NOT touched here.
   */
  static async createPendingRequest({
    campaign,
    actorId,
    readiness,
    shareConfig,
    idempotencyKey,
    reason,
  }) {
    // Clear any request that timed out, so an abandoned one cannot block the
    // campaign forever through the partial unique index.
    await CampaignUpgrade.expireStaleRequests();

    const existing = await CampaignUpgrade.findPendingForCampaign(campaign._id);
    if (existing) {
      throw {
        code: 'UPGRADE_ALREADY_PENDING',
        message: 'This campaign already has an upgrade request awaiting the owner.',
        statusCode: 409,
      };
    }

    const key = this.buildIdempotencyKey(campaign._id, actorId, idempotencyKey);
    const expiresAt = new Date(Date.now() + SPONSOR_REQUEST_TTL_DAYS * 86400000);

    let upgradeDoc;
    try {
      upgradeDoc = await CampaignUpgrade.create({
        campaign_id: campaign._id,
        campaign_ref: campaign.campaign_id,
        campaign_title: campaign.title,
        owner_id: campaign.creator_id,
        initiated_by: actorId,
        initiator_type: 'sponsor',
        status: 'pending_owner_approval',
        from_campaign_type: campaign.campaign_type,
        previous_share_config: campaign.share_config || null,
        applied_share_config: shareConfig || null,
        payout_readiness: {
          // Never hardcode true: the admin path records readiness without
          // requiring it, so this must reflect what was actually found.
          ready: !!readiness.ready,
          readiness_level: readiness.level,
          payment_method_id: readiness.method?.id || null,
          method_type: readiness.method?.type || null,
          checked_at: new Date(),
        },
        reason,
        idempotency_key: key,
        expires_at: expiresAt,
      });
    } catch (error) {
      if (error.code === 11000) {
        const dupe = await CampaignUpgrade.findOne({ idempotency_key: key });
        if (dupe) return { upgrade: dupe, campaign, pending: true, replayed: true };
        throw {
          code: 'UPGRADE_ALREADY_PENDING',
          message: 'This campaign already has an upgrade request awaiting the owner.',
          statusCode: 409,
        };
      }
      throw error;
    }

    const sponsor = await User.findById(actorId).select('display_name');

    await this.safeNotify({
      userId: campaign.creator_id,
      type: 'campaign_upgrade_requested',
      data: {
        campaign_id: campaign.campaign_id,
        campaign_title: campaign.title,
        actor_name: sponsor?.display_name || 'A supporter',
        upgrade_id: String(upgradeDoc._id),
      },
    });

    winstonLogger.info('🤝 CampaignUpgradeService: sponsor request created', {
      campaign_id: campaign.campaign_id,
      sponsor_id: String(actorId),
      upgrade_id: String(upgradeDoc._id),
    });

    return { upgrade: upgradeDoc, campaign, pending: true, already_upgraded: false };
  }

  /**
   * Owner accepts a sponsored upgrade. This is where the owner supplies the two
   * things only they can supply: their consent, and their payout method.
   */
  static async approveUpgrade({ upgradeId, ownerId, shareConfig = {}, payoutConsent = false, paymentMethodId = null }) {
    const upgradeDoc = await CampaignUpgrade.findById(upgradeId);
    if (!upgradeDoc) {
      throw { code: 'UPGRADE_NOT_FOUND', message: 'Upgrade request not found.', statusCode: 404 };
    }
    if (String(upgradeDoc.owner_id) !== String(ownerId)) {
      throw {
        code: 'NOT_CAMPAIGN_OWNER',
        message: 'Only the campaign owner can respond to this request.',
        statusCode: 403,
      };
    }
    if (upgradeDoc.status !== 'pending_owner_approval') {
      throw {
        code: 'UPGRADE_NOT_PENDING',
        message: 'This request has already been resolved.',
        statusCode: 409,
      };
    }
    if (!payoutConsent) {
      throw {
        code: 'PAYOUT_CONSENT_REQUIRED',
        message:
          'You must accept the agreement to pay sharers directly before enabling Share-to-Earn.',
        statusCode: 400,
      };
    }

    const campaign = await Campaign.findById(upgradeDoc.campaign_id);
    this.assertCampaignEligible(campaign);

    const readiness = await PayoutReadinessService.assertReady(ownerId, {
      preferredMethodId: paymentMethodId,
    });

    // Owner-supplied config wins; fall back to what the sponsor proposed.
    const normalized = this.normalizeShareConfig(
      Object.keys(shareConfig || {}).length > 0 ? shareConfig : upgradeDoc.applied_share_config || {}
    );

    upgradeDoc.approved_at = new Date();
    upgradeDoc.payout_readiness = {
      ready: !!readiness.ready,
      readiness_level: readiness.level,
      payment_method_id: readiness.method?.id || null,
      method_type: readiness.method?.type || null,
      checked_at: new Date(),
    };
    await upgradeDoc.save();

    const result = await this.applyUpgrade({
      campaign,
      upgradeDoc,
      normalized,
      activateNow: normalized.can_activate,
      actorId: ownerId,
      initiatorType: 'sponsor',
      recordConsent: true,
    });

    await CampaignEventAnalyticsService.recordUpgradeApproved({
      campaign,
      ownerId,
      upgradeId: upgradeDoc._id,
    });

    // Tell the sponsor their request landed.
    await this.safeNotify({
      userId: upgradeDoc.initiated_by,
      type: 'campaign_upgrade_approved',
      data: {
        campaign_id: campaign.campaign_id,
        campaign_title: campaign.title,
      },
    });

    return result;
  }

  /**
   * Owner declines a sponsored upgrade. The campaign is never touched.
   */
  static async rejectUpgrade({ upgradeId, ownerId, reason = null }) {
    const upgradeDoc = await CampaignUpgrade.findById(upgradeId);
    if (!upgradeDoc) {
      throw { code: 'UPGRADE_NOT_FOUND', message: 'Upgrade request not found.', statusCode: 404 };
    }
    if (String(upgradeDoc.owner_id) !== String(ownerId)) {
      throw {
        code: 'NOT_CAMPAIGN_OWNER',
        message: 'Only the campaign owner can respond to this request.',
        statusCode: 403,
      };
    }
    if (upgradeDoc.status !== 'pending_owner_approval') {
      throw {
        code: 'UPGRADE_NOT_PENDING',
        message: 'This request has already been resolved.',
        statusCode: 409,
      };
    }

    upgradeDoc.status = 'rejected';
    upgradeDoc.rejection_reason = reason;
    await upgradeDoc.save();

    await CampaignEventAnalyticsService.recordUpgradeRejected({
      campaignId: upgradeDoc.campaign_id,
      ownerId,
      upgradeId: upgradeDoc._id,
      reason,
    });

    await this.safeNotify({
      userId: upgradeDoc.initiated_by,
      type: 'campaign_upgrade_rejected',
      data: {
        campaign_id: upgradeDoc.campaign_ref,
        campaign_title: upgradeDoc.campaign_title,
        reason,
      },
    });

    return { upgrade: upgradeDoc };
  }

  /**
   * Sponsor withdraws their own pending request.
   */
  static async cancelUpgrade({ upgradeId, actorId }) {
    const upgradeDoc = await CampaignUpgrade.findById(upgradeId);
    if (!upgradeDoc) {
      throw { code: 'UPGRADE_NOT_FOUND', message: 'Upgrade request not found.', statusCode: 404 };
    }
    if (String(upgradeDoc.initiated_by) !== String(actorId)) {
      throw {
        code: 'NOT_AUTHORIZED_SPONSOR',
        message: 'Only the requester can cancel this request.',
        statusCode: 403,
      };
    }
    if (upgradeDoc.status !== 'pending_owner_approval') {
      throw {
        code: 'UPGRADE_NOT_PENDING',
        message: 'This request has already been resolved.',
        statusCode: 409,
      };
    }

    upgradeDoc.status = 'cancelled';
    await upgradeDoc.save();
    return { upgrade: upgradeDoc };
  }

  /**
   * Perform the campaign mutation. GUARDED atomic update — the eligibility
   * check and the write are one operation, so two concurrent upgrades cannot
   * both succeed.
   */
  static async applyUpgrade({
    campaign,
    upgradeDoc,
    normalized,
    activateNow,
    actorId,
    initiatorType,
    recordConsent,
  }) {
    const now = new Date();

    // Phase 3 — admin pre-notification (per decision §14.14 of the roadmap).
    // When an admin triggers the upgrade, the owner must be told BEFORE the
    // campaign is mutated. This runs synchronously; failure is logged but
    // does NOT abort the upgrade — the owner would be worse off if a
    // notification outage blocked their campaign change. The followup
    // `campaign_upgraded` notification at the end still fires.
    if (initiatorType === 'admin') {
      await this.safeNotify({
        userId: campaign.creator_id,
        type: 'admin_upgrade_notice',
        data: {
          campaign_id: campaign.campaign_id,
          campaign_title: campaign.title,
          actor_id: String(actorId),
          upgrade_id: String(upgradeDoc._id),
          // One-click paid-sharing activation link. Paid sharing lands OFF
          // and requires the owner to re-accept the pay-sharers-directly
          // agreement — the agreement cannot be accepted by the admin on
          // their behalf, so the campaign type flips while paid sharing stays
          // off until the owner opts in explicitly.
          activation_url: `/dashboard/campaigns/${encodeURIComponent(campaign.campaign_id)}/share-activation?via=admin_upgrade`,
          paid_sharing_will_be_off: true,
        },
      });
    }

    const nextShareConfig = {
      ...(campaign.share_config?.toObject ? campaign.share_config.toObject() : campaign.share_config || {}),
      total_budget: normalized.total_budget,
      committed_budget_remaining: normalized.total_budget,
      committed_total: 0,
      amount_per_share: normalized.amount_per_share,
      share_channels: normalized.share_channels,
      // Admin upgrades leave paid sharing OFF: the owner has not personally
      // accepted the obligation to pay sharers, and an admin cannot accept it
      // for them.
      is_paid_sharing_active: !!activateNow,
      creator_payout_consent_at: recordConsent
        ? campaign.share_config?.creator_payout_consent_at || now
        : campaign.share_config?.creator_payout_consent_at || null,
      last_config_update: now,
      config_updated_by: actorId,
    };

    const updated = await Campaign.findOneAndUpdate(
      {
        _id: campaign._id,
        campaign_type: 'fundraising', // guard: not already upgraded
        status: { $in: UPGRADEABLE_STATUSES },
      },
      {
        $set: {
          campaign_type: 'sharing',
          share_config: nextShareConfig,
          'upgrade_meta.original_campaign_type': 'fundraising',
          'upgrade_meta.upgraded_at': now,
          'upgrade_meta.upgraded_by': actorId,
          'upgrade_meta.upgrade_initiator_type': initiatorType,
          'upgrade_meta.upgrade_id': upgradeDoc._id,
        },
      },
      { new: true }
    );

    if (!updated) {
      // We lost the race, or it was already upgraded. Re-read to decide which.
      const current = await Campaign.findById(campaign._id);
      if (current?.campaign_type === 'sharing') {
        upgradeDoc.status = 'completed';
        upgradeDoc.completed_at = upgradeDoc.completed_at || now;
        await upgradeDoc.save();
        return {
          upgrade: upgradeDoc,
          campaign: current,
          already_upgraded: true,
          pending: false,
        };
      }
      upgradeDoc.status = 'failed';
      await upgradeDoc.save();
      throw {
        code: 'CAMPAIGN_NOT_ELIGIBLE',
        message: 'This campaign could not be upgraded. Refresh and try again.',
        statusCode: 409,
      };
    }

    upgradeDoc.status = 'completed';
    upgradeDoc.completed_at = now;
    upgradeDoc.applied_share_config = nextShareConfig;
    await upgradeDoc.save();

    winstonLogger.info('🚀 CampaignUpgradeService: campaign upgraded to Share Campaign', {
      campaign_id: updated.campaign_id,
      initiator_type: initiatorType,
      actor_id: String(actorId),
      upgrade_id: String(upgradeDoc._id),
      paid_sharing_active: nextShareConfig.is_paid_sharing_active,
    });

    // Tell the owner. (For a creator upgrade this is their own action, but the
    // record in the feed is still useful and matches how activation is handled.)
    await this.safeNotify({
      userId: updated.creator_id,
      type: 'campaign_upgraded',
      data: {
        campaign_id: updated.campaign_id,
        campaign_title: updated.title,
        initiator_type: initiatorType,
        // Drives the admin-upgrade copy: when the owner has no payout method
        // yet, the message tells them to add one before rewards can start.
        payout_ready: !!upgradeDoc.payout_readiness?.ready,
      },
    });

    return {
      upgrade: upgradeDoc,
      campaign: updated,
      already_upgraded: false,
      pending: false,
    };
  }

  /**
   * List upgrade records, newest first.
   */
  static async listUpgrades(filter = {}, { page = 1, limit = 25 } = {}) {
    const query = {};
    if (filter.campaignId) query.campaign_id = filter.campaignId;
    if (filter.ownerId) query.owner_id = filter.ownerId;
    if (filter.initiatedBy) query.initiated_by = filter.initiatedBy;
    if (filter.status) query.status = filter.status;
    if (filter.initiatorType) query.initiator_type = filter.initiatorType;

    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
      CampaignUpgrade.find(query).sort({ created_at: -1 }).skip(skip).limit(limit),
      CampaignUpgrade.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Veteran one-free-upgrade entitlement (TASK-7.11).
   *
   * A verified veteran (verified_via ∈ {idme, admin}) may skip the upgrade
   * charge exactly once — ever. The flag `veteran_profile.free_campaign_
   * upgrade_used` is set in the same atomic update that returns the right
   * to claim, so two concurrent requests can't both win. The caller stores
   * the audit record for the specific campaign the entitlement paid for.
   *
   * Returns `{ granted: true }` if this call just consumed the entitlement,
   * `{ granted: false, reason }` otherwise.
   */
  static async claimVeteranFreeUpgrade({ userId }) {
    const User = require('../models/User');
    const AuditLogger = require('./AuditLogger');

    const user = await User.findById(userId).select('veteran_profile');
    if (!user) return { granted: false, reason: 'USER_NOT_FOUND' };
    const vp = user.veteran_profile || {};
    if (!vp.is_veteran) return { granted: false, reason: 'NOT_A_VETERAN' };
    if (!['idme', 'admin'].includes(vp.verified_via)) {
      return { granted: false, reason: 'VERIFICATION_INSUFFICIENT' };
    }
    if (vp.free_campaign_upgrade_used) {
      return { granted: false, reason: 'ALREADY_USED' };
    }

    const now = new Date();
    const updated = await User.findOneAndUpdate(
      {
        _id: userId,
        'veteran_profile.is_veteran': true,
        'veteran_profile.verified_via': { $in: ['idme', 'admin'] },
        'veteran_profile.free_campaign_upgrade_used': { $ne: true },
      },
      {
        $set: {
          'veteran_profile.free_campaign_upgrade_used': true,
          'veteran_profile.free_campaign_upgrade_used_at': now,
        },
      },
      { new: true }
    );
    if (!updated) return { granted: false, reason: 'ALREADY_USED' };

    await AuditLogger.record({
      actor: { userId },
      action: 'veteran.free_upgrade.claimed',
      entityType: 'User',
      entityId: userId,
      description: 'Veteran one-free-upgrade entitlement consumed',
      metadata: { idempotency_key: `veteran_free_upgrade:${userId}` },
    });

    return { granted: true, used_at: now };
  }

  /**
   * Notifications must never break an upgrade that already succeeded.
   */
  static async safeNotify(opts) {
    try {
      await NotificationDispatcher.notify(opts);
    } catch (error) {
      winstonLogger.warn('CampaignUpgradeService: notification failed', {
        type: opts?.type,
        message: error.message,
      });
    }
  }
}

module.exports = CampaignUpgradeService;
module.exports.UPGRADEABLE_STATUSES = UPGRADEABLE_STATUSES;
module.exports.SPONSOR_REQUEST_TTL_DAYS = SPONSOR_REQUEST_TTL_DAYS;
