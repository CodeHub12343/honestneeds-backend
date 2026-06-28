/**
 * Profile & Verification request validators.
 * Lightweight, dependency-free shape checks used by the profile/verification
 * controllers. Each returns { valid: boolean, error?: string }.
 */

const DOCUMENT_TYPES = ['drivers_license', 'state_id', 'passport'];
const REVIEW_DECISIONS = ['approve', 'reject', 'needs_more_info'];

/** Validate the profile update payload (all fields optional). */
function validateProfileUpdate(body = {}) {
  if (body.username !== undefined && body.username !== null && body.username !== '') {
    if (!/^[a-z0-9_.]{3,30}$/i.test(String(body.username))) {
      return { valid: false, error: 'Username must be 3-30 chars (letters, numbers, _ or .)' };
    }
  }
  if (body.bio !== undefined && typeof body.bio === 'string' && body.bio.length > 2000) {
    return { valid: false, error: 'Bio must not exceed 2000 characters' };
  }
  if (body.creator_profile?.personal_story && body.creator_profile.personal_story.length > 5000) {
    return { valid: false, error: 'Personal story must not exceed 5000 characters' };
  }
  if (body.interests !== undefined && !Array.isArray(body.interests)) {
    return { valid: false, error: 'interests must be an array of cause codes' };
  }
  return { valid: true };
}

/** Validate an asset reference produced by the upload endpoint. */
function isValidAsset(asset) {
  return asset && typeof asset === 'object' && typeof asset.url === 'string' && asset.url.length > 0;
}

/** Validate the identity submission payload. */
function validateIdentitySubmission(body = {}) {
  if (!DOCUMENT_TYPES.includes(body.document_type)) {
    return { valid: false, error: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}` };
  }
  if (!isValidAsset(body.front)) {
    return { valid: false, error: 'A document image (front) is required' };
  }
  if (!isValidAsset(body.selfie)) {
    return { valid: false, error: 'A selfie image is required' };
  }
  if (body.tier && !['basic', 'premium'].includes(body.tier)) {
    return { valid: false, error: 'tier must be "basic" or "premium"' };
  }
  return { valid: true };
}

/** Validate the staff review payload. */
function validateReview(body = {}) {
  if (!REVIEW_DECISIONS.includes(body.decision)) {
    return { valid: false, error: `decision must be one of: ${REVIEW_DECISIONS.join(', ')}` };
  }
  if (body.decision === 'reject' && !body.rejection_reason) {
    return { valid: false, error: 'rejection_reason is required when rejecting' };
  }
  return { valid: true };
}

module.exports = {
  DOCUMENT_TYPES,
  REVIEW_DECISIONS,
  validateProfileUpdate,
  validateIdentitySubmission,
  validateReview,
};
