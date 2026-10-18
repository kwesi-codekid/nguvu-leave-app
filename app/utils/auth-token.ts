import jwt, { type SignOptions } from "jsonwebtoken"
import { logger } from "./logger"

/**
 * Shared JWT helpers for the API routes.
 *
 * There is deliberately no fallback secret: if JWT_SECRET is missing, anyone
 * could forge tokens with the well-known default, so we fail loudly instead.
 */

export interface AccessTokenPayload {
    staffId: string
    type?: string
}

export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        const message =
            "JWT_SECRET environment variable is not set. Auth tokens cannot be signed or verified until it is configured."
        logger.error(message)
        throw new Error(message)
    }
    return secret
}

export function signAccessToken(staffId: string): string {
    const options: SignOptions = {
        expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as any,
    }
    return jwt.sign({ staffId, type: "access" }, getJwtSecret(), options)
}

export function signRefreshToken(staffId: string): string {
    const options: SignOptions = {
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || "7d") as any,
    }
    return jwt.sign({ staffId, type: "refresh" }, getJwtSecret(), options)
}

function verifyToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, getJwtSecret())
    if (
        typeof decoded === "string" ||
        typeof (decoded as AccessTokenPayload).staffId !== "string"
    ) {
        throw new Error("Invalid token payload")
    }
    return decoded as AccessTokenPayload
}

/**
 * Verify a token presented as a Bearer access token.
 * Refresh tokens are signed with the same secret, so they must be rejected
 * explicitly or a 7-day refresh token would work as an access token.
 * Tokens issued before the "access" type claim existed have no type and are
 * still accepted.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
    const payload = verifyToken(token)
    if (payload.type === "refresh") {
        throw new Error("Refresh tokens cannot be used as access tokens")
    }
    return payload
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
    const payload = verifyToken(token)
    if (payload.type !== "refresh") {
        throw new Error("Invalid refresh token")
    }
    return payload
}
