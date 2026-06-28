/**
 * Hope Responder Controller (VO-08 "Need Now")
 *
 * HTTP layer for Hope Responder enrollment and emergency Need Now requests.
 * Thin wrappers around HopeResponderService.
 */

const HopeResponderService = require('../services/HopeResponderService');

function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

// ── Responder enrollment ─────────────────────────────────────────

exports.enroll = async (req, res, next) => {
  try {
    const data = await HopeResponderService.enroll(req.user.id, req.body);
    res.status(200).json({ success: true, message: 'Hope Responder enrollment saved', data });
  } catch (error) {
    next(error);
  }
};

exports.setAvailability = async (req, res, next) => {
  try {
    const data = await HopeResponderService.setAvailability(req.user.id, !!req.body.active);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.verifyResponder = async (req, res, next) => {
  try {
    const data = await HopeResponderService.verifyResponder(
      req.params.userId,
      req.body.verified !== false
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── Need Now requests ────────────────────────────────────────────

exports.createRequest = async (req, res, next) => {
  try {
    const required = ['title', 'description', 'category'];
    const missing = required.filter((f) => !req.body[f]);
    if (missing.length) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Missing required fields: ${missing.join(', ')}` },
      });
    }
    const data = await HopeResponderService.createRequest(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Need Now request dispatched', ...data });
  } catch (error) {
    next(error);
  }
};

exports.browseRequests = async (req, res, next) => {
  try {
    const data = await HopeResponderService.browseRequests(req.query, req.user?.id || null);
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.listMyRequests = async (req, res, next) => {
  try {
    const data = await HopeResponderService.listMyRequests(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.getRequestById = async (req, res, next) => {
  try {
    const data = await HopeResponderService.getRequestById(req.params.requestId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.acceptRequest = async (req, res, next) => {
  try {
    const data = await HopeResponderService.acceptRequest(req.user.id, req.params.requestId);
    res.status(200).json({ success: true, message: 'Response accepted', data });
  } catch (error) {
    next(error);
  }
};

exports.updateResponderStatus = async (req, res, next) => {
  try {
    const data = await HopeResponderService.updateResponderStatus(
      req.user.id,
      req.params.requestId,
      req.body.status
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.resolveRequest = async (req, res, next) => {
  try {
    const data = await HopeResponderService.resolveRequest(req.user.id, req.params.requestId, {
      note: req.body.note,
      isAdmin: isAdmin(req),
    });
    res.status(200).json({ success: true, message: 'Request resolved', data });
  } catch (error) {
    next(error);
  }
};

exports.cancelRequest = async (req, res, next) => {
  try {
    const data = await HopeResponderService.cancelRequest(req.user.id, req.params.requestId, isAdmin(req));
    res.status(200).json({ success: true, message: 'Request cancelled', data });
  } catch (error) {
    next(error);
  }
};
