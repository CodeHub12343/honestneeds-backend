/**
 * Admin feature-flag routes.
 * Mounted at /api/admin/feature-flags by src/routes/admin/index.js.
 *
 * Auth: inherits authMiddleware + requireAdmin from the admin index.
 * Writes additionally require super_admin OR finance role (writes change
 * platform behaviour, so this is treated as a configuration mutation).
 */

const express = require('express');

const requireAdminRoles = require('../../middleware/requireAdminRoles');
const controller = require('../../controllers/admin/FeatureFlagController');

const router = express.Router();

// Reads: any admin.
router.get('/', controller.list);

// Writes: super_admin or finance (configuration-grade mutation).
router.post('/bulk', requireAdminRoles(['super_admin', 'finance']), controller.bulkSet);
router.post('/:key', requireAdminRoles(['super_admin', 'finance']), controller.set);
router.delete('/:key', requireAdminRoles(['super_admin', 'finance']), controller.reset);

module.exports = router;
