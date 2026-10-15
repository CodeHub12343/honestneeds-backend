# `src/schemas/` — Zod (preferred)

All new request/response validators live here. Use Zod, not Joi.

Pattern:

```js
const { z } = require('zod');

const createThingSchema = z
  .object({
    name: z.string().min(1).max(200),
    quantity: z.number().int().min(1),
  })
  .strict();

module.exports = { createThingSchema };
```

Call site:

```js
const parsed = createThingSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(422).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    },
  });
}
const data = parsed.data; // typed + sanitized
```

See `src/schemas/featureFlag.js` for a complete example.
