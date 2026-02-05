import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router"
import { connectDB } from "~/database/connect"
import { AIController } from "~/controllers/ai.controller"
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

// GET /api/ai - For read-only AI operations
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

        // Prepare request object
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
            headers: Object.fromEntries(request.headers.entries()),
            ip:
                request.headers.get("X-Forwarded-For") ||
                request.headers.get("CF-Connecting-IP") ||
                "127.0.0.1",
            socket: { remoteAddress: "127.0.0.1" },
        } as any

        switch (op) {
            case "patterns": {
                // Analyze leave patterns
                // Required permissions: HR, ADMIN, or MANAGER
                if (
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN") &&
                    !user.permissions?.includes("MANAGER")
                ) {
                    return errorResponse(
                        "Unauthorized to analyze leave patterns",
                        null,
                        403
                    )
                }

                const result = await AIController.analyzePatterns(req)

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

            case "report": {
                // Generate AI report summary
                // Required permissions: HR or ADMIN
                if (
                    !user.permissions?.includes("HR") &&
                    !user.permissions?.includes("ADMIN")
                ) {
                    return errorResponse(
                        "Unauthorized to generate AI reports",
                        null,
                        403
                    )
                }

                const result = await AIController.generateReport(req)

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
                    "Invalid operation. GET operations: patterns, report. Use POST for: recommendations, query, chat",
                    null,
                    400
                )
        }
    } catch (error) {
        console.error("AI loader error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST /api/ai - For AI operations requiring body data
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
        const body = await request.json()

        // Prepare request object
        const req = {
            query: Object.fromEntries(url.searchParams),
            body,
            user,
            headers: Object.fromEntries(request.headers.entries()),
            ip:
                request.headers.get("X-Forwarded-For") ||
                request.headers.get("CF-Connecting-IP") ||
                "127.0.0.1",
            socket: { remoteAddress: "127.0.0.1" },
        } as any

        switch (op) {
            case "recommendations": {
                // Get smart leave recommendations
                // Any authenticated user can get recommendations for themselves
                const result = await AIController.getLeaveRecommendations(req)

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

            case "query": {
                // Process natural language query
                // Any authenticated user can query (data access controlled within)
                const result = await AIController.processQuery(req)

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

            case "chat": {
                // Chat with AI assistant
                // Any authenticated user can chat
                const result = await AIController.chat(req)

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
                    "Invalid operation. POST operations: recommendations, query, chat. Use GET for: patterns, report",
                    null,
                    400
                )
        }
    } catch (error) {
        console.error("AI action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
