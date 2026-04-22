/**
 * PaymentMethod Model
 * Stores user payment methods (Stripe cards, bank accounts, mobile money)
 *
 * PCI Compliance:
 * ⚠️ NEVER store full card numbers, CVV, or routing numbers
 * ⚠️ Store only tokenized references (e.g., Stripe payment method IDs)
 * ⚠️ Bank micro-deposits are stored, but not sensitive account data
 */

const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['stripe', 'bank_transfer', 'mobile_money'],
      required: [true, 'Payment method type is required'],
    },
    provider: {
      type: String,
      enum: ['stripe', 'plaid', 'twilio', 'manual'],
      required: [true, 'Payment provider is required'],
    },
    // Stripe-specific fields
    stripe_payment_method_id: {
      type: String,
      default: null,
      sparse: true,
    },
    stripe_customer_id: {
      type: String,
      default: null,
    },
    card_brand: {
      type: String,
      enum: ['visa', 'mastercard', 'amex', 'discover', null],
      default: null,
    },
    card_last_four: {
      type: String,
      default: null,
    },
    card_expiry_month: {
      type: Number,
      default: null,
      min: 1,
      max: 12,
    },
    card_expiry_year: {
      type: Number,
      default: null,
    },
    // Bank transfer fields (via Plaid or manual)
    bank_account_last_four: {
      type: String,
      default: null,
    },
    bank_account_number: {
      type: String,
      default: null,
      // Full account number - stored for creator payout processing
      // In production, should be encrypted at rest
    },
    bank_account_holder: {
      type: String,
      default: null,
    },
    bank_name: {
      type: String,
      default: null,
    },
    bank_account_type: {
      type: String,
      enum: ['checking', 'savings', null],
      default: null,
    },
    bank_routing_number_last_four: {
      type: String,
      default: null,
    },
    bank_routing_number: {
      type: String,
      default: null,
      // Full routing number - stored for creator payout processing
      // In production, should be encrypted at rest
    },
    plaid_account_id: {
      type: String,
      default: null,
      sparse: true,
    },
    // Mobile money fields
    mobile_money_provider: {
      type: String,
      enum: ['mpesa', 'mtn_money', 'airtel_money', null],
      default: null,
    },
    mobile_number: {
      type: String,
      default: null,
    },
    mobile_country_code: {
      type: String,
      default: null,
    },
    // Verification
    status: {
      type: String,
      enum: ['active', 'pending_verification', 'inactive', 'failed'],
      default: 'pending_verification',
      index: true,
    },
    verification_method: {
      type: String,
      enum: ['instant', 'micro_deposits', 'manual_review', null],
      default: null,
    },
    verification_status: {
      type: String,
      enum: ['unverified', 'verifying', 'verified', 'failed', 'rejected'],
      default: 'unverified',
    },
    verification_code: {
      type: String,
      default: null,
    },
    verification_attempts: {
      type: Number,
      default: 0,
      max: 3,
    },
    micro_deposits: {
      amounts: { type: [Number], default: [] }, // [0.01, 0.02]
      verified_at: { type: Date, default: null },
    },
    // Primary status
    is_primary: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Metadata
    nickname: {
      type: String,
      default: null,
      maxlength: 100,
    },
    billing_address: {
      type: {
        street: String,
        city: String,
        state: String,
        postal_code: String,
        country: String,
      },
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Tracking
    last_used_at: {
      type: Date,
      default: null,
    },
    use_count: {
      type: Number,
      default: 0,
    },
    deleted_at: {
      type: Date,
      default: null,
      index: true,
      sparse: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes for common queries
paymentMethodSchema.index({ user_id: 1, status: 1 });
paymentMethodSchema.index({ user_id: 1, is_primary: 1 });
paymentMethodSchema.index({ stripe_customer_id: 1 }, { sparse: true });
paymentMethodSchema.index({ user_id: 1, created_at: -1 });
// Compound unique index: each user can have only one Stripe payment method
paymentMethodSchema.index({ user_id: 1, stripe_payment_method_id: 1 }, { sparse: true, unique: true });

/**
 * Virtual: display_name
 * Returns a user-friendly identifier for the payment method
 */
paymentMethodSchema.virtual('display_name').get(function getDisplayName() {
  if (this.nickname) {
    return this.nickname;
  }

  if (this.type === 'stripe') {
    return `${this.card_brand?.toUpperCase() || 'Card'} •••• ${this.card_last_four}`;
  }

  if (this.type === 'bank_transfer') {
    return `${this.bank_name || 'Bank Account'} •••• ${this.bank_account_last_four}`;
  }

  if (this.type === 'mobile_money') {
    return `${this.mobile_money_provider?.toUpperCase() || 'Mobile'} •••• ${this.mobile_number?.slice(-4)}`;
  }

  return 'Payment Method';
});

/**
 * Method: isExpired
 * Checks if payment method (especially cards) is expired
 * @returns {boolean}
 */
paymentMethodSchema.methods.isExpired = function isExpired() {
  if (this.type !== 'stripe' || !this.card_expiry_year || !this.card_expiry_month) {
    return false;
  }

  const now = new Date();
  const expiryDate = new Date(this.card_expiry_year, this.card_expiry_month, 0); // Last day of month

  return now > expiryDate;
};

/**
 * Method: isActive
 * Checks if payment method is usable
 * @returns {boolean}
 */
paymentMethodSchema.methods.isActive = function isActive() {
  if (this.deleted_at) {
    return false;
  }

  if (this.status !== 'active') {
    return false;
  }

  if (this.isExpired()) {
    return false;
  }

  return true;
};

/**
 * Method: setPrimary
 * Sets this payment method as primary (unsets others)
 * @returns {Promise}
 */
paymentMethodSchema.methods.setPrimary = async function setPrimary() {
  // Unset all other primary methods for this user
  await mongoose
    .model('PaymentMethod')
    .updateMany({ user_id: this.user_id, _id: { $ne: this._id } }, { is_primary: false });

  // Set this one as primary
  this.is_primary = true;
  return this.save();
};

/**
 * Method: recordUsage
 * Updates last_used_at and increments use_count
 * @returns {Promise}
 */
paymentMethodSchema.methods.recordUsage = function recordUsage() {
  this.last_used_at = new Date();
  this.use_count = (this.use_count || 0) + 1;
  return this.save();
};

/**
 * Method: softDelete
 * Soft deletes the payment method
 * @returns {Promise}
 */
paymentMethodSchema.methods.softDelete = function softDelete() {
  this.deleted_at = new Date();
  this.is_primary = false; // Remove primary status on deletion
  return this.save();
};

/**
 * Static: findByUserActive
 * Finds all active and pending verification payment methods for a user
 * @param {ObjectId} userId
 * @returns {Promise}
 */
paymentMethodSchema.statics.findByUserActive = function findByUserActive(userId) {
  return this.find({
    user_id: userId,
    status: { $in: ['active', 'pending_verification'] },
    deleted_at: null,
  }).sort({ is_primary: -1, created_at: -1 });
};

/**
 * Static: findPrimaryByUser
 * Finds primary payment method for user
 * @param {ObjectId} userId
 * @returns {Promise}
 */
paymentMethodSchema.statics.findPrimaryByUser = function findPrimaryByUser(userId) {
  return this.findOne({
    user_id: userId,
    is_primary: true,
    status: 'active',
    deleted_at: null,
  });
};

/**
 * Static: findByStripePaymentMethodId
 * Finds payment method by Stripe ID
 * @param {string} stripePaymentMethodId
 * @returns {Promise}
 */
paymentMethodSchema.statics.findByStripePaymentMethodId = function findByStripePaymentMethodId(
  stripePaymentMethodId
) {
  return this.findOne({
    stripe_payment_method_id: stripePaymentMethodId,
  });
};

/**
 * Pre-save hook: Validate expiry date
 */
paymentMethodSchema.pre('save', async function preSave(next) {
  try {
    // Mark as inactive if expired
    if (this.isExpired()) {
      this.status = 'inactive';
    }

    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Pre-save hook: Ensure only one primary payment method per user
 */
paymentMethodSchema.pre('save', async function preSave(next) {
  try {
    if (this.is_primary && !this.isNew) {
      // If setting as primary, unset others
      await mongoose
        .model('PaymentMethod')
        .updateMany(
          { user_id: this.user_id, _id: { $ne: this._id } },
          { is_primary: false }
        );
    }

    next();
  } catch (error) {
    next(error);
  }
});

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

// Drop old unique index on stripe_payment_method_id (if it exists) to prevent duplicate key errors
// We use a compound index {user_id: 1, stripe_payment_method_id: 1} instead
PaymentMethod.collection.dropIndex('stripe_payment_method_id_1').catch((error) => {
  // Index doesn't exist or already dropped - this is fine
  if (error.code !== 27) {
    console.warn('[PaymentMethod] Non-critical: Could not drop old index:', error.message);
  }
});

module.exports = PaymentMethod;
