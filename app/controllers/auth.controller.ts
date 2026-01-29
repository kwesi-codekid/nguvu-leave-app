import { Request } from "express"
import jwt from "jsonwebtoken"
import Staff from "../models/staff.model"
import AuditLogController from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { AuditAction, ResponseObject, AccountStatus } from "../utils/types"
import sendSMS from "~/utils/sendSMS"
// import { sendSMS } from "../utils/sendSMS"

// JWT configuration (should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"
const REFRESH_TOKEN_SECRET =
    process.env.REFRESH_TOKEN_SECRET || "your-refresh-secret"
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"

// OTP configuration
const OTP_EXPIRY_MINUTES = 10
const OTP_LENGTH = 4

// Rate limiting store (in production, use Redis)
const otpAttempts = new Map<string, { count: number; resetAt: Date }>()

export class AuthController {
    /**
     * Generate a random 4-digit OTP
     */
    private static generateOTP(): string {
        return Math.floor(1000 + Math.random() * 9000).toString()
    }

    /**
     * Generate JWT tokens
     */
    private static generateTokens(userId: string) {
        const accessToken = jwt.sign({ userId, type: "access" }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        } as jwt.SignOptions)

        const refreshToken = jwt.sign(
            { userId, type: "refresh" },
            REFRESH_TOKEN_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions
        )

