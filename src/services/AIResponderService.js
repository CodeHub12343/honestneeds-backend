/**
 * AI Responder Service (AI-01)
 *
 * Powers the persistent "AI Responder" guide reachable from the platform's
 * bottom navigation. Unlike the single-shot AICampaignAssistantService.advise(),
 * this is a stateful, multi-turn assistant that:
 *
 *   - keeps conversation sessions per user (history of the last 10 sessions);
 *   - is context-aware — it knows the user's role, current page, campaign in
 *     view, earnings and account state;
 *   - returns suggested follow-up questions and in-app action links each turn;
 *   - decides when it cannot help and flags the session for human handoff.
 *
 * It is grounded in a curated platform knowledge base so it never invents
 * features that do not exist. When the AI provider is unconfigured the service
 * degrades gracefully to a deterministic, knowledge-base-driven reply.
 */

const AIProviderService = require('./AIProvider');
const { AIUnavailableError } = AIProviderService;
const aiConfig = require('../config/ai');
const AIConversation = require('../models/AIConversation');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const Wallet = require('../models/Wallet');
const winstonLogger = require('../utils/winstonLogger');

class AIResponderError extends Error {
  constructor(message, statusCode = 400, code = 'AI_RESPONDER_ERROR') {
    super(message);
    this.name = 'AIResponderError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// How many recent sessions a user can browse (PRD: last 10).
const MAX_HISTORY_SESSIONS = 10;
// How many prior turns to feed the model for continuity (keeps prompt bounded).
const MAX_CONTEXT_TURNS = 16;

/**
 * Curated, accurate description of what HonestNeed actually offers. This is the
 * Responder's single source of truth — the system prompt instructs the model to
 * answer only from it and never to invent features. Update this when platform
 * capabilities change.
 */
const PLATFORM_KNOWLEDGE_BASE = `
HonestNeed is a transparent crowdfunding platform for real human needs (medical,
emergency, education, family, community, business, and individual support).

CAMPAIGNS
- Anyone registered can create a campaign with a title, story, need type, goal
  amount, photos and an optional short video.
- Strong campaigns lead with a specific, time-bound ask, an honest personal
  story, a concrete budget breakdown, and authentic media.
- Creators can post progress updates, milestones, and respond to comments.
- The AI Campaign Writer can draft a campaign from a short brief; the AI
  Optimizer audits a published campaign and suggests prioritized improvements.

DONATIONS
- Supporters donate to campaigns by card via Stripe. Donations are processed
  securely; never ask a user for raw card numbers in chat.
- Donors can leave a message of support and may donate without an account.

SHARING & SHARE REWARDS
- Users earn share rewards for sharing campaigns through their referral link
  when their shares lead to engagement/donations. Rewards accrue to the user's
  wallet after a holding/verification period.
- Sharing first with people who already know and trust the creator drives the
  best early momentum.

WALLET & PAYOUTS
- Earnings (share rewards, etc.) collect in the user's wallet with available,
  pending and reserved balances. Users withdraw available funds to a connected
  payout method.

PROFILE & VERIFICATION
- Users build a profile and can raise their trust level through identity / Trust
  & Verification, which adds a verification badge and increases supporter
  confidence.

MESSAGING
- 1:1 direct messaging connects supporters with creators, volunteers with
  coordinators, and businesses with sponsors.

VOLUNTEERING
- Volunteers can log hours (with verification), earn XP and badges, appear on
  leaderboards, collect proof-of-kindness and reference letters, and respond to
  urgent "Need Now" requests via the Hope Responder program.

BUSINESS FEATURES
- Businesses can create a verified business profile, appear in the directory,
  view CSR/impact analytics, post volunteer opportunities, and run product or
  service giveaways.

OTHER
- Campaign Boosts increase a campaign's visibility (paid). Sponsorships let
  businesses sponsor the platform/causes. A monthly sweepstakes runs for
  eligible participants.

WHAT NOT TO DO
- Do not promise or guarantee fundraising outcomes or donation amounts.
- Do not give medical, financial, legal, or tax advice — suggest professionals.
- Do not invent features, fees, dates, or policies that are not described here.
- If unsure or the user needs account-specific support you cannot perform, set
  needs_human=true and offer a handoff to the support team.
`.trim();

/**
 * Canonical in-app routes the Responder may link to. Keeping this list closed
 * prevents the model from inventing URLs. `href` values are frontend paths.
 */
const ALLOWED_ACTION_LINKS = [
  { key: 'create_campaign', label: 'Start a campaign', href: '/campaigns/new' },
  { key: 'my_campaigns', label: 'My campaigns', href: '/dashboard/campaigns' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'wallet', label: 'Wallet & payouts', href: '/wallet' },
  { key: 'share_center', label: 'Sharing & rewards', href: '/dashboard/share-rewards' },
  { key: 'verification', label: 'Get verified', href: '/verify/identity' },
  { key: 'profile', label: 'My profile', href: '/profile' },
  { key: 'messages', label: 'Messages', href: '/messages' },
  { key: 'explore', label: 'Explore campaigns', href: '/campaigns' },
  { key: 'volunteer', label: 'Volunteer', href: '/volunteers' },
  { key: 'business', label: 'Business hub', href: '/business' },
  { key: 'boosts', label: 'Boost a campaign', href: '/boosts' },
  { key: 'support', label: 'Contact support', href: '/contact' },
];

const RESPONDER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
    action_links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          href: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['label', 'href'],
      },
    },
    needs_human: { type: 'boolean' },
  },
  required: ['reply', 'suggestions', 'needs_human'],
};

