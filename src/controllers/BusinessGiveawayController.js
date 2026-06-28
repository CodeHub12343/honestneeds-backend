/**
 * Business Giveaway Controller (BU-07)
 *
 * HTTP layer for product/service giveaways: business CRUD + draw + fulfilment,
 * and user entry + claim. Thin wrappers around BusinessGiveawayService.
 */

const BusinessGiveawayService = require('../services/BusinessGiveawayService');
const { validateGiveawayCreate } = require('../validators/businessValidators');

function badRequest(res, error) {
  return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error } });
}

// ── Business-side ──────────────────────────────────────────────

exports.create = async (req, res, next) => {
  try {
    const check = validateGiveawayCreate(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await BusinessGiveawayService.create(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Giveaway created', data });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.update(req.user.id, req.params.giveawayId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.publish = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.publish(req.user.id, req.params.giveawayId);
    res.status(200).json({ success: true, message: 'Giveaway published', data });
  } catch (error) {
    next(error);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.cancel(req.user.id, req.params.giveawayId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.drawWinners = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.drawWinners(req.user.id, req.params.giveawayId);
    res.status(200).json({ success: true, message: 'Winners drawn', data });
  } catch (error) {
    next(error);
  }
};

exports.listOwn = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.listOwn(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.listClaims = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.listClaimsForGiveaway(req.user.id, req.params.giveawayId);
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.fulfilClaim = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.fulfilClaim(req.user.id, req.params.claimId, {
      tracking_reference: req.body.tracking_reference || null,
      mark: req.body.mark || 'fulfilled',
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── Public / user-side ─────────────────────────────────────────

exports.browse = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.browse({
      giveaway_type: req.query.type,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    // optionalAuthMiddleware populates req.user when a valid token is present,
    // enabling viewer-specific flags (has_entered / is_owner) without requiring auth.
    const data = await BusinessGiveawayService.getById(req.params.giveawayId, req.user?.id || null);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.enter = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.enter(req.user.id, req.params.giveawayId);
    res.status(201).json({ success: true, message: 'Entered giveaway', data });
  } catch (error) {
    next(error);
  }
};

exports.claim = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.claim(req.user.id, req.params.claimId, req.body);
    res.status(200).json({ success: true, message: 'Prize claimed', data });
  } catch (error) {
    next(error);
  }
};

exports.listMyClaims = async (req, res, next) => {
  try {
    const data = await BusinessGiveawayService.listMyClaims(req.user.id, { status: req.query.status });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};
