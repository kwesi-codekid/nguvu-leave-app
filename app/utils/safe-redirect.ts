/**
 * Return `path` only if it is a same-site relative path, otherwise `fallback`.
 * Rejects protocol-relative URLs ("//evil.com", "/\evil.com") and control
 * characters (browsers strip tabs/newlines, so "/\t/evil.com" becomes
 * "//evil.com").
 */
export function safeRedirectPath(
    path: string | null | undefined,
    fallback: string = "/dashboard"
): string {
    if (!path || typeof path !== "string") return fallback
    if (!path.startsWith("/")) return fallback
    if (path.startsWith("//") || path.startsWith("/\\")) return fallback
    if (/[\u0000-\u001F\u007F]/.test(path)) return fallback
    return path
}
