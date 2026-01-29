import { Request } from "express"
import StaffContract from "../models/staff-contract.model"
import Staff from "../models/staff.model"
import JobPosition from "../models/job-position.model"
import Department from "../models/department.model"
import LeaveBalance from "../models/leave-balance.model"
import AuditLogController from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import {
    AuditAction,
    ResponseObject,
    ContractStatus,
    LeaveTypes,
    AccountStatus,
    Gender,
    LEAVE_CAPS,
} from "../utils/types"

export class StaffContractController {
    /**
     * Create a new contract
     * POST /api/contracts
     */
    static async createContract(req: Request): Promise<ResponseObject> {
        try {
            const {
                staff,
                position,
                startDate,
                endDate,
                salary,
                currency = "USD",
            } = req.body
            const user = (req as any).user

            // Check if user has HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can create contracts"
                )
            }

            // Validation
            const errors = []

            if (!staff) {
                errors.push({ field: "staff", message: "Staff is required" })
            }

            if (!position) {
                errors.push({
                    field: "position",
                    message: "Position is required",
                })
            }

            if (!startDate) {
                errors.push({
                    field: "startDate",
                    message: "Start date is required",
                })
            }

            if (!endDate) {
                errors.push({
                    field: "endDate",
                    message: "End date is required for fixed-term contracts",
                })
            }

            // Date validation
            if (startDate && endDate) {
                const start = new Date(startDate)
                const end = new Date(endDate)

                if (isNaN(start.getTime())) {
                    errors.push({
                        field: "startDate",
                        message: "Invalid start date format",
                    })
                }

                if (isNaN(end.getTime())) {
                    errors.push({
                        field: "endDate",
                        message: "Invalid end date format",
                    })
                }

                if (start >= end) {
                    errors.push({
                        field: "endDate",
                        message: "End date must be after start date",
                    })
                }
            }

            if (salary !== undefined && salary !== null) {
                if (typeof salary !== "number" || salary < 0) {
                    errors.push({
                        field: "salary",
                        message: "Salary must be a positive number",
                    })
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Check if staff exists and is active
            const staffMember = await Staff.findById(staff)
            if (!staffMember) {
                return errorResponseObject("Staff member not found")
            }
            if (staffMember.status !== AccountStatus.ACTIVE) {
                return errorResponseObject(
                    "Cannot create contract for inactive staff"
                )
            }

            // Check if staff already has an active or pending contract
            const existingContract = await StaffContract.findOne({
                staff,
                status: {
                    $in: [ContractStatus.ACTIVE, ContractStatus.PENDING],
                },
            })

            if (existingContract) {
                const statusText =
                    existingContract.status === ContractStatus.ACTIVE
                        ? "active"
                        : "pending"
                return errorResponseObject(
                    `Staff already has an ${statusText} contract. One contract rule applies.`
                )
            }

            // Check position exists and is active
            const jobPosition = await JobPosition.findById(position).populate(
                "department",
                "name"
            )

            if (!jobPosition) {
                return errorResponseObject("Position not found")
            }
            if (!jobPosition.isActive) {
                return errorResponseObject("Cannot assign to inactive position")
            }

            // Check if position's department matches staff's department
            if (staffMember.department.toString() !== jobPosition.department._id.toString()) {
                return errorResponseObject(
                    `Cannot assign staff to position in different department. ` +
                    `Staff belongs to their assigned department, ` +
                    `but position "${jobPosition.title}" is in ${(jobPosition.department as any).name} department`
                )
            }

            // Check position availability
            const canAcceptMore = await jobPosition.canAcceptMore()
            if (!canAcceptMore) {
                return errorResponseObject(
                    `Position "${jobPosition.title}" has reached maximum occupancy`
                )
            }

            // Determine initial status based on start date
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const contractStartDate = new Date(startDate)
            contractStartDate.setHours(0, 0, 0, 0)

            const initialStatus =
                contractStartDate > today
                    ? ContractStatus.PENDING
                    : ContractStatus.ACTIVE

            // Create contract
            const contractData = {
                staff,
                position,
                startDate: contractStartDate,
                endDate: new Date(endDate),
                status: initialStatus,
                salary: salary || null,
                currency,
                createdBy: user._id,
            }

            const contract = await StaffContract.create(contractData)

            // If contract is immediately active, initialize leave balances
            if (initialStatus === ContractStatus.ACTIVE) {
                await this.initializeLeaveBalances(
                    staff,
                    contractStartDate.getFullYear(),
                    staffMember.gender
                )
            }

            // Populate for response
            const populatedContract = await StaffContract.findById(contract._id)
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_CREATED, // Using staff action as contract specific not defined
                entityType: "StaffContract",
                entityId: contract._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created ${initialStatus.toLowerCase()} contract for ${
                    staffMember.name
                } - ${jobPosition.title}`,
                metadata: {
                    staffName: staffMember.name,
                    staffId: staffMember.staffId,
                    position: jobPosition.title,
                    department: (jobPosition.department as any).name,
                    startDate: contractStartDate,
                    endDate: new Date(endDate),
                    status: initialStatus,
                    hasSalary: !!salary,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Contract created successfully",
                populatedContract
            )
        } catch (error) {
            console.error("Error creating contract:", error)
            return errorResponseObject("Failed to create contract")
        }
    }

    /**
     * Update contract details
     * PUT /api/contracts/:id
     */
    static async updateContract(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { salary, endDate } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can update contracts"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Contract ID is required" },
                ])
            }

            // Find existing contract
            const contract = await StaffContract.findById(id)
                .populate("staff", "name staffId")
                .populate("position", "title")

            if (!contract) {
                return errorResponseObject("Contract not found")
            }

            // Prevent updates to terminated/expired contracts
            if (
                contract.status === ContractStatus.CANCELLED ||
                contract.status === ContractStatus.EXPIRED
            ) {
                return errorResponseObject(
                    `Cannot update ${contract.status.toLowerCase()} contract`
                )
            }

            // Validation and tracking
            const errors = []
            const changes = []
            const updates: any = {}

            // Salary update
            if (salary !== undefined) {
                if (
                    salary !== null &&
                    (typeof salary !== "number" || salary < 0)
                ) {
                    errors.push({
                        field: "salary",
                        message: "Salary must be a positive number",
                    })
                } else if (salary !== contract.salary) {
                    changes.push({
                        field: "salary",
                        oldValue: contract.salary,
                        newValue: salary,
                        fieldLabel: "Salary",
                    })
                    updates.salary = salary
                }
            }

            // End date extension (only allow extending, not shortening)
            if (endDate !== undefined) {
                const newEndDate = new Date(endDate)

                if (isNaN(newEndDate.getTime())) {
                    errors.push({
                        field: "endDate",
                        message: "Invalid end date format",
                    })
                } else {
                    const currentEndDate = contract.endDate
                        ? new Date(contract.endDate)
                        : null

                    if (!currentEndDate) {
                        errors.push({
                            field: "endDate",
                            message:
                                "Cannot set end date for permanent contract",
                        })
                    } else if (newEndDate <= contract.startDate) {
                        errors.push({
                            field: "endDate",
                            message: "End date must be after start date",
                        })
                    } else if (newEndDate < currentEndDate) {
                        errors.push({
                            field: "endDate",
                            message:
                                "Cannot shorten contract duration. Only extensions allowed.",
                        })
                    } else if (
                        newEndDate.getTime() !== currentEndDate.getTime()
                    ) {
                        changes.push({
                            field: "endDate",
                            oldValue: currentEndDate,
                            newValue: newEndDate,
                            fieldLabel: "End Date",
                        })
                        updates.endDate = newEndDate
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
                return successResponseObject("No changes to update", contract)
            }

            // Update contract
            const updatedContract = await StaffContract.findByIdAndUpdate(
                id,
                updates,
                { new: true, runValidators: true }
            )
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_UPDATED,
                entityType: "StaffContract",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated contract for ${
                    (contract.staff as any).name
                }`,
                changes,
                metadata: {
                    staffName: (contract.staff as any).name,
                    staffId: (contract.staff as any).staffId,
                    position: (contract.position as any).title,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Contract updated successfully",
                updatedContract
            )
        } catch (error) {
            console.error("Error updating contract:", error)
            return errorResponseObject("Failed to update contract")
        }
    }

