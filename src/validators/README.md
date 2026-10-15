# `src/validators/` — Joi (legacy)

As of Phase 0 (2026-10) this directory is **frozen for new validators**. Add
new validation schemas under `src/schemas/` using **Zod** instead.

## Why

- The frontend already uses Zod (`zod` in `package.json`). A shared schema
  package becomes feasible once both sides speak the same library.
- Joi + Zod duplication was the root cause of several validation drift bugs
  (see audit docs).

## Rules

- No new file under `src/validators/` may import `joi`. ESLint enforces this.
- Existing Joi validators stay until they are replaced in-place. Do not do
  speculative Joi→Zod migrations without an accompanying code change.
- When you touch a Joi validator for a real reason, prefer rewriting it in
  Zod under `src/schemas/<name>.js` and updating the import, in the same PR.

## New validators

Put them under `src/schemas/<name>.js` and export Zod schemas. Call sites use
`schema.safeParse(data)` and return the project-standard `VALIDATION_ERROR`
shape on failure. See `src/schemas/featureFlag.js` for an example.
