import {
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router"
import bcrypt from "bcryptjs"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"
import { StaffInterface, AccountStatus } from "~/utils/types"
import Staff from "~/models/staff.model"
import { connectDB } from "~/database/connect"
import { z } from "zod"
import sendSMS from "~/utils/sendSMS"
import { EmailService } from "~/services/email.service"
import {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
} from "~/utils/auth-token"
import {
    CODE_LENGTH,
    CODE_PATTERN,
    generateCode,
    verifyStaffCode,
    storeStaffCode,
    reserveCodeSend,
    reservePasswordAttempt,
    recordPasswordResult,
    clearPasswordLockout,
    type CodeCheckResult,
    type CodeSendResult,
} from "~/utils/auth-codes"
import {
    checkAuthFailureBudget,
    formatWait,
    recordAuthFailure,
    resolveClientIp,
} from "~/utils/rate-limit"

const OTP_EXPIRES_IN = 5 * 60 * 1000 // 5 minutes in milliseconds
const RESET_CODE_EXPIRES_IN = 15 * 60 * 1000 // 15 minutes in milliseconds

// Unauthenticated operations gated by the per-IP failure budget
const RATE_LIMITED_OPS = new Set([
    "login",
    "send-otp",
    "resend-otp",
    "verify-otp",
    "forgot-password",
    "reset-password",
])

// Helper function to validate and provide user-friendly errors
function validateSendOtpInput(body: any): {
    success: boolean
    errors?: Array<{ field: string; message: string }>
} {
    const errors: Array<{ field: string; message: string }> = []

    if (!body.phone && !body.email) {
        errors.push({ field: "contact", message: "Phone number or email is required" })
    }

    if (body.phone) {
        if (typeof body.phone !== "string") {
            errors.push({
                field: "phone",
                message: "Phone number must be a valid string",
            })
        } else if (body.phone.trim().length === 0) {
            errors.push({ field: "phone", message: "Phone number cannot be empty" })
        } else if (!/^\+?[0-9]{10,15}$/.test(body.phone.trim())) {
            errors.push({
                field: "phone",
                message: "Please enter a valid phone number (10-15 digits)",
            })
        }
    }

    if (body.email) {
        if (typeof body.email !== "string") {
            errors.push({
                field: "email",
                message: "Email must be a valid string",
            })
        } else if (body.email.trim().length === 0) {
            errors.push({ field: "email", message: "Email cannot be empty" })
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
            errors.push({
                field: "email",
                message: "Please enter a valid email address",
            })
        }
    }

    return errors.length > 0 ? { success: false, errors } : { success: true }
}

function validateVerifyOtpInput(body: any): {
    success: boolean
    errors?: Array<{ field: string; message: string }>
} {
    const errors: Array<{ field: string; message: string }> = []

    if (!body.phone && !body.email) {
        errors.push({ field: "contact", message: "Phone number or email is required" })
    }

    if (body.phone) {
        if (typeof body.phone !== "string") {
            errors.push({
                field: "phone",
                message: "Phone number must be a valid string",
            })
        } else if (body.phone.trim().length === 0) {
            errors.push({ field: "phone", message: "Phone number cannot be empty" })
        } else if (!/^\+?[0-9]{10,15}$/.test(body.phone.trim())) {
            errors.push({
                field: "phone",
                message: "Please enter a valid phone number (10-15 digits)",
            })
        }
    }

    if (body.email) {
        if (typeof body.email !== "string") {
            errors.push({
                field: "email",
                message: "Email must be a valid string",
            })
        } else if (body.email.trim().length === 0) {
            errors.push({ field: "email", message: "Email cannot be empty" })
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
            errors.push({
                field: "email",
                message: "Please enter a valid email address",
            })
        }
    }

    if (!body.otp) {
        errors.push({ field: "otp", message: "OTP code is required" })
    } else if (typeof body.otp !== "string") {
        errors.push({ field: "otp", message: "OTP must be a valid string" })
    } else if (body.otp.length !== CODE_LENGTH) {
        errors.push({ field: "otp", message: `OTP must be exactly ${CODE_LENGTH} digits` })
    } else if (!CODE_PATTERN.test(body.otp)) {
        errors.push({ field: "otp", message: "OTP must contain only digits" })
    }

    return errors.length > 0 ? { success: false, errors } : { success: true }
}

function validateResetPasswordInput(body: any): {
    success: boolean
    errors?: Array<{ field: string; message: string }>
} {
    const errors: Array<{ field: string; message: string }> = []

    if (!body.phone) {
        errors.push({ field: "phone", message: "Phone number is required" })
    } else if (typeof body.phone !== "string") {
        errors.push({
            field: "phone",
            message: "Phone number must be a valid string",
        })
    } else if (body.phone.trim().length === 0) {
        errors.push({ field: "phone", message: "Phone number cannot be empty" })
    } else if (!/^\+?[0-9]{10,15}$/.test(body.phone.trim())) {
        errors.push({
            field: "phone",
            message: "Please enter a valid phone number (10-15 digits)",
        })
    }

    if (!body.code) {
        errors.push({ field: "code", message: "Reset code is required" })
    } else if (typeof body.code !== "string") {
        errors.push({
            field: "code",
            message: "Reset code must be a valid string",
        })
    } else if (body.code.length !== CODE_LENGTH) {
        errors.push({
            field: "code",
            message: `Reset code must be exactly ${CODE_LENGTH} digits`,
        })
    } else if (!CODE_PATTERN.test(body.code)) {
        errors.push({
            field: "code",
            message: "Reset code must contain only digits",
        })
    }

    if (!body.newPassword) {
        errors.push({
            field: "newPassword",
            message: "New password is required",
        })
    } else if (typeof body.newPassword !== "string") {
        errors.push({
            field: "newPassword",
            message: "Password must be a valid string",
        })
    } else if (body.newPassword.length < 8) {
        errors.push({
            field: "newPassword",
            message: "Password must be at least 8 characters long",
        })
    } else if (body.newPassword.length > 100) {
        errors.push({
            field: "newPassword",
            message: "Password must not exceed 100 characters",
        })
    }

    return errors.length > 0 ? { success: false, errors } : { success: true }
}

// Validation schemas (keeping original schemas for other endpoints)
const loginSchema = z
    .object({
        email: z.string().email().optional(),
        phone: z
            .string()
            .regex(/^\+?[0-9]{10,15}$/)
            .optional(),
        password: z.string().optional(),
        otp: z.string().regex(CODE_PATTERN).optional(),
    })
    .refine(
        (data) => {
            // Either email+password OR phone (for OTP) must be provided
            return (data.email && data.password) || data.phone
        },
        {
            message:
                "Either email and password, or phone number must be provided",
        }
    )

const forgotPasswordSchema = z.object({
    phone: z.string().regex(/^\+?[0-9]{10,15}$/),
})

const resetPasswordSchema = z.object({
    phone: z.string().regex(/^\+?[0-9]{10,15}$/),
    code: z.string().regex(CODE_PATTERN),
    newPassword: z.string().min(8).max(100),
})

const changePasswordSchema = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(100),
})

const updateProfileSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    phone: z
        .string()
        .regex(/^\+?[0-9]{10,15}$/)
        .optional(),
    address: z
        .object({
            line1: z.string().optional(),
            line2: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            country: z.string().optional(),
            postalCode: z.string().optional(),
        })
        .optional(),
    emergencyContact: z
        .object({
            name: z.string(),
            phone: z.string().regex(/^\+?[0-9]{10,15}$/),
            relation: z.string().optional(),
        })
        .optional(),
})

// Helper functions
function generateToken(staffId: string): string {
    return signAccessToken(staffId)
}

function generateRefreshToken(staffId: string): string {
    return signRefreshToken(staffId)
}

// Map a failed code check to an API error response
function codeErrorResponse(result: CodeCheckResult, label: string) {
    switch (result) {
        case "missing":
            return errorResponse(
                `No ${label} request found. Please request a new ${label}`,
                null,
                400
            )
        case "expired":
            return errorResponse(
                `${label.charAt(0).toUpperCase()}${label.slice(1)} has expired. Please request a new one`,
                null,
                400
            )
        case "too_many_attempts":
            return errorResponse(
                `Too many incorrect attempts. Please request a new ${label}`,
                null,
                429
            )
        default:
            return errorResponse(`Invalid ${label}`, null, 401)
    }
}

