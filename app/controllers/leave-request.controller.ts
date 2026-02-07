import { Request } from "express"
import mongoose from "mongoose"
import LeaveRequest from "../models/leave-request.model"
import Staff from "../models/staff.model"
import StaffContract from "../models/staff-contract.model"
import JobPosition from "../models/job-position.model"
import Department from "../models/department.model"
import LeaveBalance from "../models/leave-balance.model"
import Holiday from "../models/holiday.model"
import AuditLogController from "./audit-log.controller"
import NotificationController from "./notification.controller"
import SMSService from "../services/sms.service"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import {
    AuditAction,
    ResponseObject,
    LeaveTypes,
    LeaveStatus,
    ContractStatus,
    AccountStatus,
    Gender,
    LEAVE_TYPES_REQUIRING_DOCUMENTS,
    GENDER_RESTRICTED_LEAVES,
    DocumentAttachment,
} from "../utils/types"

export class LeaveRequestController {
    /**
     * Check if MongoDB transactions are supported
     */
    private static isReplicaSet(): boolean {
        const topology = mongoose.connection.db?.topology
        return topology?.description?.type === 'ReplicaSetWithPrimary' || 
               topology?.description?.type === 'ReplicaSetNoPrimary' ||
               process.env.USE_TRANSACTIONS === 'true'
    }

