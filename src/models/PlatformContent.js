const mongoose = require('mongoose');

/**
 * PlatformContent Schema
 * CMS content for static pages: manifesto, about, terms, privacy, etc.
 */
const platformContentSchema = new mongoose.Schema(
  {
    content_type: {
      type: String,
      required: true,
      enum: [
        'manifesto',
        'about_us',
        'terms_of_service',
        'privacy_policy',
        'how_it_works',
        'faqs',
        'contact_info',
        'social_media_links',
        'press_kit',
        'blog_footer',
        'custom_page',
      ],
      unique: true,
      index: true,
    },

    // Content
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    summary: {
      type: String,
      maxlength: 500,
    },

    // HTML/Rich content support
    is_rich_text: {
      type: Boolean,
      default: true,
    },

    // SEO
    seo: {
      meta_title: String,
      meta_description: {
        type: String,
        maxlength: 160,
      },
      keywords: [String],
      og_image: String,
      og_description: String,
    },

    // Publishing settings
    is_published: {
      type: Boolean,
      default: false,
      index: true,
    },
    publish_date: Date,
    scheduled_publish_date: Date,

    // Versioning
    version: {
      type: Number,
      default: 1,
    },
    version_history: [
      {
        version_number: Number,
        content: String,
        changed_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        change_reason: String,
        created_at: Date,
      },
    ],

    // Media attachments
    featured_image: String,
    media: [
      {
        url: String,
        type: {
          type: String,
          enum: ['image', 'video', 'document'],
        },
        caption: String,
      },
    ],

    // Metadata
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    editor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Localization
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'pt', 'ar'],
    },

    // Display settings
    display_order: {
      type: Number,
      default: 0,
    },
    template: {
      type: String,
      enum: ['standard', 'two_column', 'three_column', 'full_width'],
      default: 'standard',
    },

    // Internal notes
    internal_notes: String,

    // Visibility
    is_visible: {
      type: Boolean,
      default: true,
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
platformContentSchema.index({ is_published: 1, publish_date: -1 });
platformContentSchema.index({ language: 1, is_published: 1 });
platformContentSchema.index({ slug: 1 });
platformContentSchema.index({ content_type: 1 });

/**
 * Middleware: Auto-generate slug from title if not provided
 */
platformContentSchema.pre('save', function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }
  next();
});

/**
 * Static method to create version on update
 */
platformContentSchema.pre('save', function (next) {
  if (this.isModified('content') && !this.isNew) {
    const currentVersion = {
      version_number: this.version,
      content: this.constructor.findById(this._id).select('content'),
      changed_by: this.editor,
      change_reason: 'Updated via admin panel',
      created_at: new Date(),
    };
    this.version += 1;
    this.version_history.push(currentVersion);
  }
  next();
});

/**
 * Static method to get published content by type
 */
platformContentSchema.statics.getPublishedContent = async function (contentType, language = 'en') {
  return this.findOne({
    content_type: contentType,
    language,
    is_published: true,
  }).lean();
};

/**
 * Static method to get all published content
 */
platformContentSchema.statics.getAllPublishedContent = async function (language = 'en') {
  return this.find({
    is_published: true,
    language,
    is_visible: true,
  })
    .sort({ display_order: 1 })
    .lean();
};

/**
 * Static method to publish content
 */
platformContentSchema.statics.publishContent = async function (contentId) {
  return this.findByIdAndUpdate(
    contentId,
    {
      is_published: true,
      publish_date: new Date(),
    },
    { new: true }
  );
};

/**
 * Static method to unpublish content
 */
platformContentSchema.statics.unpublishContent = async function (contentId) {
  return this.findByIdAndUpdate(
    contentId,
    {
      is_published: false,
    },
    { new: true }
  );
};

/**
 * Static method to schedule content
 */
platformContentSchema.statics.schedulePublish = async function (contentId, publishDate) {
  return this.findByIdAndUpdate(
    contentId,
    {
      scheduled_publish_date: publishDate,
    },
    { new: true }
  );
};

/**
 * Instance method to restore to previous version
 */
platformContentSchema.methods.restoreVersion = async function (versionNumber) {
  const versionData = this.version_history.find((v) => v.version_number === versionNumber);
  if (!versionData) {
    throw new Error('Version not found');
  }
  this.content = versionData.content;
  this.version = versionNumber;
  return this.save();
};

module.exports = mongoose.model('PlatformContent', platformContentSchema);
