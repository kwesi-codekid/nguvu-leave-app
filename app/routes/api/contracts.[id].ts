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

// GET handler for single contract
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return errorResponse("Contract ID is required", null, 400)
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
            query: Object.fromEntries(new URL(request.url).searchParams),
            user,
        } as any

        const result = await StaffContractController.getContractById(req, id)

        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 404)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Get contract error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// Action handler for PUT and PATCH operations
export async function action({ request, params }: ActionFunctionArgs) {
    const { id } = params

    if (!id) {
        return errorResponse("Contract ID is required", null, 400)
    }

    // Check authentication
    const user = await getAuthenticatedStaff(request)
    if (!user) {
        return errorResponse("Unauthorized", null, 401)
    }

    try {
        await connectDB()

        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // PUT - Update contract (salary/endDate) - HR/Admin
        if (request.method === "PUT") {
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only HR/Admin can update contracts",
                    null,
                    403
                )
            }

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

            const result = await StaffContractController.updateContract(req, id)

            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        // POST - Renew contract (special case, uses POST) - HR/Admin
        if (request.method === "POST" && op === "renew") {
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only HR/Admin can renew contracts",
                    null,
                    403
                )
            }

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

            const result = await StaffContractController.renewContract(req, id)

            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        // PATCH - activate, terminate, or cancel - HR/Admin
        if (request.method === "PATCH") {
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only HR/Admin can modify contract status",
                    null,
                    403
                )
            }

            const body = await request.json().catch(() => ({}))
            const req = {
                body,
                user,
                params: { id },
                ip: request.headers.get("x-forwarded-for") || "unknown",
                headers: {
                    "user-agent": request.headers.get("user-agent"),
                },
            } as any

            switch (op) {
                case "activate": {
                    const result = await StaffContractController.activateContract(req, id)

                    if (result.status !== "success") {
                        if (result.errors) {
                            return validationErrorResponse(result.message, result.errors)
                        }
                        return errorResponse(result.message, null, 400)
                    }

                    return successResponse(result.message, result.data)
                }

                case "terminate": {
                    if (!body.reason) {
                        return validationErrorResponse("Validation failed", [
                            { field: "reason", message: "Termination reason is required" }
                        ])
                    }

                    const result = await StaffContractController.terminateContract(req, id)

                    if (result.status !== "success") {
                        if (result.errors) {
                            return validationErrorResponse(result.message, result.errors)
                        }
                        return errorResponse(result.message, null, 400)
                    }

                    return successResponse(result.message, result.data)
                }

                case "cancel": {
                    const result = await StaffContractController.cancelContract(req, id)

                    if (result.status !== "success") {
                        if (result.errors) {
                            return validationErrorResponse(result.message, result.errors)
                        }
                        return errorResponse(result.message, null, 400)
                    }

                    return successResponse(result.message, result.data)
                }

                default:
                    return errorResponse(
                        "Invalid operation for PATCH request. Use op=activate, op=terminate, or op=cancel",
                        null,
                        400
                    )
            }
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Contract action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
