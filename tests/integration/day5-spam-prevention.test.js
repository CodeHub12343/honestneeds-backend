/**
 * Day 5: Spam Prevention Tests
 * Tests for rate limiting, duplicate detection, behavior analysis
 */

const mongoose = require('mongoose');
const Campaign = require('../../src/models/Campaign');
const { ShareRecord } = require('../../src/models/Share');
const ReferralTracking = require('../../src/models/ReferralTracking');
const User = require('../../src/models/User');
const SpamDetectionService = require('../../src/services/SpamDetectionService');

const createTestUser = async (data = {}) => {
  const defaults = {
    name: `Test User ${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    phone: '1234567890',
    password: 'hashedpassword',
    role: 'supporter',
    ...data,
  };
  const user = new User(defaults);
  await user.save();
  return user;
};

const createTestCampaign = async (creatorId, data = {}) => {
  const defaults = {
    campaign_id: `CAMP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    creator_id: creatorId,
    title: 'Test Campaign',
    description: 'Spam test campaign',
    need_type: 'education_scholarship_matching',
    status: 'active',
    share_config: {
      total_budget: 500000,
      current_budget_remaining: 500000,
      amount_per_share: 100,
      is_paid_sharing_active: true,
      share_channels: [],
    },
    ...data,
  };
  const campaign = new Campaign(defaults);
  await campaign.save();
  return campaign;
};

