/**
 * Campaign Engagement Controller
 * Backend for several campaign features that share the campaign resource:
 *  - CA-12 Multi-Meter System          GET    /campaigns/:id/meters
 *  - CA-13 Crowdfunded Virality        GET    /campaigns/:id/virality
 *  - CA-17 Campaign Video Upload/Embed PUT    /campaigns/:id/video, DELETE /campaigns/:id/video
 *  - CA-18 Social Proof / Donor Feed   GET    /campaigns/:id/donor-feed
 *  - CA-08 Share Budget System         PUT    /campaigns/:id/share-budget
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Share = require('../models/Share');
const winstonLogger = require('../utils/winstonLogger');
const CampaignMilestoneService = require('../services/CampaignMilestoneService');

async function resolveCampaign(idOrCampaignId) {
  if (mongoose.Types.ObjectId.isValid(idOrCampaignId)) {
    const byId = await Campaign.findById(idOrCampaignId);
    if (byId) return byId;
  }
  return Campaign.findOne({ campaign_id: idOrCampaignId, is_deleted: false });
}

/**
 * Parse a video URL into a normalized provider + embeddable URL.
 * Supports YouTube and Vimeo; falls back to "other".
 */
function parseVideoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // YouTube: watch?v=, youtu.be/, /embed/, /shorts/
  const yt =
    trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) {
    const id = yt[1];
    return {
      url: trimmed,
      provider: 'youtube',
      embed_url: `https://www.youtube.com/embed/${id}`,
      thumbnail_url: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Vimeo: vimeo.com/<id>
  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    const id = vimeo[1];
    return {
      url: trimmed,
      provider: 'vimeo',
      embed_url: `https://player.vimeo.com/video/${id}`,
      thumbnail_url: undefined,
    };
  }

  // Cloudinary or direct video file
  if (/res\.cloudinary\.com/.test(trimmed)) {
    return { url: trimmed, provider: 'cloudinary', embed_url: trimmed, thumbnail_url: undefined };
  }

  if (/^https?:\/\/.+\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed)) {
    return { url: trimmed, provider: 'other', embed_url: trimmed, thumbnail_url: undefined };
  }

  return null;
}

