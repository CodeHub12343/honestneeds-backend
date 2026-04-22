/**
 * Transactions Collection Schema Definition
 * Tracks all financial transactions (donations, share rewards, fees, etc.)
 */

module.exports = {
  name: 'transactions',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['campaign_id', 'amount', 'transaction_type', 'status', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        transaction_id: {
          bsonType: 'string',
          pattern: '^TXN-\\d{4}-\\d{6}-[A-Z0-9]{8}$',
          description: 'Human-readable transaction ID',
        },
        campaign_id: {
          bsonType: 'objectId',
          description: 'Associated campaign ID',
        },
        user_id: {
          bsonType: ['objectId', 'null'],
          description: 'User making the transaction (null for anonymous)',
        },
        amount: {
          bsonType: 'long',
          minimum: 1,
          description: 'Amount in cents',
        },
        transaction_type: {
          enum: ['donation', 'share_reward', 'platform_fee', 'refund', 'payout'],
          description: 'Type of transaction',
        },
        payment_method: {
          enum: ['paypal', 'venmo', 'cashapp', 'bank', 'crypto', 'manual', 'stripe', 'other'],
          description: 'Payment method used',
        },
        status: {
          enum: ['pending', 'completed', 'failed', 'refunded', 'disputed'],
          description: 'Transaction status',
        },
        payment_id: {
          bsonType: ['string', 'null'],
          description: 'External payment processor ID',
        },
        proof_url: {
          bsonType: ['string', 'null'],
          pattern: '^https?://',
          description: 'URL to payment proof (screenshot, receipt)',
        },
        fee_breakdown: {
          bsonType: 'object',
          properties: {
            gross_amount: { bsonType: 'long', description: 'Total amount' },
            platform_fee: { bsonType: 'long', description: '20% platform fee' },
            net_amount: { bsonType: 'long', description: 'Creator receives' },
            processing_fee: { bsonType: ['long', 'null'], description: 'Payment processor fee' },
          },
          description: 'Fee breakdown for donation',
        },
        verification: {
          bsonType: ['object', 'null'],
          properties: {
            verified_by: { bsonType: 'objectId', description: 'Admin who verified' },
            verified_at: { bsonType: 'date' },
            rejection_reason: { bsonType: ['string', 'null'] },
          },
          description: 'Admin verification details',
        },
        metadata: {
          bsonType: 'object',
          description: 'Additional metadata (currency, IP, etc.)',
        },
        created_at: { bsonType: 'date', description: 'Transaction creation timestamp' },
        updated_at: { bsonType: 'date', description: 'Transaction update timestamp' },
        completed_at: { bsonType: ['date', 'null'], description: 'When transaction completed' },
      },
    },
  },
  indexes: [
    { key: { campaign_id: 1, created_at: -1 } },
    { key: { user_id: 1, created_at: -1 }, sparse: true },
    { key: { status: 1, created_at: -1 } },
    { key: { transaction_type: 1 } },
    { key: { payment_id: 1 }, unique: true, sparse: true },
    { key: { transaction_id: 1 }, unique: true, sparse: true },
    { key: { created_at: -1 } },
  ],
};
