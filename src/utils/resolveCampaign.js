/**
 * Campaign id resolution
 * -------------------------------------------------------------------------
 * A campaign is reachable by TWO identifiers, and both appear in real URLs:
 *
 *   - the Mongo `_id`            e.g. 6a90a6714a4a65a6afcbf26f
 *   - the human `campaign_id`    e.g. CAMP-2026-221-C7F0E9
 *
 * The campaign detail page is happy to be opened with either, which means any
 * endpoint taking `:id` can receive either. Code that assumes `_id` and calls
 * `Campaign.findById()` directly throws a CastError ("Cast to ObjectId failed")
 * and surfaces as a 500 — a server error for what is really a valid request in
 * the other supported format.
 *
 * These helpers accept both forms so callers stop having to care.
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');

/**
 * Is this string shaped like a Mongo ObjectId?
 *
 * `mongoose.isValidObjectId` is deliberately not used on its own: it returns
 * true for any 12-character string, so a human ref of exactly that length
 * would be misread as an id.
 *
 * @param {*} value
 * @returns {boolean}
 */
function looksLikeObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Load a campaign by either identifier.
 *
 * @param {string} idOrRef - Mongo _id or human campaign_id
 * @param {Object} [options]
 * @param {string} [options.select] - projection passed to the query
 * @param {boolean} [options.lean] - return a plain object
 * @returns {Promise<Object|null>} the campaign, or null if no match
 */
async function findCampaignByAnyId(idOrRef, { select, lean = false } = {}) {
  if (!idOrRef) return null;

  const applyOptions = (query) => {
    if (select) query.select(select);
    if (lean) query.lean();
    return query;
  };

  if (looksLikeObjectId(String(idOrRef))) {
    const byId = await applyOptions(Campaign.findById(idOrRef));
    if (byId) return byId;
  }

  return applyOptions(Campaign.findOne({ campaign_id: idOrRef }));
}

/**
 * Resolve either identifier to the campaign's Mongo `_id`.
 *
 * Useful at a controller boundary, so everything downstream can keep assuming
 * an ObjectId without each service needing its own lookup.
 *
 * @param {string} idOrRef
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function resolveCampaignObjectId(idOrRef) {
  if (!idOrRef) return null;

  // A well-formed ObjectId still needs to exist, but callers that only want to
  // normalise the format shouldn't pay for a lookup when it already is one.
  if (looksLikeObjectId(String(idOrRef))) {
    return new mongoose.Types.ObjectId(String(idOrRef));
  }

  const campaign = await Campaign.findOne({ campaign_id: idOrRef }).select('_id').lean();
  return campaign ? campaign._id : null;
}

module.exports = {
  looksLikeObjectId,
  findCampaignByAnyId,
  resolveCampaignObjectId,
};
