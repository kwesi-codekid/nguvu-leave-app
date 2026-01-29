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

// Handler for GET operations
async function handleGetOperations(
    request: Request,
    op: string | null,
    user: any
): Promise<Response> {
    const url = new URL(request.url)
    
    switch (op) {
        case "search": {
            // Search staff - any authenticated user
            const req = {
                query: Object.fromEntries(url.searchParams),
                user,
            } as any
            
            const result = await StaffController.searchStaff(req)
            
            return result.status === "success"
                ? successResponse(result.message, result.data)
                : errorResponse(result.message, null, 400)
        }
        
        case "by-department": {
            // Get staff by department
            const departmentId = url.searchParams.get("departmentId")
            
            if (!departmentId) {
                return validationErrorResponse("Validation failed", [
                    { field: "departmentId", message: "Department ID is required" }
                ])
            }
            
            // Check permissions - HR, Admin, or Manager
            if (!user.permissions?.includes("HR") && 
                !user.permissions?.includes("ADMIN") && 
                !user.permissions?.includes("MANAGER")) {
                return errorResponse("Unauthorized. Only HR/Admin/Manager can view department staff", null, 403)
            }
            
            const req = {
                query: Object.fromEntries(url.searchParams),
                user,
            } as any
            
            const result = await StaffController.getStaffByDepartment(req, departmentId)
            
            return result.status === "success"
                ? successResponse(result.message, result.data)
                : errorResponse(result.message, null, 400)
        }
        
        default: {
            // List all staff - HR, Admin, or Manager
            if (!user.permissions?.includes("HR") && 
                !user.permissions?.includes("ADMIN") && 
                !user.permissions?.includes("MANAGER")) {
                return errorResponse("Unauthorized. Only HR/Admin/Manager can view staff list", null, 403)
            }
            
            const req = {
                query: Object.fromEntries(url.searchParams),
                user,
            } as any
            
            const result = await StaffController.getStaff(req)
            
            return result.status === "success"
                ? successResponse(result.message, result.data)
                : errorResponse(result.message, null, 500)
        }
    }
}

// Handler for POST operations
async function handlePostOperations(
    request: Request,
    op: string | null,
    body: any,
    user: any
): Promise<Response> {
    // Check HR/Admin permission for all POST operations
    if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
        return errorResponse("Unauthorized. Only HR/Admin can create or import staff", null, 403)
    }
    
    const req = {
        body,
        user,
        ip: request.headers.get("x-forwarded-for") || "unknown",
        headers: {
            "user-agent": request.headers.get("user-agent"),
        },
    } as any
    
    switch (op) {
        case "bulk-import": {
            // Handle bulk import
            const result = await StaffController.bulkImportStaff(req)
            
            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }
            
            return successResponse(result.message, result.data)
        }
        
        default: {
            // Create single staff member
            const result = await StaffController.createStaff(req)
            
            if (result.status !== "success") {
                if (result.errors) {
                    return validationErrorResponse(result.message, result.errors)
                }
                return errorResponse(result.message, null, 400)
            }
            
            return successResponse(result.message, result.data)
        }
    }
}

// GET handler for staff operations
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
        
        return await handleGetOperations(request, op, user)
        
    } catch (error) {
        console.error("Staff loader error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST handler for creating staff and bulk import
export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return errorResponse("Method not allowed", null, 405)
    }
    
    try {
        const url = new URL(request.url)
        const op = url.searchParams.get("op")
        
        // Check authentication
        const user = await getAuthenticatedStaff(request)
        if (!user) {
            return errorResponse("Unauthorized", null, 401)
        }
        
        await connectDB()
        
        // For file upload (bulk import), handle multipart form data
        let body: any
        if (op === "bulk-import") {
            // For bulk import, expecting multipart form data or JSON
            const contentType = request.headers.get("content-type")
            if (contentType?.includes("multipart/form-data")) {
                // Handle file upload - this would need multer or similar in production
                // For now, expect JSON with parsed data
                body = await request.json()
            } else {
                body = await request.json()
            }
        } else {
            body = await request.json()
        }
        
        return await handlePostOperations(request, op, body, user)
        
    } catch (error) {
        console.error("Staff action error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