// Error response when a code cannot be sent yet (cooldown or send limits)
function codeSendLimitedResponse(
    result: Exclude<CodeSendResult, { allowed: true }>
) {
    const wait = formatWait(result.retryAfterSeconds)
    let message: string
    switch (result.reason) {
        case "cooldown":
            message = `Please wait ${wait} before requesting another code`
            break
        case "global_limit":
            message = `Verification codes are temporarily unavailable. Please try again in ${wait}`
            break
        default:
            message = `Too many codes requested for this account. Please try again in ${wait}`
    }
    return errorResponse(message, null, 429)
}

async function getAuthenticatedStaff(
    request: Request
): Promise<StaffInterface | null> {
    const authHeader = request.headers.get("Authorization")
    const token = extractToken(authHeader)

    if (!token) {
        return null
    }

    try {
        const decoded = verifyAccessToken(token)
        await connectDB()

        const staff = await Staff.findById(decoded.staffId)
            .populate("department")
            .populate("currentContract")
            .select(
                "-passwordHash -otpCodeHash -otpExpiresAt -resetCodeHash -resetCodeExpiresAt"
            )
            .lean()

        if (!staff || staff.status !== AccountStatus.ACTIVE) {
            return null
        }

        return staff as StaffInterface
    } catch (error) {
        return null
    }
}

// GET handler for profile retrieval
export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url)
    const op = url.searchParams.get("op")

    try {
        await connectDB()

        switch (op) {
            case "profile": {
                const staff = await getAuthenticatedStaff(request)

                if (!staff) {
                    return errorResponse("Unauthorized", null, 401)
                }

                return successResponse("Profile retrieved successfully", {
                    staff,
                })
            }

            default:
                return errorResponse(
                    "Invalid operation for GET request",
                    null,
                    400
                )
        }
    } catch (error) {
        // Log the detail server-side; don't leak internals to the client
        console.error("Auth loader error:", error)
        return errorResponse(
            "An unexpected error occurred. Please try again.",
            null,
            500
        )
    }
}

// Handler for PATCH operations
async function handlePatchOperations(
    request: Request,
    op: string | null,
    body: any
): Promise<Response> {
    switch (op) {
        case "change-password": {
            // Get authenticated user
            const authStaff = await getAuthenticatedStaff(request)
            if (!authStaff) {
                return errorResponse("Unauthorized", null, 401)
            }

            const validation = changePasswordSchema.safeParse(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.error.issues.map((issue) => ({
                        field: issue.path.join("."),
                        message: issue.message,
                    }))
                )
            }

            const { currentPassword, newPassword } = validation.data

            // Get staff with password hash
            const staff = await Staff.findById(authStaff._id).select(
                "+passwordHash +passwordLastChangedAt"
            )

            if (!staff || !staff.passwordHash) {
                return errorResponse("Unable to change password", null, 400)
            }

            // Verify current password
            const isValidPassword = await bcrypt.compare(
                currentPassword,
                staff.passwordHash
            )
            if (!isValidPassword) {
                return errorResponse("Current password is incorrect", null, 401)
            }

            // Hash and save new password
            const passwordHash = await bcrypt.hash(newPassword, 10)
            staff.passwordHash = passwordHash
            staff.passwordLastChangedAt = new Date()
            await staff.save()

            return successResponse("Password changed successfully")
        }

        case "update-profile": {
            // Get authenticated user
            const authStaff = await getAuthenticatedStaff(request)
            if (!authStaff) {
                return errorResponse("Unauthorized", null, 401)
            }

            const validation = updateProfileSchema.safeParse(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.error.issues.map((issue) => ({
                        field: issue.path.join("."),
                        message: issue.message,
                    }))
                )
            }

            const updates = validation.data

            // Check if phone number is being changed to one that already exists
            if (updates.phone && updates.phone !== authStaff.phone) {
                const existingStaff = await Staff.findOne({
                    phone: updates.phone,
                    _id: { $ne: authStaff._id },
                })

                if (existingStaff) {
                    return errorResponse(
                        "Phone number already in use",
                        null,
                        400
                    )
                }
            }

            // Update staff profile
            const staff = await Staff.findByIdAndUpdate(
                authStaff._id,
                {
                    ...(updates.name && { name: updates.name }),
                    ...(updates.phone && { phone: updates.phone }),
                    ...(updates.address && { address: updates.address }),
                    ...(updates.emergencyContact && {
                        emergencyContact: updates.emergencyContact,
                    }),
                },
                { new: true }
            )
                .populate("department")
                .populate("currentContract")
                .select(
                    "-passwordHash -otpCodeHash -otpExpiresAt -resetCodeHash -resetCodeExpiresAt"
                )

            if (!staff) {
                return errorResponse("Failed to update profile", null, 500)
            }

            return successResponse("Profile updated successfully", {
                staff: staff.toObject(),
            })
        }

        default:
            return errorResponse(
                "Invalid operation for PATCH request",
                null,
                400
            )
    }
}

