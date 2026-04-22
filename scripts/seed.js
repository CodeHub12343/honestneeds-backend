#!/usr/bin/env node

/**
 * Database Seeding Script - Day 2/3 Enhanced Version
 * Populates the database with initial test data:
 * - 10 test users (including 1 admin)
 * - 50 campaigns (mix of fundraising and sharing types)
 * 
 * Run: npm run db:seed
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');
const logger = require('../src/utils/logger');

const SEED_TEST_USERS_COUNT = parseInt(process.env.SEED_TEST_USERS_COUNT, 10) || 10;
const SEED_CAMPAIGNS_COUNT = parseInt(process.env.SEED_CAMPAIGNS_COUNT, 10) || 50;

// Campaign titles for realistic data
const CAMPAIGN_TITLES = [
  'Community Garden Initiative',
  'Local Youth Sports Fund',
  'Emergency Relief Fund',
  'Education Scholarship Drive',
  'Animal Shelter Support',
  'Rebuild After Natural Disaster',
  'Mental Health Awareness Campaign',
  'Environmental Clean-Up Project',
  'Medical Emergency Fund',
  'Local Business Support',
  'Veteran Support Program',
  'Children Hospital Fundraiser',
  'Senior Center Renovation',
  'Food Bank Initiative',
  'Homeless Outreach Program',
];

const CAMPAIGN_CATEGORIES = [
  'Community',
  'Education',
  'Health',
  'Environment',
  'Emergency',
  'Arts',
  'Sports',
  'Social Cause',
];

const SHARING_PLATFORMS = [
  'Instagram',
  'TikTok',
  'Twitter',
  'Facebook',
  'LinkedIn',
  'YouTube',
  'Snapchat',
  'Reddit',
];

/**
 * Generate mock test users
 */
const generateUsers = () => {
  const users = [];

  // Admin user
  users.push({
    email: 'admin@honestneed-test.local',
    password_hash: '$2b$10$mockhashedpassword',
    display_name: 'Admin User',
    bio: 'Test admin account',
    phone: faker.phone.number(),
    location: {
      address: faker.address.streetAddress(),
      city: faker.address.city(),
      state: faker.address.state(),
      latitude: parseFloat(faker.address.latitude()),
      longitude: parseFloat(faker.address.longitude()),
    },
    avatar_url: faker.image.avatar(),
    role: 'admin',
    verified: true,
    created_at: new Date(),
  });

  // Regular test users
  for (let i = 1; i < SEED_TEST_USERS_COUNT; i++) {
    users.push({
      email: `creator-${i}@honestneed-test.local`,
      password_hash: '$2b$10$mockhashedpassword',
      display_name: faker.name.fullName(),
      bio: faker.lorem.sentence(),
      phone: faker.phone.number(),
      location: {
        address: faker.address.streetAddress(),
        city: faker.address.city(),
        state: faker.address.state(),
        latitude: parseFloat(faker.address.latitude()),
        longitude: parseFloat(faker.address.longitude()),
      },
      avatar_url: faker.image.avatar(),
      role: 'user',
      verified: i % 3 !== 0, // Some unverified users
      created_at: faker.date.recent({ days: 30 }),
    });
  }

  return users;
};

/**
 * Generate mock campaigns
 */
