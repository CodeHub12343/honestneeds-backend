/**
 * Sweepstakes Collection Schema Definition
 * Tracks sweepstakes entries and drawing results
 */

module.exports = {
  name: 'sweepstakes_entries',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['campaign_id', 'user_id', 'entry_type', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        campaign_id: {
          bsonType: 'objectId',
          description: 'Associated campaign ID',
        },
        user_id: {
          bsonType: 'objectId',
          description: 'User who earned entry',
        },
        entry_type: {
          enum: ['campaign_creation', 'donation', 'share', 'referral'],
          description: 'How entry was earned',
        },
        entry_count: {
          bsonType: 'int',
          default: 1,
          minimum: 1,
          description: 'Number of entries from this action',
        },
        source_id: {
          bsonType: ['objectId', 'null'],
          description: 'Source transaction/share/referral ID',
        },
        claimed: {
          bsonType: 'bool',
          default: false,
          description: 'Whether prize was claimed',
        },
        prize_id: {
          bsonType: ['objectId', 'null'],
          description: 'Prize from drawing (if won)',
        },
        created_at: { bsonType: 'date', description: 'Entry creation timestamp' },
      },
    },
  },
  indexes: [
    { key: { campaign_id: 1, user_id: 1 } },
    { key: { user_id: 1, created_at: -1 } },
    { key: { campaign_id: 1, created_at: -1 } },
    { key: { entry_type: 1 } },
    { key: { claimed: 1, campaign_id: 1 } },
  ],
};