// Handler for POST operations
async function handlePostOperations(
    request: Request,
    op: string | null,
    body: any,
    clientIp: string | null
): Promise<Response> {
    switch (op) {
        case "login": {
            // Validate input
            const validation = loginSchema.safeParse(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.error.issues.map((issue) => ({
                        field: issue.path.join("."),
                        message: issue.message,
                    }))
                )
            }

            const { email, phone, password, otp } = validation.data

            // Find staff by email or phone - include hidden auth fields
            const query = email ? { email } : { phone }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            }).select("+passwordHash")

            if (!staff) {
                recordAuthFailure(clientIp)
                return errorResponse("Invalid credentials", null, 401)
            }

            // Handle password-based login
            if (email && password) {
                // Lock password login after repeated failures
                const attempt = await reservePasswordAttempt(staff._id)
                if (!attempt.allowed) {
                    return errorResponse(
                        `Too many failed login attempts. Please try again in ${formatWait(attempt.retryAfterSeconds)}`,
                        null,
                        429
                    )
                }

                const isValidPassword = await bcrypt.compare(
                    password,
                    staff.passwordHash || ""
                )
                await recordPasswordResult(
                    staff._id,
                    isValidPassword,
                    attempt.attempts
                )
                if (!isValidPassword) {
                    recordAuthFailure(clientIp)
                    return errorResponse("Invalid credentials", null, 401)
                }
            }
            // Handle OTP-based login
            else if (phone && otp) {
                const result = await verifyStaffCode(staff._id, "otp", otp)
                if (result !== "valid") {
                    recordAuthFailure(clientIp)
                    return codeErrorResponse(result, "OTP")
                }
            }
            // Phone without OTP - send OTP and ask user to verify
            else if (phone && !otp) {
                return errorResponse(
                    "Please provide OTP or request one first",
                    null,
                    400
                )
            }

            // Generate tokens
            const token = generateToken(staff._id.toString())
            const refreshToken = generateRefreshToken(staff._id.toString())

            // Populate related data for response
            await staff.populate(["department", "currentContract"])

            // Remove sensitive fields
            const staffData = staff.toObject()
            delete staffData.passwordHash
            delete staffData.otpCodeHash
            delete staffData.otpExpiresAt
            delete staffData.resetCodeHash
            delete staffData.resetCodeExpiresAt

            return successResponse("Login successful", {
                staff: staffData,
                token,
                refreshToken,
            })
        }

        case "logout": {
            // In a production app, you might want to invalidate the token
            // For now, we'll just return success
            return successResponse("Logged out successfully")
        }

        case "send-otp": {
            const validation = validateSendOtpInput(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.errors!
                )
            }

            const { phone, email } = body

            // Find staff by phone or email
            const query = phone ? { phone } : { email }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            })

            if (!staff) {
                recordAuthFailure(clientIp)
                return errorResponse(
                    `No account found with this ${phone ? "phone number" : "email address"}`,
                    null,
                    404
                )
            }

            // Per-account limits: 30s cooldown and a daily cap on codes sent
            const sendSlot = await reserveCodeSend(staff._id, clientIp)
            if (!sendSlot.allowed) {
                return codeSendLimitedResponse(sendSlot)
            }

            // Generate and store a new OTP (resets the attempt counter)
            const otp = generateCode()
            await storeStaffCode(staff._id, "otp", otp, OTP_EXPIRES_IN)

            // Send OTP via SMS for phone, or email for email
            if (phone) {
                await sendSMS({
                    recipient: phone,
                    smsText: `Your leave management login code is: ${otp}. Valid for 5 minutes.`,
                })
            } else {
                // Send OTP via email immediately (not queued)
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333; text-align: center;">Leave Management Login Code</h2>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                            <p style="font-size: 18px; margin: 0 0 10px 0;">Your one-time login code is:</p>
                            <div style="background-color: #007bff; color: white; font-size: 24px; font-weight: bold; padding: 15px; border-radius: 4px; letter-spacing: 2px;">
                                ${otp}
                            </div>
                        </div>
                        <p style="color: #666; text-align: center; margin: 20px 0;">
                            This code will expire in 5 minutes for security reasons.
                        </p>
                        <p style="color: #999; text-align: center; font-size: 14px;">
                            If you didn't request this code, please ignore this email.
                        </p>
                    </div>
                `;
                
                await EmailService.directSendMail({
                    to: email,
                    subject: "Your Leave Management Login Code",
                    html: emailHtml,
                    text: `Your leave management login code is: ${otp}. Valid for 5 minutes.`
                });
            }

            return successResponse("OTP sent successfully", {
                expiresIn: 300, // seconds
            })
        }

        case "verify-otp": {
            const validation = validateVerifyOtpInput(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.errors!
                )
            }

            const { phone, email, otp } = body

            // Find staff, then verify the OTP (attempt-limited, single use)
            const query = phone ? { phone } : { email }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            })

            if (!staff) {
                recordAuthFailure(clientIp)
                return errorResponse(`Invalid ${phone ? "phone number" : "email address"}`, null, 401)
            }

            const otpResult = await verifyStaffCode(staff._id, "otp", otp)
            if (otpResult !== "valid") {
                recordAuthFailure(clientIp)
                return codeErrorResponse(otpResult, "OTP")
            }

            // Generate tokens
            const token = generateToken(staff._id.toString())
            const refreshToken = generateRefreshToken(staff._id.toString())

            // Populate and prepare response
            await staff.populate(["department", "currentContract"])
            const staffData = staff.toObject()
            delete staffData.passwordHash
            delete staffData.otpCodeHash
            delete staffData.otpExpiresAt
            delete staffData.resetCodeHash
            delete staffData.resetCodeExpiresAt

            return successResponse("OTP verified successfully", {
                staff: staffData,
                token,
                refreshToken,
            })
        }

        case "resend-otp": {
            const validation = validateSendOtpInput(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.errors!
                )
            }

            const { phone, email } = body

            // Find staff
            const query = phone ? { phone } : { email }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            })

            if (!staff) {
                recordAuthFailure(clientIp)
                return errorResponse(
                    `No account found with this ${phone ? "phone number" : "email address"}`,
                    null,
                    404
                )
            }

            // Per-account limits: 30s cooldown and a daily cap on codes sent
            const sendSlot = await reserveCodeSend(staff._id, clientIp)
            if (!sendSlot.allowed) {
                return codeSendLimitedResponse(sendSlot)
            }

            // Generate and store a new OTP (resets the attempt counter)
            const otp = generateCode()
            await storeStaffCode(staff._id, "otp", otp, OTP_EXPIRES_IN)

            // Send OTP
            if (phone) {
                await sendSMS({
                    recipient: phone,
                    smsText: `Your leave management login code is: ${otp}. Valid for 5 minutes.`,
                })
            } else {
                // Send OTP via email immediately (not queued)
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333; text-align: center;">Leave Management Login Code</h2>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                            <p style="font-size: 18px; margin: 0 0 10px 0;">Your one-time login code is:</p>
                            <div style="background-color: #007bff; color: white; font-size: 24px; font-weight: bold; padding: 15px; border-radius: 4px; letter-spacing: 2px;">
                                ${otp}
                            </div>
                        </div>
                        <p style="color: #666; text-align: center; margin: 20px 0;">
                            This code will expire in 5 minutes for security reasons.
                        </p>
                        <p style="color: #999; text-align: center; font-size: 14px;">
                            If you didn't request this code, please ignore this email.
                        </p>
                    </div>
                `;
                
                await EmailService.directSendMail({
                    to: email,
                    subject: "Your Leave Management Login Code",
                    html: emailHtml,
                    text: `Your leave management login code is: ${otp}. Valid for 5 minutes.`
                });
            }

            return successResponse("OTP resent successfully", {
                expiresIn: 300,
            })
        }

        case "refresh-token": {
            const { refreshToken } = body

            if (!refreshToken) {
                return errorResponse("Refresh token is required", null, 400)
            }

            try {
                // Throws unless the token is a valid refresh token
                const decoded = verifyRefreshToken(refreshToken)

                // Verify staff still exists and is active
                const staff = await Staff.findById(decoded.staffId)
                if (!staff || staff.status !== AccountStatus.ACTIVE) {
                    return errorResponse("Invalid refresh token", null, 401)
                }

                // Generate new tokens
                const token = generateToken(staff._id.toString())
                const newRefreshToken = generateRefreshToken(
                    staff._id.toString()
                )

                return successResponse("Token refreshed successfully", {
                    token,
                    refreshToken: newRefreshToken,
                })
            } catch (error) {
                return errorResponse(
                    "Invalid or expired refresh token",
                    null,
                    401
                )
            }
        }

        case "forgot-password": {
            const validation = validateSendOtpInput(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.errors!
                )
            }

            const { phone } = body

            if (!phone) {
                return validationErrorResponse("Validation failed", [
                    { field: "phone", message: "Phone number is required" },
                ])
            }

            // Find staff
            const staff = await Staff.findOne({
                phone,
                status: AccountStatus.ACTIVE,
            })

            if (!staff) {
                // Don't reveal if phone exists for security
                recordAuthFailure(clientIp)
                return successResponse(
                    "If an account exists with this phone number, a reset code will be sent"
                )
            }

            // Same per-account cooldown and daily cap as login OTPs
            const sendSlot = await reserveCodeSend(staff._id, clientIp)
            if (!sendSlot.allowed) {
                return codeSendLimitedResponse(sendSlot)
            }

            // Generate and store reset code (resets the attempt counter)
            const resetCode = generateCode()
            await storeStaffCode(
                staff._id,
                "reset",
                resetCode,
                RESET_CODE_EXPIRES_IN
            )

            // Send reset code via SMS
            await sendSMS({
                recipient: phone,
                smsText: `Your password reset code is: ${resetCode}. Valid for 15 minutes.`,
            })

            return successResponse("Password reset code sent")
        }

        case "reset-password": {
            const validation = validateResetPasswordInput(body)
            if (!validation.success) {
                return validationErrorResponse(
                    "Validation failed",
                    validation.errors!
                )
            }

            const { phone, code, newPassword } = body

            // Find staff - include hidden password fields
            const staff = await Staff.findOne({
                phone,
                status: AccountStatus.ACTIVE,
            }).select("+passwordHash +passwordLastChangedAt")

            if (!staff) {
                recordAuthFailure(clientIp)
                return errorResponse("Invalid or expired reset code", null, 400)
            }

            // Attempt-limited, single-use check (clears the code when valid)
            const codeResult = await verifyStaffCode(staff._id, "reset", code)
            if (codeResult !== "valid") {
                recordAuthFailure(clientIp)
                return codeErrorResponse(codeResult, "reset code")
            }

            // Hash new password
            const passwordHash = await bcrypt.hash(newPassword, 10)

            // Update password
            staff.passwordHash = passwordHash
            staff.passwordLastChangedAt = new Date()
            await staff.save()

            // A successful reset lifts any password-login lockout
            await clearPasswordLockout(staff._id)

            return successResponse("Password reset successfully")
        }

        default:
            return errorResponse(
                "Invalid operation for POST request",
                null,
                400
            )
    }
}

