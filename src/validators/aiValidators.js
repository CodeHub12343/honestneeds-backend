/**
 * AI request validators.
 * Lightweight, dependency-free shape checks for the AI endpoints (AI-01..AI-12).
 * Each returns { valid: boolean, error?: string }.
 */

const COACH_PERSONAS = ['encourager', 'strategist', 'mentor'];

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** AI-01 advisor */
function validateAdvise(body = {}) {
  if (!nonEmptyString(body.question)) return { valid: false, error: 'question is required' };
  if (body.question.length > 2000) return { valid: false, error: 'question must not exceed 2000 characters' };
  return { valid: true };
}

/** AI-02 writer */
function validateDraft(body = {}) {
  if (!nonEmptyString(body.brief)) return { valid: false, error: 'brief is required' };
  if (body.brief.length > 4000) return { valid: false, error: 'brief must not exceed 4000 characters' };
  if (body.goal_amount !== undefined && (typeof body.goal_amount !== 'number' || body.goal_amount < 0)) {
    return { valid: false, error: 'goal_amount must be a non-negative number' };
  }
  return { valid: true };
}

/** AI-05 moderation */
function validateModerate(body = {}) {
  if (!nonEmptyString(body.content)) return { valid: false, error: 'content is required' };
  if (body.content.length > 20000) return { valid: false, error: 'content must not exceed 20000 characters' };
  return { valid: true };
}

/** AI-07 quest generator */
function validateQuests(body = {}) {
  if (body.count !== undefined && (!Number.isInteger(body.count) || body.count < 1 || body.count > 10)) {
    return { valid: false, error: 'count must be an integer between 1 and 10' };
  }
  if (body.cadence !== undefined && !['daily', 'weekly'].includes(body.cadence)) {
    return { valid: false, error: 'cadence must be "daily" or "weekly"' };
  }
  return { valid: true };
}

/** AI-08 team builder */
function validateTeam(body = {}) {
  if (!nonEmptyString(body.objective)) return { valid: false, error: 'objective is required' };
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    return { valid: false, error: 'candidates must be a non-empty array' };
  }
  if (body.candidates.some((c) => !c || c.id === undefined)) {
    return { valid: false, error: 'each candidate requires an id' };
  }
  if (body.team_size !== undefined && (!Number.isInteger(body.team_size) || body.team_size < 1 || body.team_size > 20)) {
    return { valid: false, error: 'team_size must be an integer between 1 and 20' };
  }
  return { valid: true };
}

/** AI-10 coach */
function validateCoach(body = {}) {
  if (!nonEmptyString(body.message)) return { valid: false, error: 'message is required' };
  if (body.message.length > 4000) return { valid: false, error: 'message must not exceed 4000 characters' };
  if (body.persona !== undefined && !COACH_PERSONAS.includes(body.persona)) {
    return { valid: false, error: `persona must be one of: ${COACH_PERSONAS.join(', ')}` };
  }
  return { valid: true };
}

/** AI-01 responder — send a chat message */
function validateResponderMessage(body = {}) {
  if (!nonEmptyString(body.message)) return { valid: false, error: 'message is required' };
  if (body.message.length > 4000) return { valid: false, error: 'message must not exceed 4000 characters' };
  if (body.conversation_id !== undefined && !nonEmptyString(body.conversation_id)) {
    return { valid: false, error: 'conversation_id must be a non-empty string when provided' };
  }
  if (body.page !== undefined && typeof body.page !== 'string') {
    return { valid: false, error: 'page must be a string' };
  }
  return { valid: true };
}

/** AI-01 responder — rate a session */
function validateResponderRating(body = {}) {
  const rating = body.rating;
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { valid: false, error: 'rating must be a number between 1 and 5' };
  }
  if (body.feedback !== undefined && typeof body.feedback !== 'string') {
    return { valid: false, error: 'feedback must be a string' };
  }
  if (typeof body.feedback === 'string' && body.feedback.length > 2000) {
    return { valid: false, error: 'feedback must not exceed 2000 characters' };
  }
  return { valid: true };
}

module.exports = {
  COACH_PERSONAS,
  validateResponderMessage,
  validateResponderRating,
  validateAdvise,
  validateDraft,
  validateModerate,
  validateQuests,
  validateTeam,
  validateCoach,
};
