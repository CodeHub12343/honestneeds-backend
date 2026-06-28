/**
 * GamificationController (RG-02..RG-21)
 *
 * HTTP surface for the rewards & gamification subsystem. Thin handlers that
 * delegate to the gamification services. Mounted under /api/gamification
 * (see routes/gamificationRoutes.js).
 */

const GamificationService = require('../services/GamificationService');
const LeaderboardService = require('../services/LeaderboardService');
const MissionService = require('../services/MissionService');
const CampaignTeamService = require('../services/CampaignTeamService');
const CommunityChallengeService = require('../services/CommunityChallengeService');
const TreasureHuntService = require('../services/TreasureHuntService');
const HopeMeterService = require('../services/HopeMeterService');
const winstonLogger = require('../utils/winstonLogger');

const ok = (res, data, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, data });
const fail = (res, error, status = 500) =>
  res.status(status).json({ success: false, message: error.message || 'Request failed' });

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      winstonLogger.error('Gamification handler error', { path: req.path, error: error.message, stack: error.stack });
      const status = /not found/i.test(error.message) ? 404 : /required|invalid|must be/i.test(error.message) ? 400 : 500;
      fail(res, error, status);
    }
  };
}

const GamificationController = {
  // ── Profile / XP / Badges (RG-02, RG-03) ──────────────────────────────
  getMyProfile: handle(async (req, res) => {
    const userId = req.user.id;
    const progress = await GamificationService.getProgress(userId);
    ok(res, progress, 'Gamification profile retrieved');
  }),

  getUserProgress: handle(async (req, res) => {
    const progress = await GamificationService.getProgress(req.params.userId);
    ok(res, progress, 'Progress retrieved');
  }),

  // ── RG-04 Streaks ─────────────────────────────────────────────────────
  checkInStreak: handle(async (req, res) => {
    const result = await GamificationService.recordDailyActivity(req.user.id);
    ok(res, result, 'Streak updated');
  }),

  // ── RG-05 Leaderboards ────────────────────────────────────────────────
  getLeaderboard: handle(async (req, res) => {
    const board = await LeaderboardService.getLeaderboard(req.params.category || 'xp', {
      period: req.query.period,
      limit: req.query.limit,
    });
    ok(res, board, 'Leaderboard retrieved');
  }),

  getMyRank: handle(async (req, res) => {
    const rank = await LeaderboardService.getUserRank(req.user.id, req.query.category || 'xp');
    ok(res, rank, 'Rank retrieved');
  }),

  // ── RG-09 Viral Multiplier ────────────────────────────────────────────
  getMyViralStatus: handle(async (req, res) => {
    // The viral tier snapshot is cached on the user (recomputed on conversions).
    const User = require('../models/User');
    const user = await User.findById(req.user.id).select('gamification.viral').lean();
    ok(res, user?.gamification?.viral || { tier: 'Cold', multiplier: 1 }, 'Viral status retrieved');
  }),

  // ── RG-10 Golden Tickets ──────────────────────────────────────────────
  getMyGoldenTickets: handle(async (req, res) => {
    const GoldenTicket = require('../models/GoldenTicket');
    const tickets = await GoldenTicket.find({ user_id: req.user.id })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();
    ok(res, tickets, 'Golden tickets retrieved');
  }),

  // ── RG-14 Hope Meter ──────────────────────────────────────────────────
  getMyHopeMeter: handle(async (req, res) => {
    const meter = await HopeMeterService.getUserHopeMeter(req.user.id);
    ok(res, meter, 'Hope meter retrieved');
  }),

  getCampaignHopeMeter: handle(async (req, res) => {
    const meter = await HopeMeterService.getCampaignHopeMeter(req.params.campaignId);
    if (!meter) throw new Error('Campaign not found');
    ok(res, meter, 'Campaign hope meter retrieved');
  }),

  // ── RG-06 Prayer Power Meter ──────────────────────────────────────────
  getPrayerPowerMeter: handle(async (req, res) => {
    const meter = await HopeMeterService.getPrayerPowerMeter(req.params.campaignId);
    if (!meter) throw new Error('Campaign not found');
    ok(res, meter, 'Prayer power meter retrieved');
  }),

  // ── RG-15 Journey / RG-12 Celebrations ────────────────────────────────
  getMyJourney: handle(async (req, res) => {
    const journey = await HopeMeterService.getJourney(req.user.id, parseInt(req.query.limit) || 50);
    ok(res, journey, 'Journey retrieved');
  }),

  getMyCelebrations: handle(async (req, res) => {
    const list = await HopeMeterService.getCelebrations(req.user.id, parseInt(req.query.limit) || 20);
    ok(res, list, 'Celebrations retrieved');
  }),

  // ── RG-17 Swipe-to-Help feed ──────────────────────────────────────────
  getSwipeFeed: handle(async (req, res) => {
    const feed = await HopeMeterService.getSwipeFeed(req.user?.id, {
      limit: req.query.limit,
      city: req.query.city,
    });
    ok(res, feed, 'Swipe feed retrieved');
  }),

  // ── RG-18 Missions ────────────────────────────────────────────────────
  getMyMissions: handle(async (req, res) => {
    const missions = await MissionService.getUserMissions(req.user.id);
    ok(res, missions, 'Missions retrieved');
  }),

  // ── RG-07 Teams ───────────────────────────────────────────────────────
  createTeam: handle(async (req, res) => {
    const team = await CampaignTeamService.createTeam(req.user.id, req.body);
    ok(res, team, 'Team created', 201);
  }),
  listTeams: handle(async (req, res) => {
    const teams = await CampaignTeamService.listTeams(
      { challenge_id: req.query.challenge_id, campaign_id: req.query.campaign_id, city: req.query.city },
      parseInt(req.query.limit) || 50
    );
    ok(res, teams, 'Teams retrieved');
  }),
  getTeam: handle(async (req, res) => {
    const team = await CampaignTeamService.getTeam(req.params.idOrSlug);
    if (!team) throw new Error('Team not found');
    ok(res, team, 'Team retrieved');
  }),
  joinTeam: handle(async (req, res) => {
    const team = await CampaignTeamService.joinTeam(req.params.id, req.user.id);
    ok(res, team, 'Joined team');
  }),
  leaveTeam: handle(async (req, res) => {
    const team = await CampaignTeamService.leaveTeam(req.params.id, req.user.id);
    ok(res, team, 'Left team');
  }),

  // ── RG-08/20/21 Community Challenges ──────────────────────────────────
  listChallenges: handle(async (req, res) => {
    const challenges = await CommunityChallengeService.listChallenges({
      status: req.query.status,
      type: req.query.type,
    });
    ok(res, challenges, 'Challenges retrieved');
  }),
  getChallenge: handle(async (req, res) => {
    const board = await CommunityChallengeService.getScoreboard(req.params.idOrSlug);
    if (!board) throw new Error('Challenge not found');
    ok(res, board, 'Challenge retrieved');
  }),
  createChallenge: handle(async (req, res) => {
    const challenge = await CommunityChallengeService.createChallenge(req.body, req.user.id);
    ok(res, challenge, 'Challenge created', 201);
  }),

  // ── RG-11 Treasure Hunts ──────────────────────────────────────────────
  listHunts: handle(async (req, res) => {
    const hunts = await TreasureHuntService.listHunts({ city: req.query.city });
    ok(res, hunts, 'Hunts retrieved');
  }),
  getHunt: handle(async (req, res) => {
    const hunt = await TreasureHuntService.getHuntForUser(req.params.idOrSlug, req.user?.id);
    if (!hunt) throw new Error('Hunt not found');
    ok(res, hunt, 'Hunt retrieved');
  }),
  createHunt: handle(async (req, res) => {
    const hunt = await TreasureHuntService.createHunt(req.body);
    ok(res, hunt, 'Hunt created', 201);
  }),
  findStop: handle(async (req, res) => {
    const result = await TreasureHuntService.recordFind(req.params.idOrSlug, req.user.id, {
      code: req.body.code,
      lat: req.body.lat,
      lng: req.body.lng,
    });
    ok(res, result, result.already_found ? 'Already found' : 'Stop found');
  }),

  // ── RG-19 Miracle Mode ────────────────────────────────────────────────
  getMiracleCampaigns: handle(async (req, res) => {
    const list = await HopeMeterService.getMiracleCampaigns(parseInt(req.query.limit) || 20);
    ok(res, list, 'Miracle campaigns retrieved');
  }),
  activateMiracleMode: handle(async (req, res) => {
    // Authorization (creator or admin) is enforced in the service-adjacent
    // check below to keep the campaign lookup single-sourced.
    const Campaign = require('../models/Campaign');
    const campaign = await Campaign.findById(req.params.campaignId).select('creator_id').lean();
    if (!campaign) throw new Error('Campaign not found');
    const isOwner = campaign.creator_id?.toString() === req.user.id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Only the campaign creator or an admin can do this' });
    }
    const result = await HopeMeterService.activateMiracleMode(req.params.campaignId, req.user.id, {
      reason: req.body.reason,
      durationHours: req.body.duration_hours,
    });
    ok(res, result, 'Miracle mode activated');
  }),
  deactivateMiracleMode: handle(async (req, res) => {
    const Campaign = require('../models/Campaign');
    const campaign = await Campaign.findById(req.params.campaignId).select('creator_id').lean();
    if (!campaign) throw new Error('Campaign not found');
    const isOwner = campaign.creator_id?.toString() === req.user.id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the campaign creator or an admin can do this' });
    }
    const result = await HopeMeterService.deactivateMiracleMode(req.params.campaignId);
    ok(res, result, 'Miracle mode deactivated');
  }),
};

module.exports = GamificationController;
