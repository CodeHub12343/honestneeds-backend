/**
 * Migration 002: Add Indexes
 * Creates all indexes for optimal query performance
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
      console.log('📊 Running Migration 002: Add Indexes...');

      // Users collection indexes
      console.log('  → Creating users indexes...');
      const usersCollection = db.collection('users');
      for (const index of usersSchema.indexes) {
        await usersCollection.createIndex(index.key, {
          unique: index.unique,
          sparse: index.sparse,
        });
      }

      // Campaigns collection indexes
      console.log('  → Creating campaigns indexes...');
      const campaignsCollection = db.collection('campaigns');
      for (const index of campaignsSchema.indexes) {
        await campaignsCollection.createIndex(index.key, {
          unique: index.unique,
          sparse: index.sparse,
        });
      }

      // Transactions collection indexes
      console.log('  → Creating transactions indexes...');
      const transactionsCollection = db.collection('transactions');
      for (const index of transactionsSchema.indexes) {
        await transactionsCollection.createIndex(index.key, {
          unique: index.unique,
          sparse: index.sparse,
        });
      }

      // Shares collection indexes
      console.log('  → Creating shares indexes...');
      const sharesCollection = db.collection('shares');
      for (const index of sharesSchema.indexes) {
        await sharesCollection.createIndex(index.key, {
          unique: index.unique,
          sparse: index.sparse,
        });
      }

      // Sweepstakes entries collection indexes
      console.log('  → Creating sweepstakes_entries indexes...');
      const sweepstakesCollection = db.collection('sweepstakes_entries');
      for (const index of sweepstakesSchema.indexes) {
        await sweepstakesCollection.createIndex(index.key, {
          unique: index.unique,
          sparse: index.sparse,
        });
      }

      console.log('✅ All indexes created successfully');
      console.log('⏭️  Verify indexes: npm run verify:indexes');
    } catch (error) {
      console.error('❌ Migration 002 failed:', error.message);
      throw error;
    }
  },

  async down(db) {
    try {
      console.log('🔄 Rolling back Migration 002...');

      const collections = [
        { name: 'users', schema: usersSchema },
        { name: 'campaigns', schema: campaignsSchema },
        { name: 'transactions', schema: transactionsSchema },
        { name: 'shares', schema: sharesSchema },
        { name: 'sweepstakes_entries', schema: sweepstakesSchema },
      ];

      for (const { name, schema } of collections) {
        console.log(`  ← Dropping indexes for ${name}...`);
        const collection = db.collection(name);

        for (const index of schema.indexes) {
          try {
            // Get index name from key (MongoDB generates names)
            const indexEntries = Object.entries(index.key);
            const indexName = indexEntries.map(([k, v]) => `${k}_${v}`).join('_');
            await collection.dropIndex(indexName);
          } catch (e) {
            // Index might not exist, continue
          }
        }
      }

      console.log('✅ Rollback completed');
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  },
};
