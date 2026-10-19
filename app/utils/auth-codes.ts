import { randomInt } from "crypto"
import bcrypt from "bcryptjs"
import mongoose from "mongoose"
import Staff from "~/models/staff.model"
import {
    checkGlobalSendBudget,
    checkSlidingWindow,
    recordGlobalSend,
    recordSlidingWindow,
} from "./rate-limit"

/**
 * One-time login codes, password-reset codes and password-login lockout.
 *
 * Per-account counters live on the staff record and are updated atomically
 * so that parallel requests cannot exceed the limits. The per-(account + IP)
 * and global send limits are in-memory (see utils/rate-limit.ts).
 */

import { CODE_LENGTH, CODE_PATTERN } from "./code-format"
export { CODE_LENGTH, CODE_PATTERN }
export const MAX_CODE_ATTEMPTS = 5
export const CODE_RESEND_COOLDOWN_MS = 30 * 1000
export const MAX_SENDS_PER_HOUR_PER_IP = 5 // per account + client IP
export const MAX_CODES_PER_DAY = 20 // absolute ceiling per account
export const MAX_PASSWORD_ATTEMPTS = 5
export const PASSWORD_LOCKOUT_MS = 15 * 60 * 1000

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export function generateCode(): string {
    return randomInt(0, 10 ** CODE_LENGTH)
        .toString()
        .padStart(CODE_LENGTH, "0")
}

type CodeKind = "otp" | "reset"

const CODE_FIELDS = {
    otp: {
        hash: "otpCodeHash",
        expires: "otpExpiresAt",
        attempts: "otpAttempts",
    },
    reset: {
        hash: "resetCodeHash",
        expires: "resetCodeExpiresAt",
        attempts: "resetCodeAttempts",
    },
} as const

export type CodeCheckResult =
    | "valid"
    | "invalid"
    | "expired"
    | "missing"
    | "too_many_attempts"

// Clear a code only if it is still the one that was checked, so a stale
// request cannot wipe a code that was issued in the meantime
async function clearCode(staffId: string, kind: CodeKind, codeHash: string) {
    const f = CODE_FIELDS[kind]
    await Staff.updateOne(
        { _id: staffId, [f.hash]: codeHash },
        { $set: { [f.hash]: null, [f.expires]: null, [f.attempts]: 0 } }
    )
}

/**
 * Check a submitted code. Each check consumes one attempt; after
 * MAX_CODE_ATTEMPTS wrong codes the code is invalidated and a new one must be
 * requested. A correct code is cleared so it can only be used once.
 */
export async function verifyStaffCode(
    staffId: string,
    kind: CodeKind,
    code: string
): Promise<CodeCheckResult> {
    const f = CODE_FIELDS[kind]

    // Reserve an attempt before comparing so parallel guesses are counted
    const staff: any = await Staff.findOneAndUpdate(
        {
            _id: staffId,
            [f.hash]: { $type: "string" },
            [f.attempts]: { $not: { $gte: MAX_CODE_ATTEMPTS } },
        },
        { $inc: { [f.attempts]: 1 } },
        { returnDocument: "after" }
    ).select(`+${f.hash} +${f.expires} +${f.attempts}`)

    if (!staff) {
        const current: any = await Staff.findById(staffId)
            .select(`+${f.hash}`)
            .lean()
        if (!current || !current[f.hash]) return "missing"
        // Attempts exhausted: invalidate the code
        await clearCode(staffId, kind, current[f.hash])
        return "too_many_attempts"
    }

    const codeHash: string = staff.get(f.hash)
    const expiresAt: Date | null = staff.get(f.expires)

    if (!expiresAt || expiresAt < new Date()) {
        await clearCode(staffId, kind, codeHash)
        return "expired"
    }

    const isValid = await bcrypt.compare(code, codeHash)

    if (isValid) {
        // Clear only if the code is unchanged, so a code can be used once
        const result = await Staff.updateOne(
            { _id: staffId, [f.hash]: codeHash },
            { $set: { [f.hash]: null, [f.expires]: null, [f.attempts]: 0 } }
        )
        return result.modifiedCount === 1 ? "valid" : "missing"
    }

    if ((staff.get(f.attempts) || 0) >= MAX_CODE_ATTEMPTS) {
        await clearCode(staffId, kind, codeHash)
        return "too_many_attempts"
    }

    return "invalid"
}

/**
 * Store a freshly generated code (hashed) and reset its attempt counter.
 */
export async function storeStaffCode(
    staffId: string,
    kind: CodeKind,
    code: string,
    ttlMs: number
): Promise<void> {
    const f = CODE_FIELDS[kind]
    const codeHash = await bcrypt.hash(code, 10)
    await Staff.updateOne(
        { _id: staffId },
        {
            $set: {
                [f.hash]: codeHash,
                [f.expires]: new Date(Date.now() + ttlMs),
                [f.attempts]: 0,
            },
        }
    )
}

export type CodeSendResult =
    | { allowed: true }
    | {
          allowed: false
          reason: "cooldown" | "hourly_limit" | "daily_limit" | "global_limit"
          retryAfterSeconds: number
      }

/**
 * Reserve a slot to send a code (SMS or email) to this account. Limits,
 * shared across login OTPs and password-reset codes:
 *   - global ceiling across all accounts/IPs (bounds SMS spend)
 *   - MAX_SENDS_PER_HOUR_PER_IP per account + client IP, so requests from
 *     another address cannot use up the owner's own budget
 *   - one every 30 seconds and MAX_CODES_PER_DAY per rolling 24 hours per
 *     account (stored on the staff record)
 */
