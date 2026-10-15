# Server-side i18n

Minimal, dependency-free message formatter. For the full ICU/next-intl surface,
use the frontend (`messages/`). The server covers emails, validation errors,
and anything the backend emits as text.

## Keys

- Under `src/i18n/messages/<locale>.json`.
- Namespaced by `domain.key` (e.g. `validation.email_required`,
  `campaigns.count`).
- One JSON per locale. Keys mirror between locales — see `scripts/i18n/`.

## Usage

```js
const { t, tLocale } = require('../i18n/t');

// In a route handler:
res.status(422).json({
  code: 'VALIDATION_ERROR',
  message: t(req, 'validation.email_required'),
});

// Explicit locale (jobs, emails from a user record):
emailService.send({ subject: tLocale(user.locale, 'auth.welcome_subject') });
```

## Supported formats

- `{var}` — variable
- `{count, plural, one {# campaign} other {# campaigns}}` — plural (`#` = value)
- `{gender, select, male {he} female {she} other {they}}` — select

Nested formats and full ICU are **not** supported server-side on purpose. Move
complex copy to the frontend if you hit the ceiling.

## Falling back

- Unknown locale → `DEFAULT_LOCALE` (usually `en`).
- Missing key in locale → check `en` → return the key itself (loud).
- Malformed JSON → warn and treat the locale as empty (no crash).
