/**
 * Models Index
 * Centralized export of all Mongoose models
 */

module.exports = {
  // User & Auth related
  User: require('./User'),
  TokenBlacklist: require('./TokenBlacklist'),
  IdentityVerification: require('./IdentityVerification'),

  // Campaign related
  Campaign: require('./Campaign'),
  CampaignProgress: require('./CampaignProgress'),
  CampaignUpdate: require('./CampaignUpdate'),
  CampaignComment: require('./CampaignComment'),
  CampaignMilestone: require('./CampaignMilestone'),
  Category: require('./Category'),

  // Transaction & Donation related
  Transaction: require('./Transaction'),
  Donation: require('./Donation'),
  FeeTransaction: require('./FeeTransaction'),
  
  // Payment & Wallet related
  PaymentMethod: require('./PaymentMethod'),
  Wallet: require('./Wallet'),
  Payout: require('./Payout'),
  Withdrawal: require('./Withdrawal'),
  SettlementLedger: require('./SettlementLedger'),

  // Sharing & Referral related
  Share: require('./Share'),
  ShareGrant: require('./ShareGrant'),
  ShareTracking: require('./ShareTracking'),
  ShareWithdrawal: require('./ShareWithdrawal'),
  ReferralLink: require('./ReferralLink'),
  ReferralTracking: require('./ReferralTracking'),

  // Sweepstakes related
  SweepstakesDrawing: require('./SweepstakesDrawing'),
  SweepstakesEntry: require('./SweepstakesEntry'),
  SweepstakesSubmission: require('./SweepstakesSubmission'),

  // QR & Platform related
  QRCode: require('./QRCode'),
  QRCodeScan: require('./QRCodeScan'),
  PlatformContent: require('./PlatformContent'),
  PlatformSettings: require('./PlatformSettings'),

  // Notifications & Alerts
  BroadcastNotification: require('./BroadcastNotification'),
  Alert: require('./Alert'),

  // Volunteer related
  VolunteerProfile: require('./VolunteerProfile'),
  VolunteerOffer: require('./VolunteerOffer'),
  VolunteerAssignment: require('./VolunteerAssignment'),
  // Volunteer Features (VO-03..VO-08)
  VolunteerHourLog: require('./VolunteerHourLog'),
  VolunteerReferenceLetter: require('./VolunteerReferenceLetter'),
  HopeResponderRequest: require('./HopeResponderRequest'),

  // Business Features (BU-01..BU-07)
  BusinessProfile: require('./BusinessProfile'),
  BusinessVerification: require('./BusinessVerification'),
  VolunteerOpportunity: require('./VolunteerOpportunity'),
  VolunteerApplication: require('./VolunteerApplication'),
  BusinessGiveaway: require('./BusinessGiveaway'),
  GiveawayClaim: require('./GiveawayClaim'),

  // Logging & Audit
  ActivityLog: require('./ActivityLog'),
  AuditLog: require('./AuditLog'),
  UserReport: require('./UserReport'),
  StripeWebhookLog: require('./StripeWebhookLog'),

  // AI subsystem (AI-01..AI-12)
  AIConversation: require('./AIConversation'),
  AIGenerationLog: require('./AIGenerationLog'),
  AIModerationResult: require('./AIModerationResult'),
  AIFraudAssessment: require('./AIFraudAssessment'),
  AIRecommendationCache: require('./AIRecommendationCache'),

  // Rewards & Gamification (RG-01..RG-21)
  GamificationEvent: require('./GamificationEvent'),
  Mission: require('./Mission'),
  UserMission: require('./UserMission'),
  GoldenTicket: require('./GoldenTicket'),
  CampaignTeam: require('./CampaignTeam'),
  CommunityChallenge: require('./CommunityChallenge'),
  TreasureHunt: require('./TreasureHunt'),
};
