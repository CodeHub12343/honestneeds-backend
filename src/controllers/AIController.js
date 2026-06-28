/**
 * AI Controller
 *
 * HTTP layer for the AI subsystem (AI-01..AI-12). Thin: validates input,
 * delegates to the feature services, and shapes the standard
 * { success, data } / { success:false, error } envelope. Service-level errors
 * carry statusCode/code and are forwarded to the global error handler.
 */

const AICampaignAssistantService = require('../services/AICampaignAssistantService');
const AIResponderService = require('../services/AIResponderService');
const AIModerationService = require('../services/AIModerationService');
const AIFraudDetectionService = require('../services/AIFraudDetectionService');
const AIRecommendationService = require('../services/AIRecommendationService');
const AIEngagementService = require('../services/AIEngagementService');
const AIProviderService = require('../services/AIProvider');
const {
  validateAdvise,
  validateDraft,
  validateModerate,
  validateQuests,
  validateTeam,
  validateCoach,
  validateResponderMessage,
  validateResponderRating,
} = require('../validators/aiValidators');

function badRequest(res, message, code = 'VALIDATION_ERROR') {
  return res.status(400).json({ success: false, error: { code, message } });
}

// ── Meta ───────────────────────────────────────────────────────────────

/** GET /api/ai/status — whether AI is configured + the feature catalog. */
exports.status = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      enabled: AIProviderService.isEnabled(),
      features: [
        'ai_responder',
        'campaign_advisor', 'campaign_writer', 'campaign_optimizer', 'fraud_detection',
        'content_moderation', 'campaign_recommendations', 'quest_generator', 'team_builder',
        'project_matching', 'mentor_coach', 'viral_score_predictor', 'donor_cause_matchmaking',
      ],
    },
  });
};

// ── AI-01 AI Responder (persistent, context-aware chat guide) ──────────

