import { Request } from "express"
import AuditLog from "../models/audit-log.model"
import { 
    successResponseObject, 
    errorResponseObject, 
    validationErrorResponseObject 
} from "../utils/api-utils"
import { AuditAction, ResponseObject } from "../utils/types"

export class AuditLogController {
    /**
     * Create an audit log entry
     * Used internally by other controllers/services to log actions
     */
    static async createAuditLog(data: {
        action: AuditAction
        entityType: string
        entityId: string
        performedBy: string
        performedByName?: string
        performedByEmail?: string
        description?: string
        changes?: Array<{
            field: string
            oldValue: any
            newValue: any
            fieldLabel?: string
        }>
        metadata?: Record<string, any>
        ipAddress?: string
        userAgent?: string
        status?: "success" | "failed"
        errorMessage?: string
    }): Promise<void> {
        try {
            await AuditLog.logAction(data)
        } catch (error) {
            // Log the error but don't throw - audit logging failure shouldn't break operations
            console.error("Failed to create audit log:", error)
        }
    }

    /**
     * Get paginated audit logs with filters
     * GET /api/audit-logs
     */
    static async getAuditLogs(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 50,
                action,
                entityType,
                performedBy,
                startDate,
                endDate
            } = req.query

            // Validate pagination parameters
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))

            // Build query
            const query: any = {}
            
            if (action) {
                query.action = action
            }
            
            if (entityType) {
                query.entityType = entityType
            }
            
            if (performedBy) {
                query.performedBy = performedBy
            }
            
            // Date range filter
            if (startDate || endDate) {
                query.createdAt = {}
                if (startDate) {
                    const start = new Date(startDate as string)
                    if (!isNaN(start.getTime())) {
                        query.createdAt.$gte = start
                    }
                }
                if (endDate) {
                    const end = new Date(endDate as string)
                    if (!isNaN(end.getTime())) {
                        // Set to end of day
                        end.setHours(23, 59, 59, 999)
                        query.createdAt.$lte = end
                    }
                }
            }

            // Calculate pagination
            const skip = (pageNum - 1) * limitNum
            
            // Get total count for pagination metadata
            const totalCount = await AuditLog.countDocuments(query)
            
            // Fetch audit logs
            const auditLogs = await AuditLog.find(query)
                .sort({ createdAt: -1 })
                .limit(limitNum)
                .skip(skip)
                .lean()

            // Prepare response with pagination metadata
            const response = {
                auditLogs,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalCount / limitNum),
                    totalRecords: totalCount,
                    recordsPerPage: limitNum
                }
            }

            return successResponseObject("Audit logs retrieved successfully", response)
        } catch (error) {
            console.error("Error fetching audit logs:", error)
            return errorResponseObject("Failed to retrieve audit logs")
        }
    }

    /**
     * Get user activity logs
     * GET /api/audit-logs/user/:userId
     */
    static async getUserActivity(req: Request, userId: string): Promise<ResponseObject> {
        try {
            const { 
                limit = 50, 
                skip = 0,
                startDate,
                endDate
            } = req.query

            // Validate userId
            if (!userId) {
                return validationErrorResponseObject(
                    "Validation failed",
                    [{ field: "userId", message: "User ID is required" }]
                )
            }

            // Parse dates if provided
            const options: any = {
                limit: Math.min(100, Math.max(1, Number(limit))),
                skip: Math.max(0, Number(skip))
            }

            if (startDate) {
                const start = new Date(startDate as string)
                if (!isNaN(start.getTime())) {
                    options.startDate = start
                }
            }

            if (endDate) {
                const end = new Date(endDate as string)
                if (!isNaN(end.getTime())) {
                    end.setHours(23, 59, 59, 999)
                    options.endDate = end
                }
            }

            // Use the model's static method
            const userActivity = await AuditLog.getUserActivity(userId, options)

            return successResponseObject(
                "User activity retrieved successfully",
                userActivity
            )
        } catch (error) {
            console.error("Error fetching user activity:", error)
            return errorResponseObject("Failed to retrieve user activity")
        }
    }

    /**
     * Get entity history
     * GET /api/audit-logs/entity/:entityType/:entityId
     */
    static async getEntityHistory(req: Request, entityType: string, entityId: string): Promise<ResponseObject> {
        try {
            const { 
                limit = 50, 
                skip = 0 
            } = req.query

            // Validate required parameters
            const errors = []
            if (!entityType) {
                errors.push({ field: "entityType", message: "Entity type is required" })
            }
            if (!entityId) {
                errors.push({ field: "entityId", message: "Entity ID is required" })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject("Validation failed", errors)
            }

            // Parse pagination options
            const options = {
                limit: Math.min(100, Math.max(1, Number(limit))),
                skip: Math.max(0, Number(skip))
            }

            // Use the model's static method
            const entityHistory = await AuditLog.getEntityHistory(
                entityType,
                entityId,
                options
            )

            return successResponseObject(
                "Entity history retrieved successfully",
                entityHistory
            )
        } catch (error) {
            console.error("Error fetching entity history:", error)
            return errorResponseObject("Failed to retrieve entity history")
        }
    }
}

export default AuditLogController
