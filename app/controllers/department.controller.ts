import { Request } from "express"
import Department from "../models/department.model"
import Staff from "../models/staff.model"
import JobPosition from "../models/job-position.model"
import AuditLogController from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { AuditAction, ResponseObject } from "../utils/types"

export class DepartmentController {
    /**
     * Create a new department
     * POST /api/departments
     */
    static async createDepartment(req: Request): Promise<ResponseObject> {
        try {
            const { name, description, head } = req.body
            const user = (req as any).user // Assuming auth middleware adds user

            // Check if user has HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can create departments"
                )
            }

            // Validation
            const errors = []
            if (!name || !name.trim()) {
                errors.push({
                    field: "name",
                    message: "Department name is required",
                })
            } else if (name.trim().length > 100) {
                errors.push({
                    field: "name",
                    message: "Department name cannot exceed 100 characters",
                })
            }

            if (description && description.length > 500) {
                errors.push({
                    field: "description",
                    message: "Description cannot exceed 500 characters",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Check for duplicate department name
            const existingDept = await Department.findByName(name.trim())
            if (existingDept) {
                return errorResponseObject(
                    `Department with name "${name}" already exists`
                )
            }

            // If head is provided, verify the staff exists
            if (head) {
                const staffExists = await Staff.findById(head)
                if (!staffExists) {
                    return validationErrorResponseObject("Validation failed", [
                        {
                            field: "head",
                            message: "Selected staff member not found",
                        },
                    ])
                }

                // Check if staff is already head of another department
                const existingHeadDept = await Department.getDepartmentByHead(
                    head
                )
                if (existingHeadDept) {
                    return errorResponseObject(
                        `Staff is already head of ${existingHeadDept.name} department`
                    )
                }
            }

            // Create department
            const departmentData: any = {
                name: name.trim(),
                description: description?.trim() || null,
                head: head || null,
                isActive: true,
                createdBy: user._id,
            }

            const department = await Department.create(departmentData)

            // Populate head information
            const populatedDept = await Department.findById(department._id)
                .populate("head", "name email staffId")
                .populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_CREATED,
                entityType: "Department",
                entityId: department._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created department: ${name}`,
                metadata: {
                    departmentName: name,
                    hasHead: !!head,
                    headId: head || null,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Department created successfully",
                populatedDept
            )
        } catch (error) {
            console.error("Error creating department:", error)
            return errorResponseObject("Failed to create department")
        }
    }

    /**
     * Get departments with search, pagination and filters
     * GET /api/departments
     */
    static async getDepartments(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                search = "",
                status,
                hasHead,
                includeInactive = false,
                sortBy = "name",
                sortOrder = "asc",
            } = req.query

            // Validate pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Build query
            const query: any = {}

            // Free text search on name and description
            if (search && typeof search === "string" && search.trim()) {
                const searchTerm = search.trim()
                query.$or = [
                    { name: { $regex: searchTerm, $options: "i" } },
                    { description: { $regex: searchTerm, $options: "i" } },
                ]
            }

            // Filter by status
            if (status === "active") {
                query.isActive = true
            } else if (status === "inactive") {
                query.isActive = false
            } else if (!includeInactive || includeInactive === "false") {
                // By default, only show active departments unless explicitly requested
                query.isActive = true
            }

            // Filter by hasHead
            if (hasHead === "true") {
                query.head = { $ne: null }
            } else if (hasHead === "false") {
                query.head = null
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = [
                "name",
                "createdAt",
                "updatedAt",
                "isActive",
            ]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "name"
            sortOptions[sortField as string] = sortOrder === "desc" ? -1 : 1

            // Execute queries
            const [departments, totalCount] = await Promise.all([
                Department.find(query)
                    .populate("head", "name email staffId phone")
                    .populate("createdBy", "name email")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                Department.countDocuments(query),
            ])

            // Add computed fields and get staff counts
            const departmentsWithStats = await Promise.all(
                departments.map(async (dept) => {
                    // Get staff count for this department
                    const staffCount = await Staff.countDocuments({
                        department: dept._id,
                        status: "active",
                    })

                    // Get job positions count
                    const positionsCount = await JobPosition.countDocuments({
                        department: dept._id,
                        isActive: true,
                    })

                    return {
                        ...dept,
                        hasHead: !!dept.head,
                        status: dept.isActive ? "active" : "inactive",
                        staffCount,
                        positionsCount,
                    }
                })
            )

            // Response with pagination metadata
            const response = {
                departments: departmentsWithStats,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalCount / limitNum),
                    totalRecords: totalCount,
                    recordsPerPage: limitNum,
                    hasNext: skip + limitNum < totalCount,
                    hasPrev: pageNum > 1,
                },
                filters: {
                    search: search || null,
                    status: status || null,
                    hasHead: hasHead || null,
                    includeInactive: includeInactive === "true",
                },
            }

            return successResponseObject(
                "Departments retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching departments:", error)
            return errorResponseObject("Failed to retrieve departments")
        }
    }

    /**
     * Get specific department by ID
     * GET /api/departments/:id
     */
    static async getDepartmentById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Department ID is required" },
                ])
            }

            const department = await Department.findById(id)
                .populate("head", "name email staffId phone department")
                .populate("createdBy", "name email")
                .lean()

            if (!department) {
                return errorResponseObject("Department not found")
            }

            // Get additional statistics
            const [staffCount, positionsCount, activeStaff] = await Promise.all(
                [
                    Staff.countDocuments({ department: id }),
                    JobPosition.countDocuments({ department: id }),
                    Staff.find({
                        department: id,
                        status: "active",
                    })
                        .select("name email staffId")
                        .limit(10)
                        .lean(),
                ]
            )

            const departmentWithStats = {
                ...department,
                hasHead: !!department.head,
                status: department.isActive ? "active" : "inactive",
                statistics: {
                    totalStaff: staffCount,
                    totalPositions: positionsCount,
                    recentStaff: activeStaff,
                },
            }

            return successResponseObject(
                "Department retrieved successfully",
                departmentWithStats
            )
        } catch (error) {
            console.error("Error fetching department:", error)
            return errorResponseObject("Failed to retrieve department")
        }
    }

    /**
     * Update a department
     * PUT /api/departments/:id
     */
    static async updateDepartment(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { name, description } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can update departments"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Department ID is required" },
                ])
            }

            // Find existing department
            const department = await Department.findById(id)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            // Validation
            const errors = []
            if (name !== undefined) {
                if (!name.trim()) {
                    errors.push({
                        field: "name",
                        message: "Department name cannot be empty",
                    })
                } else if (name.trim().length > 100) {
                    errors.push({
                        field: "name",
                        message: "Department name cannot exceed 100 characters",
                    })
                } else if (name.trim() !== department.name) {
                    // Check for duplicate name if changing
                    const existingDept = await Department.findByName(
                        name.trim()
                    )
                    if (existingDept && existingDept._id.toString() !== id) {
                        errors.push({
                            field: "name",
                            message: `Department with name "${name}" already exists`,
                        })
                    }
                }
            }

            if (description !== undefined && description.length > 500) {
                errors.push({
                    field: "description",
                    message: "Description cannot exceed 500 characters",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Track changes for audit log
            const changes = []
            const updates: any = {}

            if (name && name.trim() !== department.name) {
                changes.push({
                    field: "name",
                    oldValue: department.name,
                    newValue: name.trim(),
                    fieldLabel: "Department Name",
                })
                updates.name = name.trim()
            }

            if (description !== undefined) {
                const newDesc = description?.trim() || null
                if (newDesc !== department.description) {
                    changes.push({
                        field: "description",
                        oldValue: department.description || "",
                        newValue: newDesc || "",
                        fieldLabel: "Description",
                    })
                    updates.description = newDesc
                }
            }

            if (Object.keys(updates).length === 0) {
                return successResponseObject("No changes to update", department)
            }

            // Update department
            const updatedDepartment = await Department.findByIdAndUpdate(
                id,
                updates,
                { new: true, runValidators: true }
            )
                .populate("head", "name email staffId")
                .populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "Department",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated department: ${updatedDepartment?.name}`,
                changes,
                metadata: { departmentName: updatedDepartment?.name },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Department updated successfully",
                updatedDepartment
            )
        } catch (error) {
            console.error("Error updating department:", error)
            return errorResponseObject("Failed to update department")
        }
    }

