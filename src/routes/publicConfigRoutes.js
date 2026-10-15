/**
 * Public (unauth-safe) config reads. Mounted at /api/public-config.
 * Keeps the main /api/admin/config path admin-only.
 */

const express = require('express');
const PublicConfigController = require('../controllers/PublicConfigController');

const router = express.Router();

router.get('/external-links', PublicConfigController.getExternalLinks);

module.exports = router;
