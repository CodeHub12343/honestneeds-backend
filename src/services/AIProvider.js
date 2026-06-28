/**
 * AI Provider Facade (provider selector)
 *
 * Single switch-point for the AI subsystem's backend. Every feature service
 * and the AI controller import THIS module instead of a concrete provider, so
 * the active backend can be changed with one env var and zero code edits:
 *
 *   AI_PROVIDER=anthropic   → Claude  (src/services/AIProviderService.js)   [default]
 *   AI_PROVIDER=gemini      → Gemini  (src/services/GeminiProviderService.js)
 *
 * Both concrete providers expose the identical surface
 * (isEnabled / complete / completeJSON + AIUnavailableError / AIProviderError),
 * so this facade just re-exports whichever one is selected. Because it returns
 * exactly ONE provider object, the error classes a feature service catches are
 * always the same classes the active provider throws — `instanceof` checks stay
 * correct on either backend.
 *
 * The Claude provider and its config (src/config/ai.js) are intentionally left
 * untouched; switching is purely additive.
 */

const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

let impl;
switch (provider) {
  case 'gemini':
  case 'google':
    impl = require('./GeminiProviderService');
    break;
  case 'anthropic':
  case 'claude':
  default:
    impl = require('./AIProviderService');
    break;
}

// impl is the provider class; it already carries the AIUnavailableError /
// AIProviderError statics, so re-exporting the class re-exports them too.
module.exports = impl;
