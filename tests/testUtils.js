/**
 * Test Utilities & Factories
 * Helpers for creating test data and making authenticated requests
 */

const { faker } = require('@faker-js/faker');
const request = require('supertest');
const { generateToken } = require('../src/utils/jwt');
const { hashPassword } = require('../src/utils/passwordUtils');

/**
 * Factory: Create mock user object
 */
const createMockUser = (overrides = {}) => ({
  email: faker.internet.email(),
  password_hash: 'test-hash',
  display_name: faker.person.fullName(),
  phone: faker.phone.number(),
  avatar_url: faker.image.avatar(),
  bio: faker.lorem.paragraph(),
  role: 'user',
  verified: false,
  location: {
    latitude: parseFloat(faker.location.latitude()),
    longitude: parseFloat(faker.location.longitude()),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    country: faker.location.country(),
  },
  stats: {
    campaigns_created: 0,
    donations_made: 0,
    shares_recorded: 0,
    total_donated: 0,
    total_earned: 0,
    referral_count: 0,
  },
  preferences: {
    email_notifications: true,
    marketing_emails: false,
    newsletter: false,
  },
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

/**
 * Factory: Create mock campaign object
 */
const createMockCampaign = (overrides = {}) => {
  const createdAt = new Date();
  const endDate = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  return {
    campaign_id: `camp_${faker.string.alphaNumeric(12)}`,
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraphs(3),
    creator_id: faker.database.mongoObjectId(),
    campaign_type: 'fundraising',
    status: 'draft',
    location: {
      latitude: parseFloat(faker.location.latitude()),
      longitude: parseFloat(faker.location.longitude()),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      country: faker.location.country(),
    },
    image_url: faker.image.url(),
    category: 'medical',
    tags: [faker.lorem.word(), faker.lorem.word()],
    fundraising: {
      goal_amount: 500000, // $5000 in cents
      current_amount: 0,
      currency: 'USD',
    },
    sharing: null,
    payment_methods: {
      paypal: { display: 'PayPal' },
      venmo: { display: 'Venmo' },
    },
    dates: {
      published_at: null,
      ends_at: endDate,
      created_at: createdAt,
      updated_at: createdAt,
    },
    metrics: {
      view_count: 0,
      total_shares: 0,
      total_donations: 0,
      unique_supporters: 0,
      engagement_score: 0,
    },
    published: false,
    ...overrides,
  };
};

/**
 * Factory: Create mock transaction object
 */
const createMockTransaction = (overrides = {}) => ({
  transaction_id: `txn_${faker.string.alphaNumeric(12)}`,
  campaign_id: faker.database.mongoObjectId(),
  user_id: faker.database.mongoObjectId(),
  amount: faker.number.int({ min: 100, max: 50000 }), // cents
  transaction_type: 'donation',
  payment_method: 'paypal',
  status: 'completed',
  payment_id: faker.string.alphaNumeric(20),
  fee_breakdown: {
    gross_amount: 5000,
    platform_fee: 250,
    processing_fee: 175,
    net_amount: 4575,
  },
  verification: {
    verified: true,
    admin_notes: '',
    verified_at: new Date(),
    verified_by: null,
  },
  created_at: new Date(),
  ...overrides,
});

/**
 * Factory: Create mock share object
 */
const createMockShare = (overrides = {}) => ({
  share_id: `shr_${faker.string.alphaNumeric(12)}`,
  campaign_id: faker.database.mongoObjectId(),
  user_id: faker.database.mongoObjectId(),
  platform: 'instagram',
  status: 'pending_verification',
  proof_url: faker.internet.url(),
  proof_screenshot_url: faker.image.url(),
  qr_code_scanned: false,
  reward_amount: 50, // cents
  paid: false,
  flagged: false,
  created_at: new Date(),
  ...overrides,
});

/**
 * Create valid JWT token for testing
 */
const createAuthToken = (userId, roles = ['user'], expiresIn = '24h') => {
  try {
    return generateToken(userId, roles, expiresIn);
  } catch (error) {
    // Fallback for when keys aren't initialized
    return `test-token-${userId}`;
  }
};

/**
 * Create registration data for testing
 */
const createRegistrationData = (overrides = {}) => ({
  email: faker.internet.email(),
  password: 'TestPassword123!',
  displayName: faker.person.fullName(),
  ...overrides,
});

/**
 * Create login data for testing
 */
const createLoginData = (overrides = {}) => ({
  email: faker.internet.email(),
  password: 'TestPassword123!',
  ...overrides,
});

/**
 * Make authenticated HTTP request
 */
const makeAuthenticatedRequest = (app, method = 'GET', path = '/', token = null) => {
  const req = request(app)[method.toLowerCase()](path)
    .set('Content-Type', 'application/json');

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  return req;
};

/**
 * Seed test database with sample data
 * Returns created model IDs for reference
 */
const seedTestData = async (models = {}) => {
  const seededData = {
    users: [],
    campaigns: [],
    transactions: [],
  };

  try {
    // Create test users if User model provided
    if (models.User) {
      const user1 = await models.User.create({
        ...createMockUser(),
        email: 'test-user-1@example.com',
        role: 'user',
      });
      const user2 = await models.User.create({
        ...createMockUser(),
        email: 'test-user-2@example.com',
        role: 'creator',
      });
      const admin = await models.User.create({
        ...createMockUser(),
        email: 'test-admin@example.com',
        role: 'admin',
      });

      seededData.users = [user1, user2, admin];
    }

    // Create test campaigns if Campaign model provided
    if (models.Campaign && seededData.users.length > 0) {
      const campaign1 = await models.Campaign.create({
        ...createMockCampaign(),
        creator_id: seededData.users[1]._id, // creator user
      });
      const campaign2 = await models.Campaign.create({
        ...createMockCampaign(),
        creator_id: seededData.users[1]._id,
        status: 'active',
        published: true,
      });

      seededData.campaigns = [campaign1, campaign2];
    }

    return seededData;
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
};

/**
 * Clean up test database
 */
const cleanupTestData = async (models = {}) => {
  try {
    const collections = Object.keys(models);

    for (const modelName of collections) {
      const model = models[modelName];
      if (model.deleteMany) {
        await model.deleteMany({});
      }
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    throw error;
  }
};

/**
 * Verify password matches hashed password
 */
const verifyTestPassword = async (plainPassword, hashedPassword) => {
  const { verifyPassword } = require('../src/utils/passwordUtils');
  return verifyPassword(plainPassword, hashedPassword);
};

/**
 * Create user with hashed password for testing
 */
const createUserWithHashedPassword = async (overrides = {}) => {
  const password = overrides.password || 'TestPassword123!';
  const hashedPassword = await hashPassword(password);

  return {
    ...createMockUser({
      password_hash: hashedPassword,
      email: overrides.email || faker.internet.email(),
    }),
  };
};

/**
 * Match request body structure
 */
const expectRequestStructure = (body, expectedKeys) => {
  expectedKeys.forEach((key) => {
    expect(body).toHaveProperty(key);
  });
};

/**
 * Match response error structure
 */
const expectErrorResponse = (response, statusCode, errorCode) => {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('success', false);
  expect(response.body).toHaveProperty('error');
  expect(response.body.error).toHaveProperty('code', errorCode);
  expect(response.body.error).toHaveProperty('message');
};

/**
 * Match response success structure
 */
const expectSuccessResponse = (response, statusCode = 200) => {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('success', true);
  expect(response.body).toHaveProperty('message');
  expect(response.body).toHaveProperty('data');
};

module.exports = {
  // Factories
  createMockUser,
  createMockCampaign,
  createMockTransaction,
  createMockShare,
  createAuthToken,
  createRegistrationData,
  createLoginData,
  createUserWithHashedPassword,

  // Request helpers
  makeAuthenticatedRequest,

  // Database helpers
  seedTestData,
  cleanupTestData,
  verifyTestPassword,

  // Assertion helpers
  expectRequestStructure,
  expectErrorResponse,
  expectSuccessResponse,
};