class AIResponderService {
  /** @returns {boolean} */
  static isEnabled() {
    return AIProviderService.isEnabled();
  }

  // ── Context ────────────────────────────────────────────────────────────

  /**
   * Build a compact, prompt-friendly snapshot of the user's platform state so
   * the Responder can give personalized "what should I do next" guidance.
   * Every lookup is best-effort: a failure in one part never breaks the chat.
   *
   * @param {string} userId
   * @param {Object} [client] - client-supplied context (current page, campaign)
   * @returns {Promise<Object>}
   */
  static async gatherUserContext(userId, client = {}) {
    const ctx = {
      current_page: typeof client.page === 'string' ? client.page.slice(0, 200) : null,
      viewing_campaign_id: client.campaignId || client.campaign_id || null,
    };

    try {
      const user = await User.findById(userId)
        .select('first_name role verified created_at')
        .lean();
      if (user) {
        ctx.user = {
          first_name: user.first_name || null,
          role: user.role || 'user',
          verified: Boolean(user.verified),
          joined_days_ago: user.created_at
            ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
            : null,
        };
      }
    } catch (err) {
      winstonLogger.warn('AIResponder: user context lookup failed', { error: err.message });
    }

    try {
      const campaigns = await Campaign.find({ creator_id: userId })
        .select('campaign_id title status goals view_count share_count total_donors')
        .sort({ created_at: -1 })
        .limit(5)
        .lean();
      ctx.owned_campaign_count = campaigns.length;
      ctx.owned_campaigns = campaigns.map((c) => {
        const goal = (c.goals || []).find((g) => g.goal_type === 'fundraising');
        const target = goal?.target_amount || 0;
        const current = goal?.current_amount || 0;
        return {
          campaign_id: c.campaign_id,
          title: c.title,
          status: c.status,
          percent_funded: target ? Math.round((current / target) * 100) : 0,
          views: c.view_count || 0,
          shares: c.share_count || 0,
          donors: c.total_donors || 0,
        };
      });
    } catch (err) {
      winstonLogger.warn('AIResponder: campaign context lookup failed', { error: err.message });
    }

    try {
      const wallet = await Wallet.findOne({ user_id: userId })
        .select('available_cents pending_cents total_earned_cents')
        .lean();
      if (wallet) {
        ctx.wallet = {
          available_usd: Math.round((wallet.available_cents || 0)) / 100,
          pending_usd: Math.round((wallet.pending_cents || 0)) / 100,
          total_earned_usd: Math.round((wallet.total_earned_cents || 0)) / 100,
        };
      }
    } catch (err) {
      winstonLogger.warn('AIResponder: wallet context lookup failed', { error: err.message });
    }

    return ctx;
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  /**
   * Load a session owned by the user or throw.
   * @private
   */
  static async loadOwnedSession(conversationId, userId) {
    const session = await AIConversation.findOne({ conversation_id: conversationId });
    if (!session) throw new AIResponderError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    if (!session.isOwnedBy(userId)) {
      throw new AIResponderError('You do not own this conversation', 403, 'NOT_CONVERSATION_OWNER');
    }
    return session;
  }

  /**
   * List a user's recent sessions (most recent first), capped at 10.
   * @param {string} userId
   * @returns {Promise<{sessions: Array}>}
   */
  static async listSessions(userId) {
    const sessions = await AIConversation.listRecentForUser(userId, MAX_HISTORY_SESSIONS);
    return {
      sessions: sessions.map((s) => ({
        conversation_id: s.conversation_id,
        title: s.title,
        status: s.status,
        message_count: s.message_count,
        last_message_at: s.last_message_at,
        created_at: s.created_at,
        satisfaction: s.satisfaction || null,
      })),
    };
  }

  /**
   * Return a full session (with all turns) for the owner.
   * @param {string} userId
   * @param {string} conversationId
   * @returns {Promise<Object>}
   */
  static async getSession(userId, conversationId) {
    const session = await this.loadOwnedSession(conversationId, userId);
    return session.toObject();
  }

  /**
   * Delete a session the user owns.
   * @param {string} userId
   * @param {string} conversationId
   */
  static async deleteSession(userId, conversationId) {
    const session = await this.loadOwnedSession(conversationId, userId);
    await session.deleteOne();
    return { deleted: true, conversation_id: conversationId };
  }

  // ── Conversation turn ──────────────────────────────────────────────────

  /**
   * Send a user message and get the Responder's reply. Creates a new session
   * when `conversationId` is omitted, otherwise appends to the existing one.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.message - the user's question/turn
   * @param {string} [params.conversationId] - continue an existing session
   * @param {string} [params.page] - current app page for context
   * @param {string} [params.campaignId] - campaign currently in view
   * @returns {Promise<Object>} session + the assistant reply
   */
  static async sendMessage({ userId, message, conversationId = null, page = null, campaignId = null }) {
    if (!message || !message.trim()) {
      throw new AIResponderError('A message is required', 400, 'MISSING_MESSAGE');
    }
    if (message.length > 4000) {
      throw new AIResponderError('Message must not exceed 4000 characters', 400, 'MESSAGE_TOO_LONG');
    }

    let session;
    if (conversationId) {
      session = await this.loadOwnedSession(conversationId, userId);
      if (session.status === 'closed') {
        throw new AIResponderError('This conversation is closed', 409, 'CONVERSATION_CLOSED');
      }
    } else {
      session = new AIConversation({ user_id: userId });
    }

    const context = await this.gatherUserContext(userId, { page, campaignId });

    // Record the user's turn before calling the model.
    session.addMessage({ role: 'user', content: message.trim() });
    session.last_context = context;

    let assistant;
    try {
      assistant = await this.generateReply(session, context);
    } catch (error) {
      if (error instanceof AIUnavailableError || error.code === 'AI_UNAVAILABLE') {
        assistant = this.fallbackReply(message, context);
      } else {
        // Persist the user's turn so it is not lost, then surface the error.
        winstonLogger.error('AIResponder reply failed', { error: error.message });
        await session.save();
        throw error;
      }
    }

    session.addMessage({
      role: 'assistant',
      content: assistant.reply,
      suggestions: assistant.suggestions,
      action_links: assistant.action_links,
      needs_human: assistant.needs_human,
    });

    if (assistant.needs_human && !session.handoff.requested) {
      session.handoff.requested = true;
      session.handoff.requested_at = new Date();
      session.handoff.reason = 'AI could not fully resolve the request';
      session.status = 'handoff_requested';
    }

    await session.save();

    return {
      conversation_id: session.conversation_id,
      title: session.title,
      status: session.status,
      reply: assistant.reply,
      suggestions: assistant.suggestions || [],
      action_links: assistant.action_links || [],
      needs_human: Boolean(assistant.needs_human),
      ai_unavailable: Boolean(assistant.ai_unavailable),
      message_count: session.message_count,
    };
  }

  /**
   * Call the model with the session history + knowledge base + user context.
   * @private
   */
  static async generateReply(session, context) {
    const history = session.messages
      .slice(-MAX_CONTEXT_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));

    const linkList = ALLOWED_ACTION_LINKS
      .map((l) => `- ${l.href} — ${l.label}`)
      .join('\n');

    const system = `You are HonestNeed's AI Responder — a warm, concise, practical in-app guide
that helps users take the next best action. You appear in a chat panel next to the
music player in the bottom navigation.

Answer ONLY using the platform knowledge base below. Never invent features, fees,
dates, or policies. If you don't know or the user needs account-specific help you
cannot perform yourself, set needs_human=true and recommend contacting support.

Be specific and personalized using the user context (their role, current page,
campaigns, earnings). Keep "reply" short — a few sentences or tight bullet points.
Always provide 2-4 "suggestions" (short follow-up questions the user might tap).
When a concrete next step exists, include 1-3 "action_links" chosen ONLY from this
allowed list (use the exact href):
${linkList}

Set needs_human=true only when genuinely stuck or for sensitive account/payment/
safety issues you cannot resolve.

=== PLATFORM KNOWLEDGE BASE ===
${PLATFORM_KNOWLEDGE_BASE}

=== CURRENT USER CONTEXT (JSON) ===
${JSON.stringify(context)}`;

    const { data } = await AIProviderService.completeJSON({
      feature: 'ai_responder',
      effort: aiConfig.effort.advisor,
      maxTokens: aiConfig.maxTokens.medium,
      schema: RESPONDER_SCHEMA,
      system,
      messages: history,
    });

    return {
      reply: data.reply,
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.slice(0, 4) : [],
      action_links: this.sanitizeLinks(data.action_links),
      needs_human: Boolean(data.needs_human),
    };
  }

