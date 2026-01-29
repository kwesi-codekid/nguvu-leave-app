import { type LoaderFunctionArgs } from "react-router"
import { connectDB } from "~/database/connect"
import AuditLogController from "~/controllers/audit-log.controller"
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

// GET /api/audit-logs
export async function loader({ request }: LoaderFunctionArgs) {
    try {
        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Prepare request object with actual properties
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
            headers: Object.fromEntries(request.headers.entries()),
            ip:
                request.headers.get("X-Forwarded-For") ||
                request.headers.get("CF-Connecting-IP") ||
                "127.0.0.1",
            socket: {
                remoteAddress:
                    request.headers.get("X-Forwarded-For") || "127.0.0.1",
            },
            userAgent: request.headers.get("user-agent"),
        } as any

        switch (op) {
            case "user-activity": {
                // Get user activity - requires userId parameter
                const userId = url.searchParams.get("userId")
                if (!userId) {
                    return validationErrorResponse("Validation failed", [
                        { field: "userId", message: "User ID is required" },
                    ])
                }

                // Check authorization - can view own activity or have HR/Admin/Manager permissions
                const canView =
                    userId === user._id ||
                    user?.permissions?.includes("HR") ||
                    user?.permissions?.includes("ADMIN") ||
                    user?.permissions?.includes("MANAGER")

                if (!canView) {
                    return errorResponse(
                        "Unauthorized to view user activity",
                        null,
                        403
                    )
                }

                // Additional check for managers - can only view department staff
                if (
                    user?.permissions?.includes("MANAGER") &&
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN") &&
                    userId !== user._id
                ) {
                    // TODO: Add department-based authorization check
                    // For now, allow managers to view any user activity
                    // This should be enhanced to check if the userId belongs to manager's department
                }

                const result = await AuditLogController.getUserActivity(
                    req,
                    userId
                )
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "entity-history": {
                // Get entity history - requires entityType and entityId parameters
                const entityType = url.searchParams.get("entityType")
                const entityId = url.searchParams.get("entityId")

                if (!entityType || !entityId) {
                    return validationErrorResponse(
                        "Validation failed",
                        [
                            !entityType && {
                                field: "entityType",
                                message: "Entity type is required",
                            },
                            !entityId && {
                                field: "entityId",
                                message: "Entity ID is required",
                            },
                        ].filter(Boolean) as Array<{
                            field: string
                            message: string
                        }>
                    )
                }

                // Check permissions - HR, Admin, Manager
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN") &&
                    !user?.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized to view entity history",
                        null,
                        403
                    )
                }

                const result = await AuditLogController.getEntityHistory(
                    req,
                    entityType,
                    entityId
                )
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            default: {
                // Default - list audit logs with comprehensive filters
                // Check permissions - HR and Admin can view audit logs
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized to view audit logs",
                        null,
                        403
                    )
                }

                const result = await AuditLogController.getAuditLogs(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }
        }
    } catch (error) {
        console.error("Audit logs loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// No action function - audit logs are read-only (created internally by system)
