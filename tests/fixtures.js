/**
 * Test Fixtures
 * Pre-defined test data for consistent testing
 */

const { faker } = require('@faker-js/faker');

/**
 * User fixtures
 */
const USERS = {
  regularUser: {
    email: 'user@example.com',
    password_hash: 'hashed_password', // Will be hashed
    display_name: 'Regular User',
    role: 'user',
    verified: false,
    bio: 'I am a regular user',
    phone: '+1 (555) 123-4567',
  },
  creatorUser: {
    email: 'creator@example.com',
    password_hash: 'hashed_password', // Will be hashed
    display_name: 'Campaign Creator',
    role: 'creator',
    verified: true,
    bio: 'I create campaigns',
    phone: '+1 (555) 234-5678',
  },
  adminUser: {
    email: 'admin@example.com',
    password_hash: 'hashed_password', // Will be hashed
    display_name: 'Admin User',
    role: 'admin',
    verified: true,
    bio: 'I am an admin',
    phone: '+1 (555) 345-6789',
  },
};

/**
 * Campaign fixtures
 */
const CAMPAIGNS = {
  draft: {
    campaign_id: 'camp_draft_001',
    title: 'Medical Emergency Fund',
    description: 'Fundraiser for emergency surgery',
    campaign_type: 'fundraising',
    status: 'draft',
    published: false,
    category: 'medical',
    tags: ['medical', 'emergency'],
    fundraising: {
      goal_amount: 100000, // $1000
      current_amount: 0,
    },
  },
  active: {
    campaign_id: 'camp_active_001',
    title: 'Community Garden Project',
    description: 'Build a garden for our community',
    campaign_type: 'sharing',
    status: 'active',
    published: true,
    category: 'community',
    tags: ['community', 'environment'],
    sharing: {
      platforms: ['instagram', 'twitter'],
      reward_per_share: 50, // $0.50 per share
      budget: 10000, // $100 budget
      max_shares: 200,
    },
  },
  paused: {
    campaign_id: 'camp_paused_001',
    title: 'Education Scholarship',
    description: 'Help students with tuition',
    campaign_type: 'fundraising',
    status: 'paused',
    published: true,
    category: 'education',
    tags: ['education', 'scholarship'],
    fundraising: {
      goal_amount: 500000, // $5000
      current_amount: 200000, // $2000
    },
  },
};

/**
 * Transaction fixtures
 */
const TRANSACTIONS = {
  completed: {
    transaction_id: 'txn_completed_001',
    transaction_type: 'donation',
    amount: 10000, // $100
    status: 'completed',
    payment_method: 'paypal',
  },
  pending: {
    transaction_id: 'txn_pending_001',
    transaction_type: 'donation',
    amount: 5000, // $50
    status: 'pending',
    payment_method: 'stripe',
  },
  failed: {
    transaction_id: 'txn_failed_001',
    transaction_type: 'donation',
    amount: 3000, // $30
    status: 'failed',
    payment_method: 'paypal',
  },
};

/**
 * Request/Response fixtures
 */
const REQUESTS = {
  validRegistration: {
    email: 'newuser@example.com',
    password: 'TestPassword123!',
    displayName: 'New User',
  },
  validLogin: {
    email: 'user@example.com',
    password: 'TestPassword123!',
  },
  validCampaign: {
    title: 'Test Campaign',
    description: 'This is a test campaign',
    category: 'medical',
    tags: ['test'],
    campaignType: 'fundraising',
    goalAmount: 100000,
  },
};

/**
 * Error fixtures
 */
const ERROR_RESPONSES = {
  authRequired: {
    success: false,
    error: {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    },
  },
  permissionDenied: {
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
    },
  },
  notFound: {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  },
  validationError: {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Input validation failed',
    },
  },
};

/**
 * Success response fixtures
 */
const SUCCESS_RESPONSES = {
  registered: {
    success: true,
    message: 'User registered successfully',
  },
  loggedIn: {
    success: true,
    message: 'User logged in successfully',
  },
  campaignCreated: {
    success: true,
    message: 'Campaign created successfully',
  },
  updated: {
    success: true,
    message: 'Resource updated successfully',
  },
};

module.exports = {
  USERS,
  CAMPAIGNS,
  TRANSACTIONS,
  REQUESTS,
  ERROR_RESPONSES,
  SUCCESS_RESPONSES,
};
