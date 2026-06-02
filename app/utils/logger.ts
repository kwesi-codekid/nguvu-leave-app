/**
 * Centralized logger + log suppression.
 *
 * In production we silence noisy output — both library/system-generated and
 * ad-hoc `console.log` calls scattered across controllers. Only two categories
 * are kept:
 *   1. Cron job activity      -> logger.cron(...)
 *   2. Essential API req/res  -> logger.api(...)  (wired into api-utils responses)
 * Errors and warnings are always preserved (silently swallowing them in a
 * leave/HR system would be dangerous).
 *
 * The kept logs are written straight to stdout/stderr, bypassing the console
 * override, so they survive suppression.
 *
 * Override with env vars:
 *   VERBOSE_LOGS=true  -> restore ALL console output (debugging)
 */

const isProd = process.env.NODE_ENV === "production"
const verbose = process.env.VERBOSE_LOGS === "true"

// Write directly to the stream so kept logs bypass the console override.
function out(stream: NodeJS.WriteStream, line: string): void {
    stream.write(line + "\n")
}

function ts(): string {
    return new Date().toISOString()
}

function rest(args: unknown[]): string {
    if (args.length === 0) return ""
    return (
        " " +
        args
            .map((a) =>
                a instanceof Error
                    ? a.stack || a.message
                    : typeof a === "object"
                      ? JSON.stringify(a)
                      : String(a)
            )
            .join(" ")
    )
}

export const logger = {
    /** Cron job activity — always shown. */
    cron(message: string, ...args: unknown[]): void {
        out(process.stdout, `[${ts()}] [CRON] ${message}${rest(args)}`)
    },

    /** Essential API request/response line — always shown. */
    api(message: string): void {
        out(process.stdout, `[${ts()}] [API] ${message}`)
    },

    /** Errors — always shown (stderr). */
    error(message: string, ...args: unknown[]): void {
        out(process.stderr, `[${ts()}] [ERROR] ${message}${rest(args)}`)
    },
}

let installed = false

/**
 * Silence console.log/info/debug in production. Idempotent.
 * console.warn and console.error are preserved.
 */
export function installLogSuppression(): void {
    if (installed) return
    installed = true

    // Keep everything in development or when explicitly opted in.
    if (!isProd || verbose) return

    const noop = (): void => {}
    console.log = noop
    console.info = noop
    console.debug = noop
}

// Installed as soon as this module is first imported (it is pulled in widely
// via api-utils on the server side), so suppression takes effect early.
installLogSuppression()
