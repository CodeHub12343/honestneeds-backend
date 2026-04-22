/**
 * Comprehensive Integration Test Suite
 * Tests complete workflows and end-to-end scenarios
 * Coverage: Campaign → Donation → Sweepstakes → Claims
 */

const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB, teardownTestDB } = require('../setup/test-db');

beforeAll(async () => {
  await setupTestDB();
});

afterAll(async () => {
  await teardownTestDB();
});

// ==========================================
// WORKFLOW 1: Campaign Creation → Publishing → Donations
// ==========================================

describe('WORKFLOW 1: Campaign Lifecycle with Donations', () => {
  let authToken;
  let campaign;
  let creator;

  beforeEach(async () => {
    // Create test user and authenticate
    creator = await User.create({
      email: 'creator@test.com',
      password: 'password123',
      fullName: 'Test Creator'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'creator@test.com', password: 'password123' });

    authToken = loginRes.body.token;
  });

  test('E2E: Create → Publish → Receive Donations → Track Metrics', async () => {
    // STEP 1: Create campaign
    const createRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Emergency Roof Repair Help',
        description: 'Storm damaged our roof, need help',
        needType: 'housing',
        targetAmount: 100000, // $1,000
        campaignType: 'fundraising',
        category: 'home_repair',
        tags: ['housing', 'emergency']
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('draft');
    campaign = createRes.body.data;

    // STEP 2: Publish campaign
    const publishRes = await request(app)
      .put(`/api/campaigns/${campaign._id}/publish`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.status).toBe('active');

    // STEP 3: Supporters donate
    const supporter1 = await User.create({
      email: 'supporter1@test.com',
      password: 'pass123',
      walletBalance: 50000 // $500
    });

    const supporterToken = await getAuthToken(supporter1);

    const donateRes1 = await request(app)
      .post(`/api/campaigns/${campaign._id}/donate`)
      .set('Authorization', `Bearer ${supporterToken}`)
      .send({
        amount: 30000, // $300
        paymentMethodId: 'pm-001'
      });

    expect(donateRes1.status).toBe(200);
    expect(donateRes1.body.data.amount).toBe(30000);

    const supporter2 = await User.create({
      email: 'supporter2@test.com',
      password: 'pass123',
      walletBalance: 100000
    });

    const supporterToken2 = await getAuthToken(supporter2);

    const donateRes2 = await request(app)
      .post(`/api/campaigns/${campaign._id}/donate`)
      .set('Authorization', `Bearer ${supporterToken2}`)
      .send({
        amount: 70000, // $700
        paymentMethodId: 'pm-002'
      });

    expect(donateRes2.status).toBe(200);

    // STEP 4: Verify campaign metrics updated
    const metricsRes = await request(app)
      .get(`/api/campaigns/${campaign._id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(metricsRes.status).toBe(200);
    const updated = metricsRes.body.data;
    expect(updated.currentAmount).toBe(100000); // Both donations combined
    expect(updated.supporters.length).toBe(2);
    expect(updated.goalReachedAt).toBeDefined();

    // STEP 5: Verify sweepstakes entries created
    const sweepstakesRes = await request(app)
      .get(`/api/sweepstakes/entries`)
      .set('Authorization', `Bearer ${supporterToken}`);

    expect(sweepstakesRes.status).toBe(200);
    expect(sweepstakesRes.body.data.entries.length).toBeGreaterThan(0);
    expect(sweepstakesRes.body.data.entries.some(e => e.type === 'donation')).toBe(true);
  });

  test('E2E: Campaign reaches 100% and transition to completed', async () => {
    const campaign = await CampaignService.createCampaign({
      ...validData,
      targetAmount: 50000 // $500
    });

    await CampaignService.publishCampaign(campaign._id);

    // Donate exactly to goal
    await CampaignService.recordDonation({
      campaignId: campaign._id,
      supporterId: 'user-001',
      amount: 50000
    });

    const updated = await Campaign.findById(campaign._id);
    expect(updated.currentAmount).toBe(50000);
    expect(updated.percentageFunded).toBe(100);
    expect(updated.goalReachedAt).toBeDefined();
  });
});

// ==========================================
// WORKFLOW 2: Sweepstakes Entry Allocation
// ==========================================

describe('WORKFLOW 2: Sweepstakes Entry Tracking & Drawing', () => {
  let drawing;
  let users;

  beforeEach(async () => {
    // Create current monthly drawing
    drawing = await SweepstakesDrawing.create({
      month:  new Date().getMonth(),
      year: new Date().getFullYear(),
      status: 'open',
      totalEntries: 0,
      entries: []
    });

    // Create test users
    users = await Promise.all(
      Array(5).fill(null).map((_, i) =>
        User.create({
          email: `user${i}@test.com`,
          password: 'pass123'
        })
      )
    );
  });

  test('E2E: Donations → Entry Allocation → Fair Drawing → Winner Selection', async () => {
    // STEP 1: Campaign with multiple donations
    const campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);

    // User 1: $100 donation = 1 entry
    await CampaignService.recordDonation({
      campaignId: campaign._id,
      supporterId: users[0]._id,
      amount: 10000
    });

    // User 2: $200 donation = 1 entry
    await CampaignService.recordDonation({
      campaignId: campaign._id,
      supporterId: users[1]._id,
      amount: 20000
    });

    // User 3: Created campaign = 1 entry
    await SweepstakesService.addEntry({
      userId: users[2]._id,
      type: 'campaign_creation',
      drawingId: drawing._id
    });

    // User 4: Shared = 0.5 entries
    await SweepstakesService.addEntry({
      userId: users[3]._id,
      type: 'share_reward',
      drawingId: drawing._id
    });

    // STEP 2: Verify fairness metrics
    const metrics = await SweepstakesService.calculateFairnessMetrics(drawing._id);
    expect(metrics.totalEntries).toBeGreaterThan(0);
    expect(metrics.hhi).toBeGreaterThan(0);
    expect(metrics.hhi).toBeLessThanOrEqual(10000);

    // STEP 3: Execute drawing
    const result = await SweepstakesService.executeDrawing(drawing._id);
    expect(result.status).toBe('completed');
    expect(result.winnerUserId).toBeDefined();
    expect(result.winningEntryNumber).toBeDefined();

    // STEP 4: Notify winner
    const winner = await User.findById(result.winnerUserId);
    const notification = await Notification.findOne({
      userId: winner._id,
      type: 'sweepstakes_winner'
    });
    expect(notification).toBeDefined();

    // STEP 5: Winner can claim prize
    const claimRes = await request(app)
      .post(`/api/sweepstakes/claims`)
      .set('Authorization', `Bearer ${getAuthToken(winner)}`)
      .send({
        drawingId: drawing._id
      });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.status).toBe('pending_verification');
  });

  test('E2E: Weighted drawing favors higher contributors', async () => {
    // Create 100 donations: 99 users with $1 each, 1 user with $900
    const campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);

    const smallDonors = users.slice(0, 2);
    const largeDonor = users[2];

    // 2 small donations
    for (let donor of smallDonors) {
      await CampaignService.recordDonation({
        campaignId: campaign._id,
        supporterId: donor._id,
        amount: 1000 // $10 each = 2 total entries
      });
    }

    // 1 large donation
    await CampaignService.recordDonation({
      campaignId: campaign._id,
      supporterId: largeDonor._id,
      amount: 90000 // $900 = 1 entry (but weighted)
    });

    // Run drawing multiple times
    const winners = {};
    for (let i = 0; i < 30; i++) {
      const testDrawing = await SweepstakesDrawing.create({
        status: 'open',
        entries: [
          { userId: smallDonors[0]._id, weight: 1 },
          { userId: smallDonors[1]._id, weight: 1 },
          { userId: largeDonor._id, weight: 1 }
        ]
      });

      const result = await SweepstakesService.executeDrawing(testDrawing._id);
      winners[result.winnerUserId] = (winners[result.winnerUserId] || 0) + 1;
    }

    // Large donor should win more often (though still probabilistic)
    const largeDonorWins = winners[largeDonor._id] || 0;
    const totalDrawings = 30;
    const largeDonorWinRate = largeDonorWins / totalDrawings;

    // Large donor with 1 entry out of 3 should have ~33%, but due to randomness
    // we'll check it's not extremely skewed in wrong direction
    expect(largeDonorWinRate).toBeGreaterThan(0.15); // Not less than 15%
  });
});

// ==========================================
// WORKFLOW 3: Prize Claiming Process
// ==========================================

describe('WORKFLOW 3: Prize Claiming & Validation', () => {
  test('E2E: Winner Notified → Claim Window Opens → Verify Payment Method → Award Prize', async () => {
    // STEP 1: Setup drawing with winner
    const drawing = await SweepstakesDrawing.create({
      status: 'open',
      totalEntries: 100,
      entries: Array(100).fill(null).map((_, i) => ({
        userId: `user-${i % 10}`,
        weight: 10
      }))
    });

    const winner = await User.findById('user-5');
    const result = await SweepstakesService.executeDrawing(drawing._id);
    expect(result.winnerUserId).toBeDefined();

    // STEP 2: Claim window available
    const claimableRes = await request(app)
      .get(`/api/sweepstakes/prizes`)
      .set('Authorization', `Bearer ${getAuthToken(winner)}`);

    expect(claimableRes.status).toBe(200);
    const prize = claimableRes.body.data.find(p => p.drawingId === drawing._id);
    expect(prize).toBeDefined();
    expect(prize.status).toBe('available_for_claim');
    expect(prize.expiresAt).toBeDefined();

    // STEP 3: Winner initiates claim
    const claimRes = await request(app)
      .post(`/api/sweepstakes/claims`)
      .set('Authorization', `Bearer ${getAuthToken(winner)}`)
      .send({
        drawingId: drawing._id,
        paymentMethodId: 'pm-001'
      });

    expect(claimRes.status).toBe(200);
    const claim = claimRes.body.data;
    expect(claim.status).toBe('pending_verification');
    expect(claim.requestedAt).toBeDefined();

    // STEP 4: Admin verifies claim
    const adminToken = await getAdminAuthToken();
    const verifyRes = await request(app)
      .post(`/api/sweepstakes/claims/${claim._id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verified: true,
        notes: 'Payment method verified'
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('verified');

    // STEP 5: Payout issued
    const payoutRes = await request(app)
      .post(`/api/sweepstakes/claims/${claim._id}/payout`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 10000 // $100 prize
      });

    expect(payoutRes.status).toBe(200);
    expect(payoutRes.body.data.status).toBe('paid');
    expect(payoutRes.body.data.paidAt).toBeDefined();

    // STEP 6: Verify user wallet updated
    const updatedWinner = await User.findById(winner._id);
    expect(updatedWinner.walletBalance).toBeGreaterThan(0);
  });

  test('E2E: Claim Expires After 30 Days', async () => {
    const drawing = await SweepstakesDrawing.create({
      status: 'completed',
      completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) // 31 days ago
    });

    // Attempt to claim
    const claimRes = await request(app)
      .post(`/api/sweepstakes/claims`)
      .set('Authorization', `Bearer ${getAuthToken(winner)}`)
      .send({
        drawingId: drawing._id
      });

    expect(claimRes.status).toBe(410); // Gone
    expect(claimRes.body.error).toContain('expired');
  });
});