/** POST /api/ai/responder/message — send a turn (creates a session if needed). */
exports.responderMessage = async (req, res, next) => {
  try {
    const check = validateResponderMessage(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AIResponderService.sendMessage({
      userId: req.user.id,
      message: req.body.message,
      conversationId: req.body.conversation_id || null,
      page: req.body.page || null,
      campaignId: req.body.campaign_id || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/ai/responder/sessions — the user's last 10 sessions. */
exports.responderSessions = async (req, res, next) => {
  try {
    const data = await AIResponderService.listSessions(req.user.id);
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/ai/responder/sessions/:conversationId — full transcript. */
exports.responderSession = async (req, res, next) => {
  try {
    const data = await AIResponderService.getSession(req.user.id, req.params.conversationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/ai/responder/sessions/:conversationId — remove a session. */
exports.responderDeleteSession = async (req, res, next) => {
  try {
    const data = await AIResponderService.deleteSession(req.user.id, req.params.conversationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** POST /api/ai/responder/sessions/:conversationId/handoff — escalate to support. */
exports.responderHandoff = async (req, res, next) => {
  try {
    const data = await AIResponderService.requestHandoff({
      userId: req.user.id,
      conversationId: req.params.conversationId,
      reason: req.body.reason || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** POST /api/ai/responder/sessions/:conversationId/rate — leave a rating. */
exports.responderRate = async (req, res, next) => {
  try {
    const check = validateResponderRating(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AIResponderService.rateSession({
      userId: req.user.id,
      conversationId: req.params.conversationId,
      rating: req.body.rating,
      feedback: req.body.feedback || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-01 Advisor (single-shot campaign Q&A) ───────────────────────────

exports.advise = async (req, res, next) => {
  try {
    const check = validateAdvise(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AICampaignAssistantService.advise({
      question: req.body.question,
      campaignId: req.body.campaign_id || null,
      requesterId: req.user.id,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-02 Writer ───────────────────────────────────────────────────────

exports.draft = async (req, res, next) => {
  try {
    const check = validateDraft(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AICampaignAssistantService.draft({
      needType: req.body.need_type,
      brief: req.body.brief,
      goalAmount: req.body.goal_amount,
      tone: req.body.tone,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-03 Optimizer ────────────────────────────────────────────────────

exports.optimize = async (req, res, next) => {
  try {
    const data = await AICampaignAssistantService.optimize({
      campaignId: req.params.campaignId,
      requesterId: req.user.id,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-11 Viral Score ──────────────────────────────────────────────────

exports.viralScore = async (req, res, next) => {
  try {
    const data = await AICampaignAssistantService.predictViralScore({
      campaignId: req.params.campaignId,
      requesterId: req.user.id,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-05 Moderation ───────────────────────────────────────────────────

exports.moderate = async (req, res, next) => {
  try {
    const check = validateModerate(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AIModerationService.moderateText({
      content: req.body.content,
      targetType: req.body.target_type || 'other',
      targetId: req.body.target_id || null,
      userId: req.user.id,
      persist: req.body.persist !== false,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.moderationQueue = async (req, res, next) => {
  try {
    const data = await AIModerationService.listReviewQueue({
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      decision: req.query.decision || null,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.reviewModeration = async (req, res, next) => {
  try {
    const data = await AIModerationService.review({
      resultId: req.params.resultId,
      reviewerId: req.user.id,
      decision: req.body.decision,
      notes: req.body.notes || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-04 Fraud Detection ──────────────────────────────────────────────

exports.assessCampaignFraud = async (req, res, next) => {
  try {
    const data = await AIFraudDetectionService.assessCampaign({ campaignId: req.params.campaignId });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.assessUserFraud = async (req, res, next) => {
  try {
    const data = await AIFraudDetectionService.assessUser({ userId: req.params.userId });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.fraudQueue = async (req, res, next) => {
  try {
    const data = await AIFraudDetectionService.listReviewQueue({
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      subjectType: req.query.subject_type || null,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.reviewFraud = async (req, res, next) => {
  try {
    const data = await AIFraudDetectionService.review({
      assessmentId: req.params.assessmentId,
      reviewerId: req.user.id,
      decision: req.body.decision,
      notes: req.body.notes || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── AI-06 Recommendations / AI-12 Matchmaking / AI-09 Volunteer match ──

exports.recommendCampaigns = async (req, res, next) => {
  try {
    const data = await AIRecommendationService.recommendCampaigns({
      userId: req.user.id,
      limit: parseInt(req.query.limit, 10) || 10,
      refresh: req.query.refresh === 'true',
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.matchDonorToCauses = async (req, res, next) => {
  try {
    const data = await AIRecommendationService.matchDonorToCauses({
      userId: req.user.id,
      limit: parseInt(req.query.limit, 10) || 10,
      refresh: req.query.refresh === 'true',
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.matchVolunteer = async (req, res, next) => {
  try {
    const data = await AIRecommendationService.matchVolunteerToCampaigns({
      userId: req.user.id,
      skills: Array.isArray(req.body.skills) ? req.body.skills : [],
      limit: parseInt(req.query.limit, 10) || 10,
      refresh: req.query.refresh === 'true',
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

// ── AI-07 Quests / AI-08 Team / AI-10 Coach ────────────────────────────

exports.generateQuests = async (req, res, next) => {
  try {
    const check = validateQuests(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AIEngagementService.generateQuests({
      userId: req.user.id,
      count: req.body.count || 3,
      cadence: req.body.cadence || 'weekly',
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.buildTeam = async (req, res, next) => {
  try {
    const check = validateTeam(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AIEngagementService.buildTeam({
      objective: req.body.objective,
      candidates: req.body.candidates,
      teamSize: req.body.team_size || 4,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.coach = async (req, res, next) => {
  try {
    const check = validateCoach(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await AIEngagementService.coach({
      userId: req.user.id,
      message: req.body.message,
      persona: req.body.persona || 'mentor',
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