        return { accessToken, refreshToken }
    }

    /**
     * Check rate limiting for OTP requests
     */
    private static checkRateLimit(identifier: string): boolean {
        const now = new Date()
        const attempt = otpAttempts.get(identifier)

        if (!attempt || attempt.resetAt < now) {
            // Reset counter
            otpAttempts.set(identifier, {
                count: 1,
                resetAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour
            })
            return true
        }

        if (attempt.count >= 5) {
            // Max 5 attempts per hour
            return false
        }

        attempt.count++
        return true
    }

    /**
     * Login with email/password or initiate phone/OTP
     * POST /api/auth/login
     */
    static async login(req: Request): Promise<ResponseObject> {
        try {
            const { email, password, phone } = req.body

            // Validate input with distinct field errors
            const errors = []
            if (!email && !phone) {
                errors.push({
                    field: "email",
                    message: "Email is required if phone is not provided",
                })
                errors.push({
                    field: "phone",
                    message: "Phone is required if email is not provided",
                })
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            let staff = null

            // Email + Password login
            if (email && password) {
                // Validate email format
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    return validationErrorResponseObject("Validation failed", [
                        { field: "email", message: "Invalid email format" },
                    ])
                }

                if (!password) {
                    return validationErrorResponseObject("Validation failed", [
                        {
                            field: "password",
                            message: "Password is required for email login",
                        },
                    ])
                }

                // Find staff by email with password field
                staff = await Staff.findOne({
                    email: email.toLowerCase(),
                }).select("+passwordHash")

                if (!staff) {
                    return errorResponseObject("Invalid email or password")
                }

                // Check if staff has a password set
                if (!staff.passwordHash) {
                    return errorResponseObject(
                        "Password not set. Please use phone login or reset password"
                    )
                }

                // Verify password
                const isValidPassword = await staff.verifyPassword(password)
                if (!isValidPassword) {
                    // Log failed attempt
                    await AuditLogController.createAuditLog({
                        action: AuditAction.USER_LOGIN,
                        entityType: "Staff",
                        entityId: staff._id,
                        performedBy: staff._id,
                        performedByName: staff.name,
                        performedByEmail: staff.email,
                        description: "Failed login attempt with email/password",
                        status: "failed",
                        errorMessage: "Invalid password",
                        metadata: { loginMethod: "email" },
                        ipAddress: req.ip || req.socket.remoteAddress,
                        userAgent: req.headers["user-agent"],
                    })

                    return errorResponseObject("Invalid email or password")
                }

                // Check account status
                if (staff.status === AccountStatus.INACTIVE) {
                    return errorResponseObject(
                        "Account is inactive. Please contact HR"
                    )
                }
                if (staff.status === AccountStatus.SUSPENDED) {
                    return errorResponseObject(
                        "Account is suspended. Please contact HR"
                    )
                }

                // Generate tokens
                const tokens = AuthController.generateTokens(staff._id)

                // Populate department for response
                await staff.populate("department", "name")

                // Log successful login
                await AuditLogController.createAuditLog({
                    action: AuditAction.USER_LOGIN,
                    entityType: "Staff",
                    entityId: staff._id,
                    performedBy: staff._id,
                    performedByName: staff.name,
                    performedByEmail: staff.email,
                    description: "Successful login with email/password",
                    metadata: { loginMethod: "email" },
                    ipAddress: req.ip || req.socket.remoteAddress,
                    userAgent: req.headers["user-agent"],
                })

                // Remove sensitive fields
                const staffData = staff.toObject()
                delete staffData.passwordHash

                return successResponseObject("Login successful", {
                    user: staffData,
                    tokens,
                })
            } else if (phone) {
                // Phone + OTP login initiation
                if (!phone.trim()) {
                    return validationErrorResponseObject("Validation failed", [
                        {
                            field: "phone",
                            message: "Phone number cannot be empty",
                        },
                    ])
                }

                staff = await Staff.findOne({ phone: phone.trim() })

                if (!staff) {
                    return errorResponseObject("Phone number not registered")
                }

                // Check account status
                if (staff.status === AccountStatus.INACTIVE) {
                    return errorResponseObject(
                        "Account is inactive. Please contact HR"
                    )
                }
                if (staff.status === AccountStatus.SUSPENDED) {
                    return errorResponseObject(
                        "Account is suspended. Please contact HR"
                    )
                }

                // Check rate limiting
                if (!AuthController.checkRateLimit(phone)) {
                    return errorResponseObject(
                        "Too many OTP requests. Please try again later"
                    )
                }

                // Generate and send OTP
                const otp = AuthController.generateOTP()

                // Save hashed OTP with expiry
                await staff.setOTP(otp, OTP_EXPIRY_MINUTES)
                await staff.save()

                // Send OTP via SMS
                try {
                    await sendSMS({
                        recipient: phone,
                        smsText: `Your leave management login code is: ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
                    })
                } catch (smsError) {
                    console.error("SMS sending failed:", smsError)
                    return errorResponseObject(
                        "Failed to send OTP. Please try again"
                    )
                }

                return successResponseObject("OTP sent successfully", {
                    phone,
                    expiresIn: OTP_EXPIRY_MINUTES * 60, // in seconds
                    message: `OTP has been sent to ${phone}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
                })
            }

            return errorResponseObject("Invalid login request")
        } catch (error) {
            console.error("Login error:", error)
            return errorResponseObject("Login failed")
        }
    }

    /**
     * Request OTP for phone login
     * POST /api/auth/request-otp
     */
    static async requestOTP(req: Request): Promise<ResponseObject> {
        try {
            const { phone } = req.body

            if (!phone) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "phone", message: "Phone number is required" },
                ])
            }

            if (!phone.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "phone", message: "Phone number cannot be empty" },
                ])
            }

            // Check rate limiting
            if (!AuthController.checkRateLimit(phone)) {
                return errorResponseObject(
                    "Too many OTP requests. Please try again later"
                )
            }

            // Find staff by phone
            const staff = await Staff.findOne({ phone: phone.trim() })
            if (!staff) {
                return errorResponseObject("Phone number not registered")
            }

            // Check account status
            if (staff.status === AccountStatus.INACTIVE) {
                return errorResponseObject(
                    "Account is inactive. Please contact HR"
                )
            }
            if (staff.status === AccountStatus.SUSPENDED) {
                return errorResponseObject(
                    "Account is suspended. Please contact HR"
                )
            }

            // Generate and send OTP
            const otp = AuthController.generateOTP()
            console.log("[OTP Request] Generated OTP for phone:", phone.trim(), "Staff ID:", staff._id)

            // Save hashed OTP with expiry
            await staff.setOTP(otp, OTP_EXPIRY_MINUTES)
            await staff.save()
            
            // Verify it was saved
            const verifyStaff = await Staff.findById(staff._id).select("+otpCodeHash +otpExpiresAt")
            console.log("[OTP Request] After save - Has OTP:", !!verifyStaff?.otpCodeHash, "Has Expiry:", !!verifyStaff?.otpExpiresAt)

            // Send OTP via SMS
            try {
                await sendSMS({
                    recipient: phone,
                    smsText: `Your leave management login code is: ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
                })
            } catch (smsError) {
                console.error("SMS sending failed:", smsError)
                return errorResponseObject(
                    "Failed to send OTP. Please try again"
                )
            }

            return successResponseObject("OTP sent successfully", {
                phone,
                expiresIn: OTP_EXPIRY_MINUTES * 60, // in seconds
                message: `OTP has been sent to ${phone}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
            })
        } catch (error) {
            console.error("OTP request error:", error)
            return errorResponseObject("Failed to send OTP")
        }
    }

    /**
     * Verify OTP and complete login
     * POST /api/auth/verify-otp
     */
    static async verifyOTP(req: Request): Promise<ResponseObject> {
        try {
            const { phone, otp } = req.body

            // Validation with distinct field errors
            const errors = []
            if (!phone) {
                errors.push({
                    field: "phone",
                    message: "Phone number is required",
                })
            } else if (!phone.trim()) {
                errors.push({
                    field: "phone",
                    message: "Phone number cannot be empty",
                })
            }

            if (!otp) {
                errors.push({ field: "otp", message: "OTP code is required" })
            } else if (!/^\d{4}$/.test(otp)) {
                errors.push({
                    field: "otp",
                    message: "OTP must be a 4-digit code",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Debug logging
            console.log("[OTP Verify] Looking for phone:", phone.trim())
            
            // Find staff with OTP fields - ensure we're selecting the hidden fields
            const staff = await Staff.findOne({ phone: phone.trim() })
                .select("+otpCodeHash +otpExpiresAt +passwordHash")
                .exec()

            if (!staff) {
                console.log("[OTP Verify] No staff found with phone:", phone.trim())
                return errorResponseObject("Invalid phone number")
            }

            console.log("[OTP Verify] Staff found:", staff._id, "Has OTP:", !!staff.otpCodeHash, "Has Expiry:", !!staff.otpExpiresAt)

            // Check if OTP exists and not expired
            if (!staff.otpCodeHash || !staff.otpExpiresAt) {
                console.log("[OTP Verify] No OTP data found for staff")
                return errorResponseObject(
                    "No OTP request found. Please request a new OTP"
                )
            }

            if (staff.otpExpiresAt < new Date()) {
                // Clear expired OTP
                await staff.clearOTP()
                await staff.save()
                return errorResponseObject(
                    "OTP has expired. Please request a new one"
                )
            }

            // Verify OTP
            const bcrypt = require("bcryptjs")
            const isValidOTP = await bcrypt.compare(otp, staff.otpCodeHash)

            if (!isValidOTP) {
                // Log failed attempt
                await AuditLogController.createAuditLog({
                    action: AuditAction.USER_LOGIN,
                    entityType: "Staff",
                    entityId: staff._id,
                    performedBy: staff._id,
                    performedByName: staff.name,
                    performedByEmail: staff.email,
                    description: "Failed OTP verification",
                    status: "failed",
                    errorMessage: "Invalid OTP",
                    metadata: { loginMethod: "phone", phone },
                    ipAddress: req.ip || req.socket.remoteAddress,
                    userAgent: req.headers["user-agent"],
                })

                return errorResponseObject("Invalid OTP code")
            }

            // Clear OTP after successful verification
            await staff.clearOTP()
            await staff.save()

            // Check account status
            if (staff.status === AccountStatus.INACTIVE) {
                return errorResponseObject(
                    "Account is inactive. Please contact HR"
                )
            }
            if (staff.status === AccountStatus.SUSPENDED) {
                return errorResponseObject(
                    "Account is suspended. Please contact HR"
                )
            }

            // Generate tokens
            const tokens = AuthController.generateTokens(staff._id)

            // Populate department for response
            await staff.populate("department", "name")

            // Log successful login
            await AuditLogController.createAuditLog({
                action: AuditAction.USER_LOGIN,
                entityType: "Staff",
                entityId: staff._id,
                performedBy: staff._id,
                performedByName: staff.name,
                performedByEmail: staff.email,
                description: "Successful login with phone/OTP",
                metadata: { loginMethod: "phone", phone },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Login successful", {
                user: staff,
                tokens,
            })
        } catch (error) {
            console.error("OTP verification error:", error)
            return errorResponseObject("OTP verification failed")
        }
    }

    /**
     * Request password reset via phone
     * POST /api/auth/reset-password-request
     */
    static async resetPasswordRequest(req: Request): Promise<ResponseObject> {
        try {
            const { phone } = req.body

            if (!phone) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "phone", message: "Phone number is required" },
                ])
            }

            if (!phone.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "phone", message: "Phone number cannot be empty" },
                ])
            }

            // Check rate limiting
            if (!AuthController.checkRateLimit(`reset_${phone}`)) {
                return errorResponseObject(
                    "Too many reset requests. Please try again later"
                )
            }

            // Find staff by phone
            const staff = await Staff.findOne({ phone: phone.trim() })
            if (!staff) {
                // Don't reveal if phone exists
                return successResponseObject(
                    "If the phone number is registered, you will receive a reset code",
                    {
                        phone,
                    }
                )
            }

            // Generate reset code (4-digit)
            const resetCode = AuthController.generateOTP()

            // Save hashed reset code with expiry
            await staff.setResetCode(resetCode, OTP_EXPIRY_MINUTES)
            await staff.save()

            // Send reset code via SMS
            try {
                await sendSMS({
                    recipient: phone,
                    smsText: `Your password reset code is: ${resetCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
                })
            } catch (smsError) {
                console.error("SMS sending failed:", smsError)
                return errorResponseObject(
                    "Failed to send reset code. Please try again"
                )
            }

            return successResponseObject("Reset code sent successfully", {
                phone,
                expiresIn: OTP_EXPIRY_MINUTES * 60,
                message: `Reset code has been sent to ${phone}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
            })
        } catch (error) {
            console.error("Password reset request error:", error)
            return errorResponseObject("Failed to send reset code")
        }
    }

    /**
     * Reset password with reset code
     * POST /api/auth/reset-password
     */
    static async resetPassword(req: Request): Promise<ResponseObject> {
        try {
            const { phone, resetCode, newPassword } = req.body

            // Validation with distinct field errors
            const errors = []
            if (!phone) {
                errors.push({
                    field: "phone",
                    message: "Phone number is required",
                })
            } else if (!phone.trim()) {
                errors.push({
                    field: "phone",
                    message: "Phone number cannot be empty",
                })
            }

            if (!resetCode) {
                errors.push({
                    field: "resetCode",
                    message: "Reset code is required",
                })
            } else if (!/^\d{4}$/.test(resetCode)) {
                errors.push({
                    field: "resetCode",
                    message: "Reset code must be a 4-digit code",
                })
            }

            if (!newPassword) {
                errors.push({
                    field: "newPassword",
                    message: "New password is required",
                })
            } else if (newPassword.length < 8) {
                errors.push({
                    field: "newPassword",
                    message: "Password must be at least 8 characters",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Find staff with reset code fields
            const staff = await Staff.findOne({ phone: phone.trim() }).select(
                "+resetCodeHash +resetCodeExpiresAt"
            )

            if (!staff) {
                return errorResponseObject("Invalid phone number")
            }

            // Check if reset code exists and not expired
            if (!staff.resetCodeHash || !staff.resetCodeExpiresAt) {
                return errorResponseObject(
                    "No reset code found. Please request a new one"
                )
            }

            if (staff.resetCodeExpiresAt < new Date()) {
                // Clear expired reset code
                await staff.clearResetCode()
                await staff.save()
                return errorResponseObject(
                    "Reset code has expired. Please request a new one"
                )
            }

            // Verify reset code
            const bcrypt = require("bcryptjs")
            const isValidCode = await bcrypt.compare(
                resetCode,
                staff.resetCodeHash
            )

            if (!isValidCode) {
                return errorResponseObject("Invalid reset code")
            }

            // Set new password
            await staff.setPassword(newPassword)

            // Clear reset code
            await staff.clearResetCode()

            await staff.save()

            // Log password reset
            await AuditLogController.createAuditLog({
                action: AuditAction.PASSWORD_RESET,
                entityType: "Staff",
                entityId: staff._id,
                performedBy: staff._id,
                performedByName: staff.name,
                performedByEmail: staff.email,
                description: "Password reset via phone code",
                metadata: { phone },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Password reset successful", {
                message:
                    "Your password has been reset successfully. You can now login with your new password.",
            })
        } catch (error) {
            console.error("Password reset error:", error)
            return errorResponseObject("Failed to reset password")
        }
    }

    /**
     * Change password (authenticated)
     * POST /api/auth/change-password
     */
    static async changePassword(req: Request): Promise<ResponseObject> {
        try {
            const { currentPassword, newPassword } = req.body
            const user = (req as any).user // From auth middleware

            if (!user) {
                return errorResponseObject("Authentication required")
            }

            // Validation with distinct field errors
            const errors = []
            if (!currentPassword) {
                errors.push({
                    field: "currentPassword",
                    message: "Current password is required",
                })
            }

            if (!newPassword) {
                errors.push({
                    field: "newPassword",
                    message: "New password is required",
                })
            } else if (newPassword.length < 8) {
                errors.push({
                    field: "newPassword",
                    message: "Password must be at least 8 characters",
                })
            } else if (newPassword === currentPassword) {
                errors.push({
                    field: "newPassword",
                    message:
                        "New password must be different from current password",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Get staff with password field
            const staff = await Staff.findById(user._id).select("+passwordHash")

            if (!staff) {
                return errorResponseObject("User not found")
            }

            // Check if user has a password
            if (!staff.passwordHash) {
                return errorResponseObject(
                    "No password set. Please use password reset"
                )
            }

            // Verify current password
            const isValidPassword = await staff.verifyPassword(currentPassword)
            if (!isValidPassword) {
                return errorResponseObject("Current password is incorrect")
            }

            // Set new password
            await staff.setPassword(newPassword)
            await staff.save()

            // Log password change
            await AuditLogController.createAuditLog({
                action: AuditAction.PASSWORD_CHANGE,
                entityType: "Staff",
                entityId: staff._id,
                performedBy: staff._id,
                performedByName: staff.name,
                performedByEmail: staff.email,
                description: "Password changed by user",
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Password changed successfully", {
                message: "Your password has been changed successfully",
            })
        } catch (error) {
            console.error("Password change error:", error)
            return errorResponseObject("Failed to change password")
        }
    }

    /**
     * Logout
     * POST /api/auth/logout
     */
    static async logout(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user // From auth middleware

            if (user) {
                // Log logout
                await AuditLogController.createAuditLog({
                    action: AuditAction.USER_LOGOUT,
                    entityType: "Staff",
                    entityId: user._id,
                    performedBy: user._id,
                    performedByName: user.name,
                    performedByEmail: user.email,
                    description: "User logged out",
                    ipAddress: req.ip || req.socket.remoteAddress,
                    userAgent: req.headers["user-agent"],
                })
            }

            // In production, you might want to blacklist the token here
            // or remove it from a token whitelist in Redis

            return successResponseObject("Logged out successfully", {
                message: "You have been logged out successfully",
            })
        } catch (error) {
            console.error("Logout error:", error)
            return errorResponseObject("Logout failed")
        }
    }

    /**
     * Refresh access token
     * POST /api/auth/refresh-token
     */
    static async refreshToken(req: Request): Promise<ResponseObject> {
        try {
            const { refreshToken } = req.body

            if (!refreshToken) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "refreshToken",
                        message: "Refresh token is required",
                    },
                ])
            }

            // Verify refresh token
            let decoded: any
            try {
                decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET)
            } catch (error) {
                return errorResponseObject("Invalid or expired refresh token")
            }

            if (decoded.type !== "refresh") {
                return errorResponseObject("Invalid token type")
            }

            // Get user
            const staff = await Staff.findById(decoded.userId).populate(
                "department",
                "name"
            )

            if (!staff) {
                return errorResponseObject("User not found")
            }

            // Check account status
            if (staff.status === AccountStatus.INACTIVE) {
                return errorResponseObject("Account is inactive")
            }
            if (staff.status === AccountStatus.SUSPENDED) {
                return errorResponseObject("Account is suspended")
            }

            // Generate new tokens
            const tokens = AuthController.generateTokens(staff._id)

            return successResponseObject("Token refreshed successfully", {
                user: staff,
                tokens,
            })
        } catch (error) {
            console.error("Token refresh error:", error)
            return errorResponseObject("Failed to refresh token")
        }
    }

    /**
     * Get current authenticated user
     * GET /api/auth/me
     */
    static async getCurrentUser(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user // From auth middleware

            if (!user) {
                return errorResponseObject("Authentication required")
            }

            // Get full user details
            const staff = await Staff.findById(user._id)
                .populate("department", "name description")
                .populate("currentContract")
                .lean()

            if (!staff) {
                return errorResponseObject("User not found")
            }

            return successResponseObject("User retrieved successfully", staff)
        } catch (error) {
            console.error("Get current user error:", error)
            return errorResponseObject("Failed to retrieve user")
        }
    }

    /**
     * Validate session
     * GET /api/auth/validate
     */
    static async validateSession(req: Request): Promise<ResponseObject> {
        try {
            const authHeader = req.headers.authorization

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return errorResponseObject("No token provided")
            }

            const token = authHeader.split(" ")[1]

            // Verify token
            let decoded: any
            try {
                decoded = jwt.verify(token, JWT_SECRET)
            } catch (error) {
                return errorResponseObject("Invalid or expired token")
            }

            if (decoded.type !== "access") {
                return errorResponseObject("Invalid token type")
            }

            // Get user
            const staff = await Staff.findById(decoded.userId).select(
                "name email phone status"
            )

            if (!staff) {
                return errorResponseObject("User not found")
            }

            // Check account status
            if (staff.status === AccountStatus.INACTIVE) {
                return errorResponseObject("Account is inactive")
            }
            if (staff.status === AccountStatus.SUSPENDED) {
                return errorResponseObject("Account is suspended")
            }

            return successResponseObject("Session is valid", {
                valid: true,
                userId: staff._id,
                status: staff.status,
            })
        } catch (error) {
            console.error("Session validation error:", error)
            return errorResponseObject("Session validation failed")
        }
    }
}

export default AuthController
