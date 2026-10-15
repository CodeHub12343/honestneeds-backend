/**
 * Zod schemas for the feature-flag admin API.
 *
 * The project is in the middle of a Joi → Zod migration (Phase 0 convention).
 * All NEW validators live under src/schemas/; Joi files under src/validators/
 * stay until they are replaced in-place.
 */

const { z } = require('zod');

// A single flag value may be a boolean, a string mode, or a scoped payload.
const scopedValueSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.string().min(1).max(32).optional(),
    percentage: z.number().int().min(0).max(100).optional(),
    user_ids: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).max(10_000).optional(),
    roles: z.array(z.string().min(1).max(64)).max(32).optional(),
    envs: z.array(z.enum(['development', 'test', 'staging', 'production'])).optional(),
  })
  .strict();

const flagValueSchema = z.union([z.boolean(), z.string().min(1).max(32), scopedValueSchema]);

const setFlagBodySchema = z
  .object({
    value: flagValueSchema,
    note: z.string().max(500).optional(),
  })
  .strict();

const bulkSetFlagsBodySchema = z
  .object({
    flags: z.record(z.string().min(1).max(64), flagValueSchema),
    note: z.string().max(500).optional(),
  })
  .strict();

module.exports = {
  scopedValueSchema,
  flagValueSchema,
  setFlagBodySchema,
  bulkSetFlagsBodySchema,
};