export async function reserveCodeSend(
    staffId: string,
    clientIp: string | null
): Promise<CodeSendResult> {
    const globalBudget = checkGlobalSendBudget()
    if (!globalBudget.allowed) {
        return {
            allowed: false,
            reason: "global_limit",
            retryAfterSeconds: globalBudget.retryAfterSeconds,
        }
    }

    const accountIpKey = `code-send:${staffId}:${clientIp || "unknown"}`
    const hourlyBudget = checkSlidingWindow(
        accountIpKey,
        MAX_SENDS_PER_HOUR_PER_IP,
        HOUR_MS
    )
    if (!hourlyBudget.allowed) {
        return {
            allowed: false,
            reason: "hourly_limit",
            retryAfterSeconds: hourlyBudget.retryAfterSeconds,
        }
    }

    const now = Date.now()
    const dayAgo = new Date(now - DAY_MS)
    const cooldownCutoff = new Date(now - CODE_RESEND_COOLDOWN_MS)
    // Native driver calls: these array operators are passed through as-is
    // instead of relying on Mongoose's update casting
    const _id = new mongoose.Types.ObjectId(String(staffId))

    await Staff.collection.updateOne(
        { _id },
        { $pull: { codeSendLog: { $lt: dayAgo } } } as any
    )

    // Fewer than MAX_CODES_PER_DAY entries and none within the cooldown
    const reserved = await Staff.collection.updateOne(
        {
            _id,
            [`codeSendLog.${MAX_CODES_PER_DAY - 1}`]: { $exists: false },
            codeSendLog: { $not: { $gt: cooldownCutoff } },
        },
        { $push: { codeSendLog: new Date(now) } } as any
    )

    if (reserved.modifiedCount === 1) {
        recordSlidingWindow(accountIpKey, HOUR_MS)
        recordGlobalSend()
        return { allowed: true }
    }

    const current: any = await Staff.findById(staffId)
        .select("+codeSendLog")
        .lean()
    const sentTimes: number[] = (current?.codeSendLog || [])
        .map((d: Date) => new Date(d).getTime())
        .filter((t: number) => t > now - DAY_MS)
        .sort((a: number, b: number) => a - b)

    const lastSent = sentTimes[sentTimes.length - 1]
    if (lastSent && now - lastSent < CODE_RESEND_COOLDOWN_MS) {
        return {
            allowed: false,
            reason: "cooldown",
            retryAfterSeconds: Math.ceil(
                (CODE_RESEND_COOLDOWN_MS - (now - lastSent)) / 1000
            ),
        }
    }

    const oldestInWindow =
        sentTimes[Math.max(0, sentTimes.length - MAX_CODES_PER_DAY)] ?? now
    return {
        allowed: false,
        reason: "daily_limit",
        retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldestInWindow + DAY_MS - now) / 1000)
        ),
    }
}

export type PasswordAttemptResult =
    | { allowed: true; attempts: number }
    | { allowed: false; retryAfterSeconds: number }

/**
 * Reserve a password attempt. After MAX_PASSWORD_ATTEMPTS consecutive
 * failures the account's password login is locked for PASSWORD_LOCKOUT_MS.
 */
export async function reservePasswordAttempt(
    staffId: string
): Promise<PasswordAttemptResult> {
    const now = new Date()

    const reserved: any = await Staff.findOneAndUpdate(
        {
            _id: staffId,
            passwordAttempts: { $not: { $gte: MAX_PASSWORD_ATTEMPTS } },
            passwordLockedUntil: { $not: { $gt: now } },
        },
        { $inc: { passwordAttempts: 1 } },
        { returnDocument: "after" }
    ).select("+passwordAttempts")

    if (reserved) {
        return { allowed: true, attempts: reserved.get("passwordAttempts") || 0 }
    }

    const current: any = await Staff.findById(staffId)
        .select("+passwordLockedUntil")
        .lean()
    let lockedUntil: Date | null = current?.passwordLockedUntil
        ? new Date(current.passwordLockedUntil)
        : null

    if (!lockedUntil || lockedUntil <= now) {
        // Attempts used up but no active lock recorded: start the lockout now
        lockedUntil = new Date(now.getTime() + PASSWORD_LOCKOUT_MS)
        await Staff.updateOne(
            { _id: staffId },
            { $set: { passwordLockedUntil: lockedUntil, passwordAttempts: 0 } }
        )
    }

    return {
        allowed: false,
        retryAfterSeconds: Math.ceil(
            (lockedUntil.getTime() - now.getTime()) / 1000
        ),
    }
}

export async function recordPasswordResult(
    staffId: string,
    success: boolean,
    attempts: number
): Promise<void> {
    if (success) {
        await Staff.updateOne(
            { _id: staffId },
            { $set: { passwordAttempts: 0, passwordLockedUntil: null } }
        )
        return
    }

    if (attempts >= MAX_PASSWORD_ATTEMPTS) {
        await Staff.updateOne(
            { _id: staffId },
            {
                $set: {
                    passwordLockedUntil: new Date(
                        Date.now() + PASSWORD_LOCKOUT_MS
                    ),
                    passwordAttempts: 0,
                },
            }
        )
    }
}

/** Clear any password lockout, e.g. after a successful password reset. */
export async function clearPasswordLockout(staffId: string): Promise<void> {
    await Staff.updateOne(
        { _id: staffId },
        { $set: { passwordAttempts: 0, passwordLockedUntil: null } }
    )
}
