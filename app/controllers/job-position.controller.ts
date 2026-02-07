import { Request } from "express"
import JobPosition from "../models/job-position.model"
import Department from "../models/department.model"
import StaffContract from "../models/staff-contract.model"
import Staff from "../models/staff.model"
import AuditLogController from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { AuditAction, ResponseObject, ContractStatus } from "../utils/types"

export class JobPositionController {
    /**
     * Create a new job position
     * POST /api/job-positions
     */
    static async createPosition(req: Request): Promise<ResponseObject> {
        try {
            const {
                title,
                department,
                maxOccupancy = 1,
                endorserPosition,
                approverPosition,
            } = req.body
            const user = (req as any).user

            // Check if user has HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can create job positions"
                )
            }

            // Validation
            const errors = []

            if (!title || !title.trim()) {
                errors.push({
                    field: "title",
                    message: "Position title is required",
                })
            } else if (title.trim().length > 100) {
                errors.push({
                    field: "title",
                    message: "Position title cannot exceed 100 characters",
                })
            }

            if (!department) {
                errors.push({
                    field: "department",
                    message: "Department is required",
                })
            }

            if (maxOccupancy !== undefined) {
                if (!Number.isInteger(maxOccupancy) || maxOccupancy < 1) {
                    errors.push({
                        field: "maxOccupancy",
                        message: "Maximum occupancy must be a positive integer",
                    })
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Verify department exists and is active
            const departmentExists = await Department.findById(department)
            if (!departmentExists) {
                return errorResponseObject("Department not found")
            }
            if (!departmentExists.isActive) {
                return errorResponseObject(
                    "Cannot create position in inactive department"
                )
            }

            // Check for duplicate position title in department
            const existingPosition = await JobPosition.findOne({
                title: new RegExp(`^${title.trim()}$`, "i"),
                department,
            })

            if (existingPosition) {
                return errorResponseObject(
                    `Position "${title}" already exists in ${departmentExists.name} department`
                )
            }

            // Validate endorser position if provided
            if (endorserPosition) {
                const endorserExists = await JobPosition.findById(
                    endorserPosition
                )
                if (!endorserExists) {
                    return errorResponseObject(
                        "Invalid endorser position specified"
                    )
                }
                if (!endorserExists.isActive) {
                    return errorResponseObject("Endorser position is inactive")
                }
            }

            // Validate approver position if provided
            if (approverPosition) {
                const approverExists = await JobPosition.findById(
                    approverPosition
                )
                if (!approverExists) {
                    return errorResponseObject(
                        "Invalid approver position specified"
                    )
                }
                if (!approverExists.isActive) {
                    return errorResponseObject("Approver position is inactive")
                }
            }

            // Note: Same position can be both endorser and approver (single-level approval)
            // This is valid in scenarios where only one approval level is needed

            // Create position
            const positionData = {
                title: title.trim(),
                department,
                maxOccupancy,
                endorserPosition: endorserPosition || null,
                approverPosition: approverPosition || null,
                isActive: true,
                createdBy: user._id,
            }

            const position = await JobPosition.create(positionData)

            // Populate for response
            const populatedPosition = await JobPosition.findById(position._id)
                .populate("department", "name")
                .populate("endorserPosition", "title")
                .populate("approverPosition", "title")
                .populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_CREATED, // Using department action as job position specific action not defined
                entityType: "JobPosition",
                entityId: position._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created job position: ${title} in ${departmentExists.name}`,
                metadata: {
                    positionTitle: title,
                    department: departmentExists.name,
                    maxOccupancy,
                    hasEndorser: !!endorserPosition,
                    hasApprover: !!approverPosition,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Job position created successfully",
                populatedPosition
            )
        } catch (error) {
            console.error("Error creating position:", error)
            return errorResponseObject("Failed to create job position")
        }
    }

    /**
     * Update job position
     * PUT /api/job-positions/:id
     */
    static async updatePosition(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { title, maxOccupancy, endorserPosition, approverPosition } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can update job positions"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Position ID is required" },
                ])
            }

            // Find existing position
            const position = await JobPosition.findById(id)
                .populate("department", "name")
                .populate("endorserPosition", "title")
                .populate("approverPosition", "title")

            if (!position) {
                return errorResponseObject("Job position not found")
            }

            // Validation
            const errors = []
            const changes = []
            const updates: any = {}

            // Title validation and tracking
            if (title !== undefined) {
                if (!title.trim()) {
                    errors.push({
                        field: "title",
                        message: "Position title cannot be empty",
                    })
                } else if (title.trim().length > 100) {
                    errors.push({
                        field: "title",
                        message: "Position title cannot exceed 100 characters",
                    })
                } else if (title.trim() !== position.title) {
                    // Check for duplicate in same department
                    const duplicate = await JobPosition.findOne({
                        title: new RegExp(`^${title.trim()}$`, "i"),
                        department: (position.department as any)._id,
                        _id: { $ne: id },
                    })

                    if (duplicate) {
                        errors.push({
                            field: "title",
                            message: `Position "${title}" already exists in this department`,
                        })
                    } else {
                        changes.push({
                            field: "title",
                            oldValue: position.title,
                            newValue: title.trim(),
                            fieldLabel: "Position Title",
                        })
                        updates.title = title.trim()
                    }
                }
            }

            // Max occupancy validation and tracking
            if (maxOccupancy !== undefined) {
                if (!Number.isInteger(maxOccupancy) || maxOccupancy < 1) {
                    errors.push({
                        field: "maxOccupancy",
                        message: "Maximum occupancy must be a positive integer",
                    })
                } else if (maxOccupancy !== position.maxOccupancy) {
                    // Check current occupancy
                    const occupancy = await position.checkOccupancy()

                    if (maxOccupancy < occupancy.current) {
                        errors.push({
                            field: "maxOccupancy",
                            message: `Cannot reduce max occupancy below current occupancy (${occupancy.current})`,
                        })
                    } else {
                        changes.push({
                            field: "maxOccupancy",
                            oldValue: position.maxOccupancy,
                            newValue: maxOccupancy,
                            fieldLabel: "Maximum Occupancy",
                        })
                        updates.maxOccupancy = maxOccupancy
                    }
                }
            }

            // Endorser position validation and tracking
            if (endorserPosition !== undefined) {
                const currentEndorserId = (position.endorserPosition as any)?._id?.toString() ||
                    (position.endorserPosition as any)?.toString() || null
                const newEndorserId = endorserPosition || null

                if (currentEndorserId !== newEndorserId) {
                    // Validate endorser position exists if provided
                    if (newEndorserId) {
                        const endorserExists = await JobPosition.findById(newEndorserId)
                        if (!endorserExists) {
                            errors.push({
                                field: "endorserPosition",
                                message: "Endorser position not found",
                            })
                        } else if (newEndorserId === id) {
                            errors.push({
                                field: "endorserPosition",
                                message: "Position cannot endorse itself",
                            })
                        } else {
                            changes.push({
                                field: "endorserPosition",
                                oldValue: currentEndorserId,
                                newValue: newEndorserId,
                                fieldLabel: "Endorser Position",
                            })
                            updates.endorserPosition = newEndorserId
                        }
                    } else {
                        changes.push({
                            field: "endorserPosition",
                            oldValue: currentEndorserId,
                            newValue: null,
                            fieldLabel: "Endorser Position",
                        })
                        updates.endorserPosition = null
                    }
                }
            }

            // Approver position validation and tracking
            if (approverPosition !== undefined) {
                const currentApproverId = (position.approverPosition as any)?._id?.toString() ||
                    (position.approverPosition as any)?.toString() || null
                const newApproverId = approverPosition || null

                if (currentApproverId !== newApproverId) {
                    // Validate approver position exists if provided
                    if (newApproverId) {
                        const approverExists = await JobPosition.findById(newApproverId)
                        if (!approverExists) {
                            errors.push({
                                field: "approverPosition",
                                message: "Approver position not found",
                            })
                        } else if (newApproverId === id) {
                            errors.push({
                                field: "approverPosition",
                                message: "Position cannot approve itself",
                            })
                        } else {
                            changes.push({
                                field: "approverPosition",
                                oldValue: currentApproverId,
                                newValue: newApproverId,
                                fieldLabel: "Approver Position",
                            })
                            updates.approverPosition = newApproverId
                        }
                    } else {
                        changes.push({
                            field: "approverPosition",
                            oldValue: currentApproverId,
                            newValue: null,
                            fieldLabel: "Approver Position",
                        })
                        updates.approverPosition = null
                    }
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            if (Object.keys(updates).length === 0) {
                return successResponseObject("No changes to update", position)
            }

            // Update position
            const updatedPosition = await JobPosition.findByIdAndUpdate(
                id,
                updates,
                { new: true, runValidators: true }
            )
                .populate("department", "name")
                .populate("endorserPosition", "title")
                .populate("approverPosition", "title")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "JobPosition",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated job position: ${updatedPosition?.title}`,
                changes,
                metadata: {
                    positionTitle: updatedPosition?.title,
                    department: (updatedPosition?.department as any)?.name,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Job position updated successfully",
                updatedPosition
            )
        } catch (error) {
            console.error("Error updating position:", error)
            return errorResponseObject("Failed to update job position")
        }
    }