const generateCampaigns = (userIds) => {
  const campaigns = [];
  const campaignTypes = ['fundraising', 'sharing'];

  for (let i = 0; i < SEED_CAMPAIGNS_COUNT; i++) {
    const type = campaignTypes[i % 2];
    const creatorId = userIds[Math.floor(Math.random() * userIds.length)];
    const startDate = faker.date.future({ days: 10 });
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + faker.number.int({ min: 7, max: 90 }));

    const baseData = {
      title: `${CAMPAIGN_TITLES[i % CAMPAIGN_TITLES.length]} #${i + 1}`,
      description: faker.lorem.paragraphs(2),
      creator_id: creatorId,
      campaign_type: type,
      status: ['draft', 'active', 'paused', 'completed'][Math.floor(Math.random() * 4)],
      image_url: faker.image.urlLoremFlickr({ category: 'nature', width: 400, height: 300 }),
      location: {
        address: faker.address.streetAddress(),
        city: faker.address.city(),
        state: faker.address.state(),
        latitude: parseFloat(faker.address.latitude()),
        longitude: parseFloat(faker.address.longitude()),
      },
      start_date: startDate,
      end_date: endDate,
      created_at: faker.date.past({ days: 60 }),
      updated_at: faker.date.recent({ days: 30 }),
      visibility: ['public', 'unlisted'][Math.floor(Math.random() * 2)],
    };

    if (type === 'fundraising') {
      // Fundraising-specific fields (amounts in cents)
      campaigns.push({
        ...baseData,
        goal_amount: faker.number.int({ min: 100 * 100, max: 1000000 * 100 }), // $100 - $1M in cents
        current_amount: faker.number.int({ min: 0, max: 50000 * 100 }), // up to $50K raised
        category: CAMPAIGN_CATEGORIES[Math.floor(Math.random() * CAMPAIGN_CATEGORIES.length)],
        tags: [
          faker.word.adjective(),
          faker.word.noun(),
          faker.word.adverb(),
        ].slice(0, faker.number.int({ min: 1, max: 3 })),
      });
    } else {
      // Sharing-specific fields
      const selectedPlatforms = SHARING_PLATFORMS
        .sort(() => Math.random() - 0.5)
        .slice(0, faker.number.int({ min: 1, max: 4 }));

      campaigns.push({
        ...baseData,
        platforms: selectedPlatforms,
        reward_per_share: faker.number.int({ min: 10, max: 10000 }), // cents ($0.10 - $100)
        budget: faker.number.int({ min: 1000, max: 1000000 }), // cents ($10 - $10K)
        max_shares: faker.number.int({ min: 100, max: 5000 }),
        current_shares: faker.number.int({ min: 0, max: 1000 }),
      });
    }
  }

  return campaigns;
};

/**
 * Main seeding function
 */
const seedDatabase = async () => {
  let connection;
  try {
    logger.info('🌱 Starting database seeding (Day 2/3 Enhanced)...');

    // Connect to MongoDB
    connection = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB,
    });
    logger.info('✅ Connected to MongoDB');

    // Get collections
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const campaignsCollection = db.collection('campaigns');

    // Clear existing test data
    logger.info('🗑️ Clearing existing test data...');
    await usersCollection.deleteMany({ email: { $regex: '@honestneed-test' } });
    await campaignsCollection.deleteMany({ creator_id: { $exists: true } }); // Remove test campaigns

    // Generate and insert users
    logger.info(`👥 Creating ${SEED_TEST_USERS_COUNT} test users...`);
    const users = generateUsers();
    const userResult = await usersCollection.insertMany(users);
    const userIds = Object.values(userResult.insertedIds);
    logger.info(`✅ Created ${SEED_TEST_USERS_COUNT} test users`);

    // Generate and insert campaigns
    logger.info(`📋 Creating ${SEED_CAMPAIGNS_COUNT} test campaigns...`);
    const campaigns = generateCampaigns(userIds);
    const campaignResult = await campaignsCollection.insertMany(campaigns);
    logger.info(`✅ Created ${SEED_CAMPAIGNS_COUNT} test campaigns`);

    // Summary
    logger.info('\n📊 Seed Data Summary:');
    logger.info(`  • Users created: ${SEED_TEST_USERS_COUNT}`);
    logger.info(`    - Admin: admin@honestneed-test.local`);
    logger.info(`    - Creators: creator-1@honestneed-test.local through creator-${SEED_TEST_USERS_COUNT - 1}@honestneed-test.local`);
    logger.info(`  • Campaigns created: ${SEED_CAMPAIGNS_COUNT}`);
    logger.info(`    - Campaign types: Mix of fundraising and sharing`);
    logger.info(`    - Statuses: Draft, Active, Paused, Completed`);
    logger.info(`    - Locations: Randomized across different cities`);
    logger.info('\n📝 Test Credentials:');
    logger.info('  Email: admin@honestneed-test.local (or any creator-*@honestneed-test.local)');
    logger.info('  Password: (use actual password hash in production)');
    logger.info('\n🎉 Database seeding completed successfully!');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Database seeding failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
    }
  }
};

// Run seeding
seedDatabase();
