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
import DepartmentController from "~/controllers/department.controller"
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

// GET handler for single department
export async function loader({ request, params }: LoaderFunctionArgs) {
    try {
        const { id } = params
        
        if (!id) {
            return errorResponse("Department ID is required", null, 400)
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
            user,
        } as any
        
        const result = await DepartmentController.getDepartmentById(req, id)
        
        if (result.status !== "success") {
            return errorResponse(result.message, null, 404)
        }
        
        return successResponse(result.message, result.data)
        
    } catch (error) {
        console.error("Get department error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
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
    } as any
    
    switch (op) {
        case "assign-head": {
            // Check HR/Admin permission
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse("Unauthorized. Only HR/Admin can assign department heads", null, 403)
            }
            
            const result = await DepartmentController.assignDepartmentHead(req, id)
            
            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }
            
            return successResponse(result.message, result.data)
        }
        
        case "remove-head": {
            // Check HR/Admin permission
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse("Unauthorized. Only HR/Admin can remove department heads", null, 403)
            }
            
            const result = await DepartmentController.removeDepartmentHead(req, id)
            
            if (result.status !== "success") {
                return errorResponse(result.message, null, 400)
            }
            
            return successResponse(result.message, result.data)
        }
        
        case "toggle-status": {
            // Check Admin permission
            if (!user.permissions?.includes("ADMIN")) {
                return errorResponse("Unauthorized. Only Admin can toggle department status", null, 403)
            }
            
            const result = await DepartmentController.toggleDepartmentStatus(req, id)
            
            if (result.status !== "success") {
                return errorResponse(result.message, null, 400)
            }
            
            return successResponse(result.message, result.data)
        }
        
        default:
            return errorResponse("Invalid operation for PATCH request", null, 400)
    }
}

// Handler for PUT operations (update department)
async function handlePutOperations(
    request: Request,
    id: string,
    body: any,
    user: any
): Promise<Response> {
    // Check HR/Admin permission
    if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
        return errorResponse("Unauthorized. Only HR/Admin can update departments", null, 403)
    }
    
    const req = {
        body,
        user,
        ip: request.headers.get("x-forwarded-for") || "unknown",
        headers: {
            "user-agent": request.headers.get("user-agent"),
        },
    } as any
    
    const result = await DepartmentController.updateDepartment(req, id)
    
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
        return errorResponse("Unauthorized. Only Admin can delete departments", null, 403)
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
    
    const result = await DepartmentController.deleteDepartment(req, id)
    
    if (result.status !== "success") {
        return errorResponse(result.message, null, 400)
    }
    
    return successResponse(result.message, result.data)
}

// Main action handler
export async function action({ request, params }: ActionFunctionArgs) {
    const { id } = params
    
    if (!id) {
        return errorResponse("Department ID is required", null, 400)
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
            const body = await request.json()
            return await handlePatchOperations(request, id, op, body, user)
        }
        
        if (request.method === "DELETE") {
            return await handleDeleteOperations(request, id, user)
        }
        
        return errorResponse("Method not allowed", null, 405)
        
    } catch (error) {
        console.error("Department action error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
