/**
 * PersonaController — HTTP boundary for the Persona identity flow.
 *
 * Routes mounted at /api/verification/persona:
 *   POST   /start      — start (or resume) an inquiry; returns {inquiry_id, session_token}
 *   GET    /me         — the signed-in user's current Persona inquiry state
 *
 * Admin:
 *   PATCH  /:submissionId/review — reuse the generic review path via VerificationService
 */

const VerificationService = require('../services/VerificationService');
const IdentityVerification = require('../models/IdentityVerification');
const { t } = require('../i18n/t');
const winstonLogger = require('../utils/winstonLogger');

function forward(next, error) {
  if (!error.statusCode) error.statusCode = 500;
  if (!error.code) error.code = 'INTERNAL_ERROR';
  return next(error);
}

exports.start = async (req, res, next) => {
  try {
    const enabled = await VerificationService.isPersonaEnabled({
      userId: req.user.id,
      role: req.user.roles && req.user.roles[0],
    });
    if (!enabled) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'PERSONA_DISABLED',
          message: 'Persona identity verification is not available. Please use the standard upload flow.',
        },
      });
    }
    const metadata = (req.body && typeof req.body.metadata === 'object') ? req.body.metadata : {};
    const result = await VerificationService.startPersonaInquiry({ userId: req.user.id, metadata });
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    winstonLogger.error('PersonaController.start error', {
      userId: req.user && req.user.id,
      message: error.message,
    });
    return forward(next, error);
  }
};

exports.getMine = async (req, res, next) => {
  try {
    const submission = await IdentityVerification.findOne({
      user_id: req.user.id,
      persona_inquiry_id: { $ne: null },
    })
      .sort({ submitted_at: -1 })
      .lean();

    if (!submission) {
      return res.json({ success: true, data: null });
    }
    // toJSON strips credentials; .lean() means we build the safe shape by hand.
    return res.json({
      success: true,
      data: {
        submission_id: String(submission._id),
        status: submission.status,
        persona_inquiry_id: submission.persona_inquiry_id,
        persona_report_id: submission.persona_report_id || null,
        webhook_last_event_at: submission.webhook_last_event_at,
        automated_checks: submission.automated_checks || null,
        submitted_at: submission.submitted_at,
        locale_message: submission.status === 'approved'
          ? t(req, 'auth.logged_out') // reuse an existing OK key; placeholder for a future 'identity.approved'
          : undefined,
      },
    });
  } catch (error) {
    return forward(next, error);
  }
};
