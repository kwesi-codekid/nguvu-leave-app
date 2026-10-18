/**
 * Escape a user-supplied string so it can be used literally inside a RegExp
 * or a MongoDB $regex (prevents regex injection / ReDoS from search boxes).
 */
export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
