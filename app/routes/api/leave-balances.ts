import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"
import { connectDB } from "~/database/connect"
import LeaveBalanceController from "~/controllers/leave-balance.controller"
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

// GET /api/leave-balances
export async function loader({ request }: LoaderFunctionArgs) {
    try {
        await connectDB()

        // Authenticate
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        const url = new URL(request.url)
        const op = url.searchParams.get("op")

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
            case "by-staff": {
                const staffId = url.searchParams.get("staffId")
                if (!staffId) {
                    return errorResponse("Staff ID is required", null, 400)
                }
                result = await LeaveBalanceController.getStaffBalances(
                    mockReq,
                    staffId
                )
                break
            }

            case "by-department": {
                const departmentId = url.searchParams.get("departmentId")
                if (!departmentId) {
                    return errorResponse("Department ID is required", null, 400)
                }
                result = await LeaveBalanceController.getDepartmentBalances(
                    mockReq,
                    departmentId
                )
                break
            }

            case "single": {
                const staffId = url.searchParams.get("staffId")
                const leaveType = url.searchParams.get("leaveType")
                if (!staffId || !leaveType) {
                    return errorResponse(
                        "Staff ID and leave type are required",
                        null,
                        400
                    )
                }
                result = await LeaveBalanceController.getBalance(
                    mockReq,
                    staffId,
                    leaveType
                )
                break
            }

            case "check-availability": {
                result = await LeaveBalanceController.checkAvailability(mockReq)
                break
            }

            case "history": {
                const staffId = url.searchParams.get("staffId")
                if (!staffId) {
                    return errorResponse(
                        "Staff ID is required for history",
                        null,
                        400
                    )
                }
                result = await LeaveBalanceController.getBalanceHistory(
                    mockReq,
                    staffId
                )
                break
            }

            case "summary-report": {
                result = await LeaveBalanceController.getBalanceSummaryReport(
                    mockReq
                )
                break
            }

            case "low-balance": {
                result = await LeaveBalanceController.getLowBalanceAlert(
                    mockReq
                )
                break
            }

            case "year-end-report": {
                result = await LeaveBalanceController.getYearEndReport(mockReq)
                break
            }

            case "utilization-report": {
                result = await LeaveBalanceController.getLeaveUtilizationReport(
                    mockReq
                )
                break
            }

            case "export": {
                result = await LeaveBalanceController.exportBalances(mockReq)
                break
            }

            default:
                return errorResponse(
                    "Invalid operation. Valid operations: by-staff, by-department, single, check-availability, history, summary-report, low-balance, year-end-report, utilization-report, export",
                    null,
                    400
                )
        }

        // Handle controller response
        if (result.status !== "success") {
            return errorResponse(result.message, null, 400)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Error in leave balance route:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST/PUT/PATCH /api/leave-balances
export async function action({ request }: ActionFunctionArgs) {
    try {
        await connectDB()

        // Authenticate
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        const method = request.method
        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Create a mock request object for the controller
        let body = {}
        if (request.headers.get("Content-Type")?.includes("application/json")) {
            try {
                body = await request.json()
            } catch {
                body = {}
            }
        }

        const mockReq = {
            user,
            query: Object.fromEntries(url.searchParams.entries()),
            body,
            headers: Object.fromEntries(request.headers.entries()),
            ip: request.headers.get("X-Forwarded-For") || "127.0.0.1",
            socket: { remoteAddress: "127.0.0.1" },
        } as any

        let result

        if (method === "POST") {
            switch (op) {
                case "validate-request": {
                    // Validate a leave request
                    result = await LeaveBalanceController.validateLeaveRequest(
                        mockReq
                    )
                    break
                }

                case "initialize-new-year": {
                    // Initialize balances for new year (Admin only)
                    result = await LeaveBalanceController.initializeNewYear(
                        mockReq
                    )
                    break
                }

                case "process-year-end": {
                    // Process year end (Admin only)
                    result = await LeaveBalanceController.processYearEnd(
                        mockReq
                    )
                    break
                }

                default:
                    return errorResponse(
                        "Invalid operation for POST. Valid operations: validate-request, initialize-new-year, process-year-end",
                        null,
                        400
                    )
            }

            // Handle controller response
            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(
                        result.message,
                        result.errors
                    )
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        if (method === "PUT") {
            switch (op) {
                case "adjust": {
                    // Adjust annual leave balance (HR/Admin only)
                    result = await LeaveBalanceController.adjustBalance(mockReq)
                    break
                }

                case "reset": {
                    // Reset balance to default (Admin only)
                    result = await LeaveBalanceController.resetBalance(mockReq)
                    break
                }

                case "debit": {
                    // Debit balance when leave is approved (System/HR/Admin)
                    result = await LeaveBalanceController.debitBalance(mockReq)
                    break
                }

                case "credit": {
                    // Credit balance when leave is cancelled (System/HR/Admin)
                    result = await LeaveBalanceController.creditBalance(mockReq)
                    break
                }

                default:
                    return errorResponse(
                        "Invalid operation for PUT. Valid operations: adjust, reset, debit, credit",
                        null,
                        400
                    )
            }

            // Handle controller response
            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(
                        result.message,
                        result.errors
                    )
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Error in leave balance action:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
