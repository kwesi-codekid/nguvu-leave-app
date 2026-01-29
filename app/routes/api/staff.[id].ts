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
import StaffController from "~/controllers/staff.controller"
import Staff from "~/models/staff.model"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

// Helper to get authenticated staff
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

// GET handler for single staff
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params

        if (!id) {
            return errorResponse("Staff ID is required", null, 400)
        }

        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }

        // Check permissions - HR, Admin, Manager, or Self
        const isSelf = user._id.toString() === id
        const hasPermission =
            user.permissions?.includes("HR") ||
            user.permissions?.includes("ADMIN") ||
            user.permissions?.includes("MANAGER") ||
            isSelf

        if (!hasPermission) {
            return errorResponse(
                "Unauthorized to view this staff member",
                null,
                403
            )
        }

        await connectDB()

        // Extract query parameters from the request URL
        const url = new URL(request.url)
        const query = Object.fromEntries(url.searchParams)

        // Prepare request for controller
        const req = {
            params: { id },
            query,
            user,
        } as any

        const result = await StaffController.getStaffById(req, id)

        if (result.status !== "success") {
            return errorResponse(result.message, null, 404)
        }

        return successResponse(result.message, result.data)
    } catch (error) {
        console.error("Get staff error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// Handler for PATCH operations
async function handlePatchOperations(
    request: Request,
    id: string,
    op: string | null,
    body: any,
    user: any
): Promise<Response> {
    const req = {
        body,
        user,
        ip: request.headers.get("x-forwarded-for") || "unknown",
        headers: {
            "user-agent": request.headers.get("user-agent"),
        },
        file: body.file || (request as any).file, // For image upload
    } as any

    const isSelf = user._id.toString() === id

    switch (op) {
        case "status": {
            // Update status - HR/Admin only
            if (
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN")
            ) {
                return errorResponse(
                    "Unauthorized. Only HR/Admin can update staff status",
                    null,
                    403
                )
            }

            const result = await StaffController.updateStaffStatus(req, id)

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

        case "permissions": {
            // Assign permissions - Admin only
            if (!user.permissions?.includes("ADMIN")) {
                return errorResponse(
                    "Unauthorized. Only Admin can assign permissions",
                    null,
                    403
                )
            }

            const result = await StaffController.assignPermissions(req, id)

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

        case "profile-image": {
            // Upload profile image - HR/Admin or Self
            if (
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN") &&
                !isSelf
            ) {
                return errorResponse(
                    "Unauthorized to upload profile image",
                    null,
                    403
                )
            }

            // Check if file was provided
            if (!req.file) {
                return errorResponse(
                    "No file uploaded. Please send a file in the 'file' field of multipart form data",
                    null,
                    400
                )
            }

            const result = await StaffController.uploadProfileImage(req, id)

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

        case "emergency-contact": {
            // Update emergency contact - HR/Admin or Self
            if (
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN") &&
                !isSelf
            ) {
                return errorResponse(
                    "Unauthorized to update emergency contact",
                    null,
                    403
                )
            }

            const result = await StaffController.updateEmergencyContact(req, id)

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

        default:
            return errorResponse(
                "Invalid operation for PATCH request",
                null,
                400
            )
    }
}

// Handler for PUT operations (update staff profile)
async function handlePutOperations(
    request: Request,
    id: string,
    body: any,
    user: any
): Promise<Response> {
    // Check HR/Admin permission
    const hasHRPermission = user.permissions?.includes("HR") || false
    const hasAdminPermission = user.permissions?.includes("ADMIN") || false

    if (!hasHRPermission && !hasAdminPermission) {
        return errorResponse(
            "Unauthorized. Only HR/Admin can update staff profiles",
            null,
            403
        )
    }

    const req = {
        body,
        user,
        params: { id },
        ip: request.headers.get("x-forwarded-for") || "unknown",
        headers: {
            "user-agent": request.headers.get("user-agent"),
        },
    } as any

    const result = await StaffController.updateStaff(req, id)

    if (result.status !== "success") {
        if (result.errors) {
            return validationErrorResponse(result.message, result.errors)
        }
        return errorResponse(result.message, null, 400)
    }

    return successResponse(result.message, result.data)
}

// Handler for DELETE operations
async function handleDeleteOperations(
    request: Request,
    id: string,
    user: any
): Promise<Response> {
    // Check Admin permission
    if (!user.permissions?.includes("ADMIN")) {
        return errorResponse(
            "Unauthorized. Only Admin can delete staff",
            null,
            403
        )
    }

    const url = new URL(request.url)
    const req = {
        query: Object.fromEntries(url.searchParams),
        user,
        ip: request.headers.get("x-forwarded-for") || "unknown",
        headers: {
            "user-agent": request.headers.get("user-agent"),
        },
    } as any

    const result = await StaffController.deleteStaff(req, id)

    if (result.status !== "success") {
        return errorResponse(result.message, null, 400)
    }

    return successResponse(result.message, result.data)
}

// Main action handler
export async function action({ request, params }: ActionFunctionArgs) {
    const { id } = params

    if (!id) {
        return errorResponse("Staff ID is required", null, 400)
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

        // Handle different HTTP methods
        if (request.method === "PUT") {
            const body = await request.json()
            return await handlePutOperations(request, id, body, user)
        }

        if (request.method === "PATCH") {
            // Handle different content types for PATCH operations
            let body: any = {}
            const contentType = request.headers.get("content-type")

            if (
                op === "profile-image" &&
                contentType?.includes("multipart/form-data")
            ) {
                // Handle multipart form data for image upload
                const formData = await request.formData()
                const file = formData.get("file") as File | null

                // Convert file to Buffer format expected by controller
                if (file && file.size > 0) {
                    // Check if it's an image
                    if (!file.type.startsWith("image/")) {
                        return errorResponse(
                            "Invalid file type. Please upload an image file.",
                            null,
                            400
                        )
                    }

                    const arrayBuffer = await file.arrayBuffer()
                    const fileBuffer = {
                        buffer: Buffer.from(arrayBuffer),
                        originalname: file.name,
                        mimetype: file.type,
                        size: file.size,
                        fieldname: "file",
                        encoding: "7bit",
                        destination: "",
                        filename: "",
                        path: "",
                        stream: null as any,
                    }
                    // Store file for the controller
                    body.file = fileBuffer
                }

                // Extract any other form data fields if present
                for (const [key, value] of formData.entries()) {
                    if (key !== "file" && typeof value === "string") {
                        body[key] = value
                    }
                }
            } else {
                body = await request.json()
            }

            return await handlePatchOperations(request, id, op, body, user)
        }

        if (request.method === "DELETE") {
            return await handleDeleteOperations(request, id, user)
        }

        return errorResponse("Method not allowed", null, 405)
    } catch (error) {
        console.error("Staff action error:", error)
        const message =
            error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
