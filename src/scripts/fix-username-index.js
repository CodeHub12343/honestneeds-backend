/**
 * One-time migration: fix the unique username index.
 *
 * The old `username_1` index was a plain/sparse unique index, which treated
 * every `username: null` document as a duplicate and broke registration with
 * E11000. This drops it and recreates it as a PARTIAL unique index that only
 * applies when username is an actual string.
 *
 * Run with: node src/scripts/fix-username-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  const dbName = process.env.MONGODB_DB || 'honestneed-dev';

  try {
    await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 10000 });
    console.log(`✅ Connected to MongoDB (db: ${dbName})`);

    const db = mongoose.connection.db;

    // Ensure the collection exists (fresh DBs won't have it yet).
    const existing = await db.listCollections({ name: 'users' }).toArray();
    if (existing.length === 0) {
      await db.createCollection('users');
      console.log('Created empty users collection.');
    }

    const coll = db.collection('users');

    const indexes = await coll.indexes();
    const usernameIdx = indexes.find((i) => i.name === 'username_1');

    if (usernameIdx) {
      console.log('Found existing username_1 index:', JSON.stringify(usernameIdx));
      await coll.dropIndex('username_1');
      console.log('🗑️  Dropped old username_1 index');
    } else {
      console.log('No existing username_1 index found.');
    }

    await coll.createIndex(
      { username: 1 },
      { unique: true, partialFilterExpression: { username: { $type: 'string' } }, name: 'username_1' }
    );
    console.log('✅ Created partial unique index on username');

    console.log('Done. Final indexes:');
    console.log((await coll.indexes()).map((i) => i.name).join(', '));
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();