  /**
   * Keep only action links whose href is on the allowed list — the final guard
   * against hallucinated routes.
   * @private
   */
  static sanitizeLinks(links) {
    if (!Array.isArray(links)) return [];
    const allowed = new Map(ALLOWED_ACTION_LINKS.map((l) => [l.href, l]));
    const seen = new Set();
    const out = [];
    for (const link of links) {
      if (!link || !allowed.has(link.href) || seen.has(link.href)) continue;
      seen.add(link.href);
      const canonical = allowed.get(link.href);
      out.push({
        label: link.label || canonical.label,
        href: canonical.href,
        description: link.description || null,
      });
      if (out.length >= 3) break;
    }
    return out;
  }

  /**
   * Deterministic reply used when the AI provider is not configured. Still
   * useful and context-aware, just rule-based.
   * @private
   */
  static fallbackReply(message, context) {
    const links = [];
    const suggestions = [];
    let reply;

    const hasCampaigns = (context.owned_campaign_count || 0) > 0;
    if (!hasCampaigns) {
      reply =
        'The best next step is usually to create your first campaign. Lead with a specific, ' +
        'time-bound ask, an honest story, a clear budget breakdown, and an authentic photo. ' +
        'Then share it first with people who already know and trust you.';
      links.push({ label: 'Start a campaign', href: '/campaigns/new', description: null });
      suggestions.push('How do I write a strong campaign?', 'How do share rewards work?');
    } else {
      reply =
        'To gain momentum: post a fresh update, make sure your campaign has a clear budget and ' +
        'an authentic photo or short video, and share your referral link with your closest ' +
        'supporters first — that drives the best early traction and share rewards.';
      links.push({ label: 'My campaigns', href: '/dashboard/campaigns', description: null });
      links.push({ label: 'Sharing & rewards', href: '/dashboard/share-rewards', description: null });
      suggestions.push('How can I improve my campaign?', 'How do I get more donations?');
    }

    if (context.user && !context.user.verified) {
      suggestions.push('How do I get verified?');
    }

    return {
      reply: reply + ' (Live AI guidance is temporarily unavailable, so this is general advice.)',
      suggestions,
      action_links: links,
      needs_human: false,
      ai_unavailable: true,
    };
  }

