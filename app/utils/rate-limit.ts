import { createHmac, timingSafeEqual } from "crypto"
import { getSessionSecrets } from "./session-secrets"

/**
 * In-memory rate limiting for the auth endpoints.
 *
 * The app runs as a single long-lived server process, so process-local Maps
 * are sufficient.
 *
 * - Per-IP limit counts FAILURES only (wrong codes/passwords, unknown
 *   accounts), so many staff logging in from one office/NAT address are not
 *   throttled by each other's successful logins.
 * - Sliding-window helpers back the per-(account + IP) and global code-send
 *   limits used by utils/auth-codes.ts.
 *
 * Env:
 *   AUTH_RATE_LIMIT_MAX            failures per IP per 15 min (default 30)
 *   AUTH_GLOBAL_SEND_MAX_PER_HOUR  codes sent per hour, all accounts (default 300)
 *   CLIENT_IP_HEADER               trusted header holding the client IP
 *   TRUSTED_PROXY_HOPS             N: use the Nth-from-last X-Forwarded-For entry
 */

const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX) || 30
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

const AUTH_GLOBAL_SEND_MAX_PER_HOUR =
    Number(process.env.AUTH_GLOBAL_SEND_MAX_PER_HOUR) || 300
const HOUR_MS = 60 * 60 * 1000

export interface RateLimitResult {
    allowed: boolean
    retryAfterSeconds: number
}

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 }

// ---------------------------------------------------------------------------
// Fixed-window failure counters (per IP)
// ---------------------------------------------------------------------------

const failureBuckets = new Map<string, { count: number; resetAt: number }>()

/** Is this IP still under its failure budget? Does not consume anything. */
export function checkAuthFailureBudget(ip: string | null): RateLimitResult {
    if (!ip) return ALLOWED
    const now = Date.now()
    const bucket = failureBuckets.get(ip)
    if (!bucket || bucket.resetAt <= now) return ALLOWED
    if (bucket.count >= AUTH_RATE_LIMIT_MAX) {
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
        }
    }
    return ALLOWED
}

/** Count one failed auth attempt against this IP. */
export function recordAuthFailure(ip: string | null): void {
    if (!ip) return
    const now = Date.now()
    const bucket = failureBuckets.get(ip)
    if (!bucket || bucket.resetAt <= now) {
        failureBuckets.set(ip, {
            count: 1,
            resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS,
        })
        return
    }
    bucket.count++
}

// ---------------------------------------------------------------------------
// Sliding-window logs (per account+IP sends, global sends)
// ---------------------------------------------------------------------------

const slidingLogs = new Map<string, { windowMs: number; times: number[] }>()

function prunedTimes(key: string, windowMs: number, now: number): number[] {
    const entry = slidingLogs.get(key)
    if (!entry) return []
    entry.times = entry.times.filter((t) => t > now - windowMs)
    if (entry.times.length === 0) slidingLogs.delete(key)
    return entry.times
}

/** Would one more event under `key` stay within `limit` per `windowMs`? */
export function checkSlidingWindow(
    key: string,
    limit: number,
    windowMs: number
): RateLimitResult {
    const now = Date.now()
    const times = prunedTimes(key, windowMs, now)
    if (times.length < limit) return ALLOWED
    const oldestRelevant = times[times.length - limit]
    return {
        allowed: false,
        retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldestRelevant + windowMs - now) / 1000)
        ),
    }
}

/** Record one event under `key`. */
export function recordSlidingWindow(key: string, windowMs: number): void {
    const now = Date.now()
    prunedTimes(key, windowMs, now)
    const entry = slidingLogs.get(key)
    if (entry) {
        entry.times.push(now)
    } else {
        slidingLogs.set(key, { windowMs, times: [now] })
    }
}

const GLOBAL_SEND_KEY = "global:code-send"

/** Global ceiling on codes sent (SMS/email) across all accounts and IPs. */
export function checkGlobalSendBudget(): RateLimitResult {
    return checkSlidingWindow(
        GLOBAL_SEND_KEY,
        AUTH_GLOBAL_SEND_MAX_PER_HOUR,
        HOUR_MS
    )
}

export function recordGlobalSend(): void {
    recordSlidingWindow(GLOBAL_SEND_KEY, HOUR_MS)
}

// Drop expired entries periodically so the maps cannot grow without bound
setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of failureBuckets) {
        if (bucket.resetAt <= now) failureBuckets.delete(key)
    }
    for (const [key, entry] of slidingLogs) {
        prunedTimes(key, entry.windowMs, now)
    }
}, 60 * 1000).unref()