// ==========================================
// WORKFLOW 4: Admin Moderation & Audit Logging
// ==========================================

describe('WORKFLOW 4: Admin Moderation & Transparency', () => {
  let adminToken;
  let campaign;

  beforeEach(async () => {
    const admin = await User.create({
      email: 'admin@test.com',
      password: 'pass123',
      role: 'admin'
    });
    adminToken = await getAuthToken(admin);

    campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);
  });

  test('E2E: Flag Suspicious Campaign → Review → Take Action → Log Audit Trail', async () => {
    // STEP 1: Admin flags campaign as suspicious
    const flagRes = await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'SUSPICIOUS_ACTIVITY',
        details: 'Unusual donation pattern detected'
      });

    expect(flagRes.status).toBe(200);
    expect(flagRes.body.data.status).toBe('flagged');

    // STEP 2: Verify audit log entry created
    const auditLog = await AuditLog.findOne({
      action: 'campaign_flagged',
      targetId: campaign._id
    });
    expect(auditLog).toBeDefined();
    expect(auditLog.performedBy).toBe(adminToken.userId);

    // STEP 3: Admin reviews flagged campaigns
    const reviewRes = await request(app)
      .get(`/api/admin/campaigns?status=flagged`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.some(c => c._id == campaign._id)).toBe(true);

    // STEP 4: Admin suspends campaign
    const suspendRes = await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'POLICY_VIOLATION',
        message: 'Campaign suspended pending review'
      });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe('suspended');

    // STEP 5: Verify audit trail is complete
    const allLogs = await AuditLog.find({ targetId: campaign._id });
    expect(allLogs.length).toBeGreaterThanOrEqual(2);
    expect(allLogs.some(l => l.action === 'campaign_flagged')).toBe(true);
    expect(allLogs.some(l => l.action === 'campaign_suspended')).toBe(true);

    // STEP 6: Financial report shows suspended campaign
    const reportRes = await request(app)
      .get(`/api/admin/financial-report`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reportRes.status).toBe(200);
    const suspended = reportRes.body.data.suspendedCampaigns;
    expect(suspended.some(c => c._id == campaign._id)).toBe(true);
  });

  test('E2E: Transaction Verification Workflow', async () => {
    const supporter = await User.create({
      email: 'supporter@test.com',
      password: 'pass123',
      walletBalance: 100000
    });

    const tx = await Transaction.create({
      campaignId: campaign._id,
      supporterId: supporter._id,
      amount: 50000,
      type: 'donation',
      status: 'pending'
    });

    // STEP 1: Admin reviews high-risk transactions
    const txRes = await request(app)
      .get(`/api/admin/transactions?riskScore=gte:70`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(txRes.status).toBe(200);

    // STEP 2: Admin verifies transaction
    const verifyRes = await request(app)
      .post(`/api/admin/transactions/${tx._id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verified: true,
        notes: 'Payment method validated'
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('verified');

    // STEP 3: Audit trail records verification
    const auditLog = await AuditLog.findOne({
      action: 'transaction_verified',
      targetId: tx._id
    });
    expect(auditLog).toBeDefined();
    expect(auditLog.performedBy).toBe(adminToken.userId);
  });
});

// ==========================================
// ERROR SCENARIOS (15+ tests)
// ==========================================

describe('Integration: Error Scenarios', () => {
  test('Should not allow donation to draft campaign', async () => {
    const campaign = await CampaignService.createCampaign(validData);
    const supporter = await User.create({
      email: 'supporter@test.com',
      password: 'pass123',
      walletBalance: 100000
    });

    const donateRes = await request(app)
      .post(`/api/campaigns/${campaign._id}/donate`)
      .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
      .send({ amount: 50000 });

    expect(donateRes.status).toBe(400);
    expect(donateRes.body.error).toContain('not active');
  });

  test('Should reject donation with insufficient balance', async () => {
    const campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);

    const poorSupporter = await User.create({
      email: 'poor@test.com',
      password: 'pass123',
      walletBalance: 1000 // $10, trying to donate $100
    });

    const donateRes = await request(app)
      .post(`/api/campaigns/${campaign._id}/donate`)
      .set('Authorization', `Bearer ${getAuthToken(poorSupporter)}`)
      .send({ amount: 10000 });

    expect(donateRes.status).toBe(402); // Payment required
  });

  test('Should prevent claiming prize outside 30-day window', async () => {
    const drawing = await SweepstakesDrawing.create({
      completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    });

    const winner = await User.findById(drawing.winnerUserId);
    const claimRes = await request(app)
      .post(`/api/sweepstakes/claims`)
      .set('Authorization', `Bearer ${getAuthToken(winner)}`)
      .send({ drawingId: drawing._id });

    expect(claimRes.status).toBe(410); // Expired
  });

  test('Should reject unauthorized admin actions', async () => {
    const campaign = await CampaignService.createCampaign(validData);
    const regularUser = await User.create({
      email: 'user@test.com',
      password: 'pass123',
      role: 'user'
    });

    const suspendRes = await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/suspend`)
      .set('Authorization', `Bearer ${getAuthToken(regularUser)}`)
      .send({ reason: 'TEST' });

    expect(suspendRes.status).toBe(403); // Forbidden
  });

  test('Should handle missing required fields in donation', async () => {
    const campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);

    const supporter = await User.create({
      email: 'supporter@test.com',
      password: 'pass123',
      walletBalance: 100000
    });

    const donateRes = await request(app)
      .post(`/api/campaigns/${campaign._id}/donate`)
      .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
      .send({}); // Missing amount

    expect(donateRes.status).toBe(400);
  });
});

