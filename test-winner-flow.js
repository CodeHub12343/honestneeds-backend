/**
 * Test Winner Flow Script
 * Creates winning sweepstakes records for a test user
 */

require('dotenv').config(); // Load environment variables

const mongoose = require('mongoose');

// MongoDB connection - use environment variable
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed';

console.log('📡 Connecting to MongoDB:', mongoUri.replace(/:[^/]*@/, ':***@'));

async function setupWinnerFlow() {
  let client;
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const userId = mongoose.Types.ObjectId.createFromHexString('69d42861c113d40e33874b89');

    // 1. Create a SweepstakesDrawing (completed drawing with this user as winner)
    const drawingResult = await db.collection('sweepstakes_drawings').findOneAndUpdate(
      { drawingPeriod: '2026-04' },
      {
        $set: {
          drawingPeriod: '2026-04',
          drawingDate: new Date('2026-05-01'),
          prizeAmount: 30000, // $300
          totalParticipants: 2,
          totalEntries: 2,
          winningUserId: userId,
          winningSubmissionId: new mongoose.Types.ObjectId(),
          winnerEntryCount: 1,
          winnerProbability: 0.5,
          status: 'drawn',
          randomSeed: 'test-seed-april-2026',
          algorithm: 'vose_alias_method',
          winnerNotifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const drawing = drawingResult.value || drawingResult;
    if (!drawing) {
      throw new Error('Failed to create drawing');
    }

    console.log('✅ Drawing Created:', {
      id: drawing._id,
      period: drawing.drawingPeriod,
      prize: `$${drawing.prizeAmount / 100}`,
      status: drawing.status,
    });

    // 2. Update or create the user's sweepstakes submission to mark as winner
    const submissionResult = await db.collection('sweepstakes_submissions').updateOne(
      { userId: userId, drawingPeriod: '2026-04' },
      {
        $set: {
          userId: userId,
          drawingPeriod: '2026-04',
          entryCount: 1,
          isWinner: true,
          winningAmount: 30000,
          'entrySources.campaignCreated.count': 1,
          'entrySources.campaignCreated.claimed': true,
          'entrySources.donations.count': 0,
          'entrySources.donations.totalAmount': 0,
          'entrySources.shares.count': 0,
          'entrySources.shares.sharesRecorded': 0,
          'entrySources.qrScans.count': 0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        }
      },
      { upsert: true }
    );

    console.log('✅ Submission Updated/Created:', {
      modified: submissionResult.modifiedCount,
      upserted: submissionResult.upsertedId,
      entries: 1,
      isWinner: true,
      prize: '$300',
    });

    // 3. Create a winning entry record with all required fields
    // Create dummy IDs for required fields (these would normally come from actual donations)
    const dummyCampaignId = new mongoose.Types.ObjectId();
    const dummyTransactionId = new mongoose.Types.ObjectId();
    
    const winningEntry = {
      campaign_id: dummyCampaignId,
      supporter_id: userId,  // ✅ Use supporter_id, not userId
      transaction_id: dummyTransactionId,
      creator_id: new mongoose.Types.ObjectId(),
      entries_count: 1,
      donation_amount_cents: 10000, // $100 donation
      status: 'won',
      is_winner: true,
      winning_entries: 1,
      prize_amount_cents: 30000,  // $300 prize
      drawing_id: drawing._id,
      won_at: new Date(),
      ip_address: '127.0.0.1',
      user_agent: 'test-script',
      fraud_check_status: 'passed',
      fraud_score: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log('📝 Creating winning entry with:', {
      supporter_id: userId.toString(),
      campaign_id: dummyCampaignId.toString(),
      transaction_id: dummyTransactionId.toString(),
      prize: '$300',
      status: 'won',
      is_winner: true,
    });

    const winningResult = await db.collection('sweepstakes_entries').insertOne(winningEntry);

    console.log('✅ Winning Entry Created:', {
      id: winningResult.insertedId,
      userId: userId.toString(),
      prize: '$300',
      status: 'won',
    });

    console.log('\n🎯 Winner Flow Setup Complete!');
    console.log('\nTo test the winner flow:');
    console.log('1. Log in as: apataewr234@gmail.com');
    console.log('2. Go to: http://localhost:3000/sweepstakes');
    console.log('3. Verify Age (check box and confirm)');
    console.log('4. You should see a winner notification modal');
    console.log('5. Click "Claim Prize" to proceed');
    console.log('6. Select payment method and complete claim');
    console.log('\nTest Complete! ✅');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupWinnerFlow();

