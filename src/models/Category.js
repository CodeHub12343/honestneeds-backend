const mongoose = require('mongoose');

/**
 * Category Schema
 * Campaign categories/need types for campaign filtering and organization
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    icon: {
      type: String,
      description: 'Icon URL or emoji',
    },
    color: {
      type: String,
      description: 'Hex color for UI display',
      match: /^#[0-9a-f]{6}$/i,
    },
    // Category organization
    parent_category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      sparse: true,
    },
    sub_categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],

    // Visibility and status
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    is_visible: {
      type: Boolean,
      default: true,
    },
    display_order: {
      type: Number,
      default: 0,
    },

    // Statistics
    campaign_count: {
      type: Number,
      default: 0,
    },
    total_raised: {
      type: Number,
      default: 0,
    },

    // Metadata
    seo: {
      meta_title: String,
      meta_description: String,
      keywords: [String],
    },

    // Moderation settings
    requires_approval: {
      type: Boolean,
      default: false,
    },
    is_featured: {
      type: Boolean,
      default: false,
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes
categorySchema.index({ slug: 1 });
categorySchema.index({ is_active: 1, display_order: 1 });
categorySchema.index({ parent_category: 1 });
categorySchema.index({ is_featured: 1 });

/**
 * Middleware: Auto-generate slug from name
 */
categorySchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }
  next();
});

/**
 * Static method to get all active categories
 */
categorySchema.statics.getActiveCategories = async function (includeCount = false) {
  return this.find({ is_active: true })
    .sort({ display_order: 1, name: 1 })
    .lean();
};

/**
 * Static method to get featured categories
 */
categorySchema.statics.getFeaturedCategories = async function () {
  return this.find({ is_active: true, is_featured: true })
    .sort({ display_order: 1 })
    .lean();
};

/**
 * Static method to get category by slug
 */
categorySchema.statics.getBySlug = async function (slug) {
  return this.findOne({ slug, is_active: true }).lean();
};

/**
 * Static method to get top categories by campaign count
 */
categorySchema.statics.getTopCategories = async function (limit = 10) {
  return this.find({ is_active: true })
    .sort({ campaign_count: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to increment campaign count
 */
categorySchema.statics.incrementCount = async function (categoryId, amount = 1) {
  return this.findByIdAndUpdate(
    categoryId,
    { $inc: { campaign_count: amount } },
    { new: true }
  );
};

/**
 * Static method to update total raised
 */
categorySchema.statics.updateTotalRaised = async function (categoryId, amount) {
  return this.findByIdAndUpdate(
    categoryId,
    { $inc: { total_raised: amount } },
    { new: true }
  );
};

/**
 * Instance method to get sub-categories
 */
categorySchema.methods.getSubCategories = async function () {
  return this.constructor
    .find({ parent_category: this._id, is_active: true })
    .lean();
};

/**
 * Instance method to activate category
 */
categorySchema.methods.activate = async function () {
  this.is_active = true;
  return this.save();
};

/**
 * Instance method to deactivate category
 */
categorySchema.methods.deactivate = async function () {
  this.is_active = false;
  return this.save();
};

module.exports = mongoose.model('Category', categorySchema);
