/**
 * Business Features request validators (BU-01..BU-07).
 * Lightweight, dependency-free shape checks. Each returns
 * { valid: boolean, error?: string }. Mirrors profileValidators style.
 */

const { BUSINESS_INDUSTRIES } = require('../models/BusinessProfile');
const { BUSINESS_DOCUMENT_TYPES } = require('../models/BusinessVerification');
const { OPPORTUNITY_CATEGORIES } = require('../models/VolunteerOpportunity');
const { GIVEAWAY_TYPES } = require('../models/BusinessGiveaway');

const REVIEW_DECISIONS = ['approve', 'reject', 'needs_more_info'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** BU-01: create business profile (business_name required). */
function validateBusinessProfileCreate(body = {}) {
  if (!isNonEmptyString(body.business_name)) {
    return { valid: false, error: 'business_name is required' };
  }
  if (body.business_name.trim().length < 2 || body.business_name.length > 120) {
    return { valid: false, error: 'business_name must be 2-120 characters' };
  }
  if (body.industry && !BUSINESS_INDUSTRIES.includes(body.industry)) {
    return { valid: false, error: `industry must be one of: ${BUSINESS_INDUSTRIES.join(', ')}` };
  }
  return { valid: true };
}

/** BU-01: update business profile (all fields optional). */
function validateBusinessProfileUpdate(body = {}) {
  if (body.business_name !== undefined) {
    if (!isNonEmptyString(body.business_name) || body.business_name.length > 120) {
      return { valid: false, error: 'business_name must be 2-120 characters' };
    }
  }
  if (body.industry !== undefined && !BUSINESS_INDUSTRIES.includes(body.industry)) {
    return { valid: false, error: `industry must be one of: ${BUSINESS_INDUSTRIES.join(', ')}` };
  }
  if (body.description !== undefined && String(body.description).length > 5000) {
    return { valid: false, error: 'description must not exceed 5000 characters' };
  }
  return { valid: true };
}

/** BU-05: business verification submission. */
function validateBusinessVerification(body = {}) {
  if (!isNonEmptyString(body.legal_business_name)) {
    return { valid: false, error: 'legal_business_name is required' };
  }
  if (!Array.isArray(body.documents) || body.documents.length === 0) {
    return { valid: false, error: 'At least one document is required' };
  }
  for (const doc of body.documents) {
    if (!doc || !BUSINESS_DOCUMENT_TYPES.includes(doc.document_type)) {
      return { valid: false, error: `Each document needs a valid document_type: ${BUSINESS_DOCUMENT_TYPES.join(', ')}` };
    }
    if (!isNonEmptyString(doc.url)) {
      return { valid: false, error: 'Each document needs a url' };
    }
  }
  return { valid: true };
}

/** Staff review payload (shared shape with profile reviews). */
function validateReview(body = {}) {
  if (!REVIEW_DECISIONS.includes(body.decision)) {
    return { valid: false, error: `decision must be one of: ${REVIEW_DECISIONS.join(', ')}` };
  }
  if (body.decision === 'reject' && !isNonEmptyString(body.rejection_reason)) {
    return { valid: false, error: 'rejection_reason is required when rejecting' };
  }
  return { valid: true };
}

/** BU-06: create volunteer opportunity. */
function validateOpportunityCreate(body = {}) {
  if (!isNonEmptyString(body.title) || body.title.trim().length < 5 || body.title.length > 200) {
    return { valid: false, error: 'title must be 5-200 characters' };
  }
  if (!isNonEmptyString(body.description) || body.description.trim().length < 20) {
    return { valid: false, error: 'description must be at least 20 characters' };
  }
  if (!OPPORTUNITY_CATEGORIES.includes(body.category)) {
    return { valid: false, error: `category must be one of: ${OPPORTUNITY_CATEGORIES.join(', ')}` };
  }
  if (body.slots_available !== undefined && (!Number.isInteger(body.slots_available) || body.slots_available < 1)) {
    return { valid: false, error: 'slots_available must be a positive integer' };
  }
  return { valid: true };
}

/** BU-06: volunteer applies to an opportunity. */
function validateApplication(body = {}) {
  if (body.message !== undefined && String(body.message).length > 2000) {
    return { valid: false, error: 'message must not exceed 2000 characters' };
  }
  if (body.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email)) {
    return { valid: false, error: 'contact_email is invalid' };
  }
  if (body.application_answers !== undefined) {
    if (!Array.isArray(body.application_answers)) {
      return { valid: false, error: 'application_answers must be an array' };
    }
    if (body.application_answers.length > 40) {
      return { valid: false, error: 'application_answers cannot exceed 40 items' };
    }
    for (const a of body.application_answers) {
      if (!a || !isNonEmptyString(a.key)) {
        return { valid: false, error: 'each application answer needs a key' };
      }
    }
  }
  return { valid: true };
}

/** BU-07: create a giveaway. */
function validateGiveawayCreate(body = {}) {
  if (!isNonEmptyString(body.title) || body.title.trim().length < 5 || body.title.length > 200) {
    return { valid: false, error: 'title must be 5-200 characters' };
  }
  if (!isNonEmptyString(body.description)) {
    return { valid: false, error: 'description is required' };
  }
  if (!GIVEAWAY_TYPES.includes(body.giveaway_type)) {
    return { valid: false, error: `giveaway_type must be one of: ${GIVEAWAY_TYPES.join(', ')}` };
  }
  if (!body.ends_at || Number.isNaN(Date.parse(body.ends_at))) {
    return { valid: false, error: 'ends_at must be a valid date' };
  }
  if (new Date(body.ends_at) <= new Date()) {
    return { valid: false, error: 'ends_at must be in the future' };
  }
  if (body.winners_count !== undefined && (!Number.isInteger(body.winners_count) || body.winners_count < 1)) {
    return { valid: false, error: 'winners_count must be a positive integer' };
  }
  if (body.estimated_value_cents !== undefined && (typeof body.estimated_value_cents !== 'number' || body.estimated_value_cents < 0)) {
    return { valid: false, error: 'estimated_value_cents must be a non-negative number' };
  }
  return { valid: true };
}

module.exports = {
  REVIEW_DECISIONS,
  validateBusinessProfileCreate,
  validateBusinessProfileUpdate,
  validateBusinessVerification,
  validateReview,
  validateOpportunityCreate,
  validateApplication,
  validateGiveawayCreate,
};
