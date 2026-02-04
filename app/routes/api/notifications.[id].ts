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

// PATCH/DELETE /api/notifications/:id
export async function action({ request, params }: ActionFunctionArgs) {
    try {
        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        const notificationId = params.id
        if (!notificationId) {
            return errorResponse("Notification ID is required", null, 400)
        }

        await connectDB()

        const method = request.method

        // Prepare request object for controller
        const req = {
            user,
        } as any

        // Handle PATCH - Mark notification as read
        if (method === "PATCH") {
            const result = await NotificationController.markAsRead(req, notificationId)
            return result.status === "success"
                ? successResponse(result.message, result.data)
                : errorResponse(result.message, null, 404)
        }

        // Handle DELETE - Delete notification
        if (method === "DELETE") {
            const result = await NotificationController.deleteNotification(req, notificationId)
            return result.status === "success"
                ? successResponse(result.message, result.data)
                : errorResponse(result.message, null, 404)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Notification action error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
