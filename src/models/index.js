/**
 * Models Index
 * Centralized export of all Mongoose models
 */

module.exports = {
  // User & Auth related
  User: require('./User'),
  TokenBlacklist: require('./TokenBlacklist'),

  // Campaign related
  Campaign: require('./Campaign'),
  CampaignProgress: require('./CampaignProgress'),
  CampaignUpdate: require('./CampaignUpdate'),
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

  // Logging & Audit
  ActivityLog: require('./ActivityLog'),
  AuditLog: require('./AuditLog'),
  UserReport: require('./UserReport'),
  StripeWebhookLog: require('./StripeWebhookLog'),
};
