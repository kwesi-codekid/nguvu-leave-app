import {
  type LoaderFunctionArgs,
} from "react-router"
import { connectDB } from "~/database/connect"
import { ReportController } from "~/controllers/report.controller"
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

// GET /api/reports
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
      case "leave-requests": {
        // Get leave requests report
        // Required permissions: HR, ADMIN, or MANAGER
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN") &&
          !user.permissions?.includes("MANAGER")
        ) {
          return errorResponse(
            "Unauthorized to view leave requests report",
            null,
            403
          )
        }

        const result = await ReportController.getLeaveRequestsReport(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "leave-balances": {
        // Get leave balances report
        // Required permissions: HR, ADMIN, or MANAGER
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN") &&
          !user.permissions?.includes("MANAGER")
        ) {
          return errorResponse(
            "Unauthorized to view leave balances report",
            null,
            403
          )
        }

        const result = await ReportController.getLeaveBalancesReport(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "approvals-sla": {
        // Get approvals SLA report
        // Required permissions: HR, ADMIN, or MANAGER
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN") &&
          !user.permissions?.includes("MANAGER")
        ) {
          return errorResponse(
            "Unauthorized to view approvals SLA report",
            null,
            403
          )
        }

        const result = await ReportController.getApprovalsSlAReport(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "utilization": {
        // Get utilization report
        // Required permissions: HR, ADMIN, or MANAGER
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN") &&
          !user.permissions?.includes("MANAGER")
        ) {
          return errorResponse(
            "Unauthorized to view utilization report",
            null,
            403
          )
        }

        const result = await ReportController.getUtilizationReport(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "department-summary": {
        // Get department summary report
        // Required permissions: HR, ADMIN, or MANAGER
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN") &&
          !user.permissions?.includes("MANAGER")
        ) {
          return errorResponse(
            "Unauthorized to view department summary report",
            null,
            403
          )
        }

        const result = await ReportController.getDepartmentSummaryReport(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      case "year-end": {
        // Get year-end report
        // Required permissions: HR or ADMIN only (more sensitive than other reports)
        if (
          !user.permissions?.includes("HR") &&
          !user.permissions?.includes("ADMIN")
        ) {
          return errorResponse(
            "Unauthorized to view year-end report. Only HR and Admin can access this report",
            null,
            403
          )
        }

        const result = await ReportController.getYearEndReport(req)
        
        if (result.status === "validation_error") {
          return validationErrorResponse(result.message, result.errors || [])
        }
        
        return result.status === "success"
          ? successResponse(result.message, result.data)
          : errorResponse(result.message, null, 500)
      }

      default:
        return errorResponse(
          "Invalid operation. Valid operations: leave-requests, leave-balances, approvals-sla, utilization, department-summary, year-end",
          null,
          400
        )
    }
  } catch (error) {
    console.error("Reports loader error:", error)
    const message = error instanceof Error ? error.message : "An error occurred"
    return errorResponse(message, null, 500)
  }
}