    /**
     * Get positions with search, pagination and filters
     * GET /api/job-positions
     */
    static async getPositions(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                search = "",
                department,
                status,
                hasVacancy,
                sortBy = "title",
                sortOrder = "asc",
            } = req.query

            // Validate pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Build query
            const query: any = {}

            // Free text search on title
            if (search && typeof search === "string" && search.trim()) {
                const searchTerm = search.trim()
                query.title = { $regex: searchTerm, $options: "i" }
            }

            // Filter by department
            if (department) {
                query.department = department
            }

            // Filter by status
            if (status === "active") {
                query.isActive = true
            } else if (status === "inactive") {
                query.isActive = false
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = [
                "title",
                "maxOccupancy",
                "createdAt",
                "updatedAt",
            ]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "title"
            sortOptions[sortField as string] = sortOrder === "desc" ? -1 : 1

            // Execute base query
            const [positions, totalCount] = await Promise.all([
                JobPosition.find(query)
                    .populate("department", "name")
                    .populate("endorserPosition", "title")
                    .populate("approverPosition", "title")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                JobPosition.countDocuments(query),
            ])

            // Add occupancy details
            const positionsWithOccupancy = await Promise.all(
                positions.map(async (position) => {
                    const activeContracts = await StaffContract.countDocuments({
                        position: position._id,
                        status: ContractStatus.ACTIVE,
                    })

                    const occupancy = {
                        current: activeContracts,
                        max: position.maxOccupancy,
                        available: Math.max(
                            0,
                            position.maxOccupancy - activeContracts
                        ),
                    }

                    return {
                        ...position,
                        occupancy,
                        hasVacancy: occupancy.available > 0,
                    }
                })
            )

            // Filter by vacancy if requested
            let filteredPositions = positionsWithOccupancy
            if (hasVacancy === "true") {
                filteredPositions = positionsWithOccupancy.filter(
                    (p) => p.hasVacancy
                )
            } else if (hasVacancy === "false") {
                filteredPositions = positionsWithOccupancy.filter(
                    (p) => !p.hasVacancy
                )
            }

            // Response with pagination metadata
            const response = {
                positions: filteredPositions,
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
                    department: department || null,
                    status: status || null,
                    hasVacancy: hasVacancy || null,
                },
            }