    /**
     * Assign or change department head
     * PUT /api/departments/:id/assign-head
     */
    static async assignDepartmentHead(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { staffId } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can assign department heads"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Department ID is required" },
                ])
            }

            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            // Find department
            const department = await Department.findById(id)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            // Verify staff exists
            const staff = await Staff.findById(staffId)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Check if staff is already head of another department
            const existingHeadDept = await Department.getDepartmentByHead(
                staffId
            )
            if (existingHeadDept && existingHeadDept._id.toString() !== id) {
                return errorResponseObject(
                    `Staff is already head of ${existingHeadDept.name} department`
                )
            }

            const oldHead = department.head

            // Assign the new head
            department.head = staffId
            await department.save()

            // Populate the updated department
            const updatedDepartment = await Department.findById(id)
                .populate("head", "name email staffId")
                .populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "Department",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Assigned ${staff.name} as head of ${department.name} department`,
                changes: [
                    {
                        field: "head",
                        oldValue: oldHead,
                        newValue: staffId,
                        fieldLabel: "Department Head",
                    },
                ],
                metadata: {
                    departmentName: department.name,
                    newHeadName: staff.name,
                    oldHeadId: oldHead,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Department head assigned successfully",
                updatedDepartment
            )
        } catch (error) {
            console.error("Error assigning department head:", error)
            return errorResponseObject("Failed to assign department head")
        }
    }

    /**
     * Remove department head
     * PUT /api/departments/:id/remove-head
     */
    static async removeDepartmentHead(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can remove department heads"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Department ID is required" },
                ])
            }

            // Find department
            const department = await Department.findById(id).populate(
                "head",
                "name"
            )

            if (!department) {
                return errorResponseObject("Department not found")
            }

            if (!department.head) {
                return errorResponseObject("Department has no head to remove")
            }

            const oldHead = {
                id: (department.head as any)._id,
                name: (department.head as any).name,
            }

            // Remove the head
            department.head = undefined
            await department.save()

            // Get updated department
            const updatedDepartment = await Department.findById(id).populate(
                "createdBy",
                "name email"
            )

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "Department",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Removed ${oldHead.name} as head of ${department.name} department`,
                changes: [
                    {
                        field: "head",
                        oldValue: oldHead.id,
                        newValue: null,
                        fieldLabel: "Department Head",
                    },
                ],
                metadata: {
                    departmentName: department.name,
                    removedHeadName: oldHead.name,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Department head removed successfully",
                updatedDepartment
            )
        } catch (error) {
            console.error("Error removing department head:", error)
            return errorResponseObject("Failed to remove department head")
        }
    }

    /**
     * Toggle department status (activate/deactivate)
     * PUT /api/departments/:id/toggle-status
     */
    static async toggleDepartmentStatus(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can change department status"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Department ID is required" },
                ])
            }

            // Find department
            const department = await Department.findById(id)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            // Check if deactivating a department with active staff
            if (department.isActive) {
                const activeStaffCount = await Staff.countDocuments({
                    department: id,
                    status: "active",
                })

                if (activeStaffCount > 0) {
                    return errorResponseObject(
                        `Cannot deactivate department with ${activeStaffCount} active staff members`
                    )
                }
            }

            // Toggle status
            const newStatus = !department.isActive
            department.isActive = newStatus
            await department.save()

            // Get updated department
            const updatedDepartment = await Department.findById(id)
                .populate("head", "name email staffId")
                .populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "Department",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `${
                    newStatus ? "Activated" : "Deactivated"
                } department: ${department.name}`,
                changes: [
                    {
                        field: "isActive",
                        oldValue: !newStatus,
                        newValue: newStatus,
                        fieldLabel: "Status",
                    },
                ],
                metadata: {
                    departmentName: department.name,
                    newStatus: newStatus ? "active" : "inactive",
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                `Department ${
                    newStatus ? "activated" : "deactivated"
                } successfully`,
                updatedDepartment
            )
        } catch (error) {
            console.error("Error toggling department status:", error)
            return errorResponseObject("Failed to change department status")
        }
    }

    /**
     * Delete a department
     * DELETE /api/departments/:id
     */
    static async deleteDepartment(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { forceDelete = false } = req.query
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can delete departments"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Department ID is required" },
                ])
            }

            // Find department
            const department = await Department.findById(id)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            // Check for dependencies
            const [staffCount, positionsCount] = await Promise.all([
                Staff.countDocuments({ department: id }),
                JobPosition.countDocuments({ department: id }),
            ])

            if (staffCount > 0 || positionsCount > 0) {
                const dependencies = []
                if (staffCount > 0)
                    dependencies.push(`${staffCount} staff members`)
                if (positionsCount > 0)
                    dependencies.push(`${positionsCount} job positions`)

                return errorResponseObject(
                    `Cannot delete department with existing dependencies: ${dependencies.join(
                        ", "
                    )}. ` + `Please reassign or remove them first.`
                )
            }

            let actionTaken = ""

            if (forceDelete === "true") {
                // Hard delete
                await Department.findByIdAndDelete(id)
                actionTaken = "deleted"
            } else {
                // Soft delete (deactivate)
                department.isActive = false
                await department.save()
                actionTaken = "deactivated"
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_DELETED,
                entityType: "Department",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `${
                    actionTaken === "deleted" ? "Deleted" : "Deactivated"
                } department: ${department.name}`,
                metadata: {
                    departmentName: department.name,
                    actionType: actionTaken,
                    forceDelete: forceDelete === "true",
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                `Department ${actionTaken} successfully`,
                { id, name: department.name, action: actionTaken }
            )
        } catch (error) {
            console.error("Error deleting department:", error)
            return errorResponseObject("Failed to delete department")
        }
    }

    /**
     * Get department statistics
     * GET /api/departments/statistics
     */
    static async getDepartmentStatistics(
        req: Request
    ): Promise<ResponseObject> {
        try {
            const departments = await Department.find({ isActive: true }).lean()

            const statistics = await Promise.all(
                departments.map(async (dept) => {
                    const [staffCount, positionsCount, onLeaveCount] =
                        await Promise.all([
                            Staff.countDocuments({
                                department: dept._id,
                                status: "active",
                            }),
                            JobPosition.countDocuments({
                                department: dept._id,
                                isActive: true,
                            }),
                            Staff.countDocuments({
                                department: dept._id,
                                isOnLeave: true,
                            }),
                        ])

                    return {
                        departmentId: dept._id,
                        departmentName: dept.name,
                        hasHead: !!dept.head,
                        staffCount,
                        positionsCount,
                        onLeaveCount,
                        utilizationRate:
                            positionsCount > 0
                                ? (staffCount / positionsCount) * 100
                                : 0,
                    }
                })
            )

            const summary = {
                totalDepartments: departments.length,
                departmentsWithHeads: statistics.filter((d) => d.hasHead)
                    .length,
                totalStaff: statistics.reduce(
                    (sum, d) => sum + d.staffCount,
                    0
                ),
                totalPositions: statistics.reduce(
                    (sum, d) => sum + d.positionsCount,
                    0
                ),
                totalOnLeave: statistics.reduce(
                    (sum, d) => sum + d.onLeaveCount,
                    0
                ),
                departments: statistics,
            }

            return successResponseObject(
                "Department statistics retrieved successfully",
                summary
            )
        } catch (error) {
            console.error("Error fetching department statistics:", error)
            return errorResponseObject(
                "Failed to retrieve department statistics"
            )
        }
    }
}

export default DepartmentController
