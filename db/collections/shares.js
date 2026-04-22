/**
 * Shares Collection Schema Definition
 * Tracks social media shares for sharing campaigns
 */

module.exports = {
  name: 'shares',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['campaign_id', 'platform', 'status', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        share_id: {
          bsonType: 'string',
          pattern: '^SHARE-\\d{4}-\\d{6}-[A-Z0-9]{8}$',
          description: 'Human-readable share ID',
        },
        campaign_id: {
          bsonType: 'objectId',
          description: 'Associated campaign ID',
        },
        user_id: {
          bsonType: ['objectId', 'null'],
          description: 'User who shared (optional for anonymous)',
        },
        platform: {
          enum: ['instagram', 'tiktok', 'twitter', 'facebook', 'linkedin', 'youtube', 'snapchat', 'reddit', 'other'],
          description: 'Social media platform',
        },
        status: {
          enum: ['pending_verification', 'verified', 'disputed', 'rejected'],
          description: 'Share verification status',
        },
        proof_url: {
          bsonType: ['string', 'null'],
          pattern: '^https?://',
          description: 'URL to shared post',
        },
        proof_screenshot_url: {
          bsonType: ['string', 'null'],
          pattern: '^https?://',
          description: 'Screenshot of share (in S3)',
        },
        qr_code_scanned: {
          bsonType: ['object', 'null'],
          properties: {
            timestamp: { bsonType: 'date' },
            location: {
              bsonType: 'object',
              properties: {
                latitude: { bsonType: 'double' },
                longitude: { bsonType: 'double' },
              },
            },
          },
          description: 'QR code scan details if applicable',
        },
        reward_amount: {
          bsonType: 'long',
          description: 'Reward in cents for this share',
        },
        paid: {
          bsonType: 'bool',
          default: false,
          description: 'Whether reward has been paid',
        },
        payment_transaction_id: {
          bsonType: ['objectId', 'null'],
          description: 'Transaction record for reward payment',
        },
        flagged: {
          bsonType: 'object',
          properties: {
            flagged_at: { bsonType: 'date' },
            reason: { bsonType: 'string' },
            flagged_by: { bsonType: 'objectId' },
          },
          description: 'Fraud flag details',
        },
        metadata: {
          bsonType: 'object',
          properties: {
            ip_address: { bsonType: 'string' },
            user_agent: { bsonType: 'string' },
            reach_estimated: { bsonType: 'int' },
            engagement_estimated: { bsonType: 'int' },
          },
          description: 'Additional metadata',
        },
        created_at: { bsonType: 'date', description: 'Share creation timestamp' },
        verified_at: { bsonType: ['date', 'null'], description: 'Verification timestamp' },
        paid_at: { bsonType: ['date', 'null'], description: 'Payment timestamp' },
      },
    },
  },
  indexes: [
    { key: { campaign_id: 1, status: 1 } },
    { key: { user_id: 1, created_at: -1 }, sparse: true },
    { key: { platform: 1 } },
    { key: { status: 1, created_at: -1 } },
    { key: { paid: 1, campaign_id: 1 } },
    { key: { share_id: 1 }, unique: true, sparse: true },
    { key: { flagged: 1 }, sparse: true },
    { key: { created_at: -1 } },
  ],
};
