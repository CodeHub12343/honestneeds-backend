/**
 * BusinessVerification Model (BU-05)
 *
 * Stores business verification submissions (registration certificate, tax ID,
 * proof of address). Mirrors the IdentityVerification pattern: documents are
 * private and stripped from serialized output; only staff service code reads
 * the raw asset URLs. The derived badge lives on BusinessProfile.
 *
 * Status machine:
 *   pending  →  approved | rejected | needs_more_info  (admin review)
 */

const mongoose = require('mongoose');

const BUSINESS_DOCUMENT_TYPES = [
  'business_registration',
  'tax_certificate',
  'proof_of_address',
  'incorporation_certificate',
  'other',
];

const businessVerificationSchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Business legal details supplied by the applicant.
    legal_business_name: { type: String, required: true, maxlength: 200 },
    registration_number: { type: String, default: null },
    tax_id: { type: String, default: null },

    // Stored asset references (private). Stripped from API responses.
    documents: [
      {
        document_type: {
          type: String,
          enum: BUSINESS_DOCUMENT_TYPES,
          required: true,
        },
        url: { type: String, required: true },
        public_id: { type: String, default: null },
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'needs_more_info'],
      default: 'pending',
      index: true,
    },

    reviewer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    review_notes: { type: String, default: null },
    rejection_reason: { type: String, default: null },

    submitted_at: { type: Date, default: Date.now },
    reviewed_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

businessVerificationSchema.index({ status: 1, submitted_at: 1 }); // review queue
businessVerificationSchema.index({ business_id: 1, status: 1 });

/**
 * Strip private document URLs from any serialized output.
 */
businessVerificationSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  if (Array.isArray(obj.documents)) {
    obj.documents = obj.documents.map((d) => ({ document_type: d.document_type }));
  }
  return obj;
};

businessVerificationSchema.statics.findLatestForBusiness = function findLatestForBusiness(businessId) {
  return this.findOne({ business_id: businessId }).sort({ submitted_at: -1 });
};

module.exports = mongoose.model('BusinessVerification', businessVerificationSchema);
module.exports.BUSINESS_DOCUMENT_TYPES = BUSINESS_DOCUMENT_TYPES;