describe('Day 5: Spam Prevention & Detection', () => {
  const spamService = new SpamDetectionService();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-test';
      await mongoose.connect(mongoUrl);
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Campaign.deleteMany({});
    await ShareRecord.deleteMany({});
    await ReferralTracking.deleteMany({});
    await User.deleteMany({});
  });

  describe('Rate Limiting: 10 shares per IP per campaign per hour', () => {
    test('Allow up to 10 shares from same IP', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const ipAddress = '192.168.1.100';

      // Record 10 shares from same IP
      for (let i = 0; i < 10; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-RATE-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFRATE${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: ipAddress,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();

        // Check rate limit
        const rateCheck = await spamService.checkRateLimit(campaign._id.toString(), ipAddress);
        expect(rateCheck.allowed).toBe(true);
        expect(rateCheck.remaining).toBe(10 - (i + 1));
      }

      console.log('✅ 10 shares allowed from same IP');
    });

    test('Reject 11th share from same IP within 1 hour', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const ipAddress = '192.168.1.200';

      // Record 10 shares
      for (let i = 0; i < 10; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-REJECT-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFREJECT${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: ipAddress,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();
      }

      // Check rate limit for 11th share
      const rateCheck = await spamService.checkRateLimit(campaign._id.toString(), ipAddress);
      expect(rateCheck.allowed).toBe(false);
      expect(rateCheck.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(rateCheck.remaining).toBe(0);

      console.log('✅ 11th share from same IP rejected');
    });

    test('Allow shares after 1 hour window passes', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const ipAddress = '192.168.1.150';

      // Create shares with old timestamp (>1 hour ago)
      for (let i = 0; i < 10; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-OLD-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFOLD${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: ipAddress,
          sweepstakes_entries_awarded: 1,
          created_at: new Date(Date.now() - 3700000), // 61+ minutes ago
        });
        await share.save();
      }

      // Now same IP should be allowed (old shares outside window)
      const rateCheck = await spamService.checkRateLimit(campaign._id.toString(), ipAddress);
      expect(rateCheck.allowed).toBe(true);

      console.log('✅ Rate limit reset after 1 hour window');
    });
  });

  describe('Duplicate Detection: Same IP + Campaign within 5 minutes', () => {
    test('Detect duplicate share from same IP', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();
      const ipAddress = '192.168.1.50';

      // First share
      const share1 = new ShareRecord({
        share_id: 'SHARE-DUP-1',
        campaign_id: campaign._id,
        supporter_id: supporter._id,
        channel: 'email',
        referral_code: 'REFDUP1',
        is_paid: true,
        reward_amount: 100,
        status: 'completed',
        ip_address: ipAddress,
        sweepstakes_entries_awarded: 1,
        created_at: new Date(Date.now() - 60000), // 1 minute ago
      });
      await share1.save();

      // Second share (duplicate attempt)
      const duplicate = await spamService.checkDuplicateActivity(
        campaign._id.toString(),
        ipAddress,
        'email'
      );

      expect(duplicate.detected).toBe(true);
      expect(duplicate.code).toBe('DUPLICATE_SHARE_ATTEMPT');
      expect(duplicate.lastShare._id.toString()).toBe(share1._id.toString());

      console.log('✅ Duplicate share detected');
    });

    test('Allow new share after 5 minute window', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();
      const ipAddress = '192.168.1.60';

      // Share from 6 minutes ago
      const oldShare = new ShareRecord({
        share_id: 'SHARE-OLD',
        campaign_id: campaign._id,
        supporter_id: supporter._id,
        channel: 'email',
        referral_code: 'REFOLD',
        is_paid: true,
        reward_amount: 100,
        status: 'completed',
        ip_address: ipAddress,
        sweepstakes_entries_awarded: 1,
        created_at: new Date(Date.now() - 360000), // 6 minutes ago
      });
      await oldShare.save();

      const duplicate = await spamService.checkDuplicateActivity(
        campaign._id.toString(),
        ipAddress,
        'email'
      );

      expect(duplicate.detected).toBe(false);

      console.log('✅ Share allowed after 5 minute window');
    });

    test('Different channels not considered duplicates', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();
      const ipAddress = '192.168.1.70';

      // Email share
      const emailShare = new ShareRecord({
        share_id: 'SHARE-EMAIL',
        campaign_id: campaign._id,
        supporter_id: supporter._id,
        channel: 'email',
        referral_code: 'REFEMAIL',
        is_paid: true,
        reward_amount: 100,
        status: 'completed',
        ip_address: ipAddress,
        sweepstakes_entries_awarded: 1,
        created_at: new Date(Date.now() - 60000),
      });
      await emailShare.save();

      // Facebook share from same IP (allowed)
      const duplicate = await spamService.checkDuplicateActivity(
        campaign._id.toString(),
        ipAddress,
        'facebook'
      );

      expect(duplicate.detected).toBe(false);

      console.log('✅ Different channels not flagged as duplicates');
    });
  });

  describe('Behavior Analysis: Suspicious Patterns', () => {
    test('Flag rapid succession shares (4+ in 10 minutes)', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();
      const ipAddress = '192.168.1.80';

      // Create 4 shares within 10 minutes
      for (let i = 0; i < 4; i++) {
        const share = new ShareRecord({
          share_id: `SHARE-RAPID-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFRAPID${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: ipAddress,
          sweepstakes_entries_awarded: 1,
          created_at: new Date(Date.now() - i * 60000), // 0, 1, 2, 3 min ago
        });
        await share.save();
      }

      const analysis = await spamService.analyzeBehavior(campaign._id.toString(), ipAddress, {
        supporterId: supporter._id,
      });

      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.suspicionScore).toBeGreaterThan(0);
      expect(analysis.flags.some((f) => f.type === 'rapid_succession')).toBe(true);

      console.log(`✅ Rapid succession flagged (suspicion: ${analysis.suspicionScore})`);
    });

    test('Flag no-engagement pattern (many shares, no conversions)', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();

      // Create 55 old shares with no conversions
      for (let i = 0; i < 55; i++) {
        const share = new ShareRecord({
          share_id: `SHARE-NOENG-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFNOENG${i}`,
          is_paid: false,
          reward_amount: 0,
          status: 'completed',
          ip_address: `192.168.1.${100 + i}`,
          sweepstakes_entries_awarded: 0.5,
          created_at: new Date(Date.now() - 8 * 24 * 3600000), // 8 days ago
        });
        share.save();
      }

      // Wait for all to save
      await ShareRecord.deleteMany({ campaign_id: campaign._id });
      for (let i = 0; i < 55; i++) {
        const share = new ShareRecord({
          share_id: `SHARE-NOENG-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFNOENG${i}`,
          is_paid: false,
          reward_amount: 0,
          status: 'completed',
          ip_address: `192.168.1.${100 + i}`,
          sweepstakes_entries_awarded: 0.5,
          created_at: new Date(Date.now() - 8 * 24 * 3600000),
        });
        await share.save();
      }

      const analysis = await spamService.analyzeBehavior(campaign._id.toString(), '192.168.1.100', {
        supporterId: supporter._id,
      });

      expect(analysis.flags.some((f) => f.type === 'no_engagement')).toBe(true);

      console.log(`✅ No-engagement pattern detected`);
    });

    test('Calculate suspicion score accurately', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();
      const ipAddress = '192.168.1.90';

      // Multiple suspicious patterns
      for (let i = 0; i < 5; i++) {
        const share = new ShareRecord({
          share_id: `SHARE-MULTI-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFMULTI${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: ipAddress,
          sweepstakes_entries_awarded: 1,
          created_at: new Date(Date.now() - i * 30000),
        });
        await share.save();
      }

      const analysis = await spamService.analyzeBehavior(campaign._id.toString(), ipAddress, {
        supporterId: supporter._id,
      });

      expect(analysis.suspicionScore).toBeGreaterThanOrEqual(0);
      expect(analysis.suspicionScore).toBeLessThanOrEqual(100);
      expect(analysis.isSuspicious).toBe(analysis.suspicionScore >= 40);

      console.log(`✅ Suspicion score: ${analysis.suspicionScore}`);
    });
  });

  describe('Share Revocation & Refund', () => {
    test('Revoke paid share and refund reward', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();

      // Record paid share
      const share = new ShareRecord({
        share_id: 'SHARE-REVOKE',
        campaign_id: campaign._id,
        supporter_id: supporter._id,
        channel: 'email',
        referral_code: 'REFREVOKE',
        is_paid: true,
        reward_amount: 100,
        status: 'completed',
        ip_address: '192.168.1.99',
        sweepstakes_entries_awarded: 1,
      });
      await share.save();

      const beforeCampaign = await Campaign.findById(campaign._id);
      const budgetBefore = beforeCampaign.share_config.current_budget_remaining;

      // Revoke share
      const result = await spamService.revokeShare(share._id, 'Spam detected');

      expect(result.success).toBe(true);
      expect(result.refunded).toBe(100);

      // Verify refund applied
      const afterCampaign = await Campaign.findById(campaign._id);
      expect(afterCampaign.share_config.current_budget_remaining).toBe(budgetBefore + 100);

      // Verify share marked invalid
      const revokedShare = await ShareRecord.findById(share._id);
      expect(revokedShare.status).toBe('invalid');

      console.log('✅ Share revoked and reward refunded');
    });

    test('Revert referral tracking when share revoked', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();

      // Setup share and referral tracking
      const share = new ShareRecord({
        share_id: 'SHARE-TRACK-REVOKE',
        campaign_id: campaign._id,
        supporter_id: supporter._id,
        channel: 'email',
        referral_code: 'REFTRACK',
        is_paid: false,
        reward_amount: 0,
        status: 'completed',
        ip_address: '192.168.1.111',
        sweepstakes_entries_awarded: 0.5,
      });
      await share.save();

      // Create referral tracking
      const tracking = new ReferralTracking({
        tracking_id: `REF-${Date.now()}`,
        campaign_id: campaign._id,
        share_id: share._id,
        referrer_id: supporter._id,
        referral_visits: [{ visitor_id: new mongoose.Types.ObjectId(), visited_at: new Date() }],
        conversions: [
          {
            converted_by_id: new mongoose.Types.ObjectId(),
            donation_id: new mongoose.Types.ObjectId(),
            donation_amount: 5000,
            converted_at: new Date(),
            reward_pending: true,
          },
        ],
        total_visits: 1,
        total_conversions: 1,
        total_conversion_amount: 5000,
        conversion_rate: '100.00',
      });
      await tracking.save();

      console.log('Tracking before revoke:', tracking.total_conversions);

      // Revoke share
      await spamService.revokeShare(share._id, 'Fraudulent activity');

      // Verify tracking reverted
      const revokedTracking = await ReferralTracking.findById(tracking._id);
      expect(revokedTracking.total_visits).toBe(0);
      expect(revokedTracking.total_conversions).toBe(0);
      expect(revokedTracking.referral_visits.length).toBe(0);
      expect(revokedTracking.conversions.length).toBe(0);
      expect(revokedTracking.original_metrics_archived).toBeDefined();

      console.log('✅ Referral tracking reverted along with share revocation');
    });
  });

  describe('Archiving & Admin Review', () => {
    test('Archive suspicious share for admin review', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);
      const supporter = await createTestUser();

      const share = new ShareRecord({
        share_id: 'SHARE-ARCHIVE',
        campaign_id: campaign._id,
        supporter_id: supporter._id,
        channel: 'email',
        referral_code: 'REFARCHIVE',
        is_paid: true,
        reward_amount: 100,
        status: 'completed',
        ip_address: '192.168.1.88',
        sweepstakes_entries_awarded: 1,
      });
      await share.save();

      const analysis = {
        suspicionScore: 75,
        isSuspicious: true,
        flags: [{ type: 'rapid_succession', severity: 'high' }],
      };

      const result = await spamService.archiveSuspiciousShare(
        share._id,
        analysis,
        'Multiple rapid shares from same network'
      );

      expect(result.success).toBe(true);

      // Verify archived
      const archivedShare = await ShareRecord.findById(share._id);
      expect(archivedShare.is_suspicious).toBe(true);
      expect(archivedShare.requires_review).toBe(true);
      expect(archivedShare.suspension_analysis.suspicionScore).toBe(75);

      console.log('✅ Share archived for admin review');
    });

    test('Get suspicious shares requiring review', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      // Create multiple suspicious shares
      for (let i = 0; i < 5; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-REVIEW-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFREVIEW${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: `192.168.1.${55 + i}`,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();

        await spamService.archiveSuspiciousShare(share._id, { suspicionScore: 50 + i * 10 }, 'Spam');
      }

      const result = await spamService.getSuspiciousShares(campaign._id.toString());

      expect(result.shares.length).toBe(5);
      expect(result.pagination.total).toBe(5);

      console.log(`✅ Found ${result.shares.length} suspicious shares requiring review`);
    });

    test('Get spam stats for campaign', async () => {
      const creator = await createTestUser({ role: 'creator' });
      const campaign = await createTestCampaign(creator._id);

      // Create 100 normal shares
      for (let i = 0; i < 100; i++) {
        const supporter = await createTestUser();
        const share = new ShareRecord({
          share_id: `SHARE-STATS-${i}`,
          campaign_id: campaign._id,
          supporter_id: supporter._id,
          channel: 'email',
          referral_code: `REFSTATS${i}`,
          is_paid: true,
          reward_amount: 100,
          status: 'completed',
          ip_address: `192.168.${i / 256}.${i % 256}`,
          sweepstakes_entries_awarded: 1,
        });
        await share.save();
      }

      // Mark 10 as suspicious
      const suspicious = await ShareRecord.find({ campaign_id: campaign._id }).limit(10);
      for (const share of suspicious) {
        await spamService.archiveSuspiciousShare(share._id, { suspicionScore: 60 }, 'Spam');
      }

      const stats = await spamService.getSpamStats(campaign._id.toString());

      expect(stats.totalShares).toBe(100);
      expect(stats.suspiciousShares).toBe(10);
      expect(stats.revokedShares).toBeGreaterThanOrEqual(0);

      console.log(`✅ Spam stats: ${stats.suspiciousShares}/${stats.totalShares} flagged`);
      console.log(`   Spam rate: ${stats.spamRate}`);
    });
  });
});
