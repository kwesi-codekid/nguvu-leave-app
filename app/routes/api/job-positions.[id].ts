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

// GET handler for single job position and occupancy
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return errorResponse("Position ID is required", null, 400)
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        const url = new URL(request.url)
        const op = url.searchParams.get("op")

        // Prepare request for controller
        const req = {
            params: { id },
            query: Object.fromEntries(url.searchParams),
            user,
        } as any

        if (op === "occupancy") {
            const result = await JobPositionController.checkOccupancy(req, id)

            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        const result = await JobPositionController.getPositionById(req, id)

        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 404)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Get job position error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// Action handler for PUT, PATCH and DELETE operations
export async function action({ request, params }: ActionFunctionArgs) {
    const { id } = params

    if (!id) {
        return errorResponse("Position ID is required", null, 400)
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

        // PUT - Update position (HR/Admin)
        if (request.method === "PUT") {
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only HR/Admin can update job positions",
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

            const result = await JobPositionController.updatePosition(req, id)

            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        // PATCH - approval-chain or toggle-status (HR/Admin)
        if (request.method === "PATCH") {
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only HR/Admin can modify job positions",
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

            if (op === "approval-chain") {
                const result = await JobPositionController.updateApprovalChain(req, id)

                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 400)
                }

                return successResponse(result.message, result.data)
            }

            if (op === "toggle-status") {
                const result = await JobPositionController.togglePositionStatus(req, id)

                if (result.status !== "success") {
                    if (result.errors) {
                        return validationErrorResponse(result.message, result.errors)
                    }
                    return errorResponse(result.message, null, 400)
                }

                return successResponse(result.message, result.data)
            }

            return errorResponse("Invalid operation for PATCH request", null, 400)
        }

        // DELETE - Delete position (Admin)
        if (request.method === "DELETE") {
            if (!user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only Admin can delete job positions",
                    null,
                    403
                )
            }

            const req = {
                user,
                params: { id },
                query: Object.fromEntries(url.searchParams),
                ip: request.headers.get("x-forwarded-for") || "unknown",
                headers: {
                    "user-agent": request.headers.get("user-agent"),
                },
            } as any

            const result = await JobPositionController.deletePosition(req, id)

            if (result.status !== "success") {
                return errorResponse(result.message, null, 400)
            }

            return successResponse(result.message, result.data)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Job position action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

