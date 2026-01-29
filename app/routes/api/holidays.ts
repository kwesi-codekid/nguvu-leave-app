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

// GET handler for holidays list, upcoming, check-date, and year operations
export async function loader({ request }: LoaderFunctionArgs) {
    try {
        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        // Prepare base request object for controller
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
        } as any

        // Route based on operation
        switch (op) {
            case "upcoming": {
                // Get upcoming holidays
                const result = await HolidayController.getUpcomingHolidays(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "check-date": {
                // Check if a specific date is a holiday
                const result = await HolidayController.checkDateIsHoliday(req)
                
                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 400)
                }
                
                return successResponse(result.message, result.data)
            }

            case "year": {
                // Get holidays for a specific year
                const year = url.searchParams.get("year")
                
                if (!year) {
                    return validationErrorResponse("Validation failed", [
                        { field: "year", message: "Year is required when using op=year" }
                    ])
                }
                
                const result = await HolidayController.getHolidaysForYear(req, year)
                
                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 400)
                }
                
                return successResponse(result.message, result.data)
            }

            default: {
                // Default: Get holidays list with filters and pagination
                const result = await HolidayController.getHolidays(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }
        }
    } catch (error) {
        console.error("Holidays loader error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST handler for creating holiday
export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return errorResponse("Method not allowed", null, 405)
    }

    try {
        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        // Check HR permission
        if (!user.permissions?.includes("HR")) {
            return errorResponse(
                "Unauthorized. Only HR can create holidays",
                null,
                403
            )
        }

        await connectDB()
        const body = await request.json()

        // Prepare request object for controller
        const req = {
            body,
            user,
            ip: request.headers.get("x-forwarded-for") || "unknown",
            headers: {
                "user-agent": request.headers.get("user-agent"),
            },
        } as any

        const result = await HolidayController.createHoliday(req)

        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 400)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Create holiday error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