            return successResponseObject(
                "Job positions retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching positions:", error)
            return errorResponseObject("Failed to retrieve job positions")
        }
    }

    /**
     * Get specific position by ID
     * GET /api/job-positions/:id
     */
    static async getPositionById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Position ID is required" },
                ])
            }

            const position = await JobPosition.findById(id)
                .populate("department", "name description")
                .populate("endorserPosition", "title department")
                .populate("approverPosition", "title department")
                .populate("createdBy", "name email")
                .lean()

            if (!position) {
                return errorResponseObject("Job position not found")
            }

            // Get occupancy details
            const activeContracts = await StaffContract.find({
                position: id,
                status: ContractStatus.ACTIVE,
            }).populate("staff", "name staffId email")

            const occupancy = {
                current: activeContracts.length,
                max: position.maxOccupancy,
                available: Math.max(
                    0,
                    position.maxOccupancy - activeContracts.length
                ),
            }

            // Get current staff in this position
            const currentStaff = activeContracts.map((contract) => ({
                id: (contract.staff as any)._id,
                name: (contract.staff as any).name,
                staffId: (contract.staff as any).staffId,
                email: (contract.staff as any).email,
                contractStartDate: contract.startDate,
                contractEndDate: contract.endDate,
            }))

            const positionDetails = {
                ...position,
                occupancy,
                hasVacancy: occupancy.available > 0,
                currentStaff,
                approvalChain: {
                    endorser: position.endorserPosition,
                    approver: position.approverPosition,
                },
            }

            return successResponseObject(
                "Job position retrieved successfully",
                positionDetails
            )
        } catch (error) {
            console.error("Error fetching position:", error)
            return errorResponseObject("Failed to retrieve job position")
        }
    }

    /**
     * Update approval chain
     * PUT /api/job-positions/:id/approval-chain
     */
    static async updateApprovalChain(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { endorserPosition, approverPosition } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can update approval chains"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Position ID is required" },
                ])
            }

            // Find position
            const position = await JobPosition.findById(id)
            if (!position) {
                return errorResponseObject("Job position not found")
            }

            // Prevent self-referencing
            if (endorserPosition === id || approverPosition === id) {
                return errorResponseObject(
                    "A position cannot be its own endorser or approver"
                )
            }

            // Note: Same position can be both endorser and approver (single-level approval)
            // This is valid in scenarios where only one approval level is needed

            const changes = []
            const updates: any = {}

            // Validate and track endorser changes
            if (endorserPosition !== undefined) {
                if (
                    endorserPosition &&
                    endorserPosition !== position.endorserPosition?.toString()
                ) {
                    const endorserExists = await JobPosition.findById(
                        endorserPosition
                    )
                    if (!endorserExists) {
                        return errorResponseObject(
                            "Invalid endorser position specified"
                        )
                    }
                    if (!endorserExists.isActive) {
                        return errorResponseObject(
                            "Endorser position is inactive"
                        )
                    }

                    // Check for circular reference
                    if (
                        endorserExists.endorserPosition?.toString() === id ||
                        endorserExists.approverPosition?.toString() === id
                    ) {
                        return errorResponseObject(
                            "Circular reference detected in approval chain"
                        )
                    }

                    changes.push({
                        field: "endorserPosition",
                        oldValue: position.endorserPosition,
                        newValue: endorserPosition,
                        fieldLabel: "Endorser Position",
                    })
                    updates.endorserPosition = endorserPosition
                } else if (!endorserPosition && position.endorserPosition) {
                    changes.push({
                        field: "endorserPosition",
                        oldValue: position.endorserPosition,
                        newValue: null,
                        fieldLabel: "Endorser Position",
                    })
                    updates.endorserPosition = null
                }
            }

            // Validate and track approver changes
            if (approverPosition !== undefined) {
                if (
                    approverPosition &&
                    approverPosition !== position.approverPosition?.toString()
                ) {
                    const approverExists = await JobPosition.findById(
                        approverPosition
                    )
                    if (!approverExists) {
                        return errorResponseObject(
                            "Invalid approver position specified"
                        )
                    }
                    if (!approverExists.isActive) {
                        return errorResponseObject(
                            "Approver position is inactive"
                        )
                    }

                    // Check for circular reference
                    if (
                        approverExists.endorserPosition?.toString() === id ||
                        approverExists.approverPosition?.toString() === id
                    ) {
                        return errorResponseObject(
                            "Circular reference detected in approval chain"
                        )
                    }

                    changes.push({
                        field: "approverPosition",
                        oldValue: position.approverPosition,
                        newValue: approverPosition,
                        fieldLabel: "Approver Position",
                    })
                    updates.approverPosition = approverPosition
                } else if (!approverPosition && position.approverPosition) {
                    changes.push({
                        field: "approverPosition",
                        oldValue: position.approverPosition,
                        newValue: null,
                        fieldLabel: "Approver Position",
                    })
                    updates.approverPosition = null
                }
            }

            if (Object.keys(updates).length === 0) {
                return successResponseObject("No changes to update", position)
            }

            // Update position
            const updatedPosition = await JobPosition.findByIdAndUpdate(
                id,
                updates,
                { new: true }
            )
                .populate("department", "name")
                .populate("endorserPosition", "title")
                .populate("approverPosition", "title")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "JobPosition",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated approval chain for position: ${position.title}`,
                changes,
                metadata: {
                    positionTitle: position.title,
                    hasEndorser: !!updatedPosition?.endorserPosition,
                    hasApprover: !!updatedPosition?.approverPosition,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Approval chain updated successfully",
                updatedPosition
            )
        } catch (error) {
            console.error("Error updating approval chain:", error)
            return errorResponseObject("Failed to update approval chain")
        }
    }

    /**
     * Check position occupancy
     * GET /api/job-positions/:id/occupancy
     */
    static async checkOccupancy(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Position ID is required" },
                ])
            }

            const position = await JobPosition.findById(id).populate(
                "department",
                "name"
            )

            if (!position) {
                return errorResponseObject("Job position not found")
            }

            const occupancy = await position.checkOccupancy()
            const canAcceptMore = await position.canAcceptMore()

            // Get list of current occupants
            const activeContracts = await StaffContract.find({
                position: id,
                status: ContractStatus.ACTIVE,
            }).populate("staff", "name staffId email phone")

            const occupants = activeContracts.map((contract) => ({
                staff: {
                    id: (contract.staff as any)._id,
                    name: (contract.staff as any).name,
                    staffId: (contract.staff as any).staffId,
                    email: (contract.staff as any).email,
                },
                contractId: contract._id,
                startDate: contract.startDate,
                endDate: contract.endDate,
            }))

            const response = {
                position: {
                    id: position._id,
                    title: position.title,
                    department: position.department,
                },
                occupancy: {
                    ...occupancy,
                    percentage: (occupancy.current / occupancy.max) * 100,
                },
                canAcceptMore,
                occupants,
            }

            return successResponseObject(
                "Occupancy retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error checking occupancy:", error)
            return errorResponseObject("Failed to check occupancy")
        }
    }

    /**
     * Toggle position status
     * PUT /api/job-positions/:id/toggle-status
     */
    static async togglePositionStatus(
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
                    "Unauthorized. Only HR/Admin can change position status"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Position ID is required" },
                ])
            }

            // Find position
            const position = await JobPosition.findById(id)
            if (!position) {
                return errorResponseObject("Job position not found")
            }

            // Check if deactivating a position with active contracts
            if (position.isActive) {
                const activeContractsCount = await StaffContract.countDocuments(
                    {
                        position: id,
                        status: ContractStatus.ACTIVE,
                    }
                )

                if (activeContractsCount > 0) {
                    return errorResponseObject(
                        `Cannot deactivate position with ${activeContractsCount} active contracts`
                    )
                }
            }

            // Toggle status
            const newStatus = !position.isActive
            position.isActive = newStatus
            await position.save()

            // Get updated position
            const updatedPosition = await JobPosition.findById(id).populate(
                "department",
                "name"
            )

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_UPDATED,
                entityType: "JobPosition",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `${
                    newStatus ? "Activated" : "Deactivated"
                } position: ${position.title}`,
                changes: [
                    {
                        field: "isActive",
                        oldValue: !newStatus,
                        newValue: newStatus,
                        fieldLabel: "Status",
                    },
                ],
                metadata: {
                    positionTitle: position.title,
                    newStatus: newStatus ? "active" : "inactive",
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                `Position ${
                    newStatus ? "activated" : "deactivated"
                } successfully`,
                updatedPosition
            )
        } catch (error) {
            console.error("Error toggling position status:", error)
            return errorResponseObject("Failed to change position status")
        }
    }

    /**
     * Get positions by department
     * GET /api/job-positions/department/:departmentId
     */
    static async getPositionsByDepartment(
        req: Request,
        departmentId: string
    ): Promise<ResponseObject> {
        try {
            if (!departmentId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "departmentId",
                        message: "Department ID is required",
                    },
                ])
            }

            // Verify department exists
            const department = await Department.findById(departmentId)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            const positions = await JobPosition.find({
                department: departmentId,
                isActive: true,
            })
                .populate("endorserPosition", "title")
                .populate("approverPosition", "title")
                .sort({ title: 1 })
                .lean()

            // Add occupancy for each position
            const positionsWithOccupancy = await Promise.all(
                positions.map(async (position) => {
                    const activeContracts = await StaffContract.countDocuments({
                        position: position._id,
                        status: ContractStatus.ACTIVE,
                    })

                    return {
                        ...position,
                        occupancy: {
                            current: activeContracts,
                            max: position.maxOccupancy,
                            available: Math.max(
                                0,
                                position.maxOccupancy - activeContracts
                            ),
                        },
                    }
                })
            )

            const response = {
                department: {
                    id: department._id,
                    name: department.name,
                },
                totalPositions: positionsWithOccupancy.length,
                totalSlots: positionsWithOccupancy.reduce(
                    (sum, p) => sum + p.maxOccupancy,
                    0
                ),
                totalOccupied: positionsWithOccupancy.reduce(
                    (sum, p) => sum + p.occupancy.current,
                    0
                ),
                totalAvailable: positionsWithOccupancy.reduce(
                    (sum, p) => sum + p.occupancy.available,
                    0
                ),
                positions: positionsWithOccupancy,
            }

            return successResponseObject(
                "Department positions retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching department positions:", error)
            return errorResponseObject(
                "Failed to retrieve department positions"
            )
        }
    }

    /**
     * Get available positions (with vacancies)
     * GET /api/job-positions/available
     */
    static async getAvailablePositions(req: Request): Promise<ResponseObject> {
        try {
            const { department } = req.query

            const query: any = { isActive: true }
            if (department) {
                query.department = department
            }

            const positions = await JobPosition.find(query)
                .populate("department", "name")
                .populate("endorserPosition", "title")
                .populate("approverPosition", "title")
                .lean()

            // Filter positions with available slots
            const availablePositions = []
            for (const position of positions) {
                const activeContracts = await StaffContract.countDocuments({
                    position: position._id,
                    status: ContractStatus.ACTIVE,
                })

                const available = position.maxOccupancy - activeContracts
                if (available > 0) {
                    availablePositions.push({
                        ...position,
                        occupancy: {
                            current: activeContracts,
                            max: position.maxOccupancy,
                            available,
                        },
                    })
                }
            }

            // Sort by available slots (most available first)
            availablePositions.sort(
                (a, b) => b.occupancy.available - a.occupancy.available
            )

            return successResponseObject(
                "Available positions retrieved successfully",
                {
                    totalPositions: availablePositions.length,
                    totalAvailableSlots: availablePositions.reduce(
                        (sum, p) => sum + p.occupancy.available,
                        0
                    ),
                    positions: availablePositions,
                }
            )
        } catch (error) {
            console.error("Error fetching available positions:", error)
            return errorResponseObject("Failed to retrieve available positions")
        }
    }

    /**
     * Delete job position
     * DELETE /api/job-positions/:id
     */
    static async deletePosition(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { forceDelete = false } = req.query
            const user = (req as any).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can delete job positions"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Position ID is required" },
                ])
            }

            // Find position
            const position = await JobPosition.findById(id)
            if (!position) {
                return errorResponseObject("Job position not found")
            }

            // Check for active contracts
            const activeContractsCount = await StaffContract.countDocuments({
                position: id,
                status: ContractStatus.ACTIVE,
            })

            if (activeContractsCount > 0 && forceDelete !== "true") {
                return errorResponseObject(
                    `Cannot delete position with ${activeContractsCount} active contracts. ` +
                        `Use forceDelete=true to override or deactivate instead.`
                )
            }

            // Check if other positions depend on this for approval chain
            const dependentPositions = await JobPosition.find({
                $or: [{ endorserPosition: id }, { approverPosition: id }],
            })

            if (dependentPositions.length > 0) {
                const dependentNames = dependentPositions
                    .map((p) => p.title)
                    .join(", ")
                return errorResponseObject(
                    `Cannot delete position used in approval chain by: ${dependentNames}. ` +
                        `Update their approval chains first.`
                )
            }

            let actionTaken = ""

            if (forceDelete === "true") {
                // Hard delete
                await JobPosition.findByIdAndDelete(id)
                actionTaken = "deleted"
            } else {
                // Soft delete (deactivate)
                position.isActive = false
                await position.save()
                actionTaken = "deactivated"
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DEPARTMENT_DELETED,
                entityType: "JobPosition",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `${
                    actionTaken === "deleted" ? "Deleted" : "Deactivated"
                } position: ${position.title}`,
                metadata: {
                    positionTitle: position.title,
                    actionType: actionTaken,
                    forceDelete: forceDelete === "true",
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                `Position ${actionTaken} successfully`,
                { id, title: position.title, action: actionTaken }
            )
        } catch (error) {
            console.error("Error deleting position:", error)
            return errorResponseObject("Failed to delete job position")
        }
    }

    /**
     * Get approval chain report
     * GET /api/job-positions/approval-chain-report
     */
    static async getApprovalChainReport(req: Request): Promise<ResponseObject> {
        try {
            const { department } = req.query

            const query: any = { isActive: true }
            if (department) {
                query.department = department
            }

            const positions = await JobPosition.find(query)
                .populate("department", "name")
                .populate("endorserPosition", "title department")
                .populate("approverPosition", "title department")
                .lean()

            // Group by department
            const chainsByDepartment: any = {}

            for (const position of positions) {
                const deptName = (position.department as any).name

                if (!chainsByDepartment[deptName]) {
                    chainsByDepartment[deptName] = {
                        departmentId: (position.department as any)._id,
                        departmentName: deptName,
                        positions: [],
                    }
                }

                chainsByDepartment[deptName].positions.push({
                    id: position._id,
                    title: position.title,
                    endorser: position.endorserPosition
                        ? {
                              id: (position.endorserPosition as any)._id,
                              title: (position.endorserPosition as any).title,
                              department: (position.endorserPosition as any)
                                  .department?.name,
                          }
                        : null,
                    approver: position.approverPosition
                        ? {
                              id: (position.approverPosition as any)._id,
                              title: (position.approverPosition as any).title,
                              department: (position.approverPosition as any)
                                  .department?.name,
                          }
                        : null,
                    hasCompleteChain: !!(
                        position.endorserPosition && position.approverPosition
                    ),
                    hasPartialChain: !!(
                        position.endorserPosition || position.approverPosition
                    ),
                    hasNoChain: !(
                        position.endorserPosition || position.approverPosition
                    ),
                })
            }

            // Convert to array and add statistics
            const report = Object.values(chainsByDepartment).map(
                (dept: any) => ({
                    ...dept,
                    statistics: {
                        totalPositions: dept.positions.length,
                        withCompleteChain: dept.positions.filter(
                            (p: any) => p.hasCompleteChain
                        ).length,
                        withPartialChain: dept.positions.filter(
                            (p: any) => p.hasPartialChain && !p.hasCompleteChain
                        ).length,
                        withNoChain: dept.positions.filter(
                            (p: any) => p.hasNoChain
                        ).length,
                    },
                })
            )

            const summary = {
                totalDepartments: report.length,
                totalPositions: positions.length,
                positionsWithCompleteChain: positions.filter(
                    (p) => p.endorserPosition && p.approverPosition
                ).length,
                positionsWithPartialChain: positions.filter(
                    (p) =>
                        (p.endorserPosition || p.approverPosition) &&
                        !(p.endorserPosition && p.approverPosition)
                ).length,
                positionsWithNoChain: positions.filter(
                    (p) => !p.endorserPosition && !p.approverPosition
                ).length,
            }

            return successResponseObject(
                "Approval chain report generated successfully",
                {
                    summary,
                    departments: report,
                }
            )
        } catch (error) {
            console.error("Error generating approval chain report:", error)
            return errorResponseObject(
                "Failed to generate approval chain report"
            )
        }
    }
}

export default JobPositionController
