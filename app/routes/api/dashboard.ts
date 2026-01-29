import { type LoaderFunctionArgs } from "react-router"
import { connectDB } from "~/database/connect"
import DashboardController from "~/controllers/dashboard.controller"
import Staff from "~/models/staff.model"
import jwt from "jsonwebtoken"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"
import { AccountStatus } from "~/utils/types"

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

        if (!staff || staff.status !== AccountStatus.ACTIVE) {
            return null
        }

        return staff
    } catch (error) {
        return null
    }
}

// GET /api/dashboard
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

        // Prepare request object with real request data for audit logging
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
            headers: Object.fromEntries(request.headers.entries()),
            ip:
                request.headers.get("X-Forwarded-For") ||
                request.headers.get("CF-Connecting-IP") ||
                request.headers.get("X-Real-IP") ||
                "127.0.0.1",
            socket: {
                remoteAddress:
                    request.headers.get("X-Forwarded-For") ||
                    request.headers.get("CF-Connecting-IP") ||
                    "127.0.0.1",
            },
            userAgent: request.headers.get("user-agent"),
        } as any

        switch (op) {
            case "hr": {
                // HR Dashboard - HR or Admin only
                if (
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized to view HR dashboard. Only HR and Admin can access this dashboard",
                        null,
                        403
                    )
                }

                const result = await DashboardController.getHRDashboard(req)

                if (result.status === "validation_error") {
                    return validationErrorResponse(
                        result.message,
                        result.errors || []
                    )
                }

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "manager": {
                // Manager Dashboard - Manager, HR, or Admin
                if (
                    !user.permissions?.includes("MANAGER") &&
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized to view manager dashboard. Only Managers, HR, and Admin can access this dashboard",
                        null,
                        403
                    )
                }

                const result = await DashboardController.getManagerDashboard(
                    req
                )

                if (result.status === "validation_error") {
                    return validationErrorResponse(
                        result.message,
                        result.errors || []
                    )
                }

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "staff": {
                // Staff Dashboard - Any authenticated user (personal view)
                const result = await DashboardController.getStaffDashboard(req)

                if (result.status === "validation_error") {
                    return validationErrorResponse(
                        result.message,
                        result.errors || []
                    )
                }

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "calendar": {
                // Role-Based Calendar - Role-based access handled in controller
                const result = await DashboardController.getRoleBasedCalendar(
                    req
                )

                if (result.status === "validation_error") {
                    return validationErrorResponse(
                        result.message,
                        result.errors || []
                    )
                }

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "today": {
                // Today Snapshot - Role-based access handled in controller
                const result = await DashboardController.getTodaySnapshot(req)

                if (result.status === "validation_error") {
                    return validationErrorResponse(
                        result.message,
                        result.errors || []
                    )
                }

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "forecast": {
                // Upcoming Forecast - Role-based access handled in controller
                const result = await DashboardController.getUpcomingForecast(
                    req
                )

                if (result.status === "validation_error") {
                    return validationErrorResponse(
                        result.message,
                        result.errors || []
                    )
                }

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            default:
                return errorResponse(
                    "Invalid operation. Valid operations: hr, manager, staff, calendar, today, forecast",
                    null,
                    400
                )
        }
    } catch (error) {
        console.error("Dashboard loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
