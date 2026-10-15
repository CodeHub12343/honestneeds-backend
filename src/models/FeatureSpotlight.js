/**
 * FeatureSpotlight — the single registry the frontend reads to decide what
 * to surface on the home page, in /whats-new, and as "New" dots on nav items.
 *
 * One row = one feature a user might not know exists yet. The frontend treats
 * this as data: all three discovery surfaces (hero carousel, directory page,
 * nav dot) render from the same list, filtered by audience and dismissal.
 *
 * Dismissal is per-user and lives on User.dismissed_spotlights (an array of
 * spotlight keys) so this collection stays stateless and cacheable.
 */

const mongoose = require('mongoose');

const AUDIENCES = [
  'any',           // every signed-in and anonymous visitor
  'anonymous',     // only shown while logged out (e.g. "Create an account")
  'authenticated', // only shown while logged in
  'creator',       // user has at least one campaign
  'volunteer',     // user has volunteer flag
  'veteran',       // user has veteran profile
  'new_user',      // account age < 14 days
];

const SURFACES = ['hero', 'directory', 'nav_badge'];

const featureSpotlightSchema = new mongoose.Schema(
  {
    // Stable identifier the frontend keys off — never change once published.
    key: { type: String, required: true, unique: true, index: true },

    title: { type: String, required: true, maxlength: 80 },
    subtitle: { type: String, required: true, maxlength: 200 },
    // One sentence for the directory page card body.
    body: { type: String, default: null, maxlength: 500 },

    // Where it points. Relative in-app paths; external links allowed with http(s).
    href: { type: String, required: true, maxlength: 500 },
    cta_label: { type: String, default: 'Try it', maxlength: 40 },

    // Lucide icon name the frontend maps to a component. Kept as a string so
    // the registry can introduce new icons without a schema change.
    icon: { type: String, default: 'Sparkles', maxlength: 40 },

    // Accent color key the frontend resolves to a token. Kept open-ended for
    // the same reason as icon.
    accent: { type: String, default: 'red', maxlength: 20 },

    // Which audience sees it. First match wins on the frontend.
    audience: {
      type: String,
      enum: AUDIENCES,
      default: 'any',
      index: true,
    },

    // Where the frontend may render it. If a surface isn't listed, it stays
    // off that surface even when active.
    surfaces: {
      type: [{ type: String, enum: SURFACES }],
      default: ['hero', 'directory'],
    },

    // Ordering within a surface. Lower = earlier.
    priority: { type: Number, default: 100 },

    // Whether this spotlight is currently published.
    active: { type: Boolean, default: true, index: true },

    // Up to this moment, the "New" affordance is shown. After it, the feature
    // still appears in the directory but without the NEW dot.
    is_new_until: { type: Date, default: null },

    // Optional window — leaves the row dormant outside it.
    starts_at: { type: Date, default: null },
    ends_at: { type: Date, default: null },

    // Audit.
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

featureSpotlightSchema.index({ active: 1, priority: 1 });

module.exports = mongoose.model('FeatureSpotlight', featureSpotlightSchema);
module.exports.AUDIENCES = AUDIENCES;
module.exports.SURFACES = SURFACES;
