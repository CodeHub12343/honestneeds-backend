/**
 * Users Collection Schema Definition
 * Stores user account information with proper validation
 */

module.exports = {
  name: 'users',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password_hash', 'display_name', 'role', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'User email address (unique)',
        },
        password_hash: {
          bsonType: 'string',
          minLength: 60,
          maxLength: 60,
          description: 'Bcrypt hashed password (60 chars)',
        },
        display_name: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 100,
          description: 'Display name for the user',
        },
        bio: {
          bsonType: 'string',
          maxLength: 500,
          description: 'User biography',
        },
        phone: {
          bsonType: ['string', 'null'],
          pattern: '^\\+?[1-9]\\d{1,14}$',
          description: 'Phone number in E.164 format',
        },
        avatar_url: {
          bsonType: ['string', 'null'],
          pattern: '^https?://',
          description: 'URL to user avatar image',
        },
        role: {
          enum: ['user', 'creator', 'admin'],
          description: 'User role for access control',
        },
        verified: {
          bsonType: 'bool',
          description: 'Email verification status',
        },
        location: {
          bsonType: ['object', 'null'],
          properties: {
            address: { bsonType: 'string' },
            city: { bsonType: 'string' },
            state: { bsonType: 'string' },
            country: { bsonType: 'string', default: 'US' },
            zip_code: { bsonType: 'string' },
            latitude: { bsonType: 'double' },
            longitude: { bsonType: 'double' },
          },
          description: 'User location information',
        },
        stats: {
          bsonType: 'object',
          properties: {
            campaigns_created: { bsonType: 'int', default: 0 },
            donations_made: { bsonType: 'int', default: 0 },
            total_donated: { bsonType: 'long', default: 0 },
            shares_recorded: { bsonType: 'int', default: 0 },
            sweepstakes_entries: { bsonType: 'int', default: 0 },
          },
          description: 'User activity statistics',
        },
        created_at: {
          bsonType: 'date',
          description: 'Account creation timestamp',
        },
        updated_at: {
          bsonType: 'date',
          description: 'Last profile update timestamp',
        },
        deleted_at: {
          bsonType: ['date', 'null'],
          description: 'Soft delete timestamp (null = active)',
        },
      },
    },
  },
  indexes: [
    { key: { email: 1 }, unique: true, sparse: true },
    { key: { role: 1 } },
    { key: { created_at: -1 } },
    { key: { deleted_at: 1 }, sparse: true },
    { key: { 'location.latitude': '2dsphere', 'location.longitude': '2dsphere' }, sparse: true },
  ],
};
