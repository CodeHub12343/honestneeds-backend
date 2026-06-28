/**
 * Campaign Comment Routes (CA-15)
 * Nested under /campaigns/:id/comments
 *
 * Routes:
 *  - POST   /                       Create comment / reply / encouragement   (auth)
 *  - GET    /                       List top-level comments                  (public, optional auth)
 *  - GET    /:commentId/replies     List replies                            (public, optional auth)
 *  - PATCH  /:commentId             Edit own comment                        (auth)
 *  - DELETE /:commentId             Delete comment                          (auth)
 *  - POST   /:commentId/like        Toggle like                            (auth)
 *  - POST   /:commentId/report      Report a comment                       (auth)
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const CampaignCommentController = require('../controllers/campaignCommentController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');

// Normalize the parent router's :id param to :campaignId
router.use((req, res, next) => {
  if (req.params.id && !req.params.campaignId) {
    req.params.campaignId = req.params.id;
  }
  next();
});

router.post('/', authMiddleware, CampaignCommentController.create);
router.get('/', optionalAuthMiddleware, CampaignCommentController.list);
router.get('/:commentId/replies', optionalAuthMiddleware, CampaignCommentController.listReplies);
router.patch('/:commentId', authMiddleware, CampaignCommentController.update);
router.delete('/:commentId', authMiddleware, CampaignCommentController.remove);
router.post('/:commentId/like', authMiddleware, CampaignCommentController.toggleLike);
router.post('/:commentId/report', authMiddleware, CampaignCommentController.report);

module.exports = router;
