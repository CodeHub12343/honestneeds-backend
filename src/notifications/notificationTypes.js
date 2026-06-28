/**
 * Notification Type Registry
 *
 * Single source of truth for every user-facing notification type. The
 * NotificationDispatcher resolves presentation (title/message/icon/color),
 * routing (action_url), default delivery channels, and the preference path
 * used to decide whether the user opted out — all from this table.
 *
 * Each entry:
 *   {
 *     category:        Logical grouping (used by the feed filters / UI).
 *     icon_emoji:      Default emoji shown in the bell/feed.
 *     color:           One of primary|success|warning|danger|info.
 *     defaultChannels: Channels attempted when the user has no explicit override.
 *     prefPath:        Dot-path into NotificationPreferences for the per-type
 *                      toggle (`{ enabled, channels }`). Null = always on
 *                      (transactional / security) but still gated by the
 *                      global `notifications_enabled` switch.
 *     title(data):     Builds the notification title from event data.
 *     message(data):   Builds the body text from event data.
 *     actionUrl(data): Builds a deep link, or null.
 *   }
 *
 * `data` is the merged payload passed to NotificationDispatcher.notify({ data }).
 * Templates must be defensive — every field is optional.
 */

const ALL = ['in_app', 'email', 'push'];
const IN_APP_ONLY = ['in_app'];
const IN_APP_PUSH = ['in_app', 'push'];

const money = (data) => {
  const cents =
    data.amount_cents != null
      ? data.amount_cents
      : data.amount != null
        ? Math.round(Number(data.amount) * 100)
        : null;
  if (cents == null || Number.isNaN(cents)) return null;
  return `$${(cents / 100).toFixed(2)}`;
};

const campaignName = (data) =>
  data.campaign_title || data.campaignTitle || data.title || 'your campaign';

const actor = (data) =>
  data.supporter_name || data.actor_name || data.donor_name || data.sender_name || 'Someone';

const campaignUrl = (data) =>
  data.campaign_id ? `/campaigns/${data.campaign_id}` : null;

