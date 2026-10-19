/**
 * Format of one-time login and password-reset codes.
 *
 * Kept separate from auth-codes.ts (which needs Node's crypto) so route
 * modules can use these at module level, e.g. in zod schemas, without pulling
 * server-only code into the browser bundle.
 */
export const CODE_LENGTH = 6
export const CODE_PATTERN = /^\d{6}$/
