import { type LoaderFunctionArgs } from "react-router"
import { connectDB } from "~/database/connect"
import AuditLog from "~/models/audit-log.model"
import Staff from "~/models/staff.model"
import jwt from "jsonwebtoken"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

// Helper to get authenticated staff from request
async function getAuthenticatedStaff(request: Request) {
    const authHeader = request.headers.get("Authorization")
    const token = extractToken(authHeader)

    if (!token) {
        return null
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { staffId: string }
        await connectDB()

        const staff = await Staff.findById(decoded.staffId)
            .select("-passwordHash -otpCodeHash -otpExpiresAt")
            .lean()

        if (!staff || staff.status !== "active") {
            return null
        }

        return staff
    } catch (error) {
        return null
    }
}

// GET /api/audit-logs/:id
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return validationErrorResponse("Validation failed", [
                { field: "id", message: "Audit log ID is required" },
            ])
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        // Check permissions - HR, Admin, Manager can view audit log details
        if (
            !user?.permissions?.includes("HR") &&
            !user?.permissions?.includes("ADMIN") &&
            !user?.permissions?.includes("MANAGER")
        ) {
            return errorResponse(
                "Unauthorized to view audit log details",
                null,
                403
            )
        }

        // Get the audit log
        const auditLog = await AuditLog.findById(id).lean()

        if (!auditLog) {
            return errorResponse("Audit log not found", null, 404)
        }

        // Additional authorization checks based on role
        if (
            user?.permissions?.includes("MANAGER") &&
            !user?.permissions?.includes("HR") &&
            !user?.permissions?.includes("ADMIN")
        ) {
            // Managers can only view audit logs related to:
            // 1. Their own actions
            // 2. Their department staff (TODO: implement department check)
            // 3. Entities within their department (TODO: implement department check)

            // For now, allow if it's their own action
            if (auditLog.performedBy !== user._id) {
                // TODO: Add department-based authorization
                // This should check if the audit log relates to manager's department
            }
        }

        // Enhance audit log with additional computed fields
        const enhancedAuditLog = {
            ...auditLog,
            timeAgo: auditLog.createdAt
                ? getTimeAgo(auditLog.createdAt)
                : "Unknown",
            isRecentAction: auditLog.createdAt
                ? isWithinLast24Hours(auditLog.createdAt)
                : false,
            actionCategory: categorizeAction(auditLog.action),
            hasChanges: auditLog.changes && auditLog.changes.length > 0,
            hasMetadata:
                auditLog.metadata && Object.keys(auditLog.metadata).length > 0,
        }

        return successResponse(
            "Audit log retrieved successfully",
            enhancedAuditLog
        )
    } catch (error) {
        console.error("Audit log loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// Helper function to calculate time ago
function getTimeAgo(createdAt: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - new Date(createdAt).getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
        return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`
    } else if (diffHours > 0) {
        return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`
    } else {
        const diffMinutes = Math.floor(diffMs / (1000 * 60))
        if (diffMinutes > 0) {
            return diffMinutes === 1
                ? "1 minute ago"
                : `${diffMinutes} minutes ago`
        } else {
            return "Just now"
        }
    }
}

// Helper function to check if action is within last 24 hours
function isWithinLast24Hours(createdAt: Date): boolean {
    const now = new Date()
    const diffMs = now.getTime() - new Date(createdAt).getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    return diffHours <= 24
}

// Helper function to categorize actions
function categorizeAction(action: string): string {
    const actionCategories: Record<string, string> = {
        // Authentication actions
        LOGIN: "Authentication",
        LOGOUT: "Authentication",
        PASSWORD_CHANGE: "Authentication",

        // Leave request actions
        LEAVE_REQUEST_CREATED: "Leave Management",
        LEAVE_REQUEST_UPDATED: "Leave Management",
        LEAVE_REQUEST_DELETED: "Leave Management",
        LEAVE_REQUEST_ENDORSED: "Leave Management",
        LEAVE_REQUEST_APPROVED: "Leave Management",
        LEAVE_REQUEST_REJECTED: "Leave Management",
        LEAVE_REQUEST_WITHDRAWN: "Leave Management",
        LEAVE_REQUEST_CANCELLED: "Leave Management",

        // Staff management actions
        STAFF_CREATED: "Staff Management",
        STAFF_UPDATED: "Staff Management",
        STAFF_DELETED: "Staff Management",
        STAFF_STATUS_CHANGED: "Staff Management",

        // Call-in actions
        CALLIN_CREATED: "Call-In Management",
        CALLIN_UPDATED: "Call-In Management",
        CALLIN_CANCELLED: "Call-In Management",

        // Balance actions
        BALANCE_ADJUSTED: "Balance Management",
        BALANCE_RESET: "Balance Management",
        BALANCE_CREDITED: "Balance Management",
        BALANCE_DEBITED: "Balance Management",

        // System actions
        BULK_OPERATION: "System Operation",
        DATA_EXPORT: "System Operation",
        NOTIFICATION_SENT: "Communication",
    }

    return actionCategories[action] || "Other"
}

// No action function - audit logs are read-only and immutable