/** @type {Record<string, object>} */
const REGISTRY = {
  // ── Prayer support ──────────────────────────────────────────────────────
  someone_prayed: {
    category: 'prayer',
    icon_emoji: '🙏',
    color: 'info',
    defaultChannels: IN_APP_PUSH,
    prefPath: 'prayer_notifications.someone_prayed',
    title: () => 'Someone prayed for you',
    message: (d) => `${actor(d)} prayed for ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  new_text_prayer: {
    category: 'prayer',
    icon_emoji: '🙏',
    color: 'info',
    defaultChannels: ALL,
    prefPath: 'prayer_notifications.new_text_prayer',
    title: () => 'New prayer received',
    message: (d) => `${actor(d)} left a prayer for ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  new_voice_prayer: {
    category: 'prayer',
    icon_emoji: '🎙️',
    color: 'info',
    defaultChannels: ALL,
    prefPath: 'prayer_notifications.new_voice_prayer',
    title: () => 'New voice prayer received',
    message: (d) => `${actor(d)} recorded a voice prayer for ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  new_video_prayer: {
    category: 'prayer',
    icon_emoji: '🎥',
    color: 'info',
    defaultChannels: ALL,
    prefPath: 'prayer_notifications.new_video_prayer',
    title: () => 'New video prayer received',
    message: (d) => `${actor(d)} recorded a video prayer for ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  prayer_approved: {
    category: 'prayer',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: 'prayer_notifications.prayer_approved',
    title: () => 'Your prayer was approved',
    message: (d) => `Your prayer for ${campaignName(d)} is now visible.`,
    actionUrl: campaignUrl,
  },
  prayer_rejected: {
    category: 'prayer',
    icon_emoji: '⚠️',
    color: 'warning',
    defaultChannels: IN_APP_ONLY,
    prefPath: 'prayer_notifications.prayer_rejected',
    title: () => 'Your prayer was not approved',
    message: (d) => d.reason || 'Your prayer did not meet our community guidelines.',
    actionUrl: campaignUrl,
  },
  prayer_flagged: {
    category: 'prayer',
    icon_emoji: '🚩',
    color: 'warning',
    defaultChannels: IN_APP_ONLY,
    prefPath: 'prayer_notifications.prayer_flagged',
    title: () => 'A prayer was flagged',
    message: (d) => d.reason || 'A prayer was flagged for review.',
    actionUrl: campaignUrl,
  },
  prayer_milestone: {
    category: 'prayer',
    icon_emoji: '🎉',
    color: 'success',
    defaultChannels: ALL,
    prefPath: 'prayer_notifications.prayer_milestone',
    title: () => 'Prayer milestone reached',
    message: (d) =>
      `${campaignName(d)} reached ${d.milestone || 'a new'} prayers. Thank you!`,
    actionUrl: campaignUrl,
  },

  // ── Campaign lifecycle ──────────────────────────────────────────────────
  campaign_activated: {
    category: 'campaigns',
    icon_emoji: '🚀',
    color: 'success',
    defaultChannels: ALL,
    prefPath: 'campaign_notifications.campaign_activated',
    title: () => 'Your campaign is live',
    message: (d) => `${campaignName(d)} is now live and accepting support.`,
    actionUrl: campaignUrl,
  },
  campaign_ended: {
    category: 'campaigns',
    icon_emoji: '🏁',
    color: 'info',
    defaultChannels: ALL,
    prefPath: 'campaign_notifications.campaign_ended',
    title: () => 'Your campaign has ended',
    message: (d) => {
      const raised = money({ amount_cents: d.total_raised_cents, amount: d.totalRaised });
      return raised
        ? `${campaignName(d)} has ended, raising ${raised}. Thank you!`
        : `${campaignName(d)} has ended. Thank you!`;
    },
    actionUrl: campaignUrl,
  },
  campaign_paused: {
    category: 'campaigns',
    icon_emoji: '⏸️',
    color: 'warning',
    defaultChannels: ALL,
    prefPath: 'campaign_notifications.campaign_activated',
    title: () => 'Your campaign was paused',
    message: (d) => `${campaignName(d)} has been paused.`,
    actionUrl: campaignUrl,
  },
  goal_reached: {
    category: 'campaigns',
    icon_emoji: '🎯',
    color: 'success',
    defaultChannels: ALL,
    prefPath: 'campaign_notifications.goal_reached',
    title: () => 'Goal reached! 🎉',
    message: (d) => `${campaignName(d)} reached its fundraising goal. Amazing!`,
    actionUrl: campaignUrl,
  },
  milestone_reached: {
    category: 'campaigns',
    icon_emoji: '📈',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: 'campaign_notifications.goal_reached',
    title: () => 'Milestone reached',
    message: (d) =>
      `${campaignName(d)} reached ${d.milestone || d.milestonePercentage || ''}% of its goal.`,
    actionUrl: campaignUrl,
  },

  // ── Donations ───────────────────────────────────────────────────────────
  donation_received: {
    category: 'donations',
    icon_emoji: '💖',
    color: 'success',
    defaultChannels: ALL,
    prefPath: 'campaign_notifications.donation_received',
    title: () => 'You received a donation',
    message: (d) => {
      const amt = money(d);
      return amt
        ? `${actor(d)} donated ${amt} to ${campaignName(d)}.`
        : `${actor(d)} donated to ${campaignName(d)}.`;
    },
    actionUrl: campaignUrl,
  },
  donation_made: {
    category: 'donations',
    icon_emoji: '🧾',
    color: 'info',
    defaultChannels: ['in_app', 'email'],
    prefPath: null, // transactional receipt
    title: () => 'Thank you for your donation',
    message: (d) => {
      const amt = money(d);
      return amt
        ? `Your ${amt} donation to ${campaignName(d)} was successful.`
        : `Your donation to ${campaignName(d)} was successful.`;
    },
    actionUrl: campaignUrl,
  },

  // ── Sponsorships ────────────────────────────────────────────────────────
  sponsorship_received: {
    category: 'donations',
    icon_emoji: '🤝',
    color: 'success',
    defaultChannels: ALL,
    prefPath: 'campaign_notifications.donation_received',
    title: () => 'New sponsorship',
    message: (d) => {
      const amt = money(d);
      return amt
        ? `${actor(d)} sponsored ${campaignName(d)} for ${amt}.`
        : `${actor(d)} sponsored ${campaignName(d)}.`;
    },
    actionUrl: campaignUrl,
  },
  sponsorship_approved: {
    category: 'donations',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Sponsorship approved',
    message: (d) => `Your sponsorship of ${campaignName(d)} was approved.`,
    actionUrl: campaignUrl,
  },

  // ── Volunteer ───────────────────────────────────────────────────────────
  volunteer_hours_verified: {
    category: 'volunteer',
    icon_emoji: '⏱️',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Volunteer hours verified',
    message: (d) =>
      `${d.hours || 'Your'} volunteer hours for ${campaignName(d)} were verified.`,
    actionUrl: (d) => (d.campaign_id ? campaignUrl(d) : '/volunteer'),
  },
  volunteer_badge_earned: {
    category: 'volunteer',
    icon_emoji: '🏅',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'You earned a volunteer badge',
    message: (d) => `You earned the "${d.badge_name || 'Volunteer'}" badge.`,
    actionUrl: () => '/volunteer',
  },
  volunteer_request: {
    category: 'volunteer',
    icon_emoji: '🙋',
    color: 'info',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'New volunteer request',
    message: (d) => `${actor(d)} offered to help with ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },

  // ── Volunteer assignments (employer invite → accept/decline/complete) ────
  volunteer_assignment_invited: {
    category: 'volunteer',
    icon_emoji: '📩',
    color: 'info',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'New assignment invitation',
    message: (d) =>
      `${actor(d)} invited you to help with "${d.role_title || 'an assignment'}" on ${campaignName(d)}.`,
    actionUrl: () => '/volunteers/invites',
  },
  volunteer_assignment_accepted: {
    category: 'volunteer',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Invitation accepted',
    message: (d) =>
      `${actor(d)} accepted your invitation to help with "${d.role_title || 'an assignment'}" on ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  volunteer_assignment_declined: {
    category: 'volunteer',
    icon_emoji: '🚫',
    color: 'warning',
    defaultChannels: IN_APP_ONLY,
    prefPath: null,
    title: () => 'Invitation declined',
    message: (d) =>
      `${actor(d)} declined your invitation for "${d.role_title || 'an assignment'}"${d.reason ? `: ${d.reason}` : '.'}`,
    actionUrl: campaignUrl,
  },
  volunteer_assignment_completed: {
    category: 'volunteer',
    icon_emoji: '🎉',
    color: 'success',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'Assignment completed',
    message: (d) =>
      `${actor(d)} completed "${d.role_title || 'an assignment'}"${d.hours ? ` and logged ${d.hours}h` : ''} on ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  volunteer_assignment_reviewed: {
    category: 'volunteer',
    icon_emoji: '⭐',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'You received a review',
    message: (d) =>
      `Your work on "${d.role_title || 'an assignment'}" was rated ${d.rating || ''}/5.`,
    actionUrl: () => '/volunteers/invites',
  },

  // ── Hope Responder ("Need Now") ─────────────────────────────────────────
  hope_responder_accepted: {
    category: 'volunteer',
    icon_emoji: '🤝',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'A responder is on the way',
    message: (d) => `${actor(d)} accepted your "${d.request_title || 'Need Now'}" request and can help.`,
    actionUrl: () => '/hope-responders',
  },
  hope_responder_on_the_way: {
    category: 'volunteer',
    icon_emoji: '🚗',
    color: 'info',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Your responder is on the way',
    message: (d) => `${actor(d)} is on the way for "${d.request_title || 'your request'}".`,
    actionUrl: () => '/hope-responders',
  },
  hope_responder_arrived: {
    category: 'volunteer',
    icon_emoji: '📍',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Your responder has arrived',
    message: (d) => `${actor(d)} has arrived for "${d.request_title || 'your request'}".`,
    actionUrl: () => '/hope-responders',
  },

  // ── Business volunteer opportunities (BU-06) ────────────────────────────
  opportunity_application_received: {
    category: 'business',
    icon_emoji: '📥',
    color: 'info',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'New volunteer application',
    message: (d) =>
      `${actor(d)} applied to "${d.opportunity_title || 'your opportunity'}".`,
    actionUrl: (d) =>
      d.opportunity_id ? `/business/opportunities/${d.opportunity_id}/applications` : '/business/dashboard',
  },
  opportunity_application_accepted: {
    category: 'business',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'Your application was accepted',
    message: (d) =>
      `${d.business_name || 'A business'} accepted your application for "${d.opportunity_title || 'an opportunity'}".`,
    actionUrl: (d) =>
      d.opportunity_id ? `/opportunities/${d.opportunity_id}` : '/opportunities',
  },
  opportunity_application_rejected: {
    category: 'business',
    icon_emoji: '🚫',
    color: 'warning',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Application update',
    message: (d) =>
      `Your application for "${d.opportunity_title || 'an opportunity'}" was not accepted${d.reason ? `: ${d.reason}` : '.'}`,
    actionUrl: (d) =>
      d.opportunity_id ? `/opportunities/${d.opportunity_id}` : '/opportunities',
  },
  opportunity_application_completed: {
    category: 'business',
    icon_emoji: '🎉',
    color: 'success',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'Opportunity completed',
    message: (d) =>
      `Your work on "${d.opportunity_title || 'an opportunity'}" was marked complete${d.hours ? ` — ${d.hours}h logged` : ''}. Thank you!`,
    actionUrl: (d) =>
      d.opportunity_id ? `/opportunities/${d.opportunity_id}` : '/opportunities',
  },
  opportunity_application_withdrawn: {
    category: 'business',
    icon_emoji: '↩️',
    color: 'warning',
    defaultChannels: IN_APP_ONLY,
    prefPath: null,
    title: () => 'Applicant withdrew',
    message: (d) =>
      `${actor(d)} withdrew their application for "${d.opportunity_title || 'your opportunity'}".`,
    actionUrl: (d) =>
      d.opportunity_id ? `/business/opportunities/${d.opportunity_id}/applications` : '/business/dashboard',
  },

  // ── Business giveaways (BU-07) ──────────────────────────────────────────
  giveaway_entry_received: {
    category: 'business',
    icon_emoji: '🎟️',
    color: 'info',
    defaultChannels: IN_APP_ONLY,
    prefPath: null,
    title: () => 'New giveaway entry',
    message: (d) =>
      `${actor(d)} entered your giveaway "${d.giveaway_title || 'a giveaway'}".`,
    actionUrl: () => '/business/dashboard',
  },
  giveaway_won: {
    category: 'business',
    icon_emoji: '🎁',
    color: 'success',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'You won a giveaway! 🎉',
    message: (d) =>
      `You won "${d.giveaway_title || 'a giveaway'}"${d.business_name ? ` from ${d.business_name}` : ''}. Claim your prize!`,
    actionUrl: () => '/giveaways/wins',
  },
  giveaway_claimed: {
    category: 'business',
    icon_emoji: '📦',
    color: 'info',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'A winner claimed their prize',
    message: (d) =>
      `${actor(d)} claimed their prize for "${d.giveaway_title || 'your giveaway'}". Time to fulfil it.`,
    actionUrl: (d) =>
      d.giveaway_id ? `/business/giveaways/${d.giveaway_id}/winners` : '/business/dashboard',
  },
  giveaway_fulfilled: {
    category: 'business',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Your prize is on its way',
    message: (d) =>
      `${d.business_name || 'The business'} marked your prize for "${d.giveaway_title || 'a giveaway'}" as ${d.fulfilment_state || 'fulfilled'}.${d.tracking_reference ? ` Ref: ${d.tracking_reference}` : ''}`,
    actionUrl: () => '/giveaways/wins',
  },

  // ── Comments / social ───────────────────────────────────────────────────
  comment_received: {
    category: 'campaigns',
    icon_emoji: '💬',
    color: 'info',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'New comment',
    message: (d) => `${actor(d)} commented on ${campaignName(d)}.`,
    actionUrl: campaignUrl,
  },
  comment_reply: {
    category: 'campaigns',
    icon_emoji: '↩️',
    color: 'info',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'New reply',
    message: (d) => `${actor(d)} replied to your comment.`,
    actionUrl: campaignUrl,
  },

  // ── Share-to-earn ───────────────────────────────────────────────────────
  share_reward_owed: {
    category: 'shares',
    icon_emoji: '💸',
    color: 'success',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'You earned a share reward',
    message: (d) => {
      const amt = money(d);
      return amt
        ? `You earned ${amt} for sharing ${campaignName(d)}.`
        : `You earned a reward for sharing ${campaignName(d)}.`;
    },
    actionUrl: () => '/rewards',
  },
  share_reward_approved: {
    category: 'shares',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: ALL,
    prefPath: null,
    title: () => 'Share reward approved',
    message: (d) => {
      const amt = money(d);
      return amt ? `Your share reward of ${amt} was approved.` : 'Your share reward was approved.';
    },
    actionUrl: () => '/rewards',
  },
  share_reward_rejected: {
    category: 'shares',
    icon_emoji: '⚠️',
    color: 'warning',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Share reward not approved',
    message: (d) => d.reason || 'Your share reward could not be approved.',
    actionUrl: () => '/rewards',
  },

  // ── Payouts ─────────────────────────────────────────────────────────────
  payout_requested: {
    category: 'payouts',
    icon_emoji: '📤',
    color: 'info',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Payout requested',
    message: (d) => {
      const amt = money(d);
      return amt ? `Your payout request for ${amt} was received.` : 'Your payout request was received.';
    },
    actionUrl: () => '/sharers-payouts',
  },
  payout_sent: {
    category: 'payouts',
    icon_emoji: '💵',
    color: 'success',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Payout sent',
    message: (d) => {
      const amt = money(d);
      return amt ? `A payout of ${amt} is on its way to you.` : 'Your payout has been sent.';
    },
    actionUrl: () => '/sharers-payouts',
  },
  payout_received: {
    category: 'payouts',
    icon_emoji: '✅',
    color: 'success',
    defaultChannels: ['in_app'],
    prefPath: null,
    title: () => 'Payout confirmed received',
    message: (d) => {
      const amt = money(d);
      return amt ? `A sharer confirmed receiving their ${amt} payment.` : 'A payout was confirmed as received.';
    },
    actionUrl: () => '/sharers-payouts',
  },
  payout_reminder: {
    category: 'payouts',
    icon_emoji: '⏰',
    color: 'warning',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Payout reminder',
    message: (d) => d.message || 'You have a pending payout that needs your attention.',
    actionUrl: () => '/sharers-payouts',
  },
  payout_cancelled: {
    category: 'payouts',
    icon_emoji: '❌',
    color: 'danger',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Payout cancelled',
    message: (d) => d.reason || 'A payout was cancelled.',
    actionUrl: () => '/sharers-payouts',
  },
  payout_disputed: {
    category: 'payouts',
    icon_emoji: '⚖️',
    color: 'danger',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: () => 'Payout disputed',
    message: (d) => d.reason || 'A payout has been disputed and is under review.',
    actionUrl: () => '/sharers-payouts',
  },

  // ── Referrals ───────────────────────────────────────────────────────────
  referral_converted: {
    category: 'shares',
    icon_emoji: '🔗',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Your referral converted',
    message: (d) => `Someone you referred took action on ${campaignName(d)}.`,
    actionUrl: () => '/rewards',
  },

  // ── Gamification highlights ─────────────────────────────────────────────
  badge_earned: {
    category: 'gamification',
    icon_emoji: '🏆',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'New badge unlocked',
    message: (d) => `You unlocked the "${d.badge_name || 'new'}" badge!`,
    actionUrl: () => '/rewards',
  },
  level_up: {
    category: 'gamification',
    icon_emoji: '⬆️',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Level up!',
    message: (d) => `You reached level ${d.level || 'up'}. Keep it up!`,
    actionUrl: () => '/rewards',
  },
  streak_milestone: {
    category: 'gamification',
    icon_emoji: '🔥',
    color: 'success',
    defaultChannels: IN_APP_PUSH,
    prefPath: null,
    title: () => 'Streak milestone',
    message: (d) => `You're on a ${d.streak || ''}-day streak! 🔥`,
    actionUrl: () => '/rewards',
  },
  leaderboard_rank: {
    category: 'gamification',
    icon_emoji: '🥇',
    color: 'success',
    defaultChannels: IN_APP_ONLY,
    prefPath: null,
    title: () => 'Leaderboard update',
    message: (d) => `You're now ranked #${d.rank || ''} on the leaderboard.`,
    actionUrl: () => '/rewards',
  },

  // ── Messaging ───────────────────────────────────────────────────────────
  new_message: {
    category: 'messages',
    icon_emoji: '💬',
    color: 'info',
    defaultChannels: ALL,
    prefPath: null,
    title: (d) => `New message from ${actor(d)}`,
    message: (d) => d.preview || d.body || 'You have a new message.',
    // The messaging center opens a conversation via the `?c=` query param,
    // not a path segment (see app/(creator)/messages + MessagingCenter).
    actionUrl: (d) =>
      d.conversation_id ? `/messages?c=${d.conversation_id}` : '/messages',
  },

  // ── System / admin ──────────────────────────────────────────────────────
  system_alert: {
    category: 'system',
    icon_emoji: '🔔',
    color: 'info',
    defaultChannels: IN_APP_ONLY,
    prefPath: null,
    title: (d) => d.title || 'System notice',
    message: (d) => d.message || 'You have a new system notification.',
    actionUrl: (d) => d.action_url || null,
  },
  admin_message: {
    category: 'system',
    icon_emoji: '📣',
    color: 'primary',
    defaultChannels: ['in_app', 'email'],
    prefPath: null,
    title: (d) => d.title || 'Message from HonestNeed',
    message: (d) => d.message || 'You have a new message from the team.',
    actionUrl: (d) => d.action_url || null,
  },
};

/** Returns the registry entry for a type, or null if unknown. */
function getType(type) {
  return REGISTRY[type] || null;
}

/** All registered type keys (used to keep the Notification model enum in sync). */
function allTypeKeys() {
  return Object.keys(REGISTRY);
}

module.exports = { REGISTRY, getType, allTypeKeys };
