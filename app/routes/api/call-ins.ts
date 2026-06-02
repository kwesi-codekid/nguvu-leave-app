import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router"
import { connectDB } from "~/database/connect"
import { CallInController } from "~/controllers/call-in.controller"
import Staff from "~/models/staff.model"
import StaffContract from "~/models/staff-contract.model"
import JobPosition from "~/models/job-position.model"
import LeaveRequest from "~/models/leave-request.model"
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

// GET /api/call-ins
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
            case "on-leave": {
                // Get staff currently on approved leave
                const result = await CallInController.getStaffOnLeave(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "my-call-ins": {
                // Get my call-ins with pagination and filters
                const result = await CallInController.getMyCallIns(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "staff": {
                // Get staff call-ins - requires staffId parameter
                const staffId = url.searchParams.get("staffId")
                if (!staffId) {
                    return validationErrorResponse("Validation failed", [
                        { field: "staffId", message: "Staff ID is required" },
                    ])
                }

                // Check authorization
                const canView =
                    staffId === user._id ||
                    user?.permissions?.includes("HR") ||
                    user?.permissions?.includes("ADMIN") ||
                    user?.permissions?.includes("MANAGER")

                if (!canView) {
                    return errorResponse(
                        "Unauthorized to view staff call-ins",
                        null,
                        403
                    )
                }

                const result = await CallInController.getStaffCallIns(
                    req,
                    staffId
                )
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "department": {
                // Get department call-ins - requires departmentId parameter
                const departmentId = url.searchParams.get("departmentId")
                if (!departmentId) {
                    return validationErrorResponse("Validation failed", [
                        {
                            field: "departmentId",
                            message: "Department ID is required",
                        },
                    ])
                }

                // Check permissions - HR, Admin, Manager, or Department Head
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN") &&
                    !user?.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized to view department call-ins",
                        null,
                        403
                    )
                }

                const result = await CallInController.getDepartmentCallIns(
                    req,
                    departmentId
                )
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "history": {
                // Get staff call-in history - requires staffId parameter
                const staffId = url.searchParams.get("staffId")
                if (!staffId) {
                    return validationErrorResponse("Validation failed", [
                        { field: "staffId", message: "Staff ID is required" },
                    ])
                }

                // Check authorization
                const canView =
                    staffId === user._id ||
                    user?.permissions?.includes("HR") ||
                    user?.permissions?.includes("ADMIN") ||
                    user?.permissions?.includes("MANAGER")

                if (!canView) {
                    return errorResponse(
                        "Unauthorized to view staff call-in history",
                        null,
                        403
                    )
                }

                const result = await CallInController.getStaffCallInHistory(
                    req,
                    staffId
                )
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "report": {
                // Generate call-in report (requires HR/Admin/Manager permissions)
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN") &&
                    !user?.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized to generate call-in report",
                        null,
                        403
                    )
                }

                const result = await CallInController.getCallInReport(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "summary": {
                // Get call-in summary (requires HR/Admin/Manager permissions)
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN") &&
                    !user?.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized to view call-in summary",
                        null,
                        403
                    )
                }

                const result = await CallInController.getCallInSummary(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            case "analytics": {
                // Get call-in analytics (requires HR/Admin permissions)
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized to view call-in analytics",
                        null,
                        403
                    )
                }

                const result = await CallInController.getCallInAnalytics(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            default: {
                // Default: Get all call-ins
                console.log("[CallIns API] Getting all call-ins for user:", user?.name, "Permissions:", user?.permissions)
                const result = await CallInController.getAllCallIns(req)
                console.log("[CallIns API] Result status:", result.status)
                console.log("[CallIns API] Result message:", result.message)
                console.log("[CallIns API] CallIns count:", result.data?.callIns?.length || 0)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }
        }
    } catch (error) {
        console.error("Call-ins loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST /api/call-ins
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

        await connectDB()

        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Parse body
        let body = {}
        const contentType = request.headers.get("Content-Type")

        if (contentType?.includes("application/json")) {
            try {
                body = await request.json()
            } catch {
                return validationErrorResponse("Invalid JSON body", [])
            }
        }

        // Prepare request object with actual properties
        const req = {
            body,
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
            case "calculate": {
                // Calculate recovered days (no special permissions needed beyond auth)
                const result = await CallInController.calculateRecoveredDays(req)
                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 400)
            }

            case "bulk": {
                // Create bulk call-ins (HR/Admin only)
                if (
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized. Only HR/Admin can create bulk call-ins",
                        null,
                        403
                    )
                }

                const result = await CallInController.createBulkCallIns(req)

                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(
                            result.message,
                            result.errors
                        )
                    }
                    return errorResponse(result.message, null, 500)
                }

                return successResponse(result.message, result.data)
            }

            case "process-pending": {
                // Process pending call-ins (Admin only)
                if (!user?.permissions?.includes("ADMIN")) {
                    return errorResponse(
                        "Unauthorized. Only system administrators can process pending call-ins",
                        null,
                        403
                    )
                }

                const result = await CallInController.processPendingCallIns(req)

                return result.status === "success"
                    ? successResponse(result.message, result.data)
                    : errorResponse(result.message, null, 500)
            }

            default: {
                // Default POST - create single call-in with automatic notification
               
                // Check if user can create call-ins (HR/Admin unrestricted, or position-based approver)
                let hasPermission =
                    user?.permissions?.includes("HR") ||
                    user?.permissions?.includes("ADMIN")

                // For non-HR/ADMIN, check position-based approver relationship
                if (!hasPermission) {
                    const userContract = await StaffContract.findOne({
                        staff: user._id,
                        status: "active",
                    })
                    if (userContract?.position) {
                        // Get the leave request to find the staff's position
                        const leaveRequest = await LeaveRequest.findById(body.leaveRequestId)
                        if (leaveRequest) {
                            const staffPosition = await JobPosition.findById(leaveRequest.position)
                            // Check if user's position is the approverPosition for the staff's position
                            if (staffPosition?.approverPosition?.toString() === userContract.position.toString()) {
                                hasPermission = true
                            }
                        }
                    }
                }

                if (!hasPermission) {
                    return errorResponse(
                        "Unauthorized. Only HR, Admin, or position-based approvers can create call-ins",
                        null,
                        403
                    )
                }

                const result = await CallInController.createCallIn(req)

                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(
                            result.message,
                            result.errors
                        )
                    }
                    return errorResponse(result.message, null, 500)
                }

                return successResponse(result.message, result.data, 201)
            }
        }
    } catch (error) {
        console.error("Call-ins action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
