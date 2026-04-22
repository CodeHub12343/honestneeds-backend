/**
 * Campaigns Collection Schema Definition
 * Stores campaign information with support for fundraising and sharing types
 */

module.exports = {
  name: 'campaigns',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['title', 'description', 'creator_id', 'campaign_type', 'status', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        campaign_id: {
          bsonType: 'string',
          pattern: '^CAMP-\\d{4}-\\d{3}-[A-Z0-9]{6}$',
          description: 'Human-readable campaign ID',
        },
        title: {
          bsonType: 'string',
          minLength: 5,
          maxLength: 200,
          description: 'Campaign title',
        },
        description: {
          bsonType: 'string',
          minLength: 20,
          maxLength: 5000,
          description: 'Campaign description',
        },
        creator_id: {
          bsonType: 'objectId',
          description: 'ID of campaign creator (user)',
        },
        campaign_type: {
          enum: ['fundraising', 'sharing'],
          description: 'Type of campaign',
        },
        status: {
          enum: ['draft', 'active', 'paused', 'completed', 'rejected', 'archived'],
          description: 'Campaign status',
        },
        image_url: {
          bsonType: ['string', 'null'],
          pattern: '^https?://',
          description: 'Campaign banner image URL',
        },
        location: {
          bsonType: 'object',
          properties: {
            address: { bsonType: 'string' },
            city: { bsonType: 'string' },
            state: { bsonType: 'string' },
            country: { bsonType: 'string', default: 'US' },
            zip_code: { bsonType: 'string' },
            latitude: { bsonType: 'double' },
            longitude: { bsonType: 'double' },
            radius_miles: { bsonType: 'int', default: 5 },
          },
          description: 'Campaign location',
        },
        category: {
          bsonType: 'string',
          description: 'Campaign category',
        },
        tags: {
          bsonType: 'array',
          maxItems: 10,
          items: { bsonType: 'string' },
          description: 'Campaign tags',
        },
        dates: {
          bsonType: 'object',
          properties: {
            start_date: { bsonType: 'date' },
            end_date: { bsonType: 'date' },
            published_at: { bsonType: ['date', 'null'] },
            completed_at: { bsonType: ['date', 'null'] },
          },
          description: 'Campaign important dates',
        },
        fundraising: {
          bsonType: ['object', 'null'],
          properties: {
            goal_amount: {
              bsonType: 'long',
              minimum: 10000,
              description: 'Goal amount in cents (minimum $100)',
            },
            current_amount: { bsonType: 'long', default: 0 },
          },
          description: 'Fundraising-specific data',
        },
        sharing: {
          bsonType: ['object', 'null'],
          properties: {
            platforms: {
              bsonType: 'array',
              minItems: 1,
              maxItems: 8,
              items: { bsonType: 'string' },
            },
            reward_per_share: {
              bsonType: 'long',
              minimum: 10,
              description: 'Reward in cents (minimum $0.10)',
            },
            budget: {
              bsonType: 'long',
              minimum: 1000,
              description: 'Total budget in cents (minimum $10)',
            },
            max_shares: { bsonType: 'int', minimum: 1 },
            current_shares: { bsonType: 'int', default: 0 },
          },
          description: 'Sharing campaign data',
        },
        payment_methods: {
          bsonType: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            bsonType: 'object',
            properties: {
              type: { enum: ['paypal', 'venmo', 'cashapp', 'bank', 'crypto', 'other'] },
              encrypted_info: { bsonType: 'string' },
              iv: { bsonType: 'string' },
              display: { bsonType: 'string', description: 'Safe display without sensitive data' },
            },
          },
          description: 'Payment methods for receiving donations',
        },
        metrics: {
          bsonType: 'object',
          properties: {
            view_count: { bsonType: 'int', default: 0 },
            total_shares: { bsonType: 'int', default: 0 },
            total_donations: { bsonType: 'int', default: 0 },
            total_donation_amount: { bsonType: 'long', default: 0 },
            total_volunteers: { bsonType: 'int', default: 0 },
            unique_supporters: { bsonType: 'int', default: 0 },
            engagement_score: { bsonType: 'double', default: 0.0 },
          },
          description: 'Campaign performance metrics',
        },
        qr_code: {
          bsonType: ['object', 'null'],
          properties: {
            url: { bsonType: 'string' },
            storage_key: { bsonType: 'string' },
            generated_at: { bsonType: 'date' },
          },
          description: 'QR code for campaign',
        },
        visibility: {
          enum: ['public', 'unlisted'],
          default: 'public',
          description: 'Campaign visibility status',
        },
        created_at: { bsonType: 'date', description: 'Creation timestamp' },
        updated_at: { bsonType: 'date', description: 'Last update timestamp' },
        deleted_at: { bsonType: ['date', 'null'], description: 'Soft delete timestamp' },
      },
    },
  },
  indexes: [
    { key: { creator_id: 1, status: 1 } },
    { key: { status: 1, published_at: -1 } },
    { key: { campaign_type: 1 } },
    { key: { category: 1 } },
    { key: { 'location.latitude': '2dsphere', 'location.longitude': '2dsphere' }, sparse: true },
    { key: { 'metrics.total_shares': -1 } },
    { key: { 'metrics.view_count': -1 } },
    { key: { created_at: -1 } },
    { key: { campaign_id: 1 }, unique: true, sparse: true },
    { key: { deleted_at: 1 }, sparse: true },
  ],
};
