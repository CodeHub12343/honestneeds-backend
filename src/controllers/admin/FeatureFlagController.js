/**
 * Admin Feature-Flag Controller
 * Endpoints for the admin UI to list/set/reset feature flags.
 *
 * Writes go through FeatureFlagService.set / setBulk, which handle PlatformSettings
 * persistence and cache invalidation, and then write an AuditLog entry.
 */

const FeatureFlagService = require('../../services/FeatureFlagService');
const AuditLogger = require('../../services/AuditLogger');
const { setFlagBodySchema, bulkSetFlagsBodySchema } = require('../../schemas/featureFlag');

async function list(req, res, next) {
  try {
    const flags = await FeatureFlagService.describe();
    res.json({ success: true, data: { flags } });
  } catch (err) {
    next(err);
  }
}

async function set(req, res, next) {
  try {
    const parsed = setFlagBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid flag payload', details: parsed.error.flatten() },
      });
    }
    const key = req.params.key;
    const previous = await FeatureFlagService.getRawValue(key);
    const next_ = await FeatureFlagService.set(key, parsed.data.value);
    await AuditLogger.record({
      req,
      action: 'feature_flag.set',
      entityType: 'FeatureFlag',
      description: `Set flag '${key}'`,
      before: { value: previous },
      after: { value: next_ },
      metadata: { key, note: parsed.data.note || null },
    });
    res.json({ success: true, data: { key, value: next_ } });
  } catch (err) {
    next(err);
  }
}

async function bulkSet(req, res, next) {
  try {
    const parsed = bulkSetFlagsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid flags payload', details: parsed.error.flatten() },
      });
    }
    const previous = await FeatureFlagService.getAll();
    const next_ = await FeatureFlagService.setBulk(parsed.data.flags);
    await AuditLogger.record({
      req,
      action: 'feature_flag.bulk_set',
      entityType: 'FeatureFlag',
      description: `Bulk-updated ${Object.keys(parsed.data.flags).length} flag(s)`,
      before: previous,
      after: next_,
      metadata: { note: parsed.data.note || null },
    });
    res.json({ success: true, data: { flags: next_ } });
  } catch (err) {
    next(err);
  }
}

async function reset(req, res, next) {
  try {
    const key = req.params.key;
    const previous = await FeatureFlagService.getRawValue(key);
    const next_ = await FeatureFlagService.reset(key);
    await AuditLogger.record({
      req,
      action: 'feature_flag.reset',
      entityType: 'FeatureFlag',
      description: `Reset flag '${key}' to default`,
      before: { value: previous },
      after: { value: next_ },
      metadata: { key },
    });
    res.json({ success: true, data: { key, value: next_ } });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, set, bulkSet, reset };
