import {
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"
import { connectDB } from "~/database/connect"
import HolidayController from "~/controllers/holiday.controller"
import Staff from "~/models/staff.model"
import jwt from "jsonwebtoken"

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

// GET handler for single holiday
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return errorResponse("Holiday ID is required", null, 400)
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        // Prepare request for controller
        const req = {
            params: { id },
            user,
        } as any

        const result = await HolidayController.getHolidayById(req, id)

        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 404)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Get holiday error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// Action handler for PUT and DELETE operations
export async function action({ request, params }: ActionFunctionArgs) {
    const { id } = params

    if (!id) {
        return errorResponse("Holiday ID is required", null, 400)
    }

    // Check authentication
    const user = await getAuthenticatedStaff(request)
    if (!user) {
        return errorResponse("Unauthorized", null, 401)
    }

    // Check HR permission for all action operations
    if (!user.permissions?.includes("HR")) {
        return errorResponse(
            "Unauthorized. Only HR can modify holidays",
            null,
            403
        )
    }

    try {
        await connectDB()

        // Handle PUT request - Update holiday
        if (request.method === "PUT") {
            const body = await request.json()

            const req = {
                body,
                user,
                params: { id },
                ip: request.headers.get("x-forwarded-for") || "unknown",
                headers: {
                    "user-agent": request.headers.get("user-agent"),
                },
            } as any

            const result = await HolidayController.updateHoliday(req, id)

            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        // Handle DELETE request - Delete holiday
        if (request.method === "DELETE") {
            const req = {
                user,
                params: { id },
                ip: request.headers.get("x-forwarded-for") || "unknown",
                headers: {
                    "user-agent": request.headers.get("user-agent"),
                },
            } as any

            const result = await HolidayController.deleteHoliday(req, id)

            if (result.status !== "success") {
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Holiday action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