// ---------------------------------------------------------------------------
// Client IP
// ---------------------------------------------------------------------------

const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.trim().toLowerCase()
const TRUSTED_PROXY_HOPS = Number.parseInt(
    process.env.TRUSTED_PROXY_HOPS || "",
    10
)

let warnedUntrustedIpSource = false

function splitHeaderList(value: string | null): string[] {
    if (!value) return []
    return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
}

/**
 * Client IP from the configured trusted source. The Fetch Request has no
 * socket address, so this depends on the reverse proxy:
 *   CLIENT_IP_HEADER   read only that header (e.g. "x-real-ip",
 *                      "cf-connecting-ip")
 *   TRUSTED_PROXY_HOPS N -> the Nth-from-last X-Forwarded-For entry
 * Otherwise falls back to X-Real-IP, then the last X-Forwarded-For entry,
 * which a client can spoof if no proxy overwrites them.
 * Returns null when no usable value is present.
 */
export function getClientIp(request: Request): string | null {
    if (CLIENT_IP_HEADER) {
        const parts = splitHeaderList(request.headers.get(CLIENT_IP_HEADER))
        return parts.length > 0 ? parts[parts.length - 1] : null
    }

    if (Number.isInteger(TRUSTED_PROXY_HOPS) && TRUSTED_PROXY_HOPS > 0) {
        const parts = splitHeaderList(request.headers.get("x-forwarded-for"))
        return parts.length >= TRUSTED_PROXY_HOPS
            ? parts[parts.length - TRUSTED_PROXY_HOPS]
            : null
    }

    if (process.env.NODE_ENV === "production" && !warnedUntrustedIpSource) {
        warnedUntrustedIpSource = true
        console.warn(
            "[rate-limit] Neither CLIENT_IP_HEADER nor TRUSTED_PROXY_HOPS is set; " +
                "client IPs are read from X-Real-IP / X-Forwarded-For and per-IP " +
                "limiting may be spoofable. Configure the trusted proxy header."
        )
    }

    const realIp = splitHeaderList(request.headers.get("x-real-ip"))
    if (realIp.length > 0) return realIp[realIp.length - 1]

    const forwardedFor = splitHeaderList(request.headers.get("x-forwarded-for"))
    return forwardedFor.length > 0 ? forwardedFor[forwardedFor.length - 1] : null
}

// ---------------------------------------------------------------------------
// Internal (page action -> /api/auth) requests
// ---------------------------------------------------------------------------

/**
 * The login pages call /api/auth from the server itself, so on the API side
 * those requests carry the server's own address. The pages therefore forward
 * the browser's IP, together with a tag the API can verify: an HMAC of the
 * session secret, so it is never sent to browsers and cannot be forged.
 */
const INTERNAL_TAG_HEADER = "x-internal-request-tag"
const INTERNAL_CLIENT_IP_HEADER = "x-internal-client-ip"
const INTERNAL_TAG_LABEL = "nguvu-leave:internal-auth-request:v1"

let internalTag: string | null = null

function getInternalTag(): string {
    if (!internalTag) {
        internalTag = createHmac("sha256", getSessionSecrets()[0])
            .update(INTERNAL_TAG_LABEL)
            .digest("hex")
    }
    return internalTag
}

/** Headers for a server-side call to /api/auth made on behalf of `request`. */
export function internalRequestHeaders(
    request: Request
): Record<string, string> {
    return {
        [INTERNAL_TAG_HEADER]: getInternalTag(),
        [INTERNAL_CLIENT_IP_HEADER]: getClientIp(request) || "",
    }
}

export function isInternalRequest(request: Request): boolean {
    const presented = request.headers.get(INTERNAL_TAG_HEADER)
    if (!presented) return false
    const expected = Buffer.from(getInternalTag())
    const actual = Buffer.from(presented)
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
}

/**
 * The client IP to rate-limit on: the forwarded browser IP for verified
 * internal calls, otherwise the IP from the trusted source.
 */
export function resolveClientIp(request: Request): string | null {
    if (isInternalRequest(request)) {
        const forwarded = request.headers.get(INTERNAL_CLIENT_IP_HEADER)
        return forwarded ? forwarded.trim() : null
    }
    return getClientIp(request)
}

/** Human-readable wait time for "try again in ..." messages. */
export function formatWait(seconds: number): string {
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`
    const minutes = Math.ceil(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`
    const hours = Math.ceil(minutes / 60)
    return `${hours} hour${hours === 1 ? "" : "s"}`
}
