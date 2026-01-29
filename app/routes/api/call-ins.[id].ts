import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router"
import { connectDB } from "~/database/connect"
import { CallInController } from "~/controllers/call-in.controller"
import Staff from "~/models/staff.model"
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

// GET /api/call-ins/:id
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return validationErrorResponse("Validation failed", [
                { field: "id", message: "Call-in ID is required" },
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
            socket: {
                remoteAddress:
                    request.headers.get("X-Forwarded-For") || "127.0.0.1",
            },
            userAgent: request.headers.get("user-agent"),
        } as any

        // Get call-in by ID
        const result = await CallInController.getCallInById(req, id)

        return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(
                  result.message,
                  null,
                  result.status === "not_found" ? 404 : 500
              )
    } catch (error) {
        console.error("Call-in loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// PUT, DELETE /api/call-ins/:id
export async function action({ request, params }: ActionFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return validationErrorResponse("Validation failed", [
                { field: "id", message: "Call-in ID is required" },
            ])
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        await connectDB()

        const method = request.method

        // Parse body for PUT and DELETE operations
        let body = {}
        if (method === "PUT" || method === "DELETE") {
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
            query: Object.fromEntries(new URL(request.url).searchParams),
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

        switch (method) {
            case "PUT": {
                // Update call-in (within 24 hours) with automatic notification
                // Authorization is checked within the controller (creator, HR, Admin)
                const result = await CallInController.updateCallIn(req, id)

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

            case "DELETE": {
                // Cancel call-in (within 48 hours) with automatic notification
                // Authorization is checked within the controller (creator, HR, Admin)
                const result = await CallInController.deleteCallIn(req, id)

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

            default:
                return errorResponse("Method not allowed", null, 405)
        }
    } catch (error) {
        console.error("Call-in action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
