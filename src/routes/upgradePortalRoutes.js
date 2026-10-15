/**
 * Public + authed Sponsorship Pool portal routes.
 * Admin grant route is mounted under /api/admin/upgrade-portal from
 * routes/admin/index.js so the admin guard chain applies.
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const UpgradePortalController = require('../controllers/UpgradePortalController');

// Public portal snapshot: pool balance, queue, "waiting_for_sponsorships" state.
router.get('/', UpgradePortalController.getSnapshot);

// Signed-in user's own queue positions.
router.get('/mine', authMiddleware, UpgradePortalController.getMine);

module.exports = router;