    /**
     * Create a new leave request
     * POST /api/leave-requests
     */
    static async createLeaveRequest(req: Request): Promise<ResponseObject> {
        // Only use transactions if in replica set mode
        const useTransaction = this.isReplicaSet()
        let session: any = null
        
        if (useTransaction) {
            session = await mongoose.startSession()
            session.startTransaction()
        }

        try {
            const { leaveType, startDate, endDate, numberOfDays, reason, attachments } =
                req.body
            const user = (req as any).user

            // Validation
            const errors = []
            let computedEndDate = false
            let actualEndDate = endDate

            if (!leaveType || !Object.values(LeaveTypes).includes(leaveType)) {
                errors.push({
                    field: "leaveType",
                    message: "Valid leave type is required",
                })
            }

            if (!startDate) {
                errors.push({
                    field: "startDate",
                    message: "Start date is required",
                })
            }

            // Validate that user provides either endDate OR numberOfDays, not both
            if (endDate && numberOfDays) {
                errors.push({
                    field: "dates",
                    message: "Provide either endDate or numberOfDays, not both",
                })
            }

            if (!endDate && !numberOfDays) {
                errors.push({
                    field: "dates",
                    message: "Either endDate or numberOfDays is required",
                })
            }

            if (numberOfDays) {
                if (numberOfDays <= 0 || !Number.isInteger(numberOfDays)) {
                    errors.push({
                        field: "numberOfDays",
                        message: "Number of days must be a positive integer",
                    })
                }
                if (numberOfDays > 30) {
                    errors.push({
                        field: "numberOfDays",
                        message: "Number of days cannot exceed 30 days per request",
                    })
                }
            }

            // Date validation and computation
            if (startDate && (endDate || numberOfDays)) {
                const start = new Date(startDate)
                console.log(`[LeaveRequest] Validating dates: start=${startDate}, end=${actualEndDate}, startDay=${start.toDateString()}`)
                
                // Compute end date if numberOfDays provided
                if (numberOfDays && !endDate && errors.length === 0) {
                    try {
                        const computedEnd = await this.calculateEndDateFromWorkingDays(start, numberOfDays)
                        actualEndDate = computedEnd.toISOString()
                        computedEndDate = true
                        console.log(`[LeaveRequest] Computed end date: ${actualEndDate} for ${numberOfDays} working days`)
                    } catch (error) {
                        console.error(`[LeaveRequest] Error computing end date:`, error)
                        errors.push({
                            field: "numberOfDays",
                            message: "Failed to compute end date for the given number of days",
                        })
                    }
                }
                
                const end = new Date(actualEndDate)
                console.log(`[LeaveRequest] Validating dates: end=${actualEndDate}, endDay=${end.toDateString()}`)

                if (isNaN(start.getTime())) {
                    console.error(`[LeaveRequest] Invalid start date: ${startDate}`)
                    errors.push({
                        field: "startDate",
                        message: "Invalid start date format",
                    })
                }

                if (isNaN(end.getTime())) {
                    console.error(`[LeaveRequest] Invalid end date: ${actualEndDate}`)
                    errors.push({
                        field: "endDate",
                        message: "Invalid end date format",
                    })
                }

                if (start > end) {
                    console.error(`[LeaveRequest] Start date after end date: ${start} > ${end}`)
                    errors.push({
                        field: "endDate",
                        message:
                            "End date must be after or equal to start date",
                    })
                }

                // Check start date is current year or future
                const currentYear = new Date().getFullYear()
                if (start.getFullYear() < currentYear) {
                    console.error(`[LeaveRequest] Start date in past year: ${start.getFullYear()} < ${currentYear}`)
                    errors.push({
                        field: "startDate",
                        message: "Leave start date cannot be in past years",
                    })
                }
                
                // Check if start date is a weekend
                const startDayOfWeek = start.getDay()
                console.log(`[LeaveRequest] Start date day of week: ${startDayOfWeek} (0=Sunday, 6=Saturday)`)
                if (startDayOfWeek === 0 || startDayOfWeek === 6) {
                    console.error(`[LeaveRequest] Start date is weekend: ${startDayOfWeek}`)
                    errors.push({
                        field: "startDate",
                        message: "Leave cannot start on a weekend (Saturday or Sunday)",
                    })
                }
                
                // Check if start date is a holiday
                const isStartDateHoliday = await Holiday.isHoliday(start)
                console.log(`[LeaveRequest] Is start date holiday? ${isStartDateHoliday}`)
                if (isStartDateHoliday) {
                    console.error(`[LeaveRequest] Start date is holiday: ${start}`)
                    errors.push({
                        field: "startDate",
                        message: "Leave cannot start on a public holiday",
                    })
                }
                
                // Check if end date is a weekend
                const endDayOfWeek = end.getDay()
                console.log(`[LeaveRequest] End date day of week: ${endDayOfWeek} (0=Sunday, 6=Saturday)`)
                if (endDayOfWeek === 0 || endDayOfWeek === 6) {
                    console.error(`[LeaveRequest] End date is weekend: ${endDayOfWeek}`)
                    errors.push({
                        field: "endDate",
                        message: "Leave cannot end on a weekend (Saturday or Sunday)",
                    })
                }
                
                // Check if end date is a holiday
                const isEndDateHoliday = await Holiday.isHoliday(end)
                console.log(`[LeaveRequest] Is end date holiday? ${isEndDateHoliday}`)
                if (isEndDateHoliday) {
                    console.error(`[LeaveRequest] End date is holiday: ${end}`)
                    errors.push({
                        field: "endDate",
                        message: "Leave cannot end on a public holiday",
                    })
                }
            }

            if (errors.length > 0) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Get staff details
            const staffQuery = Staff.findById(user._id)
            const staff = session ? await staffQuery.session(session) : await staffQuery
            if (!staff) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Staff member not found")
            }

            if (staff.status !== AccountStatus.ACTIVE) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Only active staff can request leave"
                )
            }

            // Check for active contract
            const contractQuery = StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            }).populate("position")
            const activeContract = session ? await contractQuery.session(session) : await contractQuery

            if (!activeContract) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "No active contract found. Cannot request leave without an active contract"
                )
            }

            // Check leave dates do not exceed contract end date
            if (activeContract.endDate) {
                const contractEnd = new Date(activeContract.endDate)
                contractEnd.setHours(23, 59, 59, 999)
                const leaveEnd = new Date(actualEndDate)
                if (leaveEnd > contractEnd) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        `Leave end date cannot exceed your contract end date (${contractEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`
                    )
                }
            }

            // Check document requirements
            if (LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(leaveType)) {
                if (!attachments || attachments.length === 0) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        `${leaveType} leave requires supporting documents`
                    )
                }
            }

            // Check gender restrictions
            if (leaveType in GENDER_RESTRICTED_LEAVES) {
                const requiredGender =
                    GENDER_RESTRICTED_LEAVES[
                        leaveType as keyof typeof GENDER_RESTRICTED_LEAVES
                    ]
                if (staff.gender !== requiredGender) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        `${leaveType} leave is only available for ${requiredGender} staff`
                    )
                }
            }

            // Calculate working days
            const workingDaysResult = await this.calculateWorkingDaysInternal(
                new Date(startDate),
                new Date(actualEndDate)
            )

            console.log(`[LeaveRequest] Working days result:`, workingDaysResult)

            if (workingDaysResult.total === 0) {
                console.error(`[LeaveRequest] No working days found in date range`)
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Selected dates contain no working days"
                )
            }

            // Check leave balance (period-based lookup)
            const leaveStartDate = new Date(startDate)
            console.log(`[LeaveRequest] Looking for balance for staff: ${user._id}, leaveType: ${leaveType}, date: ${leaveStartDate}`)
            
            const balanceQuery = LeaveBalance.findOne({
                staff: user._id,
                leaveType,
                periodStart: { $lte: leaveStartDate },
                periodEnd: { $gte: leaveStartDate },
            })
            const balance = session ? await balanceQuery.session(session) : await balanceQuery

            console.log(`[LeaveRequest] Balance found:`, balance)

            if (!balance) {
                console.error(`[LeaveRequest] No balance found for staff: ${user._id}, leaveType: ${leaveType}`)
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    `No ${leaveType} balance found for the current leave period`
                )
            }

            const canRequest = balance.canRequest(workingDaysResult.total)
            console.log(`[LeaveRequest] Can request ${workingDaysResult.total} days?`, canRequest)
            console.log(`[LeaveRequest] Available for request: ${balance.availableForRequest}, Remaining: ${balance.remaining}`)

            if (!canRequest) {
                console.error(`[LeaveRequest] Insufficient balance. Available: ${balance.availableForRequest}, Requested: ${workingDaysResult.total}`)
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    `Insufficient leave balance. Available: ${balance.availableForRequest} days, Requested: ${workingDaysResult.total} days`
                )
            }

            // Check for overlapping requests
            console.log(`[LeaveRequest] Checking for overlapping requests...`)
            const overlapping = await LeaveRequest.getOverlappingRequests(
                user._id,
                new Date(startDate),
                new Date(actualEndDate)
            )

            console.log(`[LeaveRequest] Overlapping requests found:`, overlapping)

            if (overlapping.length > 0) {
                console.error(`[LeaveRequest] Found ${overlapping.length} overlapping requests`)
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "You have overlapping leave requests for the selected dates"
                )
            }

            // Get position and department details
            const positionQuery = JobPosition.findById(activeContract.position)
                .populate("endorserPosition approverPosition")
            const position = session ? await positionQuery.session(session) : await positionQuery

            if (!position) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Position not found")
            }
            
            console.log('[LeaveRequest] Position found:', position.title)
            console.log('[LeaveRequest] Has endorserPosition:', !!position.endorserPosition)
            console.log('[LeaveRequest] Has approverPosition:', !!position.approverPosition)

            const departmentQuery = Department.findById(position.department)
            const department = session ? await departmentQuery.session(session) : await departmentQuery

            if (!department) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Department not found")
            }

            // Create leave request
            const leaveRequestData: any = {
                staff: user._id,
                contract: activeContract._id,
                position: position._id,
                department: department._id,
                positionTitleSnapshot: position.title,
                departmentNameSnapshot: department.name,
                leaveType,
                startDate: new Date(startDate),
                endDate: new Date(actualEndDate),
                startYear: new Date(startDate).getFullYear(),
                workingDays: workingDaysResult.total,
                workingDaysBreakdown: workingDaysResult.breakdown,
                status: LeaveStatus.PENDING,
                reason: reason || null,
                attachments: attachments || [],
                createdBy: user._id,
                // Track if end date was computed
                metadata: {
                    endDateComputed: computedEndDate,
                    requestedDays: numberOfDays || null,
                }
            }

            // Set approval chain
            if (position.endorserPosition) {
                leaveRequestData.endorsement = {
                    byPosition: position.endorserPosition,
                }
            }

            if (position.approverPosition) {
                leaveRequestData.approval = {
                    byPosition: position.approverPosition,
                }
            }

            // Create leave request
            let leaveRequest
            if (session) {
                leaveRequest = await LeaveRequest.create([leaveRequestData], {
                    session,
                })
                await session.commitTransaction()
            } else {
                const newRequest = await LeaveRequest.create(leaveRequestData)
                leaveRequest = [newRequest]
            }

            // Populate for response
            const populatedRequest = await LeaveRequest.findById(
                leaveRequest[0]._id
            )
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate("department", "name")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_REQUESTED,
                entityType: "LeaveRequest",
                entityId: leaveRequest[0]._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created ${leaveType} leave request for ${workingDaysResult.total} days`,
                metadata: {
                    leaveType,
                    startDate,
                    endDate: actualEndDate,
                    workingDays: workingDaysResult.total,
                    hasDocuments: !!attachments?.length,
                    position: position.title,
                    department: department.name,
                    endDateComputed: computedEndDate,
                    requestedDays: numberOfDays || null,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send SMS notification to endorser if position has one
            if (position.endorserPosition) {
                console.log('[LeaveRequest] Position has endorser, attempting to send SMS...')
                console.log('[LeaveRequest] Endorser position ID:', position.endorserPosition._id || position.endorserPosition)
                try {
                    // Find staff who holds the endorser position
                    const endorserContract = await StaffContract.findOne({
                        position: position.endorserPosition._id || position.endorserPosition,
                        status: ContractStatus.ACTIVE
                    }).populate('staff')
                    
                    console.log('[LeaveRequest] Endorser contract found:', !!endorserContract)
                    if (endorserContract) {
                        console.log('[LeaveRequest] Endorser staff:', endorserContract.staff ? (endorserContract.staff as any).name : 'No staff')
                        console.log('[LeaveRequest] Endorser phone:', endorserContract.staff ? (endorserContract.staff as any).phone : 'No phone')
                    }
                    
                    if (endorserContract && endorserContract.staff) {
                        console.log('[LeaveRequest] Sending SMS notification to endorser...')
                        await SMSService.notifyNewLeaveRequest(
                            {
                                staff,
                                leaveType,
                                startDate,
                                endDate: actualEndDate,
                                workingDays: workingDaysResult.total,
                                reason: reason || 'Not specified'
                            },
                            endorserContract.staff
                        )
                        console.log(`[LeaveRequest] SMS notification sent to endorser: ${(endorserContract.staff as any).name}`)
                    } else {
                        console.log('[LeaveRequest] No active staff found for endorser position')
                    }
                } catch (smsError) {
                    console.error('[LeaveRequest] Failed to send SMS notification:', smsError)
                    // Don't fail the request if SMS fails
                }
            } else {
                console.log('[LeaveRequest] Position has no endorser configured')
            }

            // Send in-app notification
            try {
                const startDateFormatted = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                const endDateFormatted = new Date(actualEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                await NotificationController.notifyLeaveSubmitted({
                    staffId: user._id,
                    staffName: staff.name,
                    leaveRequestId: leaveRequest[0]._id.toString(),
                    leaveType,
                    startDate: startDateFormatted,
                    endDate: endDateFormatted,
                    departmentId: department._id.toString(),
                })
            } catch (notifError) {
                console.error('[LeaveRequest] Failed to send notification:', notifError)
            }

            return successResponseObject(
                "Leave request created successfully",
                {
                    ...populatedRequest?.toObject ? populatedRequest.toObject() : populatedRequest,
                    computedEndDate,
                    requestedDays: numberOfDays || null,
                    actualWorkingDays: workingDaysResult.total
                }
            )
        } catch (error) {
            if (session) await session.abortTransaction()
            console.error("Error creating leave request:", error)
            return errorResponseObject("Failed to create leave request")
        } finally {
            if (session) session.endSession()
        }
    }

    /**
     * Update leave request (only pending)
     * PUT /api/leave-requests/:id
     */
    static async updateRequest(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        // Only use transactions if in replica set mode
        const useTransaction = this.isReplicaSet()
        let session: any = null
        
        if (useTransaction) {
            session = await mongoose.startSession()
            session.startTransaction()
        }

        try {
            const { startDate, endDate, numberOfDays, reason, attachments } = req.body
            const user = (req as any).user
            let computedEndDate = false
            let actualEndDate = endDate

            if (!id) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            // Find request
            const requestQuery = LeaveRequest.findById(id)
            const request = session ? await requestQuery.session(session) : await requestQuery
            if (!request) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Leave request not found")
            }

            // Check ownership or HR/Admin
            if (
                request.staff.toString() !== user._id &&
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Unauthorized to update this request"
                )
            }

            // Only pending requests can be updated
            if (request.status !== LeaveStatus.PENDING) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Only pending requests can be updated"
                )
            }

            const changes = []
            const updates: any = {}

            // Validate that user provides either endDate OR numberOfDays, not both
            if (endDate && numberOfDays) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Provide either endDate or numberOfDays, not both"
                )
            }
            
            if (numberOfDays) {
                if (numberOfDays <= 0 || !Number.isInteger(numberOfDays)) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Number of days must be a positive integer"
                    )
                }
                if (numberOfDays > 30) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Number of days cannot exceed 30 days per request"
                    )
                }
            }

            // Handle date changes
            if (startDate || endDate || numberOfDays) {
                const newStartDate = startDate
                    ? new Date(startDate)
                    : request.startDate
                    
                // Compute or use provided end date
                let newEndDate
                if (numberOfDays) {
                    try {
                        newEndDate = await this.calculateEndDateFromWorkingDays(
                            newStartDate,
                            numberOfDays
                        )
                        actualEndDate = newEndDate.toISOString()
                        computedEndDate = true
                        console.log(`[LeaveRequest] Computed end date: ${actualEndDate} for ${numberOfDays} working days`)
                    } catch (error) {
                        if (session) await session.abortTransaction()
                        return errorResponseObject(
                            "Failed to compute end date for the given number of days"
                        )
                    }
                } else {
                    newEndDate = endDate ? new Date(endDate) : request.endDate
                    actualEndDate = newEndDate
                }

                if (newStartDate > newEndDate) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "End date must be after or equal to start date"
                    )
                }

                // Check leave dates do not exceed contract end date
                const updateContract = await StaffContract.findOne({
                    staff: request.staff,
                    status: ContractStatus.ACTIVE,
                })
                if (updateContract?.endDate) {
                    const contractEnd = new Date(updateContract.endDate)
                    contractEnd.setHours(23, 59, 59, 999)
                    if (newEndDate > contractEnd) {
                        if (session) await session.abortTransaction()
                        return errorResponseObject(
                            `Leave end date cannot exceed your contract end date (${contractEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`
                        )
                    }
                }

                // Check if new start date is a weekend
                const startDayOfWeek = newStartDate.getDay()
                if (startDayOfWeek === 0 || startDayOfWeek === 6) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot start on a weekend (Saturday or Sunday)"
                    )
                }
                
                // Check if new start date is a holiday
                const isStartDateHoliday = await Holiday.isHoliday(newStartDate)
                if (isStartDateHoliday) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot start on a public holiday"
                    )
                }
                
                // Check if new end date is a weekend
                const endDayOfWeek = newEndDate.getDay()
                if (endDayOfWeek === 0 || endDayOfWeek === 6) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot end on a weekend (Saturday or Sunday)"
                    )
                }
                
                // Check if new end date is a holiday
                const isEndDateHoliday = await Holiday.isHoliday(newEndDate)
                if (isEndDateHoliday) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot end on a public holiday"
                    )
                }

                // Recalculate working days if dates changed
                if (startDate || endDate) {
                    const workingDaysResult =
                        await this.calculateWorkingDaysInternal(
                            newStartDate,
                            newEndDate
                        )

                    if (workingDaysResult.total === 0) {
                        await session.abortTransaction()
                        return errorResponseObject(
                            "Selected dates contain no working days"
                        )
                    }

                    // Re-check balance (period-based)
                    const balance = await LeaveBalance.findOne({
                        staff: request.staff,
                        leaveType: request.leaveType,
                        periodStart: { $lte: newStartDate },
                        periodEnd: { $gte: newStartDate },
                    }).session(session)

                    if (!balance?.canRequest(workingDaysResult.total)) {
                        await session.abortTransaction()
                        return errorResponseObject(
                            "Insufficient leave balance for new dates"
                        )
                    }

                    // Re-check overlapping
                    const overlapping =
                        await LeaveRequest.getOverlappingRequests(
                            request.staff.toString(),
                            newStartDate,
                            newEndDate,
                            id
                        )

                    if (overlapping.length > 0) {
                        await session.abortTransaction()
                        return errorResponseObject(
                            "New dates overlap with existing leave requests"
                        )
                    }

                    if (startDate) {
                        changes.push({
                            field: "startDate",
                            oldValue: request.startDate,
                            newValue: newStartDate,
                            fieldLabel: "Start Date",
                        })
                        updates.startDate = newStartDate
                        updates.startYear = newStartDate.getFullYear()
                    }

                    if (endDate) {
                        changes.push({
                            field: "endDate",
                            oldValue: request.endDate,
                            newValue: newEndDate,
                            fieldLabel: "End Date",
                        })
                        updates.endDate = newEndDate
                    }

                    updates.workingDays = workingDaysResult.total
                    updates.workingDaysBreakdown = workingDaysResult.breakdown
                }
            }

            // Handle reason change
            if (reason !== undefined) {
                changes.push({
                    field: "reason",
                    oldValue: request.reason,
                    newValue: reason,
                    fieldLabel: "Reason",
                })
                updates.reason = reason
            }

            // Handle attachments change
            if (attachments !== undefined) {
                // Check if documents are still required
                if (
                    (
                        LEAVE_TYPES_REQUIRING_DOCUMENTS as readonly LeaveTypes[]
                    ).includes(request.leaveType) &&
                    (!attachments || attachments.length === 0)
                ) {
                    await session.abortTransaction()
                    return errorResponseObject(
                        `${request.leaveType} leave requires supporting documents`
                    )
                }
                updates.attachments = attachments
            }

            if (Object.keys(updates).length === 0) {
                await session.abortTransaction()
                return successResponseObject("No changes to update", request)
            }

            // Update request
            const updatedRequest = await LeaveRequest.findByIdAndUpdate(
                id,
                updates,
                { new: true, session }
            )
                .populate("staff", "name staffId email")
                .populate("position", "title")
                .populate("department", "name")

            await session.commitTransaction()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_UPDATED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated leave request`,
                changes,
                metadata: {
                    leaveType: request.leaveType,
                    status: request.status,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Leave request updated successfully",
                updatedRequest
            )
        } catch (error) {
            await session.abortTransaction()
            console.error("Error updating leave request:", error)
            return errorResponseObject("Failed to update leave request")
        } finally {
            session.endSession()
        }
    }

    /**
     * Delete leave request (only pending)
     * DELETE /api/leave-requests/:id
     */
    static async deleteRequest(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            // Find request
            const request = await LeaveRequest.findById(id)
            if (!request) {
                return errorResponseObject("Leave request not found")
            }

            // Check ownership or HR/Admin
            if (
                request.staff.toString() !== user._id &&
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to delete this request"
                )
            }

            // Only pending requests can be deleted
            if (request.status !== LeaveStatus.PENDING) {
                return errorResponseObject(
                    "Only pending requests can be deleted"
                )
            }

            // Delete request
            await LeaveRequest.findByIdAndDelete(id)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_CANCELLED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Deleted pending leave request`,
                metadata: {
                    leaveType: request.leaveType,
                    startDate: request.startDate,
                    endDate: request.endDate,
                    workingDays: request.workingDays,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Leave request deleted successfully", {
                id,
            })
        } catch (error) {
            console.error("Error deleting leave request:", error)
            return errorResponseObject("Failed to delete leave request")
        }
    }

    /**
     * Withdraw leave request
     * PUT /api/leave-requests/:id/withdraw
     */
    static async withdrawRequest(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { reason } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            if (!reason || !reason.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "reason",
                        message: "Withdrawal reason is required",
                    },
                ])
            }

            // Find request
            const request = await LeaveRequest.findById(id).populate(
                "staff",
                "name staffId"
            )

            if (!request) {
                return errorResponseObject("Leave request not found")
            }

            // Check ownership
            if ((request.staff as any)._id.toString() !== user._id) {
                return errorResponseObject(
                    "You can only withdraw your own requests"
                )
            }

            // Only pending or endorsed requests can be withdrawn
            if (
                request.status !== LeaveStatus.PENDING &&
                request.status !== LeaveStatus.ENDORSED
            ) {
                return errorResponseObject(
                    "Only pending or endorsed requests can be withdrawn"
                )
            }

            // Update status
            request.status = LeaveStatus.WITHDRAWN
            request.cancellation = {
                byStaff: user._id,
                at: new Date(),
                reason: reason.trim(),
            }

            await request.save()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_CANCELLED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Withdrew ${request.status} leave request`,
                metadata: {
                    leaveType: request.leaveType,
                    previousStatus: request.status,
                    reason,
                    workingDays: request.workingDays,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Leave request withdrawn successfully",
                request
            )
        } catch (error) {
            console.error("Error withdrawing request:", error)
            return errorResponseObject("Failed to withdraw leave request")
        }
    }

    /**
     * Endorse leave request
     * PUT /api/leave-requests/:id/endorse
     */
    static async endorseRequest(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { comment } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            // Find request with approval chain
            const request = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("endorsement.byPosition", "title")

            if (!request) {
                return errorResponseObject("Leave request not found")
            }

            // Check if request is pending
            if (request.status !== LeaveStatus.PENDING) {
                return errorResponseObject(
                    "Only pending requests can be endorsed"
                )
            }

            // Check if user holds the endorser position
            const userContract = await StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            })
            
            // Debug logging
            console.log('[EndorseRequest] User ID:', user._id)
            console.log('[EndorseRequest] User Contract:', !!userContract)
            console.log('[EndorseRequest] User Position ID:', userContract?.position?.toString())
            console.log('[EndorseRequest] Request endorsement:', request.endorsement)
            console.log('[EndorseRequest] Endorser Position ID:', request.endorsement?.byPosition?._id?.toString() || request.endorsement?.byPosition?.toString())
            
            // Handle both populated and non-populated endorsement.byPosition
            const endorserPositionId = request.endorsement?.byPosition?._id?.toString() || request.endorsement?.byPosition?.toString()
            
            if (
                !userContract ||
                !endorserPositionId ||
                userContract.position.toString() !== endorserPositionId
            ) {
                console.log('[EndorseRequest] Authorization failed:')
                console.log('  - Has contract:', !!userContract)
                console.log('  - Has endorser position:', !!endorserPositionId)
                console.log('  - Position match:', userContract?.position?.toString() === endorserPositionId)
                return errorResponseObject(
                    "You are not authorized to endorse this request"
                )
            }

            // Endorse the request (may auto-approve if single-level)
            await request.endorse(user._id, comment)

            // Get updated request
            const endorsedRequest = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("position", "title")
                .populate("department", "name")
                .populate("endorsement.byStaff", "name")
                .populate("approval.byStaff", "name")

            // Check if request was auto-approved (single-level approval)
            const wasAutoApproved = endorsedRequest?.status === LeaveStatus.APPROVED

            // Log to audit
            await AuditLogController.createAuditLog({
                action: wasAutoApproved ? AuditAction.LEAVE_APPROVED : AuditAction.LEAVE_ENDORSED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: wasAutoApproved 
                    ? `Approved leave request (single-level) for ${(request.staff as any).name}`
                    : `Endorsed leave request for ${(request.staff as any).name}`,
                metadata: {
                    staffName: (request.staff as any).name,
                    staffId: (request.staff as any).staffId,
                    leaveType: request.leaveType,
                    workingDays: request.workingDays,
                    comment,
                    singleLevelApproval: wasAutoApproved,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send SMS notifications
            try {
                if (wasAutoApproved) {
                    // Notify staff that leave is approved
                    await SMSService.notifyLeaveApproved(
                        endorsedRequest,
                        endorsedRequest?.staff,
                        user.name
                    )
                    console.log(`SMS sent to staff: Leave approved (single-level)`)
                } else if (endorsedRequest?.approval?.byPosition) {
                    // Find and notify approver
                    const approverPosition = await JobPosition.findById(
                        endorsedRequest.approval.byPosition
                    )
                    if (approverPosition) {
                        const approverContract = await StaffContract.findOne({
                            position: approverPosition._id,
                            status: ContractStatus.ACTIVE
                        }).populate('staff')
                        
                        if (approverContract?.staff) {
                            await SMSService.notifyLeaveEndorsed(
                                endorsedRequest,
                                approverContract.staff,
                                user.name
                            )
                            console.log(`SMS sent to approver: ${(approverContract.staff as any).name}`)
                        }
                    }
                }
            } catch (smsError) {
                console.error('Failed to send SMS notification:', smsError)
            }

            // Send in-app notifications
            try {
                const startDateFormatted = new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                const endDateFormatted = new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                if (wasAutoApproved) {
                    await NotificationController.notifyLeaveApproved({
                        staffId: (request.staff as any)._id.toString(),
                        leaveRequestId: id,
                        leaveType: request.leaveType,
                        startDate: startDateFormatted,
                        endDate: endDateFormatted,
                        approvedBy: user.name,
                    })
                } else {
                    await NotificationController.notifyLeaveEndorsed({
                        staffId: (request.staff as any)._id.toString(),
                        leaveRequestId: id,
                        leaveType: request.leaveType,
                        endorsedBy: user.name,
                    })
                }
            } catch (notifError) {
                console.error('Failed to send in-app notification:', notifError)
            }

            return successResponseObject(
                wasAutoApproved
                    ? "Leave request approved successfully (single-level approval)"
                    : "Leave request endorsed successfully",
                endorsedRequest
            )
        } catch (error) {
            console.error("Error endorsing request:", error)
            return errorResponseObject("Failed to endorse leave request")
        }
    }

    /**
     * Reject request by endorser
     * PUT /api/leave-requests/:id/reject-by-endorser
     */
    static async rejectRequestByEndorser(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { reason } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            if (!reason || !reason.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "reason",
                        message: "Rejection reason is required",
                    },
                ])
            }

            // Find request
            const request = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("endorsement.byPosition", "title")

            if (!request) {
                return errorResponseObject("Leave request not found")
            }

            // Check if request is pending
            if (request.status !== LeaveStatus.PENDING) {
                return errorResponseObject(
                    "Only pending requests can be rejected by endorser"
                )
            }

            // Check if user holds the endorser position
            const userContract = await StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            })
            
            // Handle both populated and non-populated endorsement.byPosition
            const endorserPositionId = request.endorsement?.byPosition?._id?.toString() || request.endorsement?.byPosition?.toString()

            if (
                !userContract ||
                !endorserPositionId ||
                userContract.position.toString() !== endorserPositionId
            ) {
                return errorResponseObject(
                    "You are not authorized to reject this request"
                )
            }

            // Reject the request
            request.status = LeaveStatus.REJECTED
            if (request.endorsement) {
                request.endorsement.byStaff = user._id
                request.endorsement.at = new Date()
                request.endorsement.comment = `REJECTED: ${reason.trim()}`
            }

            await request.save()

            // Get updated request
            const rejectedRequest = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("position", "title")
                .populate("department", "name")
                .populate("endorsement.byStaff", "name")

            // Send SMS notification to staff
            try {
                if (rejectedRequest?.staff) {
                    await SMSService.notifyLeaveDeclined(
                        rejectedRequest,
                        rejectedRequest.staff,
                        user.name,
                        reason.trim()
                    )
                    console.log(`[RejectByEndorser] SMS sent to staff about rejection`)
                }
            } catch (smsError) {
                console.error('[RejectByEndorser] Failed to send SMS notification:', smsError)
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_REJECTED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Rejected leave request at endorsement stage for ${
                    (request.staff as any).name
                }`,
                metadata: {
                    staffName: (request.staff as any).name,
                    staffId: (request.staff as any).staffId,
                    leaveType: request.leaveType,
                    workingDays: request.workingDays,
                    rejectionStage: "endorsement",
                    reason,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send in-app notification
            try {
                await NotificationController.notifyLeaveRejected({
                    staffId: (request.staff as any)._id.toString(),
                    leaveRequestId: id,
                    leaveType: request.leaveType,
                    rejectedBy: user.name,
                    reason: reason.trim(),
                })
            } catch (notifError) {
                console.error('Failed to send in-app notification:', notifError)
            }

            return successResponseObject(
                "Leave request rejected by endorser",
                rejectedRequest
            )
        } catch (error) {
            console.error("Error rejecting request by endorser:", error)
            return errorResponseObject("Failed to reject leave request")
        }
    }

    /**
     * Approve leave request
     * PUT /api/leave-requests/:id/approve
     */
    static async approveRequest(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        // Only use transactions if in replica set mode
        const useTransaction = this.isReplicaSet()
        let session: any = null
        
        if (useTransaction) {
            session = await mongoose.startSession()
            session.startTransaction()
        }

        try {
            const { comment } = req.body
            const user = (req as any).user

            if (!id) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            // Find request
            const requestQuery = LeaveRequest.findById(id)
                .populate("staff", "name staffId email")
                .populate("approval.byPosition", "title")
            const request = session ? await requestQuery.session(session) : await requestQuery

            if (!request) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Leave request not found")
            }

            // Check if request is endorsed or already approved
            if (request.status === LeaveStatus.APPROVED) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "This request has already been approved"
                )
            }
            
            if (request.status !== LeaveStatus.ENDORSED) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Only endorsed requests can be approved"
                )
            }

            // Check if user holds the approver position
            const contractQuery = StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            })
            const userContract = session ? await contractQuery.session(session) : await contractQuery
            
            // Handle both populated and non-populated approval.byPosition
            const approverPositionId = request.approval?.byPosition?._id?.toString() || request.approval?.byPosition?.toString()

            if (
                !userContract ||
                !approverPositionId ||
                userContract.position.toString() !== approverPositionId
            ) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "You are not authorized to approve this request"
                )
            }

            // Approve the request (will debit balance)
            await request.approve(user._id, comment, session)

            if (session) await session.commitTransaction()

            // Get updated request with phone number included
            const approvedRequest = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("position", "title")
                .populate("department", "name")
                .populate("endorsement.byStaff", "name")
                .populate("approval.byStaff", "name")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_APPROVED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Approved leave request for ${
                    (request.staff as any).name
                }`,
                metadata: {
                    staffName: (request.staff as any).name,
                    staffId: (request.staff as any).staffId,
                    leaveType: request.leaveType,
                    workingDays: request.workingDays,
                    startDate: request.startDate,
                    endDate: request.endDate,
                    comment,
                    balanceDebited: true,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send SMS notification to staff
            try {
                console.log('[ApproveRequest] Attempting to send SMS notification...')
                console.log('[ApproveRequest] Staff details:', {
                    name: approvedRequest?.staff?.name,
                    phone: approvedRequest?.staff?.phone,
                    hasPhone: !!approvedRequest?.staff?.phone
                })
                console.log('[ApproveRequest] Leave details:', {
                    leaveType: approvedRequest?.leaveType,
                    startDate: approvedRequest?.startDate,
                    endDate: approvedRequest?.endDate
                })
                
                if (approvedRequest?.staff) {
                    await SMSService.notifyLeaveApproved(
                        approvedRequest,
                        approvedRequest.staff,
                        user.name
                    )
                    console.log(`[ApproveRequest] SMS sent to staff: Leave approved by ${user.name}`)
                } else {
                    console.log('[ApproveRequest] No staff object found for SMS notification')
                }
            } catch (smsError) {
                console.error('[ApproveRequest] Failed to send SMS notification:', smsError)
            }

            // Send in-app notification
            try {
                const startDateFormatted = new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                const endDateFormatted = new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                await NotificationController.notifyLeaveApproved({
                    staffId: (request.staff as any)._id.toString(),
                    leaveRequestId: id,
                    leaveType: request.leaveType,
                    startDate: startDateFormatted,
                    endDate: endDateFormatted,
                    approvedBy: user.name,
                })
            } catch (notifError) {
                console.error('Failed to send in-app notification:', notifError)
            }

            return successResponseObject(
                "Leave request approved successfully",
                approvedRequest
            )
        } catch (error) {
            if (session) await session.abortTransaction()
            console.error("Error approving request:", error)
            return errorResponseObject(
                (error as Error).message || "Failed to approve leave request"
            )
        } finally {
            if (session) session.endSession()
        }
    }

    /**
     * Reject request by approver
     * PUT /api/leave-requests/:id/reject-by-approver
     */
    static async rejectRequestByApprover(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { reason } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            if (!reason || !reason.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "reason",
                        message: "Rejection reason is required",
                    },
                ])
            }

            // Find request
            const request = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("approval.byPosition", "title")

            if (!request) {
                return errorResponseObject("Leave request not found")
            }

            // Check if request is endorsed
            if (request.status !== LeaveStatus.ENDORSED) {
                return errorResponseObject(
                    "Only endorsed requests can be rejected by approver"
                )
            }

            // Check if user holds the approver position
            const userContract = await StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            })
            
            // Handle both populated and non-populated approval.byPosition
            const approverPositionId = request.approval?.byPosition?._id?.toString() || request.approval?.byPosition?.toString()

            if (
                !userContract ||
                !approverPositionId ||
                userContract.position.toString() !== approverPositionId
            ) {
                return errorResponseObject(
                    "You are not authorized to reject this request"
                )
            }

            // Reject the request
            await request.reject(user._id, reason.trim())

            // Get updated request
            const rejectedRequest = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("position", "title")
                .populate("department", "name")
                .populate("endorsement.byStaff", "name")
                .populate("approval.byStaff", "name")

            // Send SMS notification to staff
            try {
                if (rejectedRequest?.staff) {
                    await SMSService.notifyLeaveDeclined(
                        rejectedRequest,
                        rejectedRequest.staff,
                        user.name,
                        reason.trim()
                    )
                    console.log(`[RejectByApprover] SMS sent to staff about rejection`)
                }
            } catch (smsError) {
                console.error('[RejectByApprover] Failed to send SMS notification:', smsError)
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_REJECTED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Rejected leave request at approval stage for ${
                    (request.staff as any).name
                }`,
                metadata: {
                    staffName: (request.staff as any).name,
                    staffId: (request.staff as any).staffId,
                    leaveType: request.leaveType,
                    workingDays: request.workingDays,
                    rejectionStage: "approval",
                    reason,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send in-app notification
            try {
                await NotificationController.notifyLeaveRejected({
                    staffId: (request.staff as any)._id.toString(),
                    leaveRequestId: id,
                    leaveType: request.leaveType,
                    rejectedBy: user.name,
                    reason: reason.trim(),
                })
            } catch (notifError) {
                console.error('Failed to send in-app notification:', notifError)
            }

            return successResponseObject(
                "Leave request rejected by approver",
                rejectedRequest
            )
        } catch (error) {
            console.error("Error rejecting request by approver:", error)
            return errorResponseObject("Failed to reject leave request")
        }
    }

    /**
     * Cancel approved request
     * PUT /api/leave-requests/:id/cancel
     */
    static async cancelApprovedRequest(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        // Only use transactions if in replica set mode
        const useTransaction = this.isReplicaSet()
        let session: any = null
        
        if (useTransaction) {
            session = await mongoose.startSession()
            session.startTransaction()
        }

        try {
            const { reason } = req.body
            const user = (req as any).user

            if (!id) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            if (!reason || !reason.trim()) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "reason",
                        message: "Cancellation reason is required",
                    },
                ])
            }

            // Find request
            const requestQuery = LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
            const request = session ? await requestQuery.session(session) : await requestQuery

            if (!request) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Leave request not found")
            }

            // Check authorization
            if (
                (request.staff as any)._id.toString() !== user._id &&
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Unauthorized to cancel this request"
                )
            }

            // Check if can be cancelled
            if (!request.canBeCancelled()) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "This leave request cannot be cancelled. Only approved future leaves can be cancelled"
                )
            }

            // Cancel the request (will credit back balance)
            await request.cancel(user._id, reason.trim(), session)

            if (session) await session.commitTransaction()

            // Get updated request
            const cancelledRequest = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone")
                .populate("position", "title")
                .populate("department", "name")
                .populate("cancellation.byStaff", "name")

            // Send SMS notification to staff
            try {
                if (cancelledRequest?.staff) {
                    await SMSService.notifyLeaveCancelled(
                        cancelledRequest,
                        cancelledRequest.staff,
                        user.name,
                        reason.trim()
                    )
                    console.log(`[CancelRequest] SMS sent to staff about cancellation`)
                }
            } catch (smsError) {
                console.error('[CancelRequest] Failed to send SMS notification:', smsError)
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_CANCELLED,
                entityType: "LeaveRequest",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Cancelled approved leave request for ${
                    (request.staff as any).name
                }`,
                metadata: {
                    staffName: (request.staff as any).name,
                    staffId: (request.staff as any).staffId,
                    leaveType: request.leaveType,
                    workingDays: request.workingDays,
                    startDate: request.startDate,
                    reason,
                    balanceCredited: true,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Leave request cancelled successfully",
                cancelledRequest
            )
        } catch (error) {
            if (session) await session.abortTransaction()
            console.error("Error cancelling request:", error)
            return errorResponseObject(
                (error as Error).message || "Failed to cancel leave request"
            )
        } finally {
            if (session) session.endSession()
        }
    }

    /**
     * Get my leave requests
     * GET /api/leave-requests/my-requests
     */
    static async getMyRequests(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                year,
                status,
                leaveType,
                sortBy = "createdAt",
                sortOrder = "desc",
            } = req.query
            const user = (req as any).user

            // Pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Build query
            const query: any = { staff: user._id }

            if (year) {
                query.startYear = Number(year)
            }

            if (
                status &&
                Object.values(LeaveStatus).includes(status as LeaveStatus)
            ) {
                query.status = status
            }

            if (
                leaveType &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                query.leaveType = leaveType
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = [
                "createdAt",
                "startDate",
                "endDate",
                "workingDays",
                "status",
            ]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "createdAt"
            sortOptions[sortField as string] = sortOrder === "asc" ? 1 : -1

            // Execute query
            const [requests, totalCount] = await Promise.all([
                LeaveRequest.find(query)
                    .populate("position", "title")
                    .populate("department", "name")
                    .populate("endorsement.byStaff", "name")
                    .populate("approval.byStaff", "name")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                LeaveRequest.countDocuments(query),
            ])

            // Add computed fields
            const enhancedRequests = requests.map((request) => ({
                ...request,
                daysUntilStart:
                    request.status === LeaveStatus.APPROVED
                        ? Math.max(
                              0,
                              Math.ceil(
                                  (new Date(request.startDate).getTime() -
                                      Date.now()) /
                                      (1000 * 60 * 60 * 24)
                              )
                          )
                        : null,
                isStarted:
                    request.status === LeaveStatus.APPROVED &&
                    new Date(request.startDate) <= new Date(),
                canCancel:
                    request.status === LeaveStatus.APPROVED &&
                    new Date(request.startDate) > new Date(),
                canWithdraw: [
                    LeaveStatus.PENDING,
                    LeaveStatus.ENDORSED,
                ].includes(request.status),
            }))

            // Summary statistics
            const summary = {
                total: totalCount,
                pending: requests.filter(
                    (r) => r.status === LeaveStatus.PENDING
                ).length,
                endorsed: requests.filter(
                    (r) => r.status === LeaveStatus.ENDORSED
                ).length,
                approved: requests.filter(
                    (r) => r.status === LeaveStatus.APPROVED
                ).length,
                rejected: requests.filter(
                    (r) => r.status === LeaveStatus.REJECTED
                ).length,
                cancelled: requests.filter(
                    (r) => r.status === LeaveStatus.CANCELLED
                ).length,
                withdrawn: requests.filter(
                    (r) => r.status === LeaveStatus.WITHDRAWN
                ).length,
            }

            return successResponseObject(
                "Leave requests retrieved successfully",
                {
                    requests: enhancedRequests,
                    summary,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalCount / limitNum),
                        totalRecords: totalCount,
                        recordsPerPage: limitNum,
                        hasNext: skip + limitNum < totalCount,
                        hasPrev: pageNum > 1,
                    },
                }
            )
        } catch (error) {
            console.error("Error fetching my requests:", error)
            return errorResponseObject("Failed to retrieve leave requests")
        }
    }

    /**
     * Get request by ID
     * GET /api/leave-requests/:id
     */
    static async getRequestById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Request ID is required" },
                ])
            }

            const request = await LeaveRequest.findById(id)
                .populate("staff", "name staffId email phone department")
                .populate("contract", "startDate endDate")
                .populate("position", "title")
                .populate("department", "name")
                .populate("endorsement.byPosition", "title")
                .populate("endorsement.byStaff", "name email")
                .populate("approval.byPosition", "title")
                .populate("approval.byStaff", "name email")
                .populate("cancellation.byStaff", "name email")
                .populate("createdBy", "name email")
                .lean()

            if (!request) {
                return errorResponseObject("Leave request not found")
            }

            // Check authorization
            const canView =
                (request.staff as any)._id.toString() === user._id ||
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            if (!canView) {
                return errorResponseObject("Unauthorized to view this request")
            }

            // Add computed fields
            const enhancedRequest = {
                ...request,
                daysUntilStart:
                    request.status === LeaveStatus.APPROVED
                        ? Math.max(
                              0,
                              Math.ceil(
                                  (new Date(request.startDate).getTime() -
                                      Date.now()) /
                                      (1000 * 60 * 60 * 24)
                              )
                          )
                        : null,
                isStarted:
                    request.status === LeaveStatus.APPROVED &&
                    new Date(request.startDate) <= new Date(),
                canCancel:
                    request.status === LeaveStatus.APPROVED &&
                    new Date(request.startDate) > new Date(),
                canWithdraw: [
                    LeaveStatus.PENDING,
                    LeaveStatus.ENDORSED,
                ].includes(request.status),
                rejectionStage:
                    request.status === LeaveStatus.REJECTED
                        ? request.endorsement?.comment?.startsWith("REJECTED")
                            ? "endorsement"
                            : "approval"
                        : null,
            }

            return successResponseObject(
                "Leave request retrieved successfully",
                enhancedRequest
            )
        } catch (error) {
            console.error("Error fetching request:", error)
            return errorResponseObject("Failed to retrieve leave request")
        }
    }

    /**
     * Get pending endorsements
     * GET /api/leave-requests/pending-endorsements
     */
    static async getPendingEndorsements(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                sortBy = "createdAt",
                sortOrder = "asc",
            } = req.query
            const user = (req as any).user

            // Get user's active position
            const userContract = await StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            })

            if (!userContract) {
                return successResponseObject("No pending endorsements", {
                    requests: [],
                })
            }

            // Pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Query for pending requests where user is endorser
            const query = {
                status: LeaveStatus.PENDING,
                "endorsement.byPosition": userContract.position,
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = ["createdAt", "startDate", "workingDays"]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "createdAt"
            sortOptions[sortField as string] = sortOrder === "desc" ? -1 : 1

            const [requests, totalCount] = await Promise.all([
                LeaveRequest.find(query)
                    .populate("staff", "name staffId email department")
                    .populate("position", "title")
                    .populate("department", "name")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                LeaveRequest.countDocuments(query),
            ])

            // Add urgency indicators
            const enhancedRequests = requests.map((request) => {
                const daysUntilStart = Math.ceil(
                    (new Date(request.startDate).getTime() - Date.now()) /
                        (1000 * 60 * 60 * 24)
                )
                return {
                    ...request,
                    daysUntilStart,
                    urgency:
                        daysUntilStart <= 3
                            ? "high"
                            : daysUntilStart <= 7
                            ? "medium"
                            : "low",
                }
            })

            return successResponseObject(
                "Pending endorsements retrieved successfully",
                {
                    requests: enhancedRequests,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalCount / limitNum),
                        totalRecords: totalCount,
                        recordsPerPage: limitNum,
                        hasNext: skip + limitNum < totalCount,
                        hasPrev: pageNum > 1,
                    },
                }
            )
        } catch (error) {
            console.error("Error fetching pending endorsements:", error)
            return errorResponseObject(
                "Failed to retrieve pending endorsements"
            )
        }
    }

    /**
     * Get pending approvals
     * GET /api/leave-requests/pending-approvals
     */
    static async getPendingApprovals(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                sortBy = "createdAt",
                sortOrder = "asc",
            } = req.query
            const user = (req as any).user

            // Get user's active position
            const userContract = await StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            })

            if (!userContract) {
                return successResponseObject("No pending approvals", {
                    requests: [],
                })
            }

            // Pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Query for endorsed requests where user is approver
            const query = {
                status: LeaveStatus.ENDORSED,
                "approval.byPosition": userContract.position,
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = ["createdAt", "startDate", "workingDays"]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "createdAt"
            sortOptions[sortField as string] = sortOrder === "desc" ? -1 : 1

            const [requests, totalCount] = await Promise.all([
                LeaveRequest.find(query)
                    .populate("staff", "name staffId email department")
                    .populate("position", "title")
                    .populate("department", "name")
                    .populate("endorsement.byStaff", "name")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                LeaveRequest.countDocuments(query),
            ])

            // Add urgency indicators
            const enhancedRequests = requests.map((request) => {
                const daysUntilStart = Math.ceil(
                    (new Date(request.startDate).getTime() - Date.now()) /
                        (1000 * 60 * 60 * 24)
                )
                return {
                    ...request,
                    daysUntilStart,
                    urgency:
                        daysUntilStart <= 3
                            ? "high"
                            : daysUntilStart <= 7
                            ? "medium"
                            : "low",
                    endorsedBy: (request.endorsement?.byStaff as any)?.name,
                    endorsedAt: request.endorsement?.at,
                }
            })

            return successResponseObject(
                "Pending approvals retrieved successfully",
                {
                    requests: enhancedRequests,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalCount / limitNum),
                        totalRecords: totalCount,
                        recordsPerPage: limitNum,
                        hasNext: skip + limitNum < totalCount,
                        hasPrev: pageNum > 1,
                    },
                }
            )
        } catch (error) {
            console.error("Error fetching pending approvals:", error)
            return errorResponseObject("Failed to retrieve pending approvals")
        }
    }

    /**
     * Get leave calendar
     * GET /api/leave-requests/calendar
     */
    static async getLeaveCalendar(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate, department, team } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view leave calendar"
                )
            }

            // Validate dates
            if (!startDate || !endDate) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "dates",
                        message: "Start date and end date are required",
                    },
                ])
            }

            const start = new Date(startDate as string)
            const end = new Date(endDate as string)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return errorResponseObject("Invalid date format")
            }

            // Build query for approved leaves
            const query: any = {
                status: LeaveStatus.APPROVED,
                $or: [
                    { startDate: { $gte: start, $lte: end } },
                    { endDate: { $gte: start, $lte: end } },
                    { startDate: { $lte: start }, endDate: { $gte: end } },
                ],
            }

            // Filter by department if specified
            if (department) {
                query.department = department
            }

            // Get leaves
            const leaves = await LeaveRequest.find(query)
                .populate("staff", "name staffId email")
                .populate("department", "name")
                .populate("position", "title")
                .sort({ startDate: 1 })
                .lean()

            // Format for calendar display
            const calendarEvents = leaves.map((leave) => ({
                id: leave._id,
                title: `${(leave.staff as any).name} - ${leave.leaveType}`,
                start: leave.startDate,
                end: leave.endDate,
                staff: {
                    id: (leave.staff as any)._id,
                    name: (leave.staff as any).name,
                    staffId: (leave.staff as any).staffId,
                },
                leaveType: leave.leaveType,
                workingDays: leave.workingDays,
                department: (leave.department as any).name,
                position: (leave.position as any).title,
                color: this.getLeaveTypeColor(leave.leaveType),
            }))

            // Group by department for coverage analysis
            const departmentCoverage: any = {}
            for (const leave of leaves) {
                const deptName = (leave.department as any).name
                if (!departmentCoverage[deptName]) {
                    departmentCoverage[deptName] = []
                }
                departmentCoverage[deptName].push({
                    staffName: (leave.staff as any).name,
                    dates: `${new Date(
                        leave.startDate
                    ).toLocaleDateString()} - ${new Date(
                        leave.endDate
                    ).toLocaleDateString()}`,
                    days: leave.workingDays,
                })
            }

            return successResponseObject(
                "Leave calendar retrieved successfully",
                {
                    events: calendarEvents,
                    totalLeaves: calendarEvents.length,
                    dateRange: { start, end },
                    departmentCoverage,
                }
            )
        } catch (error) {
            console.error("Error fetching leave calendar:", error)
            return errorResponseObject("Failed to retrieve leave calendar")
        }
    }

    /**
     * Get leave request summary
     * GET /api/leave-requests/summary
     */
    static async getRequestSummary(req: Request): Promise<ResponseObject> {
        try {
            const { year, department } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject("Unauthorized to view leave summary")
            }

            // Build query
            const query: any = {}

            if (year) {
                query.startYear = Number(year)
            } else {
                query.startYear = new Date().getFullYear()
            }

            if (department) {
                query.department = department
            }

            // Get all requests
            const requests = await LeaveRequest.find(query).lean()

            // Calculate statistics
            const stats = {
                byStatus: {
                    pending: requests.filter(
                        (r) => r.status === LeaveStatus.PENDING
                    ).length,
                    endorsed: requests.filter(
                        (r) => r.status === LeaveStatus.ENDORSED
                    ).length,
                    approved: requests.filter(
                        (r) => r.status === LeaveStatus.APPROVED
                    ).length,
                    rejected: requests.filter(
                        (r) => r.status === LeaveStatus.REJECTED
                    ).length,
                    cancelled: requests.filter(
                        (r) => r.status === LeaveStatus.CANCELLED
                    ).length,
                    withdrawn: requests.filter(
                        (r) => r.status === LeaveStatus.WITHDRAWN
                    ).length,
                },
                byLeaveType: {} as Record<LeaveTypes, any>,
                totalRequests: requests.length,
                approvalRate: 0,
                rejectionRate: 0,
                averageProcessingTime: 0,
                rejectionAnalysis: {
                    atEndorsement: 0,
                    atApproval: 0,
                },
            }

            // Calculate by leave type
            for (const leaveType of Object.values(LeaveTypes)) {
                const typeRequests = requests.filter(
                    (r) => r.leaveType === leaveType
                )
                if (typeRequests.length > 0) {
                    stats.byLeaveType[leaveType] = {
                        total: typeRequests.length,
                        approved: typeRequests.filter(
                            (r) => r.status === LeaveStatus.APPROVED
                        ).length,
                        rejected: typeRequests.filter(
                            (r) => r.status === LeaveStatus.REJECTED
                        ).length,
                        pending: typeRequests.filter((r) =>
                            [
                                LeaveStatus.PENDING,
                                LeaveStatus.ENDORSED,
                            ].includes(r.status)
                        ).length,
                    }
                }
            }

            // Calculate rates
            const processedRequests = requests.filter((r) =>
                [LeaveStatus.APPROVED, LeaveStatus.REJECTED].includes(r.status)
            )

            if (processedRequests.length > 0) {
                stats.approvalRate = Math.round(
                    (stats.byStatus.approved / processedRequests.length) * 100
                )
                stats.rejectionRate = Math.round(
                    (stats.byStatus.rejected / processedRequests.length) * 100
                )
            }

            // Analyze rejections
            const rejectedRequests = requests.filter(
                (r) => r.status === LeaveStatus.REJECTED
            )
            for (const rejected of rejectedRequests) {
                if (rejected.endorsement?.comment?.startsWith("REJECTED")) {
                    stats.rejectionAnalysis.atEndorsement++
                } else if (rejected.approval?.decision === "rejected") {
                    stats.rejectionAnalysis.atApproval++
                }
            }

            // Calculate average processing time (for approved requests)
            const approvedRequests = requests.filter(
                (r) => r.status === LeaveStatus.APPROVED
            )
            if (approvedRequests.length > 0) {
                let totalProcessingTime = 0
                for (const approved of approvedRequests) {
                    if (approved.approval?.at && approved.createdAt) {
                        const processingTime =
                            new Date(approved.approval.at).getTime() -
                            new Date(approved.createdAt).getTime()
                        totalProcessingTime += processingTime
                    }
                }
                const avgTime = totalProcessingTime / approvedRequests.length
                stats.averageProcessingTime = Math.round(
                    avgTime / (1000 * 60 * 60 * 24)
                ) // Convert to days
            }

            return successResponseObject(
                "Leave request summary retrieved successfully",
                {
                    year: query.startYear,
                    department: department || "All",
                    statistics: stats,
                }
            )
        } catch (error) {
            console.error("Error generating request summary:", error)
            return errorResponseObject(
                "Failed to generate leave request summary"
            )
        }
    }

    /**
     * Calculate working days
     * GET /api/leave-requests/calculate-working-days
     */
    static async calculateWorkingDays(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate } = req.query

            if (!startDate || !endDate) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "dates",
                        message: "Start date and end date are required",
                    },
                ])
            }

            const start = new Date(startDate as string)
            const end = new Date(endDate as string)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return errorResponseObject("Invalid date format")
            }

            if (start > end) {
                return errorResponseObject(
                    "End date must be after or equal to start date"
                )
            }

            const result = await this.calculateWorkingDaysInternal(start, end)
            const holidaysInRange = await this.getHolidaysInRange(start, end)

            return successResponseObject(
                "Working days calculated successfully",
                {
                    startDate: start,
                    endDate: end,
                    totalDays:
                        Math.ceil(
                            (end.getTime() - start.getTime()) /
                                (1000 * 60 * 60 * 24)
                        ) + 1,
                    workingDays: result.total,
                    breakdown: result.breakdown,
                    includesWeekends: this.countWeekends(start, end) > 0,
                    holidays: holidaysInRange,
                    skippedHolidayDates: result.skippedHolidays || [],
                    holidaysExcluded: (result.skippedHolidays || []).length,
                }
            )
        } catch (error) {
            console.error("Error calculating working days:", error)
            return errorResponseObject("Failed to calculate working days")
        }
    }

    /**
     * Calculate period and resumption date
     * POST /api/leave-requests/calculate-period
     */
    static async calculatePeriodAndResumption(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate, numberOfDays } = req.body
            
            // Validation
            if (!startDate) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "startDate",
                        message: "Start date is required",
                    },
                ])
            }
            
            // Check that either endDate or numberOfDays is provided, not both
            if (endDate && numberOfDays) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "dates",
                        message: "Provide either endDate or numberOfDays, not both",
                    },
                ])
            }
            
            if (!endDate && !numberOfDays) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "dates",
                        message: "Either endDate or numberOfDays is required",
                    },
                ])
            }
            
            const start = new Date(startDate)
            if (isNaN(start.getTime())) {
                return errorResponseObject("Invalid start date format")
            }
            
            let actualEndDate: Date
            let computedEndDate = false
            
            // Calculate end date if numberOfDays provided
            if (numberOfDays) {
                if (numberOfDays <= 0 || !Number.isInteger(numberOfDays)) {
                    return validationErrorResponseObject("Validation failed", [
                        {
                            field: "numberOfDays",
                            message: "Number of days must be a positive integer",
                        },
                    ])
                }
                
                try {
                    actualEndDate = await this.calculateEndDateFromWorkingDays(start, numberOfDays)
                    computedEndDate = true
                } catch (error) {
                    return errorResponseObject("Failed to compute end date")
                }
            } else {
                actualEndDate = new Date(endDate)
                if (isNaN(actualEndDate.getTime())) {
                    return errorResponseObject("Invalid end date format")
                }
            }
            
            // Calculate resumption date (next working day after end date)
            let resumptionDate = new Date(actualEndDate)
            resumptionDate.setDate(resumptionDate.getDate() + 1)
            
            // Skip weekends and holidays to find next working day
            while (true) {
                const dayOfWeek = resumptionDate.getDay()
                const isHoliday = await Holiday.isHoliday(resumptionDate)
                
                if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                    resumptionDate.setDate(resumptionDate.getDate() + 1)
                } else {
                    break
                }
            }
            
            // Format dates for response
            const formatDate = (date: Date) => {
                return date.toISOString().split('T')[0]
            }

            // Calculate working days and get holidays in the period
            const workingDaysResult = await this.calculateWorkingDaysInternal(start, actualEndDate)
            const holidaysInRange = await this.getHolidaysInRange(start, actualEndDate)

            return successResponseObject(
                "Period and resumption date calculated successfully",
                {
                    period: {
                        startDate: formatDate(start),
                        endDate: formatDate(actualEndDate),
                        display: `${formatDate(start)} to ${formatDate(actualEndDate)}`
                    },
                    resumptionDate: formatDate(resumptionDate),
                    computedEndDate,
                    requestedDays: numberOfDays || null,
                    // Include working days info
                    workingDays: workingDaysResult.total,
                    workingDaysBreakdown: workingDaysResult.breakdown,
                    // Include holidays info
                    holidaysInPeriod: holidaysInRange.map(h => h.name),
                    holidayDatesSkipped: workingDaysResult.skippedHolidays || [],
                    totalHolidaysExcluded: (workingDaysResult.skippedHolidays || []).length,
                }
            )
        } catch (error) {
            console.error("Error calculating period and resumption:", error)
            return errorResponseObject("Failed to calculate period and resumption date")
        }
    }

    /**
     * Check overlapping requests
     * POST /api/leave-requests/check-overlapping
     */
    static async checkOverlapping(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate } = req.body
            const user = (req as any).user

            if (!startDate || !endDate) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "dates",
                        message: "Start date and end date are required",
                    },
                ])
            }

            const start = new Date(startDate)
            const end = new Date(endDate)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return errorResponseObject("Invalid date format")
            }

            const overlapping = await LeaveRequest.getOverlappingRequests(
                user._id,
                start,
                end
            )

            if (overlapping.length === 0) {
                return successResponseObject("No overlapping requests found", {
                    hasOverlap: false,
                    conflicts: [],
                })
            }

            // Format conflict details
            const conflicts = overlapping.map((request) => ({
                id: request._id,
                leaveType: request.leaveType,
                startDate: request.startDate,
                endDate: request.endDate,
                status: request.status,
                workingDays: request.workingDays,
            }))

            return successResponseObject("Overlapping requests found", {
                hasOverlap: true,
                conflicts,
            })
        } catch (error) {
            console.error("Error checking overlapping:", error)
            return errorResponseObject("Failed to check overlapping requests")
        }
    }

    /**
     * Create emergency leave (HR/Admin only)
     * POST /api/leave-requests/emergency
     */
    static async createEmergencyLeave(req: Request): Promise<ResponseObject> {
        // Only use transactions if in replica set mode
        const useTransaction = this.isReplicaSet()
        let session: any = null
        
        if (useTransaction) {
            session = await mongoose.startSession()
            session.startTransaction()
        }

        try {
            const {
                staffId,
                leaveType,
                startDate,
                endDate,
                reason,
                skipValidation = false,
            } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can create emergency leave"
                )
            }

            // Basic validation
            if (!staffId || !leaveType || !startDate || !endDate) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "required",
                        message:
                            "Staff ID, leave type, start date, and end date are required",
                    },
                ])
            }
            
            const start = new Date(startDate)
            const end = new Date(endDate)
            
            // Date validation - unless skipValidation is true for true emergencies
            if (!skipValidation) {
                // Check if start date is a weekend
                const startDayOfWeek = start.getDay()
                if (startDayOfWeek === 0 || startDayOfWeek === 6) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot start on a weekend (Saturday or Sunday). Use skipValidation=true for emergencies."
                    )
                }
                
                // Check if start date is a holiday
                const isStartDateHoliday = await Holiday.isHoliday(start)
                if (isStartDateHoliday) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot start on a public holiday. Use skipValidation=true for emergencies."
                    )
                }
                
                // Check if end date is a weekend
                const endDayOfWeek = end.getDay()
                if (endDayOfWeek === 0 || endDayOfWeek === 6) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot end on a weekend (Saturday or Sunday). Use skipValidation=true for emergencies."
                    )
                }
                
                // Check if end date is a holiday
                const isEndDateHoliday = await Holiday.isHoliday(end)
                if (isEndDateHoliday) {
                    if (session) await session.abortTransaction()
                    return errorResponseObject(
                        "Leave cannot end on a public holiday. Use skipValidation=true for emergencies."
                    )
                }
            }

            // Get staff and contract
            const staffQuery = Staff.findById(staffId)
            const staff = session ? await staffQuery.session(session) : await staffQuery
            if (!staff) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Staff member not found")
            }

            const contractQuery = StaffContract.findOne({
                staff: staffId,
                status: ContractStatus.ACTIVE,
            }).populate("position")
            const activeContract = session ? await contractQuery.session(session) : await contractQuery

            if (!activeContract) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Staff has no active contract")
            }

            // Calculate working days
            const workingDaysResult = await this.calculateWorkingDaysInternal(
                new Date(startDate),
                new Date(endDate)
            )

            // Get position details
            const positionQuery = JobPosition.findById(activeContract.position)
            const position = session ? await positionQuery.session(session) : await positionQuery
            if (!position) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Position not found")
            }

            const departmentQuery = Department.findById(position.department)
            const department = session ? await departmentQuery.session(session) : await departmentQuery
            if (!department) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Department not found")
            }

            // Create emergency leave request (pre-approved)
            const leaveRequestData = {
                staff: staffId,
                contract: activeContract._id,
                position: position._id,
                department: department._id,
                positionTitleSnapshot: position.title,
                departmentNameSnapshot: department.name,
                leaveType,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                startYear: new Date(startDate).getFullYear(),
                workingDays: workingDaysResult.total,
                workingDaysBreakdown: workingDaysResult.breakdown,
                status: LeaveStatus.APPROVED,
                reason: `EMERGENCY: ${reason}`,
                createdBy: user._id,
                endorsement: {
                    byStaff: user._id,
                    at: new Date(),
                    comment: "Emergency leave - auto-endorsed",
                },
                approval: {
                    byStaff: user._id,
                    at: new Date(),
                    comment: "Emergency leave - auto-approved",
                    decision: "approved",
                },
            }

            // Create leave request
            let leaveRequest
            if (session) {
                leaveRequest = await LeaveRequest.create([leaveRequestData], {
                    session,
                })
            } else {
                const newRequest = await LeaveRequest.create(leaveRequestData)
                leaveRequest = [newRequest]
            }

            // Debit balance if not skipping validation (period-based)
            if (!skipValidation) {
                const emergencyStartDate = new Date(startDate)
                const balanceQuery = LeaveBalance.findOne({
                    staff: staffId,
                    leaveType,
                    periodStart: { $lte: emergencyStartDate },
                    periodEnd: { $gte: emergencyStartDate },
                })
                const balance = session ? await balanceQuery.session(session) : await balanceQuery

                if (balance) {
                    await balance.debit(
                        workingDaysResult.total,
                        `Emergency leave request ${leaveRequest[0]._id}`
                    )
                }
            }

            if (session) await session.commitTransaction()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_APPROVED,
                entityType: "LeaveRequest",
                entityId: leaveRequest[0]._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created emergency leave for ${staff.name}`,
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    leaveType,
                    startDate,
                    endDate,
                    workingDays: workingDaysResult.total,
                    reason,
                    skipValidation,
                    isEmergency: true,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Emergency leave created successfully",
                leaveRequest[0]
            )
        } catch (error) {
            if (session) await session.abortTransaction()
            console.error("Error creating emergency leave:", error)
            return errorResponseObject("Failed to create emergency leave")
        } finally {
            if (session) session.endSession()
        }
    }

    // Helper methods
    /**
     * Calculate end date given start date and number of working days
     * Skips weekends and holidays
     */
    private static async calculateEndDateFromWorkingDays(
        startDate: Date,
        workingDays: number
    ): Promise<Date> {
        if (workingDays <= 0) {
            throw new Error("Number of days must be positive")
        }

        let currentDate = new Date(startDate)
        let daysAdded = 0
        
        // Start from the day before, as we'll increment first
        currentDate.setDate(currentDate.getDate() - 1)
        
        while (daysAdded < workingDays) {
            currentDate.setDate(currentDate.getDate() + 1)
            
            // Skip weekends
            const dayOfWeek = currentDate.getDay()
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                // Skip holidays
                const isHoliday = await Holiday.isHoliday(currentDate)
                if (!isHoliday) {
                    daysAdded++
                }
            }
        }
        
        // Ensure end date doesn't fall on weekend or holiday
        // This shouldn't happen with the logic above, but adding as safety
        let endDateAdjusted = false
        while (true) {
            const dayOfWeek = currentDate.getDay()
            const isHoliday = await Holiday.isHoliday(currentDate)
            
            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                currentDate.setDate(currentDate.getDate() + 1)
                endDateAdjusted = true
            } else {
                break
            }
        }
        
        if (endDateAdjusted) {
            console.log('[LeaveRequest] End date was adjusted to avoid weekend/holiday')
        }
        
        return currentDate
    }

    private static async calculateWorkingDaysInternal(
        startDate: Date,
        endDate: Date
    ): Promise<{ total: number; breakdown: any; skippedHolidays?: string[] }> {
        console.log(`[LeaveRequest] Calculating working days from ${startDate.toDateString()} to ${endDate.toDateString()}`)
        
        const breakdown: any = {}
        let total = 0
        const skippedHolidays: string[] = []

        // Normalize to start of day
        const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const normalizedEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())

        while (currentDate <= normalizedEndDate) {
            const year = currentDate.getFullYear()
            const dayOfWeek = currentDate.getDay()
            console.log(`[LeaveRequest] Checking date: ${currentDate.toDateString()}, dayOfWeek: ${dayOfWeek}`)

            // Skip weekends
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                // Check if it's a holiday
                const isHoliday = await Holiday.isHoliday(currentDate)
                console.log(`[LeaveRequest] Is ${currentDate.toDateString()} a holiday? ${isHoliday}`)

                if (isHoliday) {
                    skippedHolidays.push(currentDate.toISOString().split('T')[0])
                    console.log(`[LeaveRequest] Skipping holiday: ${currentDate.toDateString()}`)
                } else {
                    breakdown[year] = (breakdown[year] || 0) + 1
                    total++
                    console.log(`[LeaveRequest] Counted working day: ${currentDate.toDateString()}, total: ${total}`)
                }
            } else {
                console.log(`[LeaveRequest] Skipping weekend: ${currentDate.toDateString()}`)
            }

            currentDate.setDate(currentDate.getDate() + 1)
        }

        if (skippedHolidays.length > 0) {
            console.log(`[LeaveRequest] Skipped ${skippedHolidays.length} holiday(s): ${skippedHolidays.join(', ')}`)
        }

        console.log(`[LeaveRequest] Final working days count: ${total}`)
        return { total, breakdown, skippedHolidays }
    }

    private static countWeekends(startDate: Date, endDate: Date): number {
        let count = 0
        const currentDate = new Date(startDate)

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay()
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                count++
            }
            currentDate.setDate(currentDate.getDate() + 1)
        }

        return count
    }

    private static async getHolidaysInRange(
        startDate: Date,
        endDate: Date
    ): Promise<any[]> {
        const holidays = await Holiday.getHolidaysInRange(startDate, endDate)
        return holidays.map((h) => ({
            name: h.name,
            date: h.date,
            type: h.type,
        }))
    }

    private static getLeaveTypeColor(leaveType: LeaveTypes): string {
        const colors = {
            [LeaveTypes.ANNUAL]: "#4CAF50",
            [LeaveTypes.SICK]: "#FF9800",
            [LeaveTypes.MATERNITY]: "#E91E63",
            [LeaveTypes.PATERNITY]: "#2196F3",
            [LeaveTypes.BEREAVEMENT]: "#9C27B0",
        }
        return colors[leaveType] || "#607D8B"
    }

    /**
     * Get calendar events for all approved leave requests
     * GET /api/leave-calendar?op=calendar-events
     */
    static async getCalendarEvents(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate, department } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin/Manager can view calendar events"
                )
            }

            if (!startDate || !endDate) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "startDate", message: "Start date is required" },
                    { field: "endDate", message: "End date is required" },
                ])
            }

            const start = new Date(startDate as string)
            const end = new Date(endDate as string)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "startDate", message: "Invalid start date format" },
                    { field: "endDate", message: "Invalid end date format" },
                ])
            }

            // Build query for leave requests (all filterable statuses)
            const query: any = {
                status: { $in: [LeaveStatus.APPROVED, LeaveStatus.PENDING, LeaveStatus.ENDORSED, LeaveStatus.REJECTED] },
                $or: [
                    { startDate: { $lte: end, $gte: start } },
                    { endDate: { $gte: start, $lte: end } },
                    { startDate: { $lte: start }, endDate: { $gte: end } },
                ],
            }

            // Filter by department if specified (and user is not HR/Admin)
            if (department && !user?.permissions?.includes("HR") && !user?.permissions?.includes("ADMIN")) {
                // Get staff in the specified department
                const staffInDept = await Staff.find({ department }).select("_id")
                const staffIds = staffInDept.map(s => s._id)
                query.staff = { $in: staffIds }
            }

            // Get leave requests
            const leaveRequests = await LeaveRequest.find(query)
                .populate("staff", "name staffId department")
                .populate("approval.byStaff", "name")
                .sort({ startDate: 1 })

            // Transform to calendar events
            const events = []
            for (const request of leaveRequests) {
                const requestStart = new Date(request.startDate)
                const requestEnd = new Date(request.endDate)
                
                // Create events for each day in the leave period
                const currentDate = new Date(requestStart)
                while (currentDate <= requestEnd) {
                    // Skip weekends if not sick leave
                    const dayOfWeek = currentDate.getDay()
                    if (dayOfWeek !== 0 && dayOfWeek !== 6 || request.leaveType === LeaveTypes.SICK) {
                        events.push({
                            id: request._id,
                            title: `${request.leaveType} - ${(request.staff as any).name}`,
                            start: new Date(currentDate),
                            end: new Date(currentDate),
                            allDay: true,
                            backgroundColor: this.getLeaveTypeColor(request.leaveType),
                            extendedProps: {
                                staffId: (request.staff as any).staffId,
                                staffName: (request.staff as any).name,
                                department: (request.staff as any).department,
                                leaveType: request.leaveType,
                                status: request.status,
                                approver: (request.approval?.byStaff as any)?.name,
                                reason: request.reason,
                                requestId: request._id,
                            },
                        })
                    }
                    currentDate.setDate(currentDate.getDate() + 1)
                }
            }

            return successResponseObject("Calendar events retrieved successfully", {
                events,
                totalEvents: events.length,
                dateRange: { startDate: start, endDate: end },
            })
        } catch (error) {
            console.error("Error fetching calendar events:", error)
            return errorResponseObject("Failed to fetch calendar events")
        }
    }

    /**
     * Get calendar events for current user's leave requests
     * GET /api/leave-calendar?op=my-calendar
     */
    static async getMyCalendarEvents(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate } = req.query
            const user = (req as any).user

            if (!startDate || !endDate) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "startDate", message: "Start date is required" },
                    { field: "endDate", message: "End date is required" },
                ])
            }

            const start = new Date(startDate as string)
            const end = new Date(endDate as string)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "startDate", message: "Invalid start date format" },
                    { field: "endDate", message: "Invalid end date format" },
                ])
            }

            // Get user's leave requests
            const query: any = {
                staff: user._id,
                $or: [
                    { startDate: { $lte: end, $gte: start } },
                    { endDate: { $gte: start, $lte: end } },
                    { startDate: { $lte: start }, endDate: { $gte: end } },
                ],
            }

            const leaveRequests = await LeaveRequest.find(query)
                .populate("approval.byStaff", "name")
                .sort({ startDate: 1 })

            // Transform to calendar events
            const events = []
            for (const request of leaveRequests) {
                const requestStart = new Date(request.startDate)
                const requestEnd = new Date(request.endDate)
                
                // Create events for each day in the leave period
                const currentDate = new Date(requestStart)
                while (currentDate <= requestEnd) {
                    // Skip weekends if not sick leave
                    const dayOfWeek = currentDate.getDay()
                    if (dayOfWeek !== 0 && dayOfWeek !== 6 || request.leaveType === LeaveTypes.SICK) {
                        events.push({
                            id: request._id,
                            title: `${request.leaveType} Leave`,
                            start: new Date(currentDate),
                            end: new Date(currentDate),
                            allDay: true,
                            backgroundColor: this.getLeaveTypeColor(request.leaveType),
                            borderColor: request.status === LeaveStatus.APPROVED ? 
                                this.getLeaveTypeColor(request.leaveType) : "#9CA3AF",
                            extendedProps: {
                                leaveType: request.leaveType,
                                status: request.status,
                                approver: (request.approval?.byStaff as any)?.name,
                                reason: request.reason,
                                requestId: request._id,
                            },
                        })
                    }
                    currentDate.setDate(currentDate.getDate() + 1)
                }
            }

            return successResponseObject("My calendar events retrieved successfully", {
                events,
                totalEvents: events.length,
                dateRange: { startDate: start, endDate: end },
            })
        } catch (error) {
            console.error("Error fetching my calendar events:", error)
            return errorResponseObject("Failed to fetch calendar events")
        }
    }
}

export default LeaveRequestController
