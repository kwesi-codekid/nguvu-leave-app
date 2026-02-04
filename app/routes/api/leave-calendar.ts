import {
    type LoaderFunctionArgs,
} from "react-router"
import {
    successResponse,
    errorResponse,
    extractToken,
} from "~/utils/api-utils"
import { connectDB } from "~/database/connect"
import LeaveRequestController from "~/controllers/leave-request.controller"
import Staff from "~/models/staff.model"
import jwt from "jsonwebtoken"
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

// GET /api/leave-calendar
export async function loader({ request }: LoaderFunctionArgs) {
    try {
        await connectDB()

        // Simple test to see if route is working
        const url = new URL(request.url)
        const op = url.searchParams.get("op")
        
        if (op === "test") {
            return successResponse("API route is working", { test: true })
        }

        // Authenticate
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        console.log("Authenticated user:", user?.name, "Permissions:", user?.permissions)

        console.log("Operation:", op, "Query params:", Object.fromEntries(url.searchParams.entries()))

        // Create a mock request object for the controller
        const mockReq = {
            user,
            query: Object.fromEntries(url.searchParams.entries()),
            body: {},
            headers: Object.fromEntries(request.headers.entries()),
            ip: request.headers.get("X-Forwarded-For") || "127.0.0.1",
            socket: { remoteAddress: "127.0.0.1" },
        } as any

        let result

        switch (op) {
            case "calendar-events": {
                const startDate = url.searchParams.get("startDate")
                const endDate = url.searchParams.get("endDate")
                const department = url.searchParams.get("department")
                
                if (!startDate || !endDate) {
                    return errorResponse("Start date and end date are required", null, 400)
                }

                result = await LeaveRequestController.getCalendarEvents({
                    ...mockReq,
                    query: {
                        ...mockReq.query,
                        startDate,
                        endDate,
                        department,
                    },
                })
                break
            }

            case "my-calendar": {
                const startDate = url.searchParams.get("startDate")
                const endDate = url.searchParams.get("endDate")
                
                if (!startDate || !endDate) {
                    return errorResponse("Start date and end date are required", null, 400)
                }

                result = await LeaveRequestController.getMyCalendarEvents({
                    ...mockReq,
                    query: {
                        ...mockReq.query,
                        startDate,
                        endDate,
                    },
                })
                break
            }

            default:
                return errorResponse(
                    "Invalid operation. Valid operations: calendar-events, my-calendar",
                    null,
                    400
                )
        }

        // Handle controller response
        if (result.status !== "success") {
            console.error("Controller error:", result.message, result.data)
            return errorResponse(result.message, null, 400)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Error in leave calendar route:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