    /**
     * Manually activate a pending contract
     * PUT /api/contracts/:id/activate
     */
    static async activateContract(
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
                    "Unauthorized. Only HR/Admin can activate contracts"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Contract ID is required" },
                ])
            }

            // Find contract
            const contract = await StaffContract.findById(id)
                .populate("staff", "name staffId gender")
                .populate("position", "title")

            if (!contract) {
                return errorResponseObject("Contract not found")
            }

            if (contract.status !== ContractStatus.PENDING) {
                return errorResponseObject(
                    `Cannot activate ${contract.status.toLowerCase()} contract`
                )
            }

            // Check if staff has another active contract
            const existingActive = await StaffContract.findOne({
                staff: (contract.staff as any)._id,
                status: ContractStatus.ACTIVE,
                _id: { $ne: id },
            })

            if (existingActive) {
                return errorResponseObject(
                    "Staff already has an active contract"
                )
            }

            // Check position availability
            const position = await JobPosition.findById(contract.position)
            if (!position) {
                return errorResponseObject("Position not found")
            }
            const canAcceptMore = await position.canAcceptMore()

            if (!canAcceptMore) {
                return errorResponseObject(
                    `Position "${position.title}" has reached maximum occupancy`
                )
            }

            // Activate contract
            contract.status = ContractStatus.ACTIVE
            await contract.save()

            // Initialize leave balances
            const currentYear = new Date().getFullYear()
            await this.initializeLeaveBalances(
                (contract.staff as any)._id,
                currentYear,
                (contract.staff as any).gender
            )

            // Get updated contract
            const updatedContract = await StaffContract.findById(id)
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_UPDATED,
                entityType: "StaffContract",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Activated contract for ${
                    (contract.staff as any).name
                }`,
                changes: [
                    {
                        field: "status",
                        oldValue: ContractStatus.PENDING,
                        newValue: ContractStatus.ACTIVE,
                        fieldLabel: "Status",
                    },
                ],
                metadata: {
                    staffName: (contract.staff as any).name,
                    staffId: (contract.staff as any).staffId,
                    position: (contract.position as any).title,
                    leaveBalancesInitialized: true,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Contract activated successfully",
                updatedContract
            )
        } catch (error) {
            console.error("Error activating contract:", error)
            return errorResponseObject("Failed to activate contract")
        }
    }

    /**
     * Terminate a contract early
     * PUT /api/contracts/:id/terminate
     */
    static async terminateContract(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { reason } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can terminate contracts"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Contract ID is required" },
                ])
            }

            if (!reason || !reason.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "reason",
                        message: "Termination reason is required",
                    },
                ])
            }

            // Find contract
            const contract = await StaffContract.findById(id)
                .populate("staff", "name staffId")
                .populate("position", "title")

            if (!contract) {
                return errorResponseObject("Contract not found")
            }

            // Use instance method to terminate
            try {
                await contract.terminate(user._id, reason.trim())
            } catch (error: any) {
                return errorResponseObject(error.message)
            }

            // Update staff status to inactive (since one contract rule)
            await Staff.findByIdAndUpdate(
                (contract.staff as any)._id,
                { status: AccountStatus.INACTIVE },
                { runValidators: true }
            )

            // Get updated contract
            const terminatedContract = await StaffContract.findById(id)
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate("terminatedBy", "name")

            // Generate leave summary
            const leaveBalances = await LeaveBalance.find({
                staff: (contract.staff as any)._id,
                year: new Date().getFullYear(),
            })

            const leaveSummary = leaveBalances.map((balance) => ({
                type: balance.leaveType,
                used: balance.used,
                remaining: balance.remaining,
            }))

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_DELETED, // Using delete action for termination
                entityType: "StaffContract",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Terminated contract for ${
                    (contract.staff as any).name
                }: ${reason}`,
                metadata: {
                    staffName: (contract.staff as any).name,
                    staffId: (contract.staff as any).staffId,
                    position: (contract.position as any).title,
                    terminationReason: reason,
                    terminationDate: terminatedContract?.terminationDate,
                    leaveSummary,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Contract terminated successfully", {
                contract: terminatedContract,
                leaveSummary,
            })
        } catch (error) {
            console.error("Error terminating contract:", error)
            return errorResponseObject("Failed to terminate contract")
        }
    }

    /**
     * Renew a contract
     * POST /api/contracts/:id/renew
     */
    static async renewContract(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { newEndDate, salary, position } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can renew contracts"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Contract ID is required" },
                ])
            }

            if (!newEndDate) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "newEndDate",
                        message: "New end date is required for renewal",
                    },
                ])
            }

            // Find current contract
            const currentContract = await StaffContract.findById(id).populate(
                "staff",
                "name staffId gender"
            )

            if (!currentContract) {
                return errorResponseObject("Contract not found")
            }

            // Check if contract can be renewed
            if (
                currentContract.status !== ContractStatus.ACTIVE &&
                currentContract.status !== ContractStatus.EXPIRED
            ) {
                return errorResponseObject(
                    `Cannot renew ${currentContract.status.toLowerCase()} contract`
                )
            }

            // Validate new end date
            const renewalEndDate = new Date(newEndDate)
            if (isNaN(renewalEndDate.getTime())) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "newEndDate", message: "Invalid date format" },
                ])
            }

            // Calculate new start date (day after current end)
            const newStartDate = currentContract.endDate
                ? new Date(currentContract.endDate.getTime() + 86400000)
                : new Date()

            if (renewalEndDate <= newStartDate) {
                return errorResponseObject(
                    "New end date must be after the renewal start date"
                )
            }

            // If changing position, validate it
            let newPosition = position || (currentContract.position as any)._id
            if (
                position &&
                position !== (currentContract.position as any)._id.toString()
            ) {
                const jobPosition = await JobPosition.findById(position).populate(
                    "department",
                    "name"
                )
                if (!jobPosition) {
                    return errorResponseObject("New position not found")
                }
                if (!jobPosition.isActive) {
                    return errorResponseObject(
                        "Cannot assign to inactive position"
                    )
                }

                // Get full staff data to check department
                const staffMember = await Staff.findById(
                    (currentContract.staff as any)._id
                )
                if (!staffMember) {
                    return errorResponseObject("Staff member not found")
                }

                // Check if position's department matches staff's department
                if (staffMember.department.toString() !== jobPosition.department._id.toString()) {
                    return errorResponseObject(
                        `Cannot assign staff to position in different department during renewal. ` +
                        `Staff belongs to their assigned department, ` +
                        `but position "${jobPosition.title}" is in ${(jobPosition.department as any).name} department`
                    )
                }

                const canAcceptMore = await jobPosition.canAcceptMore()
                if (!canAcceptMore) {
                    return errorResponseObject(
                        `Position "${jobPosition.title}" has reached maximum occupancy`
                    )
                }
            }

            // Use instance method to renew (marks current as RENEWED and creates new)
            let newContract
            try {
                // First mark current as renewed
                currentContract.status = ContractStatus.RENEWED
                await currentContract.save()

                // Create new contract
                const contractData = {
                    staff: (currentContract.staff as any)._id,
                    position: newPosition,
                    startDate: newStartDate,
                    endDate: renewalEndDate,
                    status:
                        newStartDate <= new Date()
                            ? ContractStatus.ACTIVE
                            : ContractStatus.PENDING,
                    salary:
                        salary !== undefined ? salary : currentContract.salary,
                    currency: currentContract.currency,
                    previousContract: currentContract._id,
                    createdBy: user._id,
                }

                newContract = await StaffContract.create(contractData)

                // If new year and active, initialize leave balances
                if (
                    contractData.status === ContractStatus.ACTIVE &&
                    newStartDate.getFullYear() !==
                        currentContract.startDate.getFullYear()
                ) {
                    await this.initializeLeaveBalances(
                        (currentContract.staff as any)._id,
                        newStartDate.getFullYear(),
                        (currentContract.staff as any).gender
                    )
                }
            } catch (error: any) {
                // Rollback if creation fails
                currentContract.status = ContractStatus.ACTIVE
                await currentContract.save()
                return errorResponseObject(
                    `Failed to renew contract: ${error.message}`
                )
            }

            // Populate new contract for response
            const populatedNewContract = await StaffContract.findById(
                newContract._id
            )
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .populate("previousContract", "startDate endDate")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_CREATED,
                entityType: "StaffContract",
                entityId: newContract._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Renewed contract for ${
                    (currentContract.staff as any).name
                }`,
                metadata: {
                    staffName: (currentContract.staff as any).name,
                    staffId: (currentContract.staff as any).staffId,
                    oldContractId: currentContract._id,
                    newContractId: newContract._id,
                    newStartDate,
                    newEndDate: renewalEndDate,
                    positionChanged:
                        position &&
                        position !==
                            (currentContract.position as any)._id.toString(),
                    salaryChanged:
                        salary !== undefined &&
                        salary !== currentContract.salary,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Contract renewed successfully", {
                oldContract: {
                    id: currentContract._id,
                    status: ContractStatus.RENEWED,
                },
                newContract: populatedNewContract,
            })
        } catch (error) {
            console.error("Error renewing contract:", error)
            return errorResponseObject("Failed to renew contract")
        }
    }

    /**
     * Cancel a pending contract
     * PUT /api/contracts/:id/cancel
     */
    static async cancelContract(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { reason } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can cancel contracts"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Contract ID is required" },
                ])
            }

            // Find contract
            const contract = await StaffContract.findById(id)
                .populate("staff", "name staffId")
                .populate("position", "title")

            if (!contract) {
                return errorResponseObject("Contract not found")
            }

            if (contract.status !== ContractStatus.PENDING) {
                return errorResponseObject(
                    `Can only cancel pending contracts. This contract is ${contract.status.toLowerCase()}`
                )
            }

            // Cancel contract
            contract.status = ContractStatus.CANCELLED
            contract.terminatedBy = user._id
            contract.terminationReason =
                reason || "Contract cancelled before start"
            contract.terminationDate = new Date()
            await contract.save()

            // Get updated contract
            const cancelledContract = await StaffContract.findById(id)
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate("terminatedBy", "name")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_DELETED,
                entityType: "StaffContract",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Cancelled pending contract for ${
                    (contract.staff as any).name
                }`,
                metadata: {
                    staffName: (contract.staff as any).name,
                    staffId: (contract.staff as any).staffId,
                    position: (contract.position as any).title,
                    cancellationReason:
                        reason || "Contract cancelled before start",
                    originalStartDate: contract.startDate,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Contract cancelled successfully",
                cancelledContract
            )
        } catch (error) {
            console.error("Error cancelling contract:", error)
            return errorResponseObject("Failed to cancel contract")
        }
    }

    /**
     * Get contract by ID
     * GET /api/contracts/:id
     */
    static async getContractById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Contract ID is required" },
                ])
            }

            const contract = await StaffContract.findById(id)
                .populate("staff", "name staffId email phone department")
                .populate("position", "title maxOccupancy")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .populate("previousContract", "startDate endDate status")
                .populate("createdBy", "name email")
                .populate("terminatedBy", "name email")
                .lean()

            if (!contract) {
                return errorResponseObject("Contract not found")
            }

            // Check permissions for salary visibility
            const canViewSalary =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("FINANCE") ||
                (contract.staff as any)._id.toString() === user?._id

            if (!canViewSalary) {
                delete (contract as any).salary
                delete (contract as any).currency
            }

            // Add computed fields
            const enhancedContract = {
                ...contract,
                durationInDays: contract.endDate
                    ? Math.ceil(
                          (new Date(contract.endDate).getTime() -
                              new Date(contract.startDate).getTime()) /
                              (1000 * 60 * 60 * 24)
                      )
                    : null,
                remainingDays:
                    contract.status === ContractStatus.ACTIVE &&
                    contract.endDate
                        ? Math.max(
                              0,
                              Math.ceil(
                                  (new Date(contract.endDate).getTime() -
                                      new Date().getTime()) /
                                      (1000 * 60 * 60 * 24)
                              )
                          )
                        : null,
                isExpiringSoon:
                    contract.status === ContractStatus.ACTIVE &&
                    contract.endDate
                        ? Math.ceil(
                              (new Date(contract.endDate).getTime() -
                                  new Date().getTime()) /
                                  (1000 * 60 * 60 * 24)
                          ) <= 30
                        : false,
            }

            // Get next contract if this one is renewed
            let nextContract = null
            if (contract.status === ContractStatus.RENEWED) {
                nextContract = await StaffContract.findOne({
                    previousContract: contract._id,
                })
                    .select("_id startDate endDate status")
                    .lean()
            }

            return successResponseObject("Contract retrieved successfully", {
                ...enhancedContract,
                nextContract,
            })
        } catch (error) {
            console.error("Error fetching contract:", error)
            return errorResponseObject("Failed to retrieve contract")
        }
    }

    /**
     * Get staff's current active contract
     * GET /api/contracts/staff/:staffId/current
     */
    static async getStaffCurrentContract(
        req: Request,
        staffId: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            // Check permissions
            const canView =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER") ||
                staffId === user?._id

            if (!canView) {
                return errorResponseObject("Unauthorized to view this contract")
            }

            const contract = await StaffContract.findOne({
                staff: staffId,
                status: ContractStatus.ACTIVE,
            })
                .populate("position", "title")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .lean()

            if (!contract) {
                return successResponseObject("No active contract found", null)
            }

            // Hide salary if not authorized
            const canViewSalary =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("FINANCE") ||
                staffId === user?._id

            if (!canViewSalary) {
                delete (contract as any).salary
                delete (contract as any).currency
            }

            // Get leave balance summary
            const leaveBalances = await LeaveBalance.find({
                staff: staffId,
                year: new Date().getFullYear(),
            }).select("leaveType remaining availableForRequest")

            const contractWithDetails = {
                ...contract,
                remainingDays: contract.endDate
                    ? Math.max(
                          0,
                          Math.ceil(
                              (new Date(contract.endDate).getTime() -
                                  new Date().getTime()) /
                                  (1000 * 60 * 60 * 24)
                          )
                      )
                    : null,
                leaveBalances: leaveBalances.map((balance) => ({
                    type: balance.leaveType,
                    available:
                        balance.leaveType === LeaveTypes.ANNUAL
                            ? balance.availableForRequest
                            : balance.remaining,
                })),
            }

            return successResponseObject(
                "Current contract retrieved successfully",
                contractWithDetails
            )
        } catch (error) {
            console.error("Error fetching current contract:", error)
            return errorResponseObject("Failed to retrieve current contract")
        }
    }

    /**
     * Get staff contract history
     * GET /api/contracts/staff/:staffId/history
     */
    static async getStaffContractHistory(
        req: Request,
        staffId: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            // Check permissions
            const canView =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                staffId === user?._id

            if (!canView) {
                return errorResponseObject(
                    "Unauthorized to view contract history"
                )
            }

            const contracts = await StaffContract.find({ staff: staffId })
                .populate("position", "title")
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .populate("previousContract", "_id")
                .populate("terminatedBy", "name")
                .sort({ createdAt: -1 })
                .lean()

            // Hide salary if not authorized
            const canViewSalary =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("FINANCE") ||
                staffId === user?._id

            const processedContracts = contracts.map((contract) => {
                const processed = { ...contract }
                if (!canViewSalary) {
                    delete (processed as any).salary
                    delete (processed as any).currency
                }

                // Add duration
                ;(processed as any).durationInDays = contract.endDate
                    ? Math.ceil(
                          (new Date(contract.endDate).getTime() -
                              new Date(contract.startDate).getTime()) /
                              (1000 * 60 * 60 * 24)
                      )
                    : null

                return processed
            })

            // Group by status
            const summary = {
                total: contracts.length,
                active: contracts.filter(
                    (c) => c.status === ContractStatus.ACTIVE
                ).length,
                expired: contracts.filter(
                    (c) => c.status === ContractStatus.EXPIRED
                ).length,
                renewed: contracts.filter(
                    (c) => c.status === ContractStatus.RENEWED
                ).length,
                cancelled: contracts.filter(
                    (c) => c.status === ContractStatus.CANCELLED
                ).length,
                pending: contracts.filter(
                    (c) => c.status === ContractStatus.PENDING
                ).length,
            }

            return successResponseObject(
                "Contract history retrieved successfully",
                {
                    summary,
                    contracts: processedContracts,
                }
            )
        } catch (error) {
            console.error("Error fetching contract history:", error)
            return errorResponseObject("Failed to retrieve contract history")
        }
    }

    /**
     * Get all active contracts with filters
     * GET /api/contracts/active
     */
    static async getActiveContracts(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                department,
                position,
                search,
            } = req.query

            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject("Unauthorized to view contracts")
            }

            // Pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Build query
            const query: any = { status: ContractStatus.ACTIVE }

            // Filter by department/position if provided
            const positionFilters: any = {}
            if (department) {
                const positions = await JobPosition.find({ department }).select(
                    "_id"
                )
                query.position = { $in: positions.map((p) => p._id) }
            }
            if (position) {
                query.position = position
            }

            // Search by staff name if provided
            let staffFilter: any[] = []
            if (search && typeof search === "string" && search.trim()) {
                const searchTerm = search.trim()
                const matchingStaff = await Staff.find({
                    $or: [
                        { name: { $regex: searchTerm, $options: "i" } },
                        { staffId: { $regex: searchTerm, $options: "i" } },
                    ],
                }).select("_id")

                staffFilter = matchingStaff.map((s) => s._id)
                if (staffFilter.length > 0) {
                    query.staff = { $in: staffFilter }
                } else {
                    // No matching staff, return empty result
                    return successResponseObject(
                        "Active contracts retrieved successfully",
                        {
                            contracts: [],
                            pagination: {
                                currentPage: pageNum,
                                totalPages: 0,
                                totalRecords: 0,
                                recordsPerPage: limitNum,
                                hasNext: false,
                                hasPrev: false,
                            },
                        }
                    )
                }
            }

            // Execute query
            const [contracts, totalCount] = await Promise.all([
                StaffContract.find(query)
                    .populate("staff", "name staffId email department")
                    .populate("position", "title")
                    .populate({
                        path: "position",
                        populate: {
                            path: "department",
                            select: "name",
                        },
                    })
                    .sort({ startDate: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                StaffContract.countDocuments(query),
            ])

            // Process contracts
            const canViewSalary =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("FINANCE")

            const processedContracts = contracts.map((contract) => {
                const processed = { ...contract }

                if (!canViewSalary) {
                    delete (processed as any).salary
                    delete (processed as any).currency
                }

                // Add remaining days
                ;(processed as any).remainingDays = contract.endDate
                    ? Math.max(
                          0,
                          Math.ceil(
                              (new Date(contract.endDate).getTime() -
                                  new Date().getTime()) /
                                  (1000 * 60 * 60 * 24)
                          )
                      )
                    : null

                return processed
            })

            // Statistics
            const statistics = {
                total: totalCount,
                expiringSoon: contracts.filter(
                    (c) =>
                        c.endDate &&
                        Math.ceil(
                            (new Date(c.endDate).getTime() -
                                new Date().getTime()) /
                                (1000 * 60 * 60 * 24)
                        ) <= 30
                ).length,
            }

            return successResponseObject(
                "Active contracts retrieved successfully",
                {
                    contracts: processedContracts,
                    statistics,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalCount / limitNum),
                        totalRecords: totalCount,
                        recordsPerPage: limitNum,
                        hasNext: skip + limitNum < totalCount,
                        hasPrev: pageNum > 1,
                    },
                    filters: {
                        department: department || null,
                        position: position || null,
                        search: search || null,
                    },
                }
            )
        } catch (error) {
            console.error("Error fetching active contracts:", error)
            return errorResponseObject("Failed to retrieve active contracts")
        }
    }

    /**
     * Get contracts expiring soon
     * GET /api/contracts/expiring
     */
    static async getExpiringContracts(req: Request): Promise<ResponseObject> {
        try {
            const { days = 30 } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to view expiring contracts"
                )
            }

            const daysNum = Math.max(1, Number(days))

            // Get expiring contracts
            const expiringContracts = await StaffContract.getExpiringContracts(
                daysNum
            )

            // Populate details
            const populatedContracts = await StaffContract.populate(
                expiringContracts,
                [
                    { path: "staff", select: "name staffId email department" },
                    {
                        path: "position",
                        select: "title",
                        populate: { path: "department", select: "name" },
                    },
                ]
            )

            // Group by department
            const byDepartment: any = {}

            for (const contract of populatedContracts) {
                const deptName =
                    (contract.position as any)?.department?.name || "Unknown"

                if (!byDepartment[deptName]) {
                    byDepartment[deptName] = {
                        departmentName: deptName,
                        contracts: [],
                        count: 0,
                    }
                }

                const daysRemaining = Math.ceil(
                    (new Date(contract.endDate!).getTime() -
                        new Date().getTime()) /
                        (1000 * 60 * 60 * 24)
                )

                byDepartment[deptName].contracts.push({
                    id: contract._id,
                    staff: {
                        id: (contract.staff as any)._id,
                        name: (contract.staff as any).name,
                        staffId: (contract.staff as any).staffId,
                    },
                    position: (contract.position as any).title,
                    endDate: contract.endDate,
                    daysRemaining,
                    isCritical: daysRemaining <= 7,
                })
                byDepartment[deptName].count++
            }

            // Convert to array and sort
            const departments = Object.values(byDepartment).sort(
                (a: any, b: any) => b.count - a.count
            )

            // Summary
            const summary = {
                totalExpiring: populatedContracts.length,
                criticalCount: populatedContracts.filter((c) => {
                    const days = Math.ceil(
                        (new Date(c.endDate!).getTime() -
                            new Date().getTime()) /
                            (1000 * 60 * 60 * 24)
                    )
                    return days <= 7
                }).length,
                departmentsAffected: departments.length,
                timeframe: `${daysNum} days`,
            }

            return successResponseObject(
                "Expiring contracts retrieved successfully",
                {
                    summary,
                    departments,
                }
            )
        } catch (error) {
            console.error("Error fetching expiring contracts:", error)
            return errorResponseObject("Failed to retrieve expiring contracts")
        }
    }

    /**
     * Get contracts by position
     * GET /api/contracts/position/:positionId
     */
    static async getContractsByPosition(
        req: Request,
        positionId: string
    ): Promise<ResponseObject> {
        try {
            if (!positionId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "positionId", message: "Position ID is required" },
                ])
            }

            // Verify position exists
            const position = await JobPosition.findById(positionId).populate(
                "department",
                "name"
            )

            if (!position) {
                return errorResponseObject("Position not found")
            }

            // Get active and pending contracts
            const contracts = await StaffContract.find({
                position: positionId,
                status: {
                    $in: [ContractStatus.ACTIVE, ContractStatus.PENDING],
                },
            })
                .populate("staff", "name staffId email")
                .sort({ status: 1, startDate: 1 })
                .lean()

            // Check occupancy
            const occupancy = await position.checkOccupancy()

            const response = {
                position: {
                    id: position._id,
                    title: position.title,
                    department: (position.department as any).name,
                    maxOccupancy: position.maxOccupancy,
                },
                occupancy: {
                    current: occupancy.current,
                    max: occupancy.max,
                    available: occupancy.available,
                },
                contracts: contracts.map((contract) => ({
                    id: contract._id,
                    staff: contract.staff,
                    status: contract.status,
                    startDate: contract.startDate,
                    endDate: contract.endDate,
                    isPending: contract.status === ContractStatus.PENDING,
                })),
            }

            return successResponseObject(
                "Position contracts retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching position contracts:", error)
            return errorResponseObject("Failed to retrieve position contracts")
        }
    }

    /**
     * Check position availability
     * GET /api/contracts/position/:positionId/availability
     */
    static async checkPositionAvailability(
        req: Request,
        positionId: string
    ): Promise<ResponseObject> {
        try {
            if (!positionId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "positionId", message: "Position ID is required" },
                ])
            }

            const isAvailable = await StaffContract.checkPositionAvailability(
                positionId
            )

            if (!isAvailable) {
                const position = await JobPosition.findById(positionId)
                if (!position) {
                    return errorResponseObject("Position not found")
                }
                if (!position.isActive) {
                    return successResponseObject("Position is inactive", {
                        available: false,
                        reason: "Position is inactive",
                    })
                }
            }

            const position = await JobPosition.findById(positionId)
            if (!position) {
                return errorResponseObject("Position not found")
            }
            const occupancy = await position.checkOccupancy()

            return successResponseObject("Position availability checked", {
                available: isAvailable,
                position: {
                    id: position._id,
                    title: position.title,
                },
                occupancy,
            })
        } catch (error) {
            console.error("Error checking position availability:", error)
            return errorResponseObject("Failed to check position availability")
        }
    }

    /**
     * Process expired contracts (for cron job)
     * PUT /api/contracts/process-expired
     */
    static async processExpiredContracts(
        req: Request
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check system/admin permission
            if (
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("SYSTEM")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only Admin/System can process expired contracts"
                )
            }

            const updatedCount = await StaffContract.updateExpiredContracts()

            // Log to audit
            if (updatedCount > 0) {
                await AuditLogController.createAuditLog({
                    action: AuditAction.STAFF_UPDATED,
                    entityType: "StaffContract",
                    entityId: "BULK",
                    performedBy: user._id || "SYSTEM",
                    performedByName: user?.name || "System",
                    performedByEmail: user?.email || "system@leave.com",
                    description: `Processed ${updatedCount} expired contracts`,
                    metadata: {
                        processedCount: updatedCount,
                        processDate: new Date(),
                    },
                    ipAddress: req.ip || req.socket.remoteAddress,
                    userAgent: req.headers["user-agent"] || "System Process",
                })
            }

            return successResponseObject(
                "Expired contracts processed successfully",
                {
                    processedCount: updatedCount,
                    timestamp: new Date(),
                }
            )
        } catch (error) {
            console.error("Error processing expired contracts:", error)
            return errorResponseObject("Failed to process expired contracts")
        }
    }

    /**
     * Contract summary report
     * GET /api/contracts/summary
     */
    static async getContractSummary(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to view contract summary"
                )
            }

            // Get all contracts grouped by status
            const [
                activeCount,
                pendingCount,
                expiredCount,
                renewedCount,
                cancelledCount,
                totalStaff,
            ] = await Promise.all([
                StaffContract.countDocuments({ status: ContractStatus.ACTIVE }),
                StaffContract.countDocuments({
                    status: ContractStatus.PENDING,
                }),
                StaffContract.countDocuments({
                    status: ContractStatus.EXPIRED,
                }),
                StaffContract.countDocuments({
                    status: ContractStatus.RENEWED,
                }),
                StaffContract.countDocuments({
                    status: ContractStatus.CANCELLED,
                }),
                Staff.countDocuments({ status: AccountStatus.ACTIVE }),
            ])

            // Get expiring soon
            const expiringSoon = await StaffContract.getExpiringContracts(30)

            // Department breakdown
            const activeContracts = await StaffContract.find({
                status: ContractStatus.ACTIVE,
            })
                .populate({
                    path: "position",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .lean()

            const departmentBreakdown: any = {}
            for (const contract of activeContracts) {
                const deptName =
                    (contract.position as any)?.department?.name || "Unknown"
                if (!departmentBreakdown[deptName]) {
                    departmentBreakdown[deptName] = {
                        name: deptName,
                        count: 0,
                    }
                }
                departmentBreakdown[deptName].count++
            }

            // Average contract duration
            const completedContracts = await StaffContract.find({
                status: {
                    $in: [ContractStatus.EXPIRED, ContractStatus.RENEWED],
                },
                endDate: { $ne: null },
            }).select("startDate endDate")

            let totalDuration = 0
            let contractsWithDuration = 0

            for (const contract of completedContracts) {
                if (contract.endDate) {
                    const duration = Math.ceil(
                        (new Date(contract.endDate).getTime() -
                            new Date(contract.startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                    )
                    totalDuration += duration
                    contractsWithDuration++
                }
            }

            const averageDuration =
                contractsWithDuration > 0
                    ? Math.round(totalDuration / contractsWithDuration)
                    : 0

            const summary = {
                overview: {
                    totalStaff,
                    staffWithActiveContracts: activeCount,
                    staffWithoutContracts: totalStaff - activeCount,
                },
                byStatus: {
                    active: activeCount,
                    pending: pendingCount,
                    expired: expiredCount,
                    renewed: renewedCount,
                    cancelled: cancelledCount,
                },
                expiring: {
                    next30Days: expiringSoon.length,
                    next7Days: expiringSoon.filter((c) => {
                        const days = Math.ceil(
                            (new Date(c.endDate!).getTime() -
                                new Date().getTime()) /
                                (1000 * 60 * 60 * 24)
                        )
                        return days <= 7
                    }).length,
                },
                departments: Object.values(departmentBreakdown).sort(
                    (a: any, b: any) => b.count - a.count
                ),
                averageContractDuration: `${averageDuration} days`,
            }

            return successResponseObject(
                "Contract summary retrieved successfully",
                summary
            )
        } catch (error) {
            console.error("Error generating contract summary:", error)
            return errorResponseObject("Failed to generate contract summary")
        }
    }

    /**
     * Department contracts report
     * GET /api/contracts/department/:departmentId/report
     */
    static async getDepartmentContracts(
        req: Request,
        departmentId: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!departmentId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "departmentId",
                        message: "Department ID is required",
                    },
                ])
            }

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view department contracts"
                )
            }

            // Verify department
            const department = await Department.findById(departmentId)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            // Get all positions in department
            const positions = await JobPosition.find({
                department: departmentId,
            }).select("_id title maxOccupancy")

            const positionIds = positions.map((p) => p._id)

            // Get all contracts for these positions
            const contracts = await StaffContract.find({
                position: { $in: positionIds },
            })
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .sort({ status: 1, startDate: -1 })
                .lean()

            // Group by position and status
            const positionBreakdown = positions.map((position) => {
                const positionContracts = contracts.filter(
                    (c) =>
                        (c.position as any)._id.toString() ===
                        position._id.toString()
                )

                return {
                    position: {
                        id: position._id,
                        title: position.title,
                        maxOccupancy: position.maxOccupancy,
                    },
                    contracts: {
                        active: positionContracts.filter(
                            (c) => c.status === ContractStatus.ACTIVE
                        ).length,
                        pending: positionContracts.filter(
                            (c) => c.status === ContractStatus.PENDING
                        ).length,
                        total: positionContracts.length,
                    },
                    occupancy: {
                        current: positionContracts.filter(
                            (c) => c.status === ContractStatus.ACTIVE
                        ).length,
                        max: position.maxOccupancy,
                        available:
                            position.maxOccupancy -
                            positionContracts.filter(
                                (c) => c.status === ContractStatus.ACTIVE
                            ).length,
                    },
                    staff: positionContracts
                        .filter((c) => c.status === ContractStatus.ACTIVE)
                        .map((c) => ({
                            id: (c.staff as any)._id,
                            name: (c.staff as any).name,
                            staffId: (c.staff as any).staffId,
                            contractEndDate: c.endDate,
                        })),
                }
            })

            // Summary statistics
            const summary = {
                department: {
                    id: department._id,
                    name: department.name,
                },
                totalPositions: positions.length,
                totalContracts: {
                    active: contracts.filter(
                        (c) => c.status === ContractStatus.ACTIVE
                    ).length,
                    pending: contracts.filter(
                        (c) => c.status === ContractStatus.PENDING
                    ).length,
                    expired: contracts.filter(
                        (c) => c.status === ContractStatus.EXPIRED
                    ).length,
                    all: contracts.length,
                },
                staffingLevel: {
                    totalSlots: positions.reduce(
                        (sum, p) => sum + p.maxOccupancy,
                        0
                    ),
                    filled: contracts.filter(
                        (c) => c.status === ContractStatus.ACTIVE
                    ).length,
                    available:
                        positions.reduce((sum, p) => sum + p.maxOccupancy, 0) -
                        contracts.filter(
                            (c) => c.status === ContractStatus.ACTIVE
                        ).length,
                },
                expiringContracts: contracts.filter(
                    (c) =>
                        c.status === ContractStatus.ACTIVE &&
                        c.endDate &&
                        Math.ceil(
                            (new Date(c.endDate).getTime() -
                                new Date().getTime()) /
                                (1000 * 60 * 60 * 24)
                        ) <= 30
                ).length,
            }

            return successResponseObject(
                "Department contracts retrieved successfully",
                {
                    summary,
                    positions: positionBreakdown,
                }
            )
        } catch (error) {
            console.error("Error fetching department contracts:", error)
            return errorResponseObject(
                "Failed to retrieve department contracts"
            )
        }
    }

    /**
     * Payroll report
     * GET /api/contracts/payroll
     */
    static async getPayrollReport(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check permissions - only HR/Admin/Finance
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("FINANCE")
            ) {
                return errorResponseObject(
                    "Unauthorized to view payroll report"
                )
            }

            // Get all active contracts with salary
            const activeContracts = await StaffContract.find({
                status: ContractStatus.ACTIVE,
                salary: { $ne: null },
            })
                .populate("staff", "name staffId")
                .populate({
                    path: "position",
                    select: "title",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .lean()

            // Group by department and currency
            const byDepartment: any = {}
            const byCurrency: any = {}
            let totalSalary = 0
            let contractsWithSalary = 0

            for (const contract of activeContracts) {
                if (contract.salary) {
                    contractsWithSalary++
                    const deptName =
                        (contract.position as any)?.department?.name ||
                        "Unknown"
                    const currency = contract.currency || "USD"

                    // By department
                    if (!byDepartment[deptName]) {
                        byDepartment[deptName] = {
                            name: deptName,
                            staffCount: 0,
                            totalSalary: 0,
                            currencies: {},
                        }
                    }
                    byDepartment[deptName].staffCount++
                    byDepartment[deptName].totalSalary += contract.salary

                    if (!byDepartment[deptName].currencies[currency]) {
                        byDepartment[deptName].currencies[currency] = 0
                    }
                    byDepartment[deptName].currencies[currency] +=
                        contract.salary

                    // By currency
                    if (!byCurrency[currency]) {
                        byCurrency[currency] = {
                            currency,
                            count: 0,
                            total: 0,
                        }
                    }
                    byCurrency[currency].count++
                    byCurrency[currency].total += contract.salary

                    // Total (assuming USD for simplicity)
                    if (currency === "USD") {
                        totalSalary += contract.salary
                    }
                }
            }

            const report = {
                summary: {
                    totalActiveContracts: activeContracts.length,
                    contractsWithSalary,
                    contractsWithoutSalary:
                        activeContracts.length - contractsWithSalary,
                    totalMonthlySalary: totalSalary,
                    primaryCurrency: "USD",
                },
                byDepartment: Object.values(byDepartment).sort(
                    (a: any, b: any) => b.totalSalary - a.totalSalary
                ),
                byCurrency: Object.values(byCurrency),
                generatedAt: new Date(),
            }

            // Log access to payroll data
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_VIEWED,
                entityType: "PayrollReport",
                entityId: "REPORT",
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: "Accessed payroll report",
                metadata: {
                    reportType: "payroll",
                    contractCount: activeContracts.length,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Payroll report generated successfully",
                report
            )
        } catch (error) {
            console.error("Error generating payroll report:", error)
            return errorResponseObject("Failed to generate payroll report")
        }
    }

    /**
     * Initialize leave balances for a staff member
     * Private helper method
     */
    private static async initializeLeaveBalances(
        staffId: string,
        year: number,
        gender: Gender
    ): Promise<void> {
        try {
            // Check if balances already exist for this year
            const existingBalances = await LeaveBalance.find({
                staff: staffId,
                year,
            })

            if (existingBalances.length > 0) {
                console.log(
                    `Leave balances already exist for staff ${staffId} in year ${year}`
                )
                return
            }

            // Get current date for pro-rating
            const currentDate = new Date()
            const isCurrentYear = currentDate.getFullYear() === year

            // Initialize leave types based on configuration
            const leaveTypesToCreate = []

            // Annual leave - accrues monthly
            leaveTypesToCreate.push({
                staff: staffId,
                year,
                leaveType: LeaveTypes.ANNUAL,
                allocated: 30, // Max annual leave
                accrued: 0, // Will accrue monthly
                used: 0,
                adjustments: 0,
                notes: "Initialized with contract activation",
            })

            // Sick leave
            leaveTypesToCreate.push({
                staff: staffId,
                year,
                leaveType: LeaveTypes.SICK,
                allocated: LEAVE_CAPS[LeaveTypes.SICK],
                used: 0,
                notes: "Initialized with contract activation",
            })

            // Bereavement leave
            leaveTypesToCreate.push({
                staff: staffId,
                year,
                leaveType: LeaveTypes.BEREAVEMENT,
                allocated: LEAVE_CAPS[LeaveTypes.BEREAVEMENT],
                used: 0,
                notes: "Initialized with contract activation",
            })

            // Gender-specific leave
            if (gender === Gender.MALE) {
                leaveTypesToCreate.push({
                    staff: staffId,
                    year,
                    leaveType: LeaveTypes.PATERNITY,
                    allocated: LEAVE_CAPS[LeaveTypes.PATERNITY],
                    used: 0,
                    notes: "Initialized with contract activation",
                })
            } else if (gender === Gender.FEMALE) {
                leaveTypesToCreate.push({
                    staff: staffId,
                    year,
                    leaveType: LeaveTypes.MATERNITY,
                    allocated: LEAVE_CAPS[LeaveTypes.MATERNITY],
                    used: 0,
                    notes: "Initialized with contract activation",
                })
            }

            // Create all leave balances
            await LeaveBalance.insertMany(leaveTypesToCreate)

            // If current year, update annual leave accrual
            if (isCurrentYear) {
                const annualBalance = await LeaveBalance.findOne({
                    staff: staffId,
                    year,
                    leaveType: LeaveTypes.ANNUAL,
                })

                if (annualBalance) {
                    await annualBalance.updateAccrual(currentDate)
                }
            }

            console.log(
                `Initialized leave balances for staff ${staffId} in year ${year}`
            )
        } catch (error) {
            console.error("Error initializing leave balances:", error)
            throw error
        }
    }
}

export default StaffContractController