// Main action handler for auth operations
export async function action({ request }: ActionFunctionArgs) {
    const url = new URL(request.url)
    const op = url.searchParams.get("op")

    // Handle different HTTP methods
    if (request.method !== "POST" && request.method !== "PATCH") {
        return errorResponse("Method not allowed", null, 405)
    }

    // Per-IP gate on unauthenticated auth operations. Only failures count
    // toward the budget, so successful logins from a shared office/NAT IP do
    // not throttle each other. Calls from the login pages carry the
    // browser's IP (see utils/rate-limit.ts).
    const clientIp = resolveClientIp(request)
    if (request.method === "POST" && op && RATE_LIMITED_OPS.has(op)) {
        const budget = checkAuthFailureBudget(clientIp)
        if (!budget.allowed) {
            return errorResponse(
                `Too many failed attempts. Please try again in ${formatWait(budget.retryAfterSeconds)}`,
                null,
                429
            )
        }
    }

    try {
        await connectDB()
        const body = await request.json()

        // Route to appropriate handler based on HTTP method
        if (request.method === "PATCH") {
            return await handlePatchOperations(request, op, body)
        }

        if (request.method === "POST") {
            return await handlePostOperations(request, op, body, clientIp)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        // Log the detail server-side; don't leak internals to the client
        console.error("Auth action error:", error)
        return errorResponse(
            "An unexpected error occurred. Please try again.",
            null,
            500
        )
    }
}
