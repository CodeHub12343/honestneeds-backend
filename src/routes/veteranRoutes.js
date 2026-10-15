/**
 * Veteran routes — mounted at /api/veterans by src/app.js.
 *
 * Scope is now PROFILE ONLY. The Battle Buddies peer-match / groups /
 * activities product moved to the standalone site at
 * https://battlebuddiesforvets.vercel.app — those routes were deleted.
 *
 * What remains here is the platform-level veteran recognition that other
 * features depend on: campaign veteran flagging, Sponsorship Pool
 * veterans-first ordering, verification tier.
 *
 * The deprecated endpoints return 410 Gone so any lingering client still
 * calling them gets a clear signal and a pointer to the new home, instead of
 * a silent 404 that looks like a bug.
 */

const express = require('express');
const multer = require('multer');

const { authMiddleware } = require('../middleware/authMiddleware');
const VeteranProfileController = require('../controllers/VeteranProfileController');

const router = express.Router();

const dd214Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Profile ─────────────────────────────────────────────────────────────
router.get('/profile', authMiddleware, VeteranProfileController.get);
router.put('/profile', authMiddleware, VeteranProfileController.update);
router.post(
  '/profile/verify',
  authMiddleware,
  dd214Upload.single('document'),
  VeteranProfileController.verify
);

// ── ID.me OAuth ─────────────────────────────────────────────────────────
router.post('/idme/start', authMiddleware, VeteranProfileController.idmeStart);
router.get('/idme/callback', VeteranProfileController.idmeCallback);

// ── Gone: moved to battlebuddiesforvets.vercel.app ──────────────────────
function gone(_req, res) {
  res.status(410).json({
    success: false,
    error: {
      code: 'MOVED_PERMANENTLY_EXTERNAL',
      message:
        'Battle Buddies now lives at a separate site. Visit https://battlebuddiesforvets.vercel.app/Veterans',
      new_home: 'https://battlebuddiesforvets.vercel.app/Veterans',
    },
  });
}

router.all('/battle-buddies', gone);
router.all('/battle-buddies/*', gone);
router.all('/groups', gone);
router.all('/groups/*', gone);
router.all('/activities', gone);
router.all('/activities/*', gone);

module.exports = router;
