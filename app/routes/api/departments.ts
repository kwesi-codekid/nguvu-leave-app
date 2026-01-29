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

// GET handler for departments list and statistics
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
        
        // Route based on operation
        if (op === "statistics") {
            // Check HR/Admin permission for statistics
            if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
                return errorResponse("Unauthorized. Only HR/Admin can view statistics", null, 403)
            }
            
            // Prepare request object for controller
            const req = {
                query: Object.fromEntries(url.searchParams),
                user,
            } as any
            
        const result = await DepartmentController.getDepartmentStatistics(req)
        return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
        }
        
        // Default: Get departments list
        const req = {
            query: Object.fromEntries(url.searchParams),
            user,
        } as any
        
        const result = await DepartmentController.getDepartments(req)
        return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
            
    } catch (error) {
        console.error("Departments loader error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}

// POST handler for creating department
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
        
        // Check HR/Admin permission
        if (!user.permissions?.includes("HR") && !user.permissions?.includes("ADMIN")) {
            return errorResponse("Unauthorized. Only HR/Admin can create departments", null, 403)
        }
        
        await connectDB()
        const body = await request.json()
        
        // Prepare request object for controller
        const req = {
            body,
            user,
            ip: request.headers.get("x-forwarded-for") || "unknown",
            headers: {
                "user-agent": request.headers.get("user-agent"),
            },
        } as any
        
        const result = await DepartmentController.createDepartment(req)
        
        if (result.status !== "success") {
            if (result.errors) {
                return validationErrorResponse(result.message, result.errors)
            }
            return errorResponse(result.message, null, 400)
        }
        
        return successResponse(result.message, result.data)
        
    } catch (error) {
        console.error("Create department error:", error)
        const message = error instanceof Error ? error.message : "An error occurred"
        return errorResponse(message, null, 500)
    }
}
