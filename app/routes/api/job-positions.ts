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
import JobPositionController from "~/controllers/job-position.controller"
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

// GET handler for positions list, available positions, and by-department
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
            case "available": {
                // Get positions with vacancies
                const result = await JobPositionController.getAvailablePositions(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "by-department": {
                // Get positions by department
                const departmentId = url.searchParams.get("departmentId")
                
                if (!departmentId) {
                    return validationErrorResponse("Validation failed", [
                        { field: "departmentId", message: "Department ID is required when using op=by-department" }
                    ])
                }
                
                const result = await JobPositionController.getPositionsByDepartment(req, departmentId)
                
                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 400)
                }
                
                return successResponse(result.message, result.data)
            }

            default: {
                // Default: Get positions list with filters and pagination
                const result = await JobPositionController.getPositions(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }
        }
    } catch (error) {
        console.error("Job positions loader error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST handler for creating job position
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

        // Check HR/Admin permission
        if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
            return errorResponse(
                "Unauthorized. Only HR/Admin can create job positions",
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

        const result = await JobPositionController.createPosition(req)

        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 400)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Create job position error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
