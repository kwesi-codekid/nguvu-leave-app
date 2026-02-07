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
import StaffContractController from "~/controllers/staff-contract.controller"
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

// GET handler for active, expiring, by-staff contracts and history
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
            case "all": {
                // Get all contracts regardless of status - HR/Admin/Manager only
                if (
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN") &&
                    !user.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized. Only HR/Admin/Manager can view all contracts",
                        null,
                        403
                    )
                }

                const result = await StaffContractController.getAllContracts(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "pending": {
                // Get pending contracts - HR/Admin/Manager only
                if (
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN") &&
                    !user.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized. Only HR/Admin/Manager can view pending contracts",
                        null,
                        403
                    )
                }

                const result = await StaffContractController.getPendingContracts(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "active": {
                // Get all active contracts - HR/Admin only
                if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                    return errorResponse(
                        "Unauthorized. Only HR/Admin can view all active contracts",
                        null,
                        403
                    )
                }

                const result = await StaffContractController.getActiveContracts(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "expiring": {
                // Get expiring contracts - HR/Admin only
                if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                    return errorResponse(
                        "Unauthorized. Only HR/Admin can view expiring contracts",
                        null,
                        403
                    )
                }

                const result = await StaffContractController.getExpiringContracts(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "by-staff": {
                // Get staff's current contract
                const staffId = url.searchParams.get("staffId")
                
                if (!staffId) {
                    return validationErrorResponse("Validation failed", [
                        { field: "staffId", message: "Staff ID is required when using op=by-staff" }
                    ])
                }

                // Check permissions - HR, Admin, Manager, or Self
                const isSelf = user._id.toString() === staffId
                const hasPermission = 
                    user.permissions?.includes("HR") ||
                    user.permissions?.includes("ADMIN") ||
                    user.permissions?.includes("MANAGER") ||
                    isSelf

                if (!hasPermission) {
                    return errorResponse(
                        "Unauthorized to view this staff's contract",
                        null,
                        403
                    )
                }
                
                const result = await StaffContractController.getStaffCurrentContract(req, staffId)
                
                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 404)
                }
                
                return successResponse(result.message, result.data)
            }

            case "history": {
                // Get staff's contract history
                const staffId = url.searchParams.get("staffId")
                
                if (!staffId) {
                    return validationErrorResponse("Validation failed", [
                        { field: "staffId", message: "Staff ID is required when using op=history" }
                    ])
                }

                // Check permissions - HR, Admin, or Self
                const isSelf = user._id.toString() === staffId
                const hasPermission = 
                    user.permissions?.includes("HR") ||
                    user.permissions?.includes("ADMIN") ||
                    isSelf

                if (!hasPermission) {
                    return errorResponse(
                        "Unauthorized to view this staff's contract history",
                        null,
                        403
                    )
                }
                
                const result = await StaffContractController.getStaffContractHistory(req, staffId)
                
                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 404)
                }
                
                return successResponse(result.message, result.data)
            }

            default: {
                return errorResponse(
                    "Invalid operation. Use op=all, op=pending, op=active, op=expiring, op=by-staff, or op=history",
                    null,
                    400
                )
            }
        }
    } catch (error) {
        console.error("Contracts loader error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST handler for creating contract
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
                "Unauthorized. Only HR/Admin can create contracts",
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

        const result = await StaffContractController.createContract(req)

        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 400)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Create contract error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