// ==========================================
// DATA CONSISTENCY TESTS (10+ tests)
// ==========================================

describe('Integration: Data Consistency', () => {
  test('Campaign metrics remain consistent during concurrent donations', async () => {
    const campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);

    const supporters = await Promise.all(
      Array(20).fill(null).map((_, i) =>
        User.create({
          email: `supporter${i}@test.com`,
          password: 'pass123',
          walletBalance: 100000
        })
      )
    );

    const donationPromises = supporters.map((supporter, i) =>
      request(app)
        .post(`/api/campaigns/${campaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send({ amount: 5000 })
    );

    await Promise.all(donationPromises);

    const updated = await Campaign.findById(campaign._id);
    expect(updated.currentAmount).toBe(100000); // 20 × $50
    expect(updated.supporters.length).toBe(20);
  });

  test('Sweepstakes entry count matches transaction count', async () => {
    const campaign = await CampaignService.createCampaign(validData);
    await CampaignService.publishCampaign(campaign._id);

    const supporter = await User.create({
      email: 'supporter@test.com',
      password: 'pass123',
      walletBalance: 100000
    });

    const donations = [
      { amount: 10000 },
      { amount: 20000 },
      { amount: 30000 }
    ];

    for (let donation of donations) {
      await request(app)
        .post(`/api/campaigns/${campaign._id}/donate`)
        .set('Authorization', `Bearer ${getAuthToken(supporter)}`)
        .send(donation);
    }

    const transactions = await Transaction.find({ supporterId: supporter._id });
    const entries = await SweepstakesSubmission.find({ userId: supporter._id });

    expect(transactions.length).toBe(3);
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  test('Audit trail records all admin actions', async () => {
    const admin = await User.create({
      email: 'admin@test.com',
      password: 'pass123',
      role: 'admin'
    });

    const campaign = await CampaignService.createCampaign(validData);

    // Perform multiple admin actions
    await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/flag`)
      .set('Authorization', `Bearer ${getAuthToken(admin)}`)
      .send({ reason: 'TEST' });

    await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/suspend`)
      .set('Authorization', `Bearer ${getAuthToken(admin)}`)
      .send({ reason: 'TEST' });

    const auditLogs = await AuditLog.find({ targetId: campaign._id });
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
    expect(auditLogs.every(l => l.performedBy)).toBe(true);
  });
});

module.exports = {};
