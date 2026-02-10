import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router"
import { connectDB } from "~/database/connect"
import { LeaveRequestController } from "~/controllers/leave-request.controller"
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

// GET /api/leave-requests
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

    // Prepare request object with actual properties
    const req = {
      query: Object.fromEntries(url.searchParams),
      user,
      headers: Object.fromEntries(request.headers.entries()),
      ip: request.headers.get("X-Forwarded-For") || request.headers.get("CF-Connecting-IP") || "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any

    switch (op) {
      case "my-requests": {
        // Get my leave requests with pagination and filters
        const result = await LeaveRequestController.getMyRequests(req)
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "pending-endorsements": {
        // Get requests pending my endorsement
        const result = await LeaveRequestController.getPendingEndorsements(req)
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "pending-approvals": {
        // Get requests pending my approval
        const result = await LeaveRequestController.getPendingApprovals(req)
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "calendar": {
        // Get leave calendar - accessible to all users but data is scoped by role
        // Controller handles the scoping based on user permissions
        const result = await LeaveRequestController.getLeaveCalendar(req)
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "summary": {
        // Get leave request summary (requires HR/Admin/Manager permissions)
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN") &&
          !user.permissions?.includes("MANAGER")
        ) {
          return errorResponse(
            "Unauthorized to view leave summary",
            null,
            403
          )
        }

        const result = await LeaveRequestController.getRequestSummary(req)
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      default:
        return errorResponse(
          "Invalid operation. Valid operations: my-requests, pending-endorsements, pending-approvals, calendar, summary",
          null,
          400
        )
    }
  } catch (error) {
    console.error("Leave requests loader error:", error)
    const message = error instanceof Error ? error.message : "An error occurred"
    return errorResponse(message, null, 500)
  }
}

// POST /api/leave-requests
export async function action({ request }: ActionFunctionArgs) {
  if (!["POST", "PATCH"].includes(request.method)) {
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

    // Parse body
    let body = {}
    const contentType = request.headers.get("Content-Type")
    
    if (contentType?.includes("application/json")) {
      try {
        body = await request.json()
      } catch {
        return validationErrorResponse("Invalid JSON body", [])
      }
    }

    // Prepare request object with actual properties
    const req = {
      body,
      query: Object.fromEntries(url.searchParams),
      user,
      headers: Object.fromEntries(request.headers.entries()),
      ip: request.headers.get("X-Forwarded-For") || request.headers.get("CF-Connecting-IP") || "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any

    // Handle PATCH operations for leave request actions
    if (request.method === "PATCH") {
      const id = url.pathname.split("/").pop()
      
      if (!id) {
        return errorResponse("Leave request ID is required", null, 400)
      }

      switch (op) {
        case "withdraw": {
          const result = await LeaveRequestController.withdrawRequest(req, id)
          return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
        }
        
        case "endorse": {
          const result = await LeaveRequestController.endorseRequest(req, id)
          return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
        }
        
        case "approve": {
          const result = await LeaveRequestController.approveRequest(req, id)
          return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
        }
        
        case "reject": {
          const result = await LeaveRequestController.rejectRequest(req, id)
          return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
        }
        
        case "terminate": {
          const result = await LeaveRequestController.terminateRequest(req, id)
          return result.status === "success"
            ? successResponse(result.message, result.data)
            : errorResponse(result.message, null, 500)
        }
        
        default:
          return errorResponse(
            "Invalid operation. Valid PATCH operations: withdraw, endorse, approve, reject, terminate",
            null,
            400
          )
      }
    }

    // Handle POST operations
    switch (op) {
      case "calculate-period": {
        // Calculate period and resumption date
        // Available to all authenticated users
        const result = await LeaveRequestController.calculatePeriodAndResumption(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }
      
      case "emergency": {
        // Create emergency leave (HR/Admin only)
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN")
        ) {
          return errorResponse(
            "Unauthorized. Only HR/Admin can create emergency leave",
            null,
            403
          )
        }

        const result = await LeaveRequestController.createEmergencyLeave(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      default: {
        // Default POST - create normal leave request
        // This internally handles working days calculation and overlapping checks
        const result = await LeaveRequestController.createLeaveRequest(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data, 201)
          : errorResponse(result.message, null, 500)
      }
    }
  } catch (error) {
    console.error("Leave requests action error:", error)
    const message = error instanceof Error ? error.message : "An error occurred"
    return errorResponse(message, null, 500)
  }
}
