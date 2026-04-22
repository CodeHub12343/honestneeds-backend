/**
 * Migration 001: Initial Schema Setup (Enhanced)
 * Creates initial collections with comprehensive validation
 * Run by: npm run db:migrate
 * Day 4-5: Database & MongoDB Configuration (Sprint 1-2)
 */

const usersSchema = require('../collections/users');
const campaignsSchema = require('../collections/campaigns');
const transactionsSchema = require('../collections/transactions');
const sharesSchema = require('../collections/shares');
const sweepstakesSchema = require('../collections/sweepstakes_entries');

module.exports = {
  async up(db) {
    try {
      console.log('📊 Running Migration 001: Initial Schema Setup...');

      // Create users collection with validation
      console.log('  → Creating users collection...');
      await db.createCollection(usersSchema.name, {
        validator: usersSchema.validator,
      });

      // Create campaigns collection
      console.log('  → Creating campaigns collection...');
      await db.createCollection(campaignsSchema.name, {
        validator: campaignsSchema.validator,
      });

      // Create transactions collection
      console.log('  → Creating transactions collection...');
      await db.createCollection(transactionsSchema.name, {
        validator: transactionsSchema.validator,
      });

      // Create shares collection
      console.log('  → Creating shares collection...');
      await db.createCollection(sharesSchema.name, {
        validator: sharesSchema.validator,
      });

      // Create sweepstakes_entries collection
      console.log('  → Creating sweepstakes_entries collection...');
      await db.createCollection(sweepstakesSchema.name, {
        validator: sweepstakesSchema.validator,
      });

      console.log('✅ Collections created successfully');
      console.log('⏭️  Run: npm run db:migrate (to add indexes in 002_add_indexes.js)');
    } catch (error) {
      console.error('❌ Migration 001 failed:', error.message);
      throw error;
    }
  },

  async down(db) {
    try {
      console.log('🔄 Rolling back Migration 001...');
      
      const collections = ['users', 'campaigns', 'transactions', 'shares', 'sweepstakes_entries'];
      
      for (const collectionName of collections) {
        const exists = await db.listCollections({ name: collectionName }).toArray();
        if (exists.length > 0) {
          console.log(`  ← Dropping ${collectionName}...`);
          await db.dropCollection(collectionName);
        }
      }

      console.log('✅ Rollback completed');
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  },
};
