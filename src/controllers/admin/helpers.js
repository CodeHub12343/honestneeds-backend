/**
 * Shared helpers for admin controllers.
 */

/**
 * Wrap an async route handler so thrown errors are forwarded to the global
 * errorHandler middleware instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Standard success envelope. */
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** Standard failure envelope (most errors flow through errorHandler instead). */
const fail = (res, message, status = 400, code = 'BAD_REQUEST') =>
  res.status(status).json({ success: false, error: { code, message } });

/** Parse standard pagination query params. */
const parsePagination = (query, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { asyncHandler, ok, fail, parsePagination };
