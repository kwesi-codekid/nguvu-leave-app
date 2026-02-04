import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router"
import { connectDB } from "~/database/connect"
import NotificationController from "~/controllers/notification.controller"
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

// GET /api/notifications
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

        // Prepare request object for controller
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
        } as any

        switch (op) {
            case "count": {
                // Get unread notification count
                const result = await NotificationController.getUnreadCount(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            default: {
                // Get notifications list
                const result = await NotificationController.getNotifications(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }
        }
    } catch (error) {
        console.error("Notifications loader error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST/PATCH/DELETE /api/notifications
export async function action({ request }: ActionFunctionArgs) {
    try {
        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        const method = request.method
        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Prepare request object for controller
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
        } as any

        // Handle POST - Create announcement (Admin only)
        if (method === "POST") {
            if (op === "announcement") {
                // Check admin permission
                if (!user?.permissions?.includes("ADMIN")) {
                    return errorResponse("Unauthorized. Only admins can create announcements", null, 403)
                }

                const body = await request.json()
                const result = await NotificationController.createAnnouncement({
                    ...body,
                    createdBy: user._id.toString(),
                })

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 400)
            }

            return errorResponse("Invalid operation", null, 400)
        }

        // Handle PATCH - Mark as read
        if (method === "PATCH") {
            if (op === "mark-all-read") {
                const result = await NotificationController.markAllAsRead(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            return errorResponse("Invalid operation", null, 400)
        }

        // Handle DELETE - Clear read notifications
        if (method === "DELETE") {
            if (op === "clear-read") {
                const result = await NotificationController.clearReadNotifications(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            return errorResponse("Invalid operation", null, 400)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Notifications action error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
