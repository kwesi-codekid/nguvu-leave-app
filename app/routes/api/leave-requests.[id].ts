import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router"
import { connectDB } from "~/database/connect"
import { LeaveRequestController } from "~/controllers/leave-request.controller"
import LeaveRequest from "~/models/leave-request.model"
import Staff from "~/models/staff.model"
import jwt from "jsonwebtoken"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"
import { LeaveStatus } from "~/utils/types"

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

// GET /api/leave-requests/:id
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return validationErrorResponse("Validation failed", [
                { field: "id", message: "Request ID is required" },
            ])
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        // Prepare request object with actual properties
        const req = {
            query: Object.fromEntries(new URL(request.url).searchParams),
            user,
            headers: Object.fromEntries(request.headers.entries()),
            ip:
                request.headers.get("X-Forwarded-For") ||
                request.headers.get("CF-Connecting-IP") ||
                "127.0.0.1",
            socket: { remoteAddress: "127.0.0.1" },
        } as any

        // Get leave request by ID
        const result = await LeaveRequestController.getRequestById(req, id)

        if (result.status === "validation_error") {
            return validationErrorResponse(result.message, result.errors || [])
        }

        return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(
                  result.message,
                  null,
                  result.status === "error" ? 404 : 500
              )
    } catch (error) {
        console.error("Get leave request error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// PUT, PATCH, DELETE /api/leave-requests/:id
export async function action({ request, params }: ActionFunctionArgs) {
    try {
        const { id } = params
        const method = request.method

        if (!id) {
            return validationErrorResponse("Validation failed", [
                { field: "id", message: "Request ID is required" },
            ])
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Parse body for PUT and PATCH methods
        let body = {}
        if (method === "PUT" || method === "PATCH") {
            const contentType = request.headers.get("Content-Type")

            if (contentType?.includes("application/json")) {
                try {
                    body = await request.json()
                } catch {
                    return validationErrorResponse("Invalid JSON body", [])
                }
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
            socket: { remoteAddress: "127.0.0.1" },
        } as any

        switch (method) {
            case "PUT": {
                // Update leave request (only pending)
                const result = await LeaveRequestController.updateRequest(
                    req,
                    id
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

            case "PATCH": {
                // Handle various PATCH operations based on op parameter
                switch (op) {
                    case "withdraw": {
                        // Withdraw leave request (only pending/endorsed)
                        const result =
                            await LeaveRequestController.withdrawRequest(
                                req,
                                id
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

                    case "endorse": {
                        // Endorse leave request
                        const result =
                            await LeaveRequestController.endorseRequest(req, id)

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

                    case "reject-endorsement": {
                        // Reject at endorsement level
                        const result =
                            await LeaveRequestController.rejectRequestByEndorser(
                                req,
                                id
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

                    case "approve": {
                        // Approve leave request
                        const result =
                            await LeaveRequestController.approveRequest(req, id)

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

                    case "reject-approval": {
                        // Reject at approval level
                        const result =
                            await LeaveRequestController.rejectRequestByApprover(
                                req,
                                id
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

                    case "cancel": {
                        // Cancel approved leave (HR/Admin only)
                        if (
                            !user.permissions?.includes("HR") &&
                            !user.permissions?.includes("ADMIN")
                        ) {
                            return errorResponse(
                                "Unauthorized. Only HR/Admin can cancel approved leave",
                                null,
                                403
                            )
                        }

                        const result =
                            await LeaveRequestController.cancelApprovedRequest(
                                req,
                                id
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
                            "Invalid operation. Valid PATCH operations: withdraw, endorse, reject-endorsement, approve, reject-approval, cancel",
                            null,
                            400
                        )
                }
            }

            case "DELETE": {
                // Delete leave request - only pending requests allowed
                // First check if request exists and is pending
                const leaveRequest = await LeaveRequest.findById(id).lean()

                if (!leaveRequest) {
                    return errorResponse("Leave request not found", null, 404)
                }

                // Check if request is pending
                if (leaveRequest.status !== LeaveStatus.PENDING) {
                    return errorResponse(
                        "Only pending requests can be deleted. Use withdraw for pending/endorsed requests or cancel for approved requests",
                        null,
                        400
                    )
                }

                // Check ownership or HR/Admin permission
                if (
                    leaveRequest.staff.toString() !== user._id.toString() &&
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized to delete this request",
                        null,
                        403
                    )
                }

                const result = await LeaveRequestController.deleteRequest(
                    req,
                    id
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
                return errorResponse("Method not allowed", null, 405)
        }
    } catch (error) {
        console.error("Leave request action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