  // ── Handoff & rating ─────────────────────────────────────────────────────

  /**
   * Explicitly request a human handoff for a session.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.conversationId
   * @param {string} [params.reason]
   * @returns {Promise<Object>}
   */
  static async requestHandoff({ userId, conversationId, reason = null }) {
    const session = await this.loadOwnedSession(conversationId, userId);
    session.handoff.requested = true;
    session.handoff.requested_at = new Date();
    session.handoff.reason = reason || session.handoff.reason || 'User requested human support';
    session.handoff.resolved = false;
    session.status = 'handoff_requested';
    await session.save();
    return {
      conversation_id: session.conversation_id,
      status: session.status,
      handoff: session.handoff,
    };
  }

  /**
   * Leave a satisfaction rating for a session (feeds AI-01 success metrics).
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.conversationId
   * @param {number} params.rating - 1..5
   * @param {string} [params.feedback]
   * @returns {Promise<Object>}
   */
  static async rateSession({ userId, conversationId, rating, feedback = null }) {
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new AIResponderError('rating must be a number between 1 and 5', 400, 'INVALID_RATING');
    }
    const session = await this.loadOwnedSession(conversationId, userId);
    session.satisfaction.rating = Math.round(rating);
    session.satisfaction.feedback = feedback ? String(feedback).slice(0, 2000) : null;
    session.satisfaction.rated_at = new Date();
    await session.save();
    return {
      conversation_id: session.conversation_id,
      satisfaction: session.satisfaction,
    };
  }
}

module.exports = AIResponderService;
module.exports.AIResponderError = AIResponderError;
module.exports.ALLOWED_ACTION_LINKS = ALLOWED_ACTION_LINKS;
