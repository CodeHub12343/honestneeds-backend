/**
 * Gamification Routes (RG-02..RG-21)
 *
 * Mounted at /api/gamification. Public read endpoints use optional auth so the
 * swipe feed / hunts can be personalized when a token is present; mutating and
 * personal endpoints require auth. Challenge/hunt creation is admin-only.
 */

const express = require('express');
const router = express.Router();
const GamificationController = require('../controllers/GamificationController');
const {
  authMiddleware,
  optionalAuthMiddleware,
  requireAdmin,
} = require('../middleware/authMiddleware');

// ── Profile / XP / Badges (RG-02, RG-03) ────────────────────────────────
router.get('/me', authMiddleware, GamificationController.getMyProfile);
router.get('/users/:userId/progress', GamificationController.getUserProgress);

// ── RG-04 Streaks ────────────────────────────────────────────────────────
router.post('/streak/check-in', authMiddleware, GamificationController.checkInStreak);

// ── RG-05 Leaderboards ────────────────────────────────────────────────────
router.get('/leaderboard/me', authMiddleware, GamificationController.getMyRank);
router.get('/leaderboard/:category', GamificationController.getLeaderboard);
router.get('/leaderboard', (req, res, next) => {
  req.params.category = 'xp';
  GamificationController.getLeaderboard(req, res, next);
});

// ── RG-09 Viral Multiplier ────────────────────────────────────────────────
router.get('/viral/me', authMiddleware, GamificationController.getMyViralStatus);

// ── RG-10 Golden Tickets ──────────────────────────────────────────────────
router.get('/golden-tickets/me', authMiddleware, GamificationController.getMyGoldenTickets);

// ── RG-14 / RG-06 Meters ──────────────────────────────────────────────────
router.get('/hope-meter/me', authMiddleware, GamificationController.getMyHopeMeter);
router.get('/hope-meter/campaign/:campaignId', GamificationController.getCampaignHopeMeter);
router.get('/prayer-meter/campaign/:campaignId', GamificationController.getPrayerPowerMeter);

// ── RG-15 Journey / RG-12 Celebrations ────────────────────────────────────
router.get('/journey/me', authMiddleware, GamificationController.getMyJourney);
router.get('/celebrations/me', authMiddleware, GamificationController.getMyCelebrations);

// ── RG-17 Swipe-to-Help feed ──────────────────────────────────────────────
router.get('/swipe-feed', optionalAuthMiddleware, GamificationController.getSwipeFeed);

// ── RG-18 Missions ────────────────────────────────────────────────────────
router.get('/missions/me', authMiddleware, GamificationController.getMyMissions);

// ── RG-07 Teams ───────────────────────────────────────────────────────────
router.get('/teams', GamificationController.listTeams);
router.post('/teams', authMiddleware, GamificationController.createTeam);
router.get('/teams/:idOrSlug', GamificationController.getTeam);
router.post('/teams/:id/join', authMiddleware, GamificationController.joinTeam);
router.post('/teams/:id/leave', authMiddleware, GamificationController.leaveTeam);

// ── RG-08/20/21 Community Challenges ──────────────────────────────────────
router.get('/challenges', GamificationController.listChallenges);
router.post('/challenges', requireAdmin, GamificationController.createChallenge);
router.get('/challenges/:idOrSlug', GamificationController.getChallenge);

// ── RG-11 Treasure Hunts ──────────────────────────────────────────────────
router.get('/treasure-hunts', GamificationController.listHunts);
router.post('/treasure-hunts', requireAdmin, GamificationController.createHunt);
router.get('/treasure-hunts/:idOrSlug', optionalAuthMiddleware, GamificationController.getHunt);
router.post('/treasure-hunts/:idOrSlug/find', authMiddleware, GamificationController.findStop);

// ── RG-19 Miracle Mode ────────────────────────────────────────────────────
router.get('/miracle-mode', GamificationController.getMiracleCampaigns);
router.post('/miracle-mode/:campaignId/activate', authMiddleware, GamificationController.activateMiracleMode);
router.post('/miracle-mode/:campaignId/deactivate', authMiddleware, GamificationController.deactivateMiracleMode);

module.exports = router;