const CampaignEngagementController = {
  parseVideoUrl, // exported for testing

  /**
   * CA-12 — Multi-Meter System
   * Returns a unified set of progress meters (funds + shares + prayer + donors).
   * GET /campaigns/:id/meters
   */
  async getMeters(req, res) {
    try {
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const meters = [];

      // Funding meters (one per fundraising goal)
      (campaign.goals || []).forEach((g) => {
        if (g.goal_type === 'fundraising') {
          const current = g.current_amount || 0;
          const target = g.target_amount || 0;
          meters.push({
            type: 'funding',
            label: g.goal_name || 'Fundraising goal',
            unit: 'currency',
            current_cents: current,
            target_cents: target,
            current: +(current / 100).toFixed(2),
            target: +(target / 100).toFixed(2),
            percentage: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
          });
        } else if (g.goal_type === 'sharing_reach' || g.goal_type === 'resource_collection') {
          const current = g.current_amount || 0;
          const target = g.target_amount || 0;
          meters.push({
            type: g.goal_type === 'sharing_reach' ? 'sharing' : 'resource',
            label: g.goal_name || (g.goal_type === 'sharing_reach' ? 'Sharing goal' : 'Resource goal'),
            unit: 'count',
            current,
            target,
            percentage: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
          });
        }
      });

      // Share budget meter (paid sharing)
      if (campaign.share_config?.is_paid_sharing_active && campaign.share_config?.total_budget > 0) {
        const total = campaign.share_config.total_budget;
        // Trust-based: spent = cumulative rewards accrued (committed_total); the
        // liability counter (committed_budget_remaining) is what's left.
        const sc = campaign.share_config;
        const remaining =
          sc.committed_budget_remaining != null
            ? sc.committed_budget_remaining
            : Math.max(0, total - (sc.committed_total || 0));
        const spent = Math.max(0, total - remaining);
        meters.push({
          type: 'share_budget',
          label: 'Share rewards budget',
          unit: 'currency',
          current_cents: spent,
          target_cents: total,
          current: +(spent / 100).toFixed(2),
          target: +(total / 100).toFixed(2),
          percentage: total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0,
        });
      }

      // Prayer meter
      if (campaign.prayer_config?.enabled && campaign.prayer_config?.prayer_goal > 0) {
        const current = campaign.prayer_metrics?.total_prayers || campaign.prayer_config?.prayer_count || 0;
        const target = campaign.prayer_config.prayer_goal;
        meters.push({
          type: 'prayer',
          label: campaign.prayer_config.title || 'Prayer support',
          unit: 'count',
          current,
          target,
          percentage: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
        });
      }

      // Donors meter (informational; no target)
      meters.push({
        type: 'donors',
        label: 'Supporters',
        unit: 'count',
        current: campaign.total_donors || 0,
        target: null,
        percentage: null,
      });

      return res.status(200).json({
        success: true,
        message: 'Campaign meters retrieved successfully',
        data: {
          campaign_id: campaign.campaign_id,
          campaign_type: campaign.campaign_type,
          meters,
        },
      });
    } catch (error) {
      winstonLogger.error('getMeters error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve meters' });
    }
  },

  /**
   * CA-13 — Crowdfunded Virality
   * Computes a virality snapshot from share activity (and refreshes cached values).
   * GET /campaigns/:id/virality
   */
  async getVirality(req, res) {
    try {
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      let totalShares = 0;
      let uniqueSharers = 0;
      try {
        const agg = await Share.aggregate([
          { $match: { campaign_id: campaign._id } },
          {
            $group: {
              _id: null,
              totalShares: { $sum: 1 },
              sharers: { $addToSet: '$supporter_id' },
            },
          },
          { $project: { totalShares: 1, uniqueSharers: { $size: '$sharers' } } },
        ]);
        if (agg[0]) {
          totalShares = agg[0].totalShares || 0;
          uniqueSharers = agg[0].uniqueSharers || 0;
        }
      } catch (e) {
        winstonLogger.warn('Virality share aggregation failed', { error: e.message });
      }

      const referralClicks = campaign.virality?.referral_clicks || 0;
      const referralConversions = campaign.virality?.referral_conversions || 0;

      // Viral coefficient proxy: average shares generated per sharer.
      const viralCoefficient = uniqueSharers > 0 ? +(totalShares / uniqueSharers).toFixed(2) : 0;
      const conversionRate = referralClicks > 0 ? +((referralConversions / referralClicks) * 100).toFixed(2) : 0;

      // Persist refreshed snapshot
      await Campaign.updateOne(
        { _id: campaign._id },
        {
          $set: {
            'virality.viral_coefficient': viralCoefficient,
            'virality.last_calculated_at': new Date(),
          },
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Campaign virality retrieved successfully',
        data: {
          campaign_id: campaign.campaign_id,
          total_shares: totalShares,
          unique_sharers: uniqueSharers,
          referral_clicks: referralClicks,
          referral_conversions: referralConversions,
          referral_conversion_rate: conversionRate,
          viral_coefficient: viralCoefficient,
          // is the campaign "going viral"? coefficient > 1 means self-sustaining growth
          is_viral: viralCoefficient > 1,
          last_calculated_at: new Date(),
        },
      });
    } catch (error) {
      winstonLogger.error('getVirality error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve virality' });
    }
  },

  /**
   * CA-17 — Set / replace campaign video.
   * PUT /campaigns/:id/video   Body: { url, duration_seconds?, public_id? }
   * Creator only.
   */
  async setVideo(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Only the creator can set the video' });
      }

      const parsed = parseVideoUrl(req.body.url);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or unsupported video URL. Provide a YouTube, Vimeo, Cloudinary, or direct video file URL.',
        });
      }

      campaign.video = {
        url: parsed.url,
        provider: parsed.provider,
        embed_url: parsed.embed_url,
        thumbnail_url: req.body.thumbnail_url || parsed.thumbnail_url,
        public_id: req.body.public_id || undefined,
        duration_seconds:
          req.body.duration_seconds != null ? Math.max(0, parseInt(req.body.duration_seconds) || 0) : undefined,
        added_at: new Date(),
      };
      await campaign.save();

      return res.status(200).json({
        success: true,
        message: 'Campaign video saved successfully',
        data: campaign.video,
      });
    } catch (error) {
      winstonLogger.error('setVideo error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to set campaign video' });
    }
  },

  /**
   * CA-17 — Remove campaign video.
   * DELETE /campaigns/:id/video   Creator only.
   */
  async removeVideo(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Only the creator can remove the video' });
      }

      campaign.video = undefined;
      await campaign.save();

      return res.status(204).send();
    } catch (error) {
      winstonLogger.error('removeVideo error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to remove campaign video' });
    }
  },

  /**
   * CA-18 — Social Proof / Donor Feed
   * Merges recent donations (from campaign.contributors) and recent shares into a
   * single time-ordered activity feed for social proof.
   * GET /campaigns/:id/donor-feed?limit=20
   */
  async getDonorFeed(req, res) {
    try {
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

      const feed = [];

      // Donations from the denormalized contributors array
      (campaign.contributors || []).forEach((c) => {
        feed.push({
          type: 'donation',
          actor_name: c.donor_name || 'Anonymous',
          amount_cents: c.amount || 0,
          amount: +((c.amount || 0) / 100).toFixed(2),
          message: c.message || undefined,
          date: c.date || campaign.created_at,
        });
      });

      // Recent shares (with sharer name lookup)
      try {
        const shares = await Share.aggregate([
          { $match: { campaign_id: campaign._id } },
          { $sort: { created_at: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'supporter_id',
              foreignField: '_id',
              as: 'sharer',
            },
          },
          { $unwind: { path: '$sharer', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              channel: 1,
              created_at: 1,
              actor_name: { $ifNull: ['$sharer.display_name', 'A supporter'] },
            },
          },
        ]);
        shares.forEach((s) => {
          feed.push({
            type: 'share',
            actor_name: s.actor_name,
            channel: s.channel,
            date: s.created_at,
          });
        });
      } catch (e) {
        winstonLogger.warn('Donor feed share lookup failed', { error: e.message });
      }

      // Sort by date desc and trim
      feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const trimmed = feed.slice(0, limit);

      return res.status(200).json({
        success: true,
        message: 'Donor feed retrieved successfully',
        data: {
          campaign_id: campaign.campaign_id,
          total_donors: campaign.total_donors || 0,
          total_raised_cents: (campaign.goals || [])
            .filter((g) => g.goal_type === 'fundraising')
            .reduce((s, g) => s + (g.current_amount || 0), 0),
          feed: trimmed,
        },
      });
    } catch (error) {
      winstonLogger.error('getDonorFeed error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve donor feed' });
    }
  },

  /**
   * CA-08 — Share Budget System
   * Get the paid-sharing budget snapshot for a campaign.
   * GET /campaigns/:id/share-budget
   * Returns (cents): { campaignId, totalBudget, usedBudget, remainingBudget,
   *   amountPerShare, isPaidSharingActive }. Public-readable (no auth) so the
   *   share budget badge can render on the campaign page.
   */
  async getShareBudget(req, res) {
    try {
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const sc = campaign.share_config || {};
      const totalBudget = sc.total_budget || 0;
      // Trust-based liability counter (declared pool − rewards accrued).
      const remainingBudget =
        sc.committed_budget_remaining != null
          ? sc.committed_budget_remaining
          : Math.max(0, totalBudget - (sc.committed_total || 0));
      const usedBudget = Math.max(0, totalBudget - remainingBudget);

      return res.status(200).json({
        success: true,
        campaignId: campaign.campaign_id || campaign._id?.toString(),
        totalBudget,
        usedBudget,
        remainingBudget,
        amountPerShare: sc.amount_per_share || 0,
        isPaidSharingActive: !!sc.is_paid_sharing_active,
      });
    } catch (error) {
      winstonLogger.error('getShareBudget error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve share budget' });
    }
  },

  /**
   * CA-08 — Share Budget System
   * Update the paid-sharing budget configuration for a campaign.
   * PUT /campaigns/:id/share-budget
   * Body: { total_budget_dollars?, amount_per_share_dollars?, is_paid_sharing_active?,
   *   share_channels?, payout_consent? }
   * Creator only.
   */
  async updateShareBudget(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }
      const campaign = await resolveCampaign(req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Only the creator can edit the share budget' });
      }

      const current = campaign.share_config || {};
      const updates = {};

      // Trust-based consent: enabling paid sharing requires the creator to accept
      // the "pay sharers directly" agreement. Wizard-created campaigns already
      // carry it; capture it here for campaigns enabling Share-to-Earn later.
      const consentRaw = req.body.payout_consent;
      const consentAccepted =
        consentRaw === true || consentRaw === 'true' || consentRaw === '1' || consentRaw === 'on';
      const alreadyConsented = !!current.creator_payout_consent_at;
      if (consentAccepted && !alreadyConsented) {
        updates['share_config.creator_payout_consent_at'] = new Date();
      }
      const hasConsent = alreadyConsented || consentAccepted;

      // Trust-based model: total_budget IS the active reward pool. The liability
      // counter (committed_budget_remaining) = declared pool minus rewards already
      // accrued (committed_total). No escrow / reload gating.
      const committedTotal = current.committed_total || 0;
      const deriveRemaining = (totalCents) => Math.max(0, totalCents - committedTotal);
      // Effective committed-remaining for the activation gate (recomputed if budget changes).
      let effectiveRemaining =
        current.committed_budget_remaining != null
          ? current.committed_budget_remaining
          : deriveRemaining(current.total_budget || 0);

      if (req.body.total_budget_dollars != null) {
        const dollars = parseFloat(req.body.total_budget_dollars);
        if (isNaN(dollars) || dollars < 0 || dollars > 1000000) {
          return res.status(400).json({ success: false, message: 'total_budget_dollars must be between $0 and $1,000,000' });
        }
        const newTotalCents = Math.round(dollars * 100);
        updates['share_config.total_budget'] = newTotalCents;
        // Resize the liability counter to match the new declared pool.
        effectiveRemaining = deriveRemaining(newTotalCents);
        updates['share_config.committed_budget_remaining'] = effectiveRemaining;
      }

      // Effective amount-per-share for the activation gate (new value if provided).
      let effectivePerShare = current.amount_per_share || 0;
      if (req.body.amount_per_share_dollars != null) {
        const dollars = parseFloat(req.body.amount_per_share_dollars);
        if (isNaN(dollars) || dollars < 0.1 || dollars > 100) {
          return res.status(400).json({ success: false, message: 'amount_per_share_dollars must be between $0.10 and $100' });
        }
        effectivePerShare = Math.round(dollars * 100);
        updates['share_config.amount_per_share'] = effectivePerShare;
      }

      if (req.body.is_paid_sharing_active != null) {
        const wantActive = !!req.body.is_paid_sharing_active;
        // Trust-based: can ACTIVATE when the declared pool covers a reward AND the
        // creator has accepted the pay-sharers-directly agreement. Deactivation is
        // always allowed.
        if (wantActive && !hasConsent) {
          return res.status(400).json({
            success: false,
            code: 'PAYOUT_CONSENT_REQUIRED',
            message:
              'You must accept the agreement to pay sharers directly (payout_consent) before activating Share-to-Earn.',
          });
        }
        if (wantActive && (effectiveRemaining < effectivePerShare || effectivePerShare <= 0)) {
          return res.status(400).json({
            success: false,
            message:
              'Cannot activate paid sharing: your reward budget cannot cover a single reward. Increase the budget first.',
          });
        }
        updates['share_config.is_paid_sharing_active'] = wantActive;
      }

      if (Array.isArray(req.body.share_channels)) {
        updates['share_config.share_channels'] = req.body.share_channels;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid share budget fields provided' });
      }

      updates['share_config.last_config_update'] = new Date();
      updates['share_config.config_updated_by'] = userId;

      await Campaign.updateOne({ _id: campaign._id }, { $set: updates });
      const refreshed = await Campaign.findById(campaign._id).select('share_config').lean();

      return res.status(200).json({
        success: true,
        message: 'Share budget updated successfully',
        data: refreshed.share_config,
      });
    } catch (error) {
      winstonLogger.error('updateShareBudget error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to update share budget' });
    }
  },
};

module.exports = CampaignEngagementController;
