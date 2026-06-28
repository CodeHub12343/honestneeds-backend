/**
 * BusinessGiveawayService (BU-07)
 *
 * Businesses donate products/services as giveaways; users enter; winners are
 * drawn (random, seeded) and tracked via GiveawayClaim through fulfilment.
 * Reuses the proven claim-window pattern from PrizeClaimService but scoped to
 * business-sourced prizes.
 */

const crypto = require('crypto');
const BusinessGiveaway = require('../models/BusinessGiveaway');
const GiveawayClaim = require('../models/GiveawayClaim');
const BusinessProfile = require('../models/BusinessProfile');
const User = require('../models/User');
const NotificationDispatcher = require('./NotificationDispatcher');
const winstonLogger = require('../utils/winstonLogger');

class GiveawayError extends Error {
  constructor(message, statusCode = 400, code = 'GIVEAWAY_ERROR') {
    super(message);
    this.name = 'GiveawayError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class BusinessGiveawayService {
  /**
   * @private
   */
  static async _requireOwnBusiness(userId) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new GiveawayError('Business profile required', 403, 'NO_BUSINESS_PROFILE');
    if (profile.status === 'suspended') throw new GiveawayError('Business is suspended', 403, 'BUSINESS_SUSPENDED');
    return profile;
  }

  /**
   * Best-effort display name for a user id.
   * @private
   */
  static async _userName(userId, fallback = 'Someone') {
    try {
      const user = await User.findById(userId).select('display_name username').lean();
      return user?.display_name || user?.username || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Best-effort business name for a business profile id.
   * @private
   */
  static async _businessName(businessId, fallback = 'A business') {
    try {
      const profile = await BusinessProfile.findById(businessId).select('business_name').lean();
      return profile?.business_name || fallback;
    } catch {
      return fallback;
    }
  }

  // ── Business-side ────────────────────────────────────────────

  static async create(userId, data = {}) {
    const profile = await this._requireOwnBusiness(userId);

    const giveaway = await BusinessGiveaway.create({
      business_id: profile._id,
      posted_by: userId,
      title: data.title.trim(),
      description: data.description.trim(),
      giveaway_type: data.giveaway_type,
      estimated_value_cents: data.estimated_value_cents || 0,
      image_url: data.image_url || '',
      image_public_id: data.image_public_id || '',
      winners_count: data.winners_count || 1,
      entry_requirement: ['none', 'donor', 'verified_user'].includes(data.entry_requirement)
        ? data.entry_requirement
        : 'none',
      starts_at: data.starts_at || new Date(),
      ends_at: data.ends_at,
      status: 'draft',
    });

    await BusinessProfile.updateOne({ _id: profile._id }, { $inc: { 'stats.giveaways_count': 1 } });

    winstonLogger.info('🎁 Business giveaway created', {
      businessId: profile._id.toString(),
      giveawayId: giveaway._id.toString(),
    });

    return giveaway.getPublicView();
  }

  static async update(userId, giveawayId, updates = {}) {
    const giveaway = await this._loadOwned(userId, giveawayId);
    if (['drawing_complete', 'fulfilled'].includes(giveaway.status)) {
      throw new GiveawayError('Cannot edit a giveaway that has been drawn', 409, 'ALREADY_DRAWN');
    }
    const ALLOWED = [
      'title', 'description', 'giveaway_type', 'estimated_value_cents', 'image_url',
      'image_public_id', 'winners_count', 'entry_requirement', 'starts_at', 'ends_at',
    ];
    for (const key of ALLOWED) {
      if (updates[key] !== undefined) giveaway[key] = updates[key];
    }
    await giveaway.save();
    return giveaway.getPublicView();
  }

  /**
   * Publish a draft giveaway so users can enter.
   */
  static async publish(userId, giveawayId) {
    const giveaway = await this._loadOwned(userId, giveawayId);
    if (giveaway.status !== 'draft') {
      throw new GiveawayError('Only draft giveaways can be published', 409, 'INVALID_STATE');
    }
    if (new Date(giveaway.ends_at) <= new Date()) {
      throw new GiveawayError('End date must be in the future', 400, 'INVALID_END_DATE');
    }
    giveaway.status = 'active';
    await giveaway.save();
    return giveaway.getPublicView();
  }

  static async cancel(userId, giveawayId) {
    const giveaway = await this._loadOwned(userId, giveawayId);
    if (['drawing_complete', 'fulfilled'].includes(giveaway.status)) {
      throw new GiveawayError('Cannot cancel after winners are drawn', 409, 'ALREADY_DRAWN');
    }
    giveaway.status = 'cancelled';
    await giveaway.save();
    return giveaway.getPublicView();
  }

  /**
   * Draw winner(s) for a giveaway. Random, seeded for auditability. Creates a
   * GiveawayClaim per winner. Idempotent guard: only draws once.
   */
  static async drawWinners(userId, giveawayId) {
    const giveaway = await this._loadOwned(userId, giveawayId);

    if (giveaway.status === 'drawing_complete' || giveaway.status === 'fulfilled') {
      throw new GiveawayError('Winners already drawn', 409, 'ALREADY_DRAWN');
    }
    if (giveaway.status !== 'active') {
      throw new GiveawayError('Only active giveaways can be drawn', 409, 'INVALID_STATE');
    }
    if (!giveaway.entries.length) {
      throw new GiveawayError('No entries to draw from', 400, 'NO_ENTRIES');
    }

    const entrantIds = giveaway.entries.map((e) => e.user_id.toString());
    const winnersCount = Math.min(giveaway.winners_count, entrantIds.length);

    // Seeded Fisher-Yates using a recorded seed for audit reproducibility.
    const seed = crypto.randomBytes(16).toString('hex');
    const shuffled = seededShuffle(entrantIds, seed);
    const winners = shuffled.slice(0, winnersCount);

    const claims = await Promise.all(
      winners.map((winnerId) =>
        GiveawayClaim.create({
          giveaway_id: giveaway._id,
          business_id: giveaway.business_id,
          winner_id: winnerId,
          status: 'pending_claim',
        })
      )
    );

    giveaway.status = 'drawing_complete';
    giveaway.drawn_at = new Date();
    await giveaway.save();

    winstonLogger.info('🎁 Giveaway winners drawn', {
      giveawayId: giveaway._id.toString(),
      winners: winners.length,
      seed,
    });

    // Notify each winner so they can claim their prize (best-effort).
    const businessName = await this._businessName(giveaway.business_id);
    for (const claim of claims) {
      NotificationDispatcher.notify({
        userId: claim.winner_id,
        type: 'giveaway_won',
        data: {
          giveaway_id: giveaway._id,
          giveaway_title: giveaway.title,
          business_name: businessName,
          claim_id: claim._id,
        },
      });
    }

    return {
      giveaway: giveaway.getPublicView(),
      winners: claims.map((c) => ({ claim_id: c._id.toString(), winner_id: c.winner_id.toString(), status: c.status })),
      seed,
    };
  }

  /**
   * Business records fulfilment (shipped/redeemed) of a claim.
   */
  static async fulfilClaim(userId, claimId, { tracking_reference = null, mark = 'fulfilled' } = {}) {
    const profile = await this._requireOwnBusiness(userId);
    const claim = await GiveawayClaim.findById(claimId);
    if (!claim || claim.business_id.toString() !== profile._id.toString()) {
      throw new GiveawayError('Claim not found', 404, 'CLAIM_NOT_FOUND');
    }
    if (!['shipped', 'redeemed', 'fulfilled'].includes(mark)) {
      throw new GiveawayError('Invalid fulfilment state', 400, 'INVALID_STATE');
    }
    claim.status = mark;
    if (tracking_reference) claim.tracking_reference = tracking_reference;
    if (mark === 'fulfilled') claim.fulfilled_at = new Date();
    await claim.save();

    // Once every winner's claim is fulfilled, advance the giveaway itself to
    // 'fulfilled' so its lifecycle is complete (drawing_complete → fulfilled).
    if (mark === 'fulfilled') {
      const outstanding = await GiveawayClaim.countDocuments({
        giveaway_id: claim.giveaway_id,
        status: { $ne: 'fulfilled' },
      });
      if (outstanding === 0) {
        await BusinessGiveaway.updateOne(
          { _id: claim.giveaway_id, status: 'drawing_complete' },
          { $set: { status: 'fulfilled' } }
        );
      }
    }

    // Notify the winner their prize is on its way (best-effort).
    const giveaway = await BusinessGiveaway.findById(claim.giveaway_id).select('title').lean();
    NotificationDispatcher.notify({
      userId: claim.winner_id,
      type: 'giveaway_fulfilled',
      data: {
        giveaway_id: claim.giveaway_id,
        giveaway_title: giveaway?.title,
        business_name: profile.business_name,
        fulfilment_state: mark,
        tracking_reference: tracking_reference || undefined,
      },
    });

    return claim.toObject();
  }

  static async listClaimsForGiveaway(userId, giveawayId) {
    await this._loadOwned(userId, giveawayId);
    const claims = await GiveawayClaim.find({ giveaway_id: giveawayId })
      .populate('winner_id', 'display_name username email')
      .lean();
    return { claims };
  }

  /**
   * List ALL giveaways owned by the caller's business (any status) for the
   * management dashboard. Unlike browse(), this is not limited to active ones.
   * @param {string} userId
   * @param {Object} [opts] - { page, limit, status }
   */
  static async listOwn(userId, { page = 1, limit = 20, status } = {}) {
    const profile = await this._requireOwnBusiness(userId);
    const skip = (page - 1) * limit;
    const query = { business_id: profile._id, deleted_at: null };
    if (status) query.status = status;

    const [docs, total] = await Promise.all([
      BusinessGiveaway.find(query).sort({ created_at: -1 }).skip(skip).limit(limit),
      BusinessGiveaway.countDocuments(query),
    ]);

    return {
      giveaways: docs.map((d) => d.getPublicView()),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── User / public-side ───────────────────────────────────────

  /**
   * Browse active giveaways (public).
   */
  static async browse(opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(opts.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { deleted_at: null, status: 'active' };
    if (opts.giveaway_type) query.giveaway_type = opts.giveaway_type;

    const [docs, total] = await Promise.all([
      BusinessGiveaway.find(query)
        .sort({ ends_at: 1 })
        .skip(skip)
        .limit(limit)
        .populate('business_id', 'business_name slug logo_url is_verified'),
      BusinessGiveaway.countDocuments(query),
    ]);

    return {
      giveaways: docs.map((d) => d.getPublicView()),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Public detail. When a viewerId is supplied (optional auth), the view is
   * enriched with viewer-specific flags so the UI can render the right CTA.
   */
  static async getById(giveawayId, viewerId = null) {
    const giveaway = await BusinessGiveaway.findOne({ _id: giveawayId, deleted_at: null })
      .populate('business_id', 'business_name slug logo_url is_verified');
    if (!giveaway) throw new GiveawayError('Giveaway not found', 404, 'GIVEAWAY_NOT_FOUND');

    const view = giveaway.getPublicView();
    if (viewerId) {
      view.has_entered = giveaway.entries.some((e) => e.user_id.toString() === viewerId.toString());
      view.is_owner = giveaway.posted_by.toString() === viewerId.toString();
    }
    return view;
  }

  /**
   * Enter a user into a giveaway (one entry per user).
   */
  static async enter(userId, giveawayId) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new GiveawayError('User not found', 404, 'USER_NOT_FOUND');

    const giveaway = await BusinessGiveaway.findOne({ _id: giveawayId, deleted_at: null });
    if (!giveaway) throw new GiveawayError('Giveaway not found', 404, 'GIVEAWAY_NOT_FOUND');
    if (!giveaway.isOpenForEntry()) {
      throw new GiveawayError('This giveaway is not open for entries', 409, 'NOT_OPEN');
    }
    if (giveaway.posted_by.toString() === userId.toString()) {
      throw new GiveawayError('You cannot enter your own giveaway', 400, 'OWN_GIVEAWAY');
    }
    if (giveaway.entry_requirement === 'verified_user' && !user.verified) {
      throw new GiveawayError('Only verified users can enter this giveaway', 403, 'REQUIRES_VERIFIED');
    }

    // Atomic guard against duplicate entries via the entries.user_id check.
    const result = await BusinessGiveaway.updateOne(
      { _id: giveawayId, 'entries.user_id': { $ne: userId } },
      {
        $push: { entries: { user_id: userId, entered_at: new Date() } },
        $inc: { entries_count: 1 },
      }
    );
    if (result.modifiedCount === 0) {
      throw new GiveawayError('You have already entered this giveaway', 409, 'ALREADY_ENTERED');
    }

    // Notify the business owner of the new entry (best-effort, in-app only).
    NotificationDispatcher.notify({
      userId: giveaway.posted_by,
      type: 'giveaway_entry_received',
      data: {
        giveaway_id: giveaway._id,
        giveaway_title: giveaway.title,
        actor_name: user.display_name || user.username || 'Someone',
      },
    });

    return { entered: true, giveaway_id: giveawayId.toString() };
  }

  /**
   * Winner claims their prize and supplies fulfilment details.
   */
  static async claim(userId, claimId, fulfilment = {}) {
    const claim = await GiveawayClaim.findById(claimId);
    if (!claim || claim.winner_id.toString() !== userId.toString()) {
      throw new GiveawayError('Claim not found', 404, 'CLAIM_NOT_FOUND');
    }
    if (claim.status !== 'pending_claim') {
      throw new GiveawayError('Prize already claimed or no longer claimable', 409, 'NOT_CLAIMABLE');
    }
    if (claim.claim_deadline && new Date() > claim.claim_deadline) {
      claim.status = 'expired';
      await claim.save();
      throw new GiveawayError('Claim window has expired', 409, 'CLAIM_EXPIRED');
    }

    claim.fulfilment = {
      contact_email: fulfilment.contact_email || '',
      contact_phone: fulfilment.contact_phone || '',
      shipping_address: fulfilment.shipping_address || '',
      notes: fulfilment.notes || '',
    };
    claim.status = 'claimed';
    claim.claimed_at = new Date();
    await claim.save();

    // Notify the business owner so they can fulfil the prize (best-effort).
    const giveaway = await BusinessGiveaway.findById(claim.giveaway_id).select('title posted_by').lean();
    if (giveaway?.posted_by) {
      NotificationDispatcher.notify({
        userId: giveaway.posted_by,
        type: 'giveaway_claimed',
        data: {
          giveaway_id: claim.giveaway_id,
          giveaway_title: giveaway.title,
          actor_name: await this._userName(userId),
          claim_id: claim._id,
        },
      });
    }

    // If every winner has claimed, advance the giveaway to fulfilled-tracking.
    return claim.toObject();
  }

  /**
   * List the caller's own giveaway wins/claims.
   */
  static async listMyClaims(userId, { status } = {}) {
    const query = { winner_id: userId };
    if (status) query.status = status;
    const claims = await GiveawayClaim.find(query)
      .sort({ created_at: -1 })
      .populate('giveaway_id', 'title giveaway_type estimated_value_cents')
      .populate('business_id', 'business_name slug logo_url')
      .lean();
    return { claims };
  }

  /**
   * @private
   */
  static async _loadOwned(userId, giveawayId) {
    const profile = await this._requireOwnBusiness(userId);
    const giveaway = await BusinessGiveaway.findOne({ _id: giveawayId, deleted_at: null });
    if (!giveaway) throw new GiveawayError('Giveaway not found', 404, 'GIVEAWAY_NOT_FOUND');
    if (giveaway.business_id.toString() !== profile._id.toString()) {
      throw new GiveawayError('Not your giveaway', 403, 'FORBIDDEN');
    }
    return giveaway;
  }
}

/**
 * Deterministic Fisher-Yates shuffle seeded by a hex string, so a recorded
 * seed can reproduce the draw for audits.
 */
function seededShuffle(array, seed) {
  const arr = array.slice();
  let counter = 0;
  const rand = () => {
    const h = crypto.createHash('sha256').update(`${seed}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = BusinessGiveawayService;
module.exports.GiveawayError = GiveawayError;
