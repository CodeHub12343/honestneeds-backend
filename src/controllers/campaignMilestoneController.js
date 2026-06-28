/**
 * Campaign Milestone Controller (CA-19)
 * HTTP handlers for campaign milestone celebrations.
 *
 * Endpoints (mounted under /campaigns/:id/milestones):
 *  - GET    /          List milestones                              (public)
 *  - POST   /          Create a custom milestone (creator only)     (auth)
 *  - POST   /check     Recompute auto-milestones (creator only)     (auth)
 *  - DELETE /:milestoneId  Remove a milestone (creator only)        (auth)
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const CampaignMilestone = require('../models/CampaignMilestone');
const CampaignMilestoneService = require('../services/CampaignMilestoneService');
const winstonLogger = require('../utils/winstonLogger');

async function resolveCampaign(idOrCampaignId) {
  if (mongoose.Types.ObjectId.isValid(idOrCampaignId)) {
    const byId = await Campaign.findById(idOrCampaignId);
    if (byId) return byId;
  }
  return Campaign.findOne({ campaign_id: idOrCampaignId, is_deleted: false });
}

const CampaignMilestoneController = {
  async list(req, res) {
    try {
      const campaign = await resolveCampaign(req.params.campaignId || req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
      const milestones = await CampaignMilestoneService.listMilestones(campaign._id, { limit });
      return res.status(200).json({
        success: true,
        message: 'Milestones retrieved successfully',
        data: milestones,
      });
    } catch (error) {
      winstonLogger.error('Milestone list error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve milestones' });
    }
  },

  async createCustom(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }
      const campaign = await resolveCampaign(req.params.campaignId || req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Only the creator can add milestones' });
      }

      const title = (req.body.title || '').trim();
      if (title.length < 3 || title.length > 200) {
        return res.status(400).json({ success: false, message: 'Title must be between 3 and 200 characters' });
      }
      const message = req.body.message ? String(req.body.message).trim().slice(0, 1000) : undefined;

      const milestone = await CampaignMilestoneService.createCustomMilestone(campaign._id, {
        title,
        message,
        celebration_emoji: req.body.celebration_emoji,
      });

      return res.status(201).json({
        success: true,
        message: 'Milestone created successfully',
        data: milestone,
      });
    } catch (error) {
      winstonLogger.error('Milestone create error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to create milestone' });
    }
  },

  async check(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }
      const campaign = await resolveCampaign(req.params.campaignId || req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Only the creator can run milestone checks' });
      }

      const created = await CampaignMilestoneService.checkAndCreateMilestones(campaign);
      return res.status(200).json({
        success: true,
        message: created.length > 0 ? `${created.length} new milestone(s) reached` : 'No new milestones',
        data: created,
      });
    } catch (error) {
      winstonLogger.error('Milestone check error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to check milestones' });
    }
  },

  async remove(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }
      const campaign = await resolveCampaign(req.params.campaignId || req.params.id);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Only the creator can remove milestones' });
      }

      const result = await CampaignMilestone.deleteOne({
        _id: req.params.milestoneId,
        campaign_id: campaign._id,
      });
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'Milestone not found' });
      }
      return res.status(204).send();
    } catch (error) {
      winstonLogger.error('Milestone delete error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to delete milestone' });
    }
  },
};

module.exports = CampaignMilestoneController;
