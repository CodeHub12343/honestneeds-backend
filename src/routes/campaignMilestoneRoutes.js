/**
 * Campaign Milestone Routes (CA-19)
 * Nested under /campaigns/:id/milestones
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const CampaignMilestoneController = require('../controllers/campaignMilestoneController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use((req, res, next) => {
  if (req.params.id && !req.params.campaignId) {
    req.params.campaignId = req.params.id;
  }
  next();
});

router.get('/', CampaignMilestoneController.list);
router.post('/', authMiddleware, CampaignMilestoneController.createCustom);
router.post('/check', authMiddleware, CampaignMilestoneController.check);
router.delete('/:milestoneId', authMiddleware, CampaignMilestoneController.remove);

module.exports = router;
