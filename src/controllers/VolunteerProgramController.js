/**
 * Volunteer Program Controller (VO-03, VO-04, VO-05, VO-06, VO-07)
 *
 * HTTP layer for volunteer hour logging + verification, XP/level/badge progress,
 * leaderboards, proof-of-kindness, and reference letters. Thin wrappers around
 * VolunteerProgramService; service errors carry statusCode/code for the shared
 * error handler.
 */

const VolunteerProgramService = require('../services/VolunteerProgramService');

function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

// ── VO-03: Hour logging ──────────────────────────────────────────

exports.logHours = async (req, res, next) => {
  try {
    if (req.body.hours === undefined || !req.body.activity_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'hours and activity_date are required' },
      });
    }
    const data = await VolunteerProgramService.logHours(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Hours logged (pending verification)', data });
  } catch (error) {
    next(error);
  }
};

exports.listMyHourLogs = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.listMyHourLogs(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.cancelHourLog = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.cancelHourLog(req.user.id, req.params.logId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.listLogsForVerification = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.listLogsForVerification(req.user.id, {
      campaign_id: req.query.campaign_id,
      opportunity_id: req.query.opportunity_id,
      status: req.query.status,
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.verifyHourLog = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.verifyHourLog(req.user.id, req.params.logId, {
      decision: req.body.decision,
      proof_of_kindness: req.body.proof_of_kindness,
      note: req.body.note,
      isAdmin: isAdmin(req),
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

// ── VO-04: Progress / badges ─────────────────────────────────────

exports.getMyProgress = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.getProgress(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── VO-05: Leaderboard ───────────────────────────────────────────

exports.getLeaderboard = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.getLeaderboard({
      metric: req.query.metric === 'xp' ? 'xp' : 'hours',
      type: req.query.type,
      limit: parseInt(req.query.limit, 10) || 20,
    });
    res.status(200).json({ success: true, metric: req.query.metric === 'xp' ? 'xp' : 'hours', leaderboard: data });
  } catch (error) {
    next(error);
  }
};

// ── VO-07: Reference letters ─────────────────────────────────────

exports.requestReference = async (req, res, next) => {
  try {
    if (!req.body.referrer_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'referrer_id is required' },
      });
    }
    const data = await VolunteerProgramService.requestReference(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Reference requested', data });
  } catch (error) {
    next(error);
  }
};

exports.issueReference = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.issueReference(req.user.id, {
      ...req.body,
      isAdmin: isAdmin(req),
    });
    res.status(200).json({ success: true, message: 'Reference issued', data });
  } catch (error) {
    next(error);
  }
};

exports.declineReference = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.declineReference(
      req.user.id,
      req.params.letterId,
      req.body.reason || null,
      isAdmin(req)
    );
    res.status(200).json({ success: true, message: 'Reference declined', data });
  } catch (error) {
    next(error);
  }
};

exports.listMyReferences = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.listMyReferences(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.listReferenceRequests = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.listReferenceRequests(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.setReferenceVisibility = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.setReferenceVisibility(
      req.user.id,
      req.params.letterId,
      req.body.is_public
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getPublicReference = async (req, res, next) => {
  try {
    const data = await VolunteerProgramService.getPublicReference(req.params.token);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
