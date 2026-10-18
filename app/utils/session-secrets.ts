import { randomBytes } from "crypto"

/**
 * Secrets used to sign the session cookies (auth + flash).
 *
 * Production requires SESSION_SECRET. In development, if it is not set, a
 * random per-process secret is used so there is no well-known default; dev
 * sessions simply reset when the server restarts.
 */
let devFallbackSecret: string | null = null

export function getSessionSecrets(): string[] {
    const secret = process.env.SESSION_SECRET
    if (secret) return [secret]

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "Auth session secret is not set! Please contact IT for support..."
        )
    }

    if (!devFallbackSecret) {
        devFallbackSecret = randomBytes(32).toString("hex")
    }
    return [devFallbackSecret]
}
