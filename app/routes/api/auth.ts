import {
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router"
import bcrypt from "bcryptjs"
import jwt, { Secret, SignOptions, VerifyOptions } from "jsonwebtoken"
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

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m"
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
const OTP_EXPIRES_IN = 5 * 60 * 1000 // 5 minutes in milliseconds

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
    } else if (body.otp.length !== 4) {
        errors.push({ field: "otp", message: "OTP must be exactly 4 digits" })
    } else if (!/^\d{4}$/.test(body.otp)) {
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
    } else if (body.code.length !== 4) {
        errors.push({
            field: "code",
            message: "Reset code must be exactly 4 digits",
        })
    } else if (!/^\d{4}$/.test(body.code)) {
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
        otp: z.string().length(4).optional(),
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
    code: z.string().length(4),
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
function generateOTP(): string {
    return Math.floor(1000 + Math.random() * 9000).toString()
}

function generateToken(staffId: string): string {
    const options: SignOptions = {
        expiresIn: JWT_EXPIRES_IN as any,
    }
    return jwt.sign({ staffId }, JWT_SECRET, options)
}

function generateRefreshToken(staffId: string): string {
    const options: SignOptions = {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN as any,
    }
    return jwt.sign({ staffId, type: "refresh" }, JWT_SECRET, options)
}

interface TokenPayload {
    staffId: string
    type?: string
}

function verifyToken(token: string): TokenPayload {
    try {
        return jwt.verify(token, JWT_SECRET) as TokenPayload
    } catch (error) {
        throw new Error("Invalid or expired token")
    }
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
        const decoded = verifyToken(token)
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
        console.error("Auth loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
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
    body: any
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
            }).select("+passwordHash +otpCodeHash +otpExpiresAt")

            if (!staff) {
                return errorResponse("Invalid credentials", null, 401)
            }

            // Handle password-based login
            if (email && password) {
                const isValidPassword = await bcrypt.compare(
                    password,
                    staff.passwordHash || ""
                )
                if (!isValidPassword) {
                    return errorResponse("Invalid credentials", null, 401)
                }
            }
            // Handle OTP-based login
            else if (phone && otp) {
                if (!staff.otpCodeHash || !staff.otpExpiresAt) {
                    return errorResponse(
                        "No OTP request found. Please request a new OTP",
                        null,
                        400
                    )
                }

                if (new Date() > staff.otpExpiresAt) {
                    return errorResponse(
                        "OTP has expired. Please request a new one",
                        null,
                        400
                    )
                }

                const isValidOTP = await bcrypt.compare(otp, staff.otpCodeHash)
                if (!isValidOTP) {
                    return errorResponse("Invalid OTP", null, 401)
                }

                // Clear OTP after successful verification
                staff.otpCodeHash = undefined
                staff.otpExpiresAt = undefined
                await staff.save()
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

            // Find staff by phone or email - include hidden OTP fields
            const query = phone ? { phone } : { email }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            }).select("+otpCodeHash +otpExpiresAt")

            if (!staff) {
                return errorResponse(
                    `No account found with this ${phone ? "phone number" : "email address"}`,
                    null,
                    404
                )
            }

            // Check for rate limiting (last OTP sent within 30 seconds)
            if (staff.otpExpiresAt) {
                const timeSinceLastOTP =
                    Date.now() - (staff.otpExpiresAt.getTime() - OTP_EXPIRES_IN)
                if (timeSinceLastOTP < 30000) {
                    // 30 seconds
                    return errorResponse(
                        "Please wait before requesting another OTP",
                        null,
                        429
                    )
                }
            }

            // Generate and hash OTP
            const otp = generateOTP()
            const otpHash = await bcrypt.hash(otp, 10)

            // Save OTP hash and expiry
            staff.otpCodeHash = otpHash
            staff.otpExpiresAt = new Date(Date.now() + OTP_EXPIRES_IN)
            await staff.save()

            // Send OTP via SMS for phone, or email for email
            if (phone) {
                await sendSMS({
                    recipient: phone,
                    smsText: `Your leave management login code is: ${otp}. Valid for 5 minutes.`,
                })
            } else {
                // Send OTP via email
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
                
                await EmailService.sendEmailImmediate(
                    email,
                    "Your Leave Management Login Code",
                    emailHtml,
                    `Your leave management login code is: ${otp}. Valid for 5 minutes.`
                );
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

            // Find staff and verify OTP - MUST select the hidden OTP fields
            const query = phone ? { phone } : { email }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            }).select("+otpCodeHash +otpExpiresAt")

            if (!staff) {
                return errorResponse(`Invalid ${phone ? "phone number" : "email address"}`, null, 401)
            }

            if (!staff.otpCodeHash || !staff.otpExpiresAt) {
                return errorResponse(
                    "No OTP request found. Please request a new OTP",
                    null,
                    400
                )
            }

            if (new Date() > staff.otpExpiresAt) {
                return errorResponse(
                    "OTP has expired. Please request a new one",
                    null,
                    400
                )
            }

            const isValidOTP = await bcrypt.compare(otp, staff.otpCodeHash)
            if (!isValidOTP) {
                return errorResponse("Invalid OTP", null, 401)
            }

            // Clear OTP after successful verification
            staff.otpCodeHash = undefined
            staff.otpExpiresAt = undefined
            await staff.save()

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

            // Find staff - include hidden OTP fields
            const query = phone ? { phone } : { email }
            const staff = await Staff.findOne({
                ...query,
                status: AccountStatus.ACTIVE,
            }).select("+otpCodeHash +otpExpiresAt")

            if (!staff) {
                return errorResponse(
                    `No account found with this ${phone ? "phone number" : "email address"}`,
                    null,
                    404
                )
            }

            // Rate limiting - wait at least 30 seconds between OTP requests
            if (staff.otpExpiresAt) {
                const timeSinceLastOTP =
                    Date.now() - (staff.otpExpiresAt.getTime() - OTP_EXPIRES_IN)
                if (timeSinceLastOTP < 30000) {
                    const waitTime = Math.ceil(
                        (30000 - timeSinceLastOTP) / 1000
                    )
                    return errorResponse(
                        `Please wait ${waitTime} seconds before requesting another OTP`,
                        null,
                        429
                    )
                }
            }

            // Generate new OTP
            const otp = generateOTP()
            const otpHash = await bcrypt.hash(otp, 10)

            staff.otpCodeHash = otpHash
            staff.otpExpiresAt = new Date(Date.now() + OTP_EXPIRES_IN)
            await staff.save()

            // Send OTP
            if (phone) {
                await sendSMS({
                    recipient: phone,
                    smsText: `Your leave management login code is: ${otp}. Valid for 5 minutes.`,
                })
            } else {
                // Send OTP via email
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
                
                await EmailService.sendEmailImmediate(
                    email,
                    "Your Leave Management Login Code",
                    emailHtml,
                    `Your leave management login code is: ${otp}. Valid for 5 minutes.`
                );
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
                const decoded = verifyToken(refreshToken)

                if (decoded.type !== "refresh") {
                    return errorResponse("Invalid refresh token", null, 401)
                }

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

            // Find staff - include hidden reset code fields
            const staff = await Staff.findOne({
                phone,
                status: AccountStatus.ACTIVE,
            }).select("+resetCodeHash +resetCodeExpiresAt")

            if (!staff) {
                // Don't reveal if phone exists for security
                return successResponse(
                    "If an account exists with this phone number, a reset code will be sent"
                )
            }

            // Generate reset code
            const resetCode = generateOTP()
            const resetCodeHash = await bcrypt.hash(resetCode, 10)

            staff.resetCodeHash = resetCodeHash
            staff.resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
            await staff.save()

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

            // Find staff - include hidden reset code and password fields
            const staff = await Staff.findOne({
                phone,
                status: AccountStatus.ACTIVE,
            }).select(
                "+resetCodeHash +resetCodeExpiresAt +passwordHash +passwordLastChangedAt"
            )

            if (!staff || !staff.resetCodeHash || !staff.resetCodeExpiresAt) {
                return errorResponse("Invalid or expired reset code", null, 400)
            }

            if (new Date() > staff.resetCodeExpiresAt) {
                return errorResponse(
                    "Reset code has expired. Please request a new one",
                    null,
                    400
                )
            }

            const isValidCode = await bcrypt.compare(code, staff.resetCodeHash)
            if (!isValidCode) {
                return errorResponse("Invalid reset code", null, 401)
            }

            // Hash new password
            const passwordHash = await bcrypt.hash(newPassword, 10)

            // Update password and clear reset code
            staff.passwordHash = passwordHash
            staff.resetCodeHash = undefined
            staff.resetCodeExpiresAt = undefined
            staff.passwordLastChangedAt = new Date()
            await staff.save()

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

    try {
        await connectDB()
        const body = await request.json()

        // Route to appropriate handler based on HTTP method
        if (request.method === "PATCH") {
            return await handlePatchOperations(request, op, body)
        }

        if (request.method === "POST") {
            return await handlePostOperations(request, op, body)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Auth action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
