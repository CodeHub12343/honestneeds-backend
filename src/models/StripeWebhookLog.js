/**
 * StripeWebhookLog Model
 * Tracks all Stripe webhook events for debugging, audit, and idempotency
 * Prevents duplicate webhook processing
 */

const mongoose = require('mongoose');

const stripeWebhookLogSchema = new mongoose.Schema(
  {
    // ===== WEBHOOK IDENTIFICATION =====
    event_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      description: 'Stripe event ID (evt_xxxxx) - used for idempotency'
    },

    event_type: {
      type: String,
      required: true,
      index: true,
      enum: [
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'charge.completed',
        'charge.failed',
        'refund.created',
        'dispute.created',
        'dispute.warning_closed',
        'setup_intent.succeeded',
        'setup_intent.setup_failed',
        'per_request_webhook_sent',
        'charge.dispute.funds_reinstated',
        'charge.dispute.funds_withdrawn'
      ],
      description: 'Type of webhook event'
    },

    // ===== PROCESSING STATUS =====
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'ignored'],
      default: 'pending',
      index: true,
      description: 'Processing status of the webhook'
    },

    error_message: {
      type: String,
      description: 'Error message if processing failed'
    },

    // ===== TIMESTAMPS =====
    stripe_event_timestamp: {
      type: Date,
      description: 'When the event occurred on Stripe'
    },

    received_at: {
      type: Date,
      default: () => new Date(),
      index: true,
      description: 'When webhook was received by our system'
    },

    processed_at: {
      type: Date,
      index: true,
      description: 'When webhook processing completed'
    },

    // ===== METADATA =====
    stripe_signature: {
      type: String,
      description: 'Stripe-Signature header (first 20 chars for privacy)'
    },

    ip_address: {
      type: String,
      description: 'IP address that sent the webhook'
    },

    user_agent: {
      type: String,
      description: 'User-Agent header'
    },

    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
      description: 'Additional metadata from the webhook or processing'
    },

    // ===== RELATED RECORDS =====
    related_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      description: 'Related transaction if applicable'
    },

    related_campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      description: 'Related campaign if applicable'
    },

    related_charge_id: {
      type: String,
      description: 'Stripe charge ID if applicable'
    },

    related_dispute_id: {
      type: String,
      description: 'Stripe dispute ID if applicable'
    },

    // ===== SECURITY =====
    replay_suspected: {
      type: Boolean,
      default: false,
      index: true,
      description: 'True if event timestamp is too old (possible replay attack)'
    },

    duplicate: {
      type: Boolean,
      default: false,
      index: true,
      description: 'True if this event was already processed'
    },

    signature_verified: {
      type: Boolean,
      default: false,
      description: 'Whether Stripe signature was successfully verified'
    },

    // ===== PERFORMANCE =====
    processing_time_ms: {
      type: Number,
      description: 'Time taken to process the webhook (milliseconds)'
    },

    // ===== NOTES =====
    notes: {
      type: String,
      description: 'Internal notes about webhook processing'
    },

    retry_count: {
      type: Number,
      default: 0,
      description: 'Number of times this webhook was retried'
    },

    should_retry: {
      type: Boolean,
      default: false,
      description: 'Whether this webhook should be retried'
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'stripe_webhook_logs',
  }
);

// ===== INDEXES =====
stripeWebhookLogSchema.index({ event_id: 1 }, { unique: true });
stripeWebhookLogSchema.index({ event_type: 1, status: 1 });
stripeWebhookLogSchema.index({ received_at: -1 });
stripeWebhookLogSchema.index({ replay_suspected: 1 });
stripeWebhookLogSchema.index({ duplicate: 1 });
stripeWebhookLogSchema.index({ related_transaction_id: 1 });
stripeWebhookLogSchema.index({ related_campaign_id: 1 });

// ===== VIRTUAL FIELDS =====
stripeWebhookLogSchema.virtual('time_to_process').get(function() {
  if (this.received_at && this.processed_at) {
    return this.processed_at.getTime() - this.received_at.getTime();
  }
  return null;
});

// ===== METHODS =====

/**
 * Mark webhook as processed successfully
 */
stripeWebhookLogSchema.methods.markSuccessful = async function(metadata = {}) {
  this.status = 'success';
  this.processed_at = new Date();
  this.metadata = new Map([...this.metadata, ...Object.entries(metadata)]);
  
  if (this.received_at) {
    this.processing_time_ms = this.processed_at.getTime() - this.received_at.getTime();
  }

  return this.save();
};

/**
 * Mark webhook as failed
 */
stripeWebhookLogSchema.methods.markFailed = async function(error, shouldRetry = false) {
  this.status = 'failed';
  this.error_message = error?.message || error?.toString();
  this.processed_at = new Date();
  this.should_retry = shouldRetry;

  if (this.received_at) {
    this.processing_time_ms = this.processed_at.getTime() - this.received_at.getTime();
  }

  return this.save();
};

/**
 * Check if webhook should be reprocessed
 */
stripeWebhookLogSchema.methods.shouldReprocess = function() {
  // Reprocess if: status is failed, should_retry is true, and retry_count < 3
  return this.status === 'failed' && this.should_retry && this.retry_count < 3;
};

/**
 * Increment retry count
 */
stripeWebhookLogSchema.methods.incrementRetry = async function() {
  this.retry_count += 1;
  if (this.retry_count >= 3) {
    this.should_retry = false;
  }
  return this.save();
};

// ===== STATICS =====

/**
 * Check if webhook event was already processed
 */
stripeWebhookLogSchema.statics.isEventProcessed = async function(eventId) {
  const log = await this.findOne({ event_id: eventId });
  return log !== null;
};

/**
 * Get webhook statistics for monitoring
 */
stripeWebhookLogSchema.statics.getStatistics = async function(hoursPast = 24) {
  const cutoffTime = new Date(Date.now() - hoursPast * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        received_at: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: '$event_type',
        total: { $sum: 1 },
        successful: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        duplicates: { $sum: { $cond: [{ $eq: ['$duplicate', true] }, 1, 0] } },
        replaysDetected: { $sum: { $cond: [{ $eq: ['$replay_suspected', true] }, 1, 0] } },
        avgProcessingTimeMs: { $avg: '$processing_time_ms' }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
};

// ===== ENSURE INDEXES =====
stripeWebhookLogSchema.index({ event_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('StripeWebhookLog', stripeWebhookLogSchema);
