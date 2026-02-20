import { Request } from "express"
import mongoose from "mongoose"
import CallIn from "../models/call-in.model"
import LeaveRequest from "../models/leave-request.model"
import LeaveBalance from "../models/leave-balance.model"
import Staff from "../models/staff.model"
import Department from "../models/department.model"
import StaffContract from "../models/staff-contract.model"
import JobPosition from "../models/job-position.model"
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
    LeaveStatus,
    ContractStatus,
} from "../utils/types"

export class CallInController {
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
     * Create a new call-in
     * POST /api/call-ins
     */
    static async createCallIn(req: Request): Promise<ResponseObject> {
        // Only use transactions if in replica set mode
        const useTransaction = this.isReplicaSet()
        let session: any = null
        
        if (useTransaction) {
            session = await mongoose.startSession()
            session.startTransaction()
        }

        try {
            const {
                leaveRequestId,
                callInStartDate,
                callInEndDate,
                reason,
                workingDaysRecovered,
            } = req.body
            const user = (req as any).user

            console.log("[CallIn Controller] Received data:", {
                leaveRequestId,
                callInStartDate,
                callInEndDate,
                reason: reason?.substring(0, 50),
                reasonLength: reason?.length,
            })

            // Validation
            const errors = []

            if (!leaveRequestId) {
                errors.push({
                    field: "leaveRequestId",
                    message: "Leave request ID is required",
                })
            }

            if (!callInStartDate) {
                errors.push({
                    field: "callInStartDate",
                    message: "Call-in start date is required",
                })
            }

            if (!callInEndDate) {
                errors.push({
                    field: "callInEndDate",
                    message: "Call-in end date is required",
                })
            }

            if (!reason || reason.trim().length < 10) {
                errors.push({
                    field: "reason",
                    message:
                        "Reason is required and must be at least 10 characters",
                })
            }

            if (errors.length > 0) {
                if (session) await session.abortTransaction()
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Verify leave request exists and is approved
            const leaveRequest = await LeaveRequest.findById(leaveRequestId)
                .populate("staff", "name staffId email")
                .populate("department")
                .session(session)

            if (!leaveRequest) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Leave request not found")
            }

            if (leaveRequest.status !== LeaveStatus.APPROVED) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Can only call in staff from approved leave"
                )
            }

            // Check authorization - HR/Admin unrestricted, or position-based approver
            const hasHRPermission = user?.permissions?.includes("HR")
            const hasAdminPermission = user?.permissions?.includes("ADMIN")
            let hasPermission = hasHRPermission || hasAdminPermission

            if (!hasPermission) {
                // Check position-based approver relationship
                const userContract = await StaffContract.findOne({
                    staff: user._id,
                    status: "active",
                })
                if (userContract?.position) {
                    const staffPosition = await JobPosition.findById(leaveRequest.position)
                    if (staffPosition?.approverPosition?.toString() === userContract.position.toString()) {
                        hasPermission = true
                    }
                }
            }

            if (!hasPermission) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Only HR, Admin, or position-based approvers can create call-ins"
                )
            }

            const department = await Department.findById(
                leaveRequest.department
            ).session(session)
            if (!department) {
                if (session) await session.abortTransaction()
                return errorResponseObject("Department not found")
            }

            const isDepartmentHead = department.head?.toString() === user._id

            // Validate dates
            const callStart = new Date(callInStartDate)
            const callEnd = new Date(callInEndDate)
            const leaveStart = new Date(leaveRequest.startDate)
            const leaveEnd = new Date(leaveRequest.endDate)

            if (callStart < leaveStart || callEnd > leaveEnd) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Call-in dates must be within the original leave period"
                )
            }

            if (callStart > callEnd) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Call-in start date must be before or equal to end date"
                )
            }

            // Check for overlapping call-ins
            const existingCallIn = await CallIn.findOne({
                leaveRequest: leaveRequestId,
                $or: [
                    {
                        callInStartDate: { $lte: callEnd },
                        callInEndDate: { $gte: callStart },
                    },
                ],
            }).session(session)

            if (existingCallIn) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Overlapping call-in already exists for this leave period"
                )
            }

            // Calculate working days if not provided
            let calculatedWorkingDays = workingDaysRecovered
            if (!calculatedWorkingDays) {
                calculatedWorkingDays = await this.calculateWorkingDaysForCallIn(callStart, callEnd)
                console.log(`[CallIn] Calculated working days: ${calculatedWorkingDays}`)
            }

            if (calculatedWorkingDays <= 0) {
                if (session) await session.abortTransaction()
                return errorResponseObject(
                    "Call-in period contains no working days (only weekends/holidays)"
                )
            }

            // Create the call-in
            const callInData = {
                leaveRequest: leaveRequestId,
                staff: (leaveRequest.staff as any)._id,
                department: (leaveRequest.department as any)._id,
                callInStartDate: callStart,
                callInEndDate: callEnd,
                workingDaysRecovered: calculatedWorkingDays,
                reason: reason.trim(),
                requestedBy: user._id,
                requestedAt: new Date(),
            }

            let callIn
            if (session) {
                callIn = await CallIn.create([callInData], { session })
                await session.commitTransaction()
            } else {
                const newCallIn = await CallIn.create(callInData)
                callIn = [newCallIn]
            }

            // The model's post-save hook will automatically process the call-in and credit the balance

            // Populate for response
            const populatedCallIn = await CallIn.findById(callIn[0]._id)
                .populate("staff", "name staffId email")
                .populate("department", "name")
                .populate("leaveRequest", "leaveType startDate endDate")
                .populate("requestedBy", "name")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.CALLIN_CREATED,
                entityType: "CallIn",
                entityId: callIn[0]._id as string,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created call-in for ${
                    (leaveRequest.staff as any).name
                }`,
                metadata: {
                    staffName: (leaveRequest.staff as any).name,
                    staffId: (leaveRequest.staff as any).staffId,
                    leaveRequestId,
                    callInPeriod: {
                        start: callStart,
                        end: callEnd,
                    },
                    workingDaysRecovered: callIn[0].workingDaysRecovered,
                    reason,
                    isDepartmentHead,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send automatic SMS notification to staff
            try {
                console.log(
                    "[CallIn] Sending SMS notification to staff about call-in..."
                )
                await SMSService.notifyCallInCreated(
                    populatedCallIn,
                    leaveRequest.staff as any,
                    user.name
                )
                console.log(
                    `[CallIn] SMS notification sent to staff: ${
                        (leaveRequest.staff as any).name
                    }`
                )
            } catch (smsError) {
                console.error(
                    "[CallIn] Failed to send SMS notification:",
                    smsError
                )
                // Don't fail the call-in creation if SMS fails
            }

            // Send in-app notification
            try {
                const callInDateFormatted = new Date(callStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                await NotificationController.notifyCallIn({
                    staffId: (leaveRequest.staff as any)._id.toString(),
                    staffName: (leaveRequest.staff as any).name,
                    callInId: populatedCallIn._id.toString(),
                    reason: reason.trim(),
                    callInDate: callInDateFormatted,
                    requestedBy: user.name,
                    departmentId: (leaveRequest.department as any)._id.toString(),
                })
            } catch (notifError) {
                console.error('[CallIn] Failed to send in-app notification:', notifError)
            }

            return successResponseObject(
                "Call-in created successfully",
                populatedCallIn
            )
        } catch (error) {
            if (session) await session.abortTransaction()
            console.error("Error creating call-in:", error)
            return errorResponseObject(
                (error as any).message || "Failed to create call-in"
            )
        } finally {
            if (session) await session.endSession()
        }
    }

    /**
     * Update call-in (within 24 hours only)
     * PUT /api/call-ins/:id
     */
    static async updateCallIn(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const { callInStartDate, callInEndDate, reason } = req.body
            const user = (req as any).user

            if (!id) {
                await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Call-in ID is required" },
                ])
            }

            // Find call-in
            const callIn = await CallIn.findById(id)
                .populate("staff")
                .populate("department")
                .session(session)

            if (!callIn) {
                await session.abortTransaction()
                return errorResponseObject("Call-in not found")
            }

            // Check if user can update (creator or HR/Admin)
            const isCreator = callIn.requestedBy.toString() === user._id
            const hasPermission =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isCreator && !hasPermission) {
                await session.abortTransaction()
                return errorResponseObject(
                    "Unauthorized to update this call-in"
                )
            }

            // Check if within 24 hours of creation
            const hoursSinceCreation =
                (Date.now() - new Date((callIn as any).createdAt).getTime()) /
                (1000 * 60 * 60)
            if (hoursSinceCreation > 24 && !hasPermission) {
                await session.abortTransaction()
                return errorResponseObject(
                    "Call-ins can only be updated within 24 hours of creation"
                )
            }

            const changes = []
            const updates: any = {}
            let oldWorkingDays = callIn.workingDaysRecovered

            // Handle date changes
            if (callInStartDate || callInEndDate) {
                const newStartDate = callInStartDate
                    ? new Date(callInStartDate)
                    : callIn.callInStartDate
                const newEndDate = callInEndDate
                    ? new Date(callInEndDate)
                    : callIn.callInEndDate

                // Validate new dates
                const leaveRequest = await LeaveRequest.findById(
                    callIn.leaveRequest
                ).session(session)
                if (!leaveRequest) {
                    await session.abortTransaction()
                    return errorResponseObject(
                        "Associated leave request not found"
                    )
                }

                if (
                    newStartDate < leaveRequest.startDate ||
                    newEndDate > leaveRequest.endDate
                ) {
                    await session.abortTransaction()
                    return errorResponseObject(
                        "Call-in dates must be within the original leave period"
                    )
                }

                if (newStartDate > newEndDate) {
                    await session.abortTransaction()
                    return errorResponseObject(
                        "Start date must be before or equal to end date"
                    )
                }

                // Check for overlapping with other call-ins
                const overlapping = await CallIn.findOne({
                    _id: { $ne: id },
                    leaveRequest: callIn.leaveRequest,
                    $or: [
                        {
                            callInStartDate: { $lte: newEndDate },
                            callInEndDate: { $gte: newStartDate },
                        },
                    ],
                }).session(session)

                if (overlapping) {
                    await session.abortTransaction()
                    return errorResponseObject(
                        "New dates would overlap with another call-in"
                    )
                }

                if (callInStartDate) {
                    changes.push({
                        field: "callInStartDate",
                        oldValue: callIn.callInStartDate,
                        newValue: newStartDate,
                        fieldLabel: "Start Date",
                    })
                    updates.callInStartDate = newStartDate
                }

                if (callInEndDate) {
                    changes.push({
                        field: "callInEndDate",
                        oldValue: callIn.callInEndDate,
                        newValue: newEndDate,
                        fieldLabel: "End Date",
                    })
                    updates.callInEndDate = newEndDate
                }

                // Recalculate working days
                callIn.callInStartDate = newStartDate
                callIn.callInEndDate = newEndDate
                const newWorkingDays = await callIn.calculateWorkingDays()

                if (newWorkingDays !== oldWorkingDays) {
                    updates.workingDaysRecovered = newWorkingDays

                    // Adjust balance (period-based)
                    const balanceDate = new Date()
                    const balance = await LeaveBalance.findOne({
                        staff: (callIn.staff as any)._id,
                        leaveType: leaveRequest.leaveType,
                        periodStart: { $lte: balanceDate },
                        periodEnd: { $gte: balanceDate },
                    }).session(session)

                    if (balance) {
                        const daysDifference = newWorkingDays - oldWorkingDays
                        balance.used = Math.max(
                            0,
                            balance.used - daysDifference
                        )

                        const note = `Call-in updated: ${
                            daysDifference > 0 ? "+" : ""
                        }${daysDifference} days adjustment`
                        balance.notes = balance.notes
                            ? `${balance.notes}\n${note}`
                            : note

                        await balance.save({ session })
                    }
                }
            }

            // Handle reason change
            if (reason !== undefined) {
                if (reason.trim().length < 10) {
                    await session.abortTransaction()
                    return errorResponseObject(
                        "Reason must be at least 10 characters"
                    )
                }

                changes.push({
                    field: "reason",
                    oldValue: callIn.reason,
                    newValue: reason.trim(),
                    fieldLabel: "Reason",
                })
                updates.reason = reason.trim()
            }

            if (Object.keys(updates).length === 0) {
                await session.abortTransaction()
                return successResponseObject("No changes to update", callIn)
            }

            // Update call-in
            const updatedCallIn = await CallIn.findByIdAndUpdate(id, updates, {
                new: true,
                session,
            })
                .populate("staff", "name staffId email")
                .populate("department", "name")
                .populate("leaveRequest", "leaveType")
                .populate("requestedBy", "name")

            await session.commitTransaction()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: "CALLIN_UPDATED" as any,
                entityType: "CallIn",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: "Updated call-in",
                changes,
                metadata: {
                    oldWorkingDays,
                    newWorkingDays:
                        updates.workingDaysRecovered || oldWorkingDays,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send automatic SMS notification to staff about update
            try {
                console.log(
                    "[CallIn] Sending SMS notification to staff about call-in update..."
                )
                await SMSService.notifyCallInUpdated(
                    updatedCallIn,
                    updatedCallIn?.staff as any,
                    user.name,
                    changes
                )
                console.log(
                    `[CallIn] SMS update notification sent to staff: ${
                        (updatedCallIn?.staff as any)?.name
                    }`
                )
            } catch (smsError) {
                console.error(
                    "[CallIn] Failed to send SMS update notification:",
                    smsError
                )
                // Don't fail the call-in update if SMS fails
            }

            return successResponseObject(
                "Call-in updated successfully",
                updatedCallIn
            )
        } catch (error) {
            await session.abortTransaction()
            console.error("Error updating call-in:", error)
            return errorResponseObject("Failed to update call-in")
        } finally {
            session.endSession()
        }
    }

    /**
     * Delete/Cancel call-in
     * DELETE /api/call-ins/:id
     */
    static async deleteCallIn(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const { cancellationReason } = req.body
            const user = (req as any).user

            if (!id) {
                await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Call-in ID is required" },
                ])
            }

            if (!cancellationReason || cancellationReason.trim().length < 10) {
                await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "cancellationReason",
                        message:
                            "Cancellation reason is required (min 10 characters)",
                    },
                ])
            }

            // Find call-in
            const callIn = await CallIn.findById(id)
                .populate("leaveRequest")
                .session(session)

            if (!callIn) {
                await session.abortTransaction()
                return errorResponseObject("Call-in not found")
            }

            // Check authorization
            const isCreator = callIn.requestedBy.toString() === user._id
            const hasPermission =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isCreator && !hasPermission) {
                await session.abortTransaction()
                return errorResponseObject(
                    "Unauthorized to cancel this call-in"
                )
            }

            // Check time limit (48 hours for regular users)
            const hoursSinceCreation =
                (Date.now() - new Date((callIn as any).createdAt).getTime()) /
                (1000 * 60 * 60)
            if (hoursSinceCreation > 48 && !hasPermission) {
                await session.abortTransaction()
                return errorResponseObject(
                    "Call-ins can only be cancelled within 48 hours of creation"
                )
            }

            // Reverse balance credit (period-based)
            const cancelDate = new Date()
            const balance = await LeaveBalance.findOne({
                staff: callIn.staff,
                leaveType: (callIn.leaveRequest as any).leaveType,
                periodStart: { $lte: cancelDate },
                periodEnd: { $gte: cancelDate },
            }).session(session)

            if (balance) {
                // Re-debit the days that were credited
                balance.used = balance.used + callIn.workingDaysRecovered

                const note = `Call-in cancelled: ${callIn.workingDaysRecovered} days re-debited`
                balance.notes = balance.notes
                    ? `${balance.notes}\n${note}`
                    : note

                await balance.save({ session })
            }

            // Delete the call-in
            await CallIn.findByIdAndDelete(id, { session })

            await session.commitTransaction()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: "CALLIN_CANCELLED" as any,
                entityType: "CallIn",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: "Cancelled call-in",
                metadata: {
                    workingDaysReversed: callIn.workingDaysRecovered,
                    cancellationReason: cancellationReason.trim(),
                    hoursSinceCreation,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            // Send automatic SMS notification to staff about cancellation
            try {
                console.log(
                    "[CallIn] Sending SMS notification to staff about call-in cancellation..."
                )
                // Get staff info before deletion
                const staffInfo = await Staff.findById(callIn.staff)
                    .select("name phone")
                    .lean()

                if (staffInfo) {
                    await SMSService.notifyCallInCancelled(
                        callIn,
                        staffInfo,
                        user.name,
                        cancellationReason.trim()
                    )
                    console.log(
                        `[CallIn] SMS cancellation notification sent to staff: ${staffInfo.name}`
                    )
                }
            } catch (smsError) {
                console.error(
                    "[CallIn] Failed to send SMS cancellation notification:",
                    smsError
                )
                // Don't fail the call-in cancellation if SMS fails
            }

            return successResponseObject("Call-in cancelled successfully", {
                id,
                workingDaysReversed: callIn.workingDaysRecovered,
                message: "Balance has been adjusted accordingly",
            })
        } catch (error) {
            await session.abortTransaction()
            console.error("Error cancelling call-in:", error)
            return errorResponseObject("Failed to cancel call-in")
        } finally {
            session.endSession()
        }
    }

    /**
     * Get call-in by ID
     * GET /api/call-ins/:id
     */
    static async getCallInById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Call-in ID is required" },
                ])
            }

            const callIn = await CallIn.findById(id)
                .populate("staff", "name staffId email phone department")
                .populate("department", "name")
                .populate({
                    path: "leaveRequest",
                    select: "leaveType startDate endDate workingDays status",
                    populate: {
                        path: "position",
                        select: "title",
                    },
                })
                .populate("requestedBy", "name email")
                .lean()

            if (!callIn) {
                return errorResponseObject("Call-in not found")
            }

            // Check authorization
            const canView =
                (callIn.staff as any)._id.toString() === user._id ||
                (callIn.requestedBy as any)._id.toString() === user._id ||
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            if (!canView) {
                return errorResponseObject("Unauthorized to view this call-in")
            }

            // Add computed fields
            const enhancedCallIn = {
                ...callIn,
                daysRecovered: callIn.workingDaysRecovered,
                callInDuration:
                    Math.ceil(
                        (new Date(callIn.callInEndDate).getTime() -
                            new Date(callIn.callInStartDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                    ) + 1,
                isFullCallIn:
                    callIn.callInStartDate.toDateString() ===
                        (callIn.leaveRequest as any).startDate.toDateString() &&
                    callIn.callInEndDate.toDateString() ===
                        (callIn.leaveRequest as any).endDate.toDateString(),
                balanceImpact: {
                    leaveType: (callIn.leaveRequest as any).leaveType,
                    daysCredited: callIn.workingDaysRecovered,
                },
            }

            return successResponseObject(
                "Call-in retrieved successfully",
                enhancedCallIn
            )
        } catch (error) {
            console.error("Error fetching call-in:", error)
            return errorResponseObject("Failed to retrieve call-in")
        }
    }

    /**
     * Get staff call-ins
     * GET /api/call-ins/staff/:staffId
     */
    static async getStaffCallIns(
        req: Request,
        staffId: string
    ): Promise<ResponseObject> {
        try {
            const {
                year,
                page = 1,
                limit = 20,
                sortBy = "requestedAt",
                sortOrder = "desc",
            } = req.query
            const user = (req as any).user

            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            // Check authorization
            const canView =
                staffId === user._id ||
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            if (!canView) {
                return errorResponseObject(
                    "Unauthorized to view staff call-ins"
                )
            }

            // Build query
            const query: any = { staff: staffId }

            if (year) {
                const yearNum = Number(year)
                const startOfYear = new Date(yearNum, 0, 1)
                const endOfYear = new Date(yearNum, 11, 31, 23, 59, 59)
                query.callInStartDate = { $gte: startOfYear, $lte: endOfYear }
            }

            // Pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Sorting
            const sortOptions: any = {}
            const validSortFields = [
                "requestedAt",
                "callInStartDate",
                "callInEndDate",
                "workingDaysRecovered",
            ]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "requestedAt"
            sortOptions[sortField as string] = sortOrder === "asc" ? 1 : -1

            // Execute query
            const [callIns, totalCount] = await Promise.all([
                CallIn.find(query)
                    .populate("leaveRequest", "leaveType startDate endDate")
                    .populate("department", "name")
                    .populate("requestedBy", "name")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                CallIn.countDocuments(query),
            ])

            // Calculate total days recovered
            const totalDaysRecovered = await CallIn.getTotalCallInDays(
                staffId,
                year ? Number(year) : new Date().getFullYear()
            )

            // Group by leave type
            const byLeaveType: any = {}
            for (const callIn of callIns) {
                const leaveType = (callIn.leaveRequest as any).leaveType
                if (!byLeaveType[leaveType]) {
                    byLeaveType[leaveType] = {
                        count: 0,
                        totalDays: 0,
                    }
                }
                byLeaveType[leaveType].count++
                byLeaveType[leaveType].totalDays += callIn.workingDaysRecovered
            }

            return successResponseObject(
                "Staff call-ins retrieved successfully",
                {
                    callIns,
                    summary: {
                        totalCallIns: totalCount,
                        totalDaysRecovered,
                        byLeaveType,
                        year: year || "all",
                    },
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
            console.error("Error fetching staff call-ins:", error)
            return errorResponseObject("Failed to retrieve staff call-ins")
        }
    }

    /**
     * Get my call-ins
     * GET /api/call-ins/my-call-ins
     */
    static async getMyCallIns(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const { year, page = 1, limit = 20 } = req.query

            // Redirect to getStaffCallIns with user's ID
            return await this.getStaffCallIns(
                { ...req, query: { ...req.query, year, page, limit } } as any,
                user._id
            )
        } catch (error) {
            console.error("Error fetching my call-ins:", error)
            return errorResponseObject("Failed to retrieve your call-ins")
        }
    }

    /**
     * Get department call-ins
     * GET /api/call-ins/department/:departmentId
     */
    static async getDepartmentCallIns(
        req: Request,
        departmentId: string
    ): Promise<ResponseObject> {
        try {
            const { startDate, endDate, page = 1, limit = 20 } = req.query
            const user = (req as any).user

            if (!departmentId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "departmentId",
                        message: "Department ID is required",
                    },
                ])
            }

            // Check authorization - must be department head or have permissions
            const department = await Department.findById(departmentId)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            const isDepartmentHead = department.head?.toString() === user._id
            const hasPermission =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            if (!isDepartmentHead && !hasPermission) {
                return errorResponseObject(
                    "Unauthorized to view department call-ins"
                )
            }

            // Date validation
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

            // Pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Query
            const query = {
                department: departmentId,
                callInStartDate: { $gte: start, $lte: end },
            }

            const [callIns, totalCount] = await Promise.all([
                CallIn.find(query)
                    .populate("staff", "name staffId")
                    .populate("leaveRequest", "leaveType")
                    .populate("requestedBy", "name")
                    .sort({ requestedAt: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                CallIn.countDocuments(query),
            ])

            // Group by staff
            const byStaff: any = {}
            let totalDaysRecovered = 0

            for (const callIn of callIns) {
                const staffId = (callIn.staff as any)._id.toString()
                if (!byStaff[staffId]) {
                    byStaff[staffId] = {
                        name: (callIn.staff as any).name,
                        staffId: (callIn.staff as any).staffId,
                        callIns: 0,
                        totalDays: 0,
                    }
                }
                byStaff[staffId].callIns++
                byStaff[staffId].totalDays += callIn.workingDaysRecovered
                totalDaysRecovered += callIn.workingDaysRecovered
            }

            return successResponseObject(
                "Department call-ins retrieved successfully",
                {
                    department: department.name,
                    callIns,
                    summary: {
                        totalCallIns: totalCount,
                        totalDaysRecovered,
                        byStaff: Object.values(byStaff),
                        period: { start, end },
                    },
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
            console.error("Error fetching department call-ins:", error)
            return errorResponseObject("Failed to retrieve department call-ins")
        }
    }

    /**
     * Generate call-in report
     * GET /api/call-ins/report
     */
    static async getCallInReport(req: Request): Promise<ResponseObject> {
        try {
            const {
                startDate,
                endDate,
                departmentId,
                format = "json",
            } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to generate call-in report"
                )
            }

            // Date validation
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

            // Build query
            const query: any = {
                callInStartDate: { $gte: start, $lte: end },
            }

            if (departmentId) {
                query.department = departmentId
            }

            // Get call-ins
            const callIns = await CallIn.find(query)
                .populate("staff", "name staffId department")
                .populate("department", "name")
                .populate("leaveRequest", "leaveType")
                .populate("requestedBy", "name")
                .sort({ department: 1, requestedAt: -1 })
                .lean()

            // Generate statistics
            const stats = {
                totalCallIns: callIns.length,
                totalDaysRecovered: 0,
                byDepartment: {} as Record<
                    string,
                    { count: number; days: number }
                >,
                byLeaveType: {} as Record<
                    string,
                    { count: number; days: number }
                >,
                byMonth: {} as Record<string, { count: number; days: number }>,
                topReasons: {} as Record<string, number>,
            }

            for (const callIn of callIns) {
                stats.totalDaysRecovered += callIn.workingDaysRecovered

                // By department
                const deptName = (callIn.department as any).name
                if (!stats.byDepartment[deptName]) {
                    stats.byDepartment[deptName] = { count: 0, days: 0 }
                }
                stats.byDepartment[deptName].count++
                stats.byDepartment[deptName].days += callIn.workingDaysRecovered

                // By leave type
                const leaveType = (callIn.leaveRequest as any).leaveType
                if (!stats.byLeaveType[leaveType]) {
                    stats.byLeaveType[leaveType] = { count: 0, days: 0 }
                }
                stats.byLeaveType[leaveType].count++
                stats.byLeaveType[leaveType].days += callIn.workingDaysRecovered

                // By month
                const month = new Date(callIn.callInStartDate).toLocaleString(
                    "default",
                    { month: "long", year: "numeric" }
                )
                if (!stats.byMonth[month]) {
                    stats.byMonth[month] = { count: 0, days: 0 }
                }
                stats.byMonth[month].count++
                stats.byMonth[month].days += callIn.workingDaysRecovered

                // Top reasons (simplified)
                const reasonKey = callIn.reason.toLowerCase().substring(0, 50)
                if (!stats.topReasons[reasonKey]) {
                    stats.topReasons[reasonKey] = 0
                }
                stats.topReasons[reasonKey]++
            }

            // Sort top reasons
            const sortedReasons = Object.entries(stats.topReasons)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 10)
                .map(([reason, count]) => ({ reason, count }))

            const report = {
                period: { start, end },
                statistics: {
                    ...stats,
                    topReasons: sortedReasons,
                },
                details: callIns.map((callIn) => ({
                    id: callIn._id,
                    staff: {
                        name: (callIn.staff as any).name,
                        staffId: (callIn.staff as any).staffId,
                    },
                    department: (callIn.department as any).name,
                    leaveType: (callIn.leaveRequest as any).leaveType,
                    callInPeriod: {
                        start: callIn.callInStartDate,
                        end: callIn.callInEndDate,
                    },
                    workingDaysRecovered: callIn.workingDaysRecovered,
                    reason: callIn.reason,
                    requestedBy: (callIn.requestedBy as any).name,
                    requestedAt: callIn.requestedAt,
                })),
            }

            // Format as CSV if requested
            if (format === "csv") {
                const csvData = this.convertToCSV(report.details)
                return successResponseObject("Call-in report generated (CSV)", {
                    csv: csvData,
                    filename: `call-in-report-${
                        start.toISOString().split("T")[0]
                    }-to-${end.toISOString().split("T")[0]}.csv`,
                })
            }

            return successResponseObject(
                "Call-in report generated successfully",
                report
            )
        } catch (error) {
            console.error("Error generating call-in report:", error)
            return errorResponseObject("Failed to generate call-in report")
        }
    }

    /**
     * Get call-in summary
     * GET /api/call-ins/summary
     */
    static async getCallInSummary(req: Request): Promise<ResponseObject> {
        try {
            const { year, departmentId } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view call-in summary"
                )
            }

            // Build date range
            const yearNum = year ? Number(year) : new Date().getFullYear()
            const startOfYear = new Date(yearNum, 0, 1)
            const endOfYear = new Date(yearNum, 11, 31, 23, 59, 59)

            // Build query
            const query: any = {
                callInStartDate: { $gte: startOfYear, $lte: endOfYear },
            }

            if (departmentId) {
                query.department = departmentId
            }

            // Get call-ins
            const callIns = await CallIn.find(query)
                .populate("department", "name")
                .populate("leaveRequest", "leaveType")
                .lean()

            // Generate dashboard statistics
            const summary = {
                year: yearNum,
                totalCallIns: callIns.length,
                totalDaysRecovered: 0,
                averageDaysPerCallIn: 0,
                monthlyTrend: {},
                departmentBreakdown: {} as Record<
                    string,
                    { count: number; days: number; percentage: number }
                >,
                leaveTypeBreakdown: {} as Record<
                    string,
                    { count: number; days: number; percentage: number }
                >,
                frequentPeriods: {
                    quarters: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
                    highestMonth: null,
                    lowestMonth: null,
                },
                comparisons: {
                    vsLastYear: null,
                    trend: null,
                },
            }

            // Process call-ins
            const monthlyData: any = {}
            for (let month = 0; month < 12; month++) {
                monthlyData[month] = { count: 0, days: 0 }
            }

            for (const callIn of callIns) {
                summary.totalDaysRecovered += callIn.workingDaysRecovered

                // Monthly trend
                const month = new Date(callIn.callInStartDate).getMonth()
                monthlyData[month].count++
                monthlyData[month].days += callIn.workingDaysRecovered

                // Department breakdown
                const deptName = (callIn.department as any).name
                if (!summary.departmentBreakdown[deptName]) {
                    summary.departmentBreakdown[deptName] = {
                        count: 0,
                        days: 0,
                        percentage: 0,
                    }
                }
                summary.departmentBreakdown[deptName].count++
                summary.departmentBreakdown[deptName].days +=
                    callIn.workingDaysRecovered

                // Leave type breakdown
                const leaveType = (callIn.leaveRequest as any).leaveType
                if (!summary.leaveTypeBreakdown[leaveType]) {
                    summary.leaveTypeBreakdown[leaveType] = {
                        count: 0,
                        days: 0,
                        percentage: 0,
                    }
                }
                summary.leaveTypeBreakdown[leaveType].count++
                summary.leaveTypeBreakdown[leaveType].days +=
                    callIn.workingDaysRecovered

                // Quarters
                const quarter = Math.floor(month / 3)
                summary.frequentPeriods.quarters[
                    `Q${
                        quarter + 1
                    }` as keyof typeof summary.frequentPeriods.quarters
                ]++
            }

            // Calculate averages and percentages
            if (callIns.length > 0) {
                summary.averageDaysPerCallIn =
                    Math.round(
                        (summary.totalDaysRecovered / callIns.length) * 10
                    ) / 10

                // Department percentages
                for (const dept in summary.departmentBreakdown) {
                    summary.departmentBreakdown[dept].percentage = Math.round(
                        (summary.departmentBreakdown[dept].count /
                            callIns.length) *
                            100
                    )
                }

                // Leave type percentages
                for (const type in summary.leaveTypeBreakdown) {
                    summary.leaveTypeBreakdown[type].percentage = Math.round(
                        (summary.leaveTypeBreakdown[type].count /
                            callIns.length) *
                            100
                    )
                }
            }

            // Format monthly trend
            const monthNames = [
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
            ]
            for (let month = 0; month < 12; month++) {
                ;(summary.monthlyTrend as any)[monthNames[month]] =
                    monthlyData[month]
            }

            // Find highest and lowest months
            let maxMonth = null,
                minMonth = null
            let maxCount = -1,
                minCount = Infinity
            for (const [month, data] of Object.entries(monthlyData)) {
                if ((data as any).count > maxCount) {
                    maxCount = (data as any).count
                    maxMonth = monthNames[Number(month)]
                }
                if ((data as any).count < minCount && (data as any).count > 0) {
                    minCount = (data as any).count
                    minMonth = monthNames[Number(month)]
                }
            }
            summary.frequentPeriods.highestMonth = maxMonth as any
            summary.frequentPeriods.lowestMonth = minMonth as any

            // Get last year's data for comparison
            if (!departmentId) {
                const lastYearStart = new Date(yearNum - 1, 0, 1)
                const lastYearEnd = new Date(yearNum - 1, 11, 31, 23, 59, 59)

                const lastYearCallIns = await CallIn.countDocuments({
                    callInStartDate: { $gte: lastYearStart, $lte: lastYearEnd },
                })

                if (lastYearCallIns > 0) {
                    const changePercent = Math.round(
                        ((callIns.length - lastYearCallIns) / lastYearCallIns) *
                            100
                    )
                    summary.comparisons.vsLastYear = {
                        lastYear: lastYearCallIns,
                        thisYear: callIns.length,
                        change: callIns.length - lastYearCallIns,
                        changePercent,
                    } as any
                    summary.comparisons.trend = (
                        changePercent > 0
                            ? "increasing"
                            : changePercent < 0
                            ? "decreasing"
                            : "stable"
                    ) as any
                }
            }

            return successResponseObject(
                "Call-in summary generated successfully",
                summary
            )
        } catch (error) {
            console.error("Error generating call-in summary:", error)
            return errorResponseObject("Failed to generate call-in summary")
        }
    }

    /**
     * Get call-in analytics
     * GET /api/call-ins/analytics
     */
    static async getCallInAnalytics(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate, departmentId } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to view call-in analytics"
                )
            }

            // Date validation
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

            // Build query
            const query: any = {
                callInStartDate: { $gte: start, $lte: end },
            }

            if (departmentId) {
                query.department = departmentId
            }

            // Get call-ins with full population
            const callIns = await CallIn.find(query)
                .populate("staff", "name staffId")
                .populate("department", "name")
                .populate({
                    path: "leaveRequest",
                    populate: {
                        path: "staff",
                        select: "name",
                    },
                })
                .lean()

            // Analyze patterns
            const analytics = {
                period: { start, end },
                patterns: {
                    dayOfWeek: {
                        Mon: 0,
                        Tue: 0,
                        Wed: 0,
                        Thu: 0,
                        Fri: 0,
                        Sat: 0,
                        Sun: 0,
                    },
                    duration: {
                        single: 0,
                        short: 0, // 2-3 days
                        medium: 0, // 4-7 days
                        long: 0, // >7 days
                    },
                    coverage: {
                        partial: 0,
                        full: 0,
                    },
                    timing: {
                        immediate: 0, // Called in at start of leave
                        early: 0, // Within first 25% of leave
                        middle: 0, // Middle 50% of leave
                        late: 0, // Last 25% of leave
                    },
                },
                trends: {
                    averageResponseTime: 0,
                    mostCommonReasons: [],
                    peakPeriods: [],
                },
                impact: {
                    totalDaysSaved: 0,
                    estimatedCostSavings: 0,
                    productivityRecovered: 0,
                },
                recommendations: [] as string[],
            }

            // Process each call-in
            for (const callIn of callIns) {
                const leaveRequest = callIn.leaveRequest as any

                // Day of week analysis
                const dayName = new Date(
                    callIn.callInStartDate
                ).toLocaleDateString("en", { weekday: "short" })
                if (
                    analytics.patterns.dayOfWeek[
                        dayName as keyof typeof analytics.patterns.dayOfWeek
                    ]
                ) {
                    analytics.patterns.dayOfWeek[
                        dayName as keyof typeof analytics.patterns.dayOfWeek
                    ]++
                }

                // Duration analysis
                const callInDays =
                    Math.ceil(
                        (new Date(callIn.callInEndDate).getTime() -
                            new Date(callIn.callInStartDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                    ) + 1
                if (callInDays === 1) analytics.patterns.duration.single++
                else if (callInDays <= 3) analytics.patterns.duration.short++
                else if (callInDays <= 7) analytics.patterns.duration.medium++
                else analytics.patterns.duration.long++

                // Coverage analysis
                const isFullCoverage =
                    callIn.callInStartDate.toDateString() ===
                        leaveRequest.startDate.toDateString() &&
                    callIn.callInEndDate.toDateString() ===
                        leaveRequest.endDate.toDateString()
                if (isFullCoverage) {
                    analytics.patterns.coverage.full++
                } else {
                    analytics.patterns.coverage.partial++
                }

                // Timing analysis
                const leaveStart = new Date(leaveRequest.startDate).getTime()
                const leaveEnd = new Date(leaveRequest.endDate).getTime()
                const callInStart = new Date(callIn.callInStartDate).getTime()
                const leaveDuration = leaveEnd - leaveStart
                const timeIntoLeave = callInStart - leaveStart
                const percentIntoLeave = (timeIntoLeave / leaveDuration) * 100

                if (percentIntoLeave === 0)
                    analytics.patterns.timing.immediate++
                else if (percentIntoLeave <= 25)
                    analytics.patterns.timing.early++
                else if (percentIntoLeave <= 75)
                    analytics.patterns.timing.middle++
                else analytics.patterns.timing.late++

                // Impact calculations
                analytics.impact.totalDaysSaved += callIn.workingDaysRecovered
            }

            // Calculate cost savings (using average daily rate)
            const averageDailyCost = 500 // Example: $500 per day
            analytics.impact.estimatedCostSavings =
                analytics.impact.totalDaysSaved * averageDailyCost
            analytics.impact.productivityRecovered = Math.round(
                (analytics.impact.totalDaysSaved / 250) * 100
            ) // Assuming 250 working days per year

            // Generate recommendations
            if (
                analytics.patterns.coverage.partial >
                analytics.patterns.coverage.full
            ) {
                analytics.recommendations.push(
                    "Consider reviewing partial call-in patterns to optimize workforce planning"
                )
            }
            if (analytics.patterns.timing.immediate > callIns.length * 0.3) {
                analytics.recommendations.push(
                    "High immediate call-ins suggest potential for better leave planning"
                )
            }
            if (
                Object.values(analytics.patterns.dayOfWeek).some(
                    (v) => v > callIns.length * 0.3
                )
            ) {
                analytics.recommendations.push(
                    "Certain days show higher call-in rates - consider staffing adjustments"
                )
            }

            return successResponseObject(
                "Call-in analytics generated successfully",
                analytics
            )
        } catch (error) {
            console.error("Error generating call-in analytics:", error)
            return errorResponseObject("Failed to generate call-in analytics")
        }
    }

    /**
     * Get staff call-in history
     * GET /api/call-ins/history/:staffId
     */
    static async getStaffCallInHistory(
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

            // Check authorization
            const canView =
                staffId === user._id ||
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            if (!canView) {
                return errorResponseObject(
                    "Unauthorized to view staff call-in history"
                )
            }

            // Get all call-ins for the staff
            const callIns = await CallIn.find({ staff: staffId })
                .populate(
                    "leaveRequest",
                    "leaveType startDate endDate workingDays"
                )
                .populate("department", "name")
                .populate("requestedBy", "name")
                .sort({ requestedAt: -1 })
                .lean()

            // Group by year
            const byYear: any = {}
            let totalDaysRecovered = 0
            let totalCallIns = 0

            for (const callIn of callIns) {
                const year = new Date(callIn.callInStartDate).getFullYear()

                if (!byYear[year]) {
                    byYear[year] = {
                        callIns: [],
                        count: 0,
                        totalDays: 0,
                    }
                }

                byYear[year].callIns.push({
                    id: callIn._id,
                    leaveType: (callIn.leaveRequest as any).leaveType,
                    leavePeriod: {
                        start: (callIn.leaveRequest as any).startDate,
                        end: (callIn.leaveRequest as any).endDate,
                    },
                    callInPeriod: {
                        start: callIn.callInStartDate,
                        end: callIn.callInEndDate,
                    },
                    workingDaysRecovered: callIn.workingDaysRecovered,
                    reason: callIn.reason,
                    requestedBy: (callIn.requestedBy as any).name,
                    requestedAt: callIn.requestedAt,
                })

                byYear[year].count++
                byYear[year].totalDays += callIn.workingDaysRecovered
                totalDaysRecovered += callIn.workingDaysRecovered
                totalCallIns++
            }

            // Get staff details
            const staff = await Staff.findById(staffId).select(
                "name staffId email"
            )

            return successResponseObject(
                "Staff call-in history retrieved successfully",
                {
                    staff,
                    history: byYear,
                    summary: {
                        totalCallIns,
                        totalDaysRecovered,
                        averageDaysPerCallIn:
                            totalCallIns > 0
                                ? Math.round(
                                      (totalDaysRecovered / totalCallIns) * 10
                                  ) / 10
                                : 0,
                        yearsWithCallIns: Object.keys(byYear).length,
                    },
                }
            )
        } catch (error) {
            console.error("Error fetching staff call-in history:", error)
            return errorResponseObject(
                "Failed to retrieve staff call-in history"
            )
        }
    }

    /**
     * Validate call-in request
     * POST /api/call-ins/validate
     */
    static async validateCallInRequest(req: Request): Promise<ResponseObject> {
        try {
            const { leaveRequestId, callInStartDate, callInEndDate } = req.body
            const user = (req as any).user

            const validationResults = {
                isValid: true,
                errors: [] as string[],
                warnings: [] as string[],
                info: {} as any,
            }

            // Check leave request
            if (!leaveRequestId) {
                validationResults.errors.push("Leave request ID is required")
                validationResults.isValid = false
            } else {
                const leaveRequest = await LeaveRequest.findById(leaveRequestId)
                    .populate("staff", "name")
                    .populate("department")

                if (!leaveRequest) {
                    validationResults.errors.push("Leave request not found")
                    validationResults.isValid = false
                } else {
                    // Check approval status
                    if (leaveRequest.status !== LeaveStatus.APPROVED) {
                        validationResults.errors.push(
                            `Leave request is ${leaveRequest.status}, must be approved`
                        )
                        validationResults.isValid = false
                    }

                    // Check department head authorization
                    const department = await Department.findById(
                        leaveRequest.department
                    )
                    const isDepartmentHead =
                        department?.head?.toString() === user._id
                    const hasPermission =
                        user?.permissions?.includes("HR") ||
                        user?.permissions?.includes("ADMIN")

                    if (!isDepartmentHead && !hasPermission) {
                        validationResults.errors.push(
                            "You are not authorized to create call-ins for this department"
                        )
                        validationResults.isValid = false
                    }

                    // Validate dates if provided
                    if (callInStartDate && callInEndDate) {
                        const callStart = new Date(callInStartDate)
                        const callEnd = new Date(callInEndDate)
                        const leaveStart = new Date(leaveRequest.startDate)
                        const leaveEnd = new Date(leaveRequest.endDate)

                        if (callStart < leaveStart || callEnd > leaveEnd) {
                            validationResults.errors.push(
                                "Call-in dates must be within the leave period"
                            )
                            validationResults.isValid = false
                        }

                        if (callStart > callEnd) {
                            validationResults.errors.push(
                                "Start date must be before or equal to end date"
                            )
                            validationResults.isValid = false
                        }

                        // Check for overlapping
                        const existing = await CallIn.findOne({
                            leaveRequest: leaveRequestId,
                            $or: [
                                {
                                    callInStartDate: { $lte: callEnd },
                                    callInEndDate: { $gte: callStart },
                                },
                            ],
                        })

                        if (existing) {
                            validationResults.errors.push(
                                "Overlapping call-in already exists for this period"
                            )
                            validationResults.isValid = false
                        }

                        // Calculate potential working days
                        if (validationResults.isValid) {
                            const tempCallIn = new CallIn({
                                callInStartDate: callStart,
                                callInEndDate: callEnd,
                                leaveRequest: leaveRequestId,
                            })
                            const workingDays =
                                await tempCallIn.calculateWorkingDays()
                            validationResults.info.estimatedWorkingDays =
                                workingDays
                        }
                    }

                    // Add info
                    validationResults.info.leaveDetails = {
                        staff: (leaveRequest.staff as any).name,
                        leaveType: leaveRequest.leaveType,
                        leavePeriod: {
                            start: leaveRequest.startDate,
                            end: leaveRequest.endDate,
                        },
                        totalWorkingDays: leaveRequest.workingDays,
                    }

                    // Add warnings
                    const today = new Date()
                    if (leaveRequest.endDate < today) {
                        validationResults.warnings.push(
                            "This leave has already ended"
                        )
                    }
                }
            }

            validationResults.isValid = validationResults.errors.length === 0

            return successResponseObject(
                validationResults.isValid
                    ? "Validation successful"
                    : "Validation failed",
                validationResults
            )
        } catch (error) {
            console.error("Error validating call-in request:", error)
            return errorResponseObject("Failed to validate call-in request")
        }
    }

    /**
     * Check call-in eligibility
     * GET /api/call-ins/check-eligibility/:leaveRequestId
     */
    static async checkCallInEligibility(
        req: Request,
        leaveRequestId: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!leaveRequestId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "leaveRequestId",
                        message: "Leave request ID is required",
                    },
                ])
            }

            const leaveRequest = await LeaveRequest.findById(leaveRequestId)
                .populate("staff", "name staffId")
                .populate("department", "name")

            if (!leaveRequest) {
                return errorResponseObject("Leave request not found")
            }

            const eligibility = {
                eligible: true,
                reasons: [] as string[],
                leaveInfo: {
                    staff: (leaveRequest.staff as any).name,
                    staffId: (leaveRequest.staff as any).staffId,
                    leaveType: leaveRequest.leaveType,
                    status: leaveRequest.status,
                    period: {
                        start: leaveRequest.startDate,
                        end: leaveRequest.endDate,
                    },
                    workingDays: leaveRequest.workingDays,
                },
                existingCallIns: [] as any[],
                availableDays: 0,
                recommendations: [] as string[],
            }

            // Check status
            if (leaveRequest.status !== LeaveStatus.APPROVED) {
                eligibility.eligible = false
                eligibility.reasons.push(
                    `Leave is ${leaveRequest.status}, must be approved for call-in`
                )
            }

            // Check existing call-ins
            const existingCallIns = await CallIn.find({
                leaveRequest: leaveRequestId,
            })
                .select("callInStartDate callInEndDate workingDaysRecovered")
                .lean()

            eligibility.existingCallIns = existingCallIns

            // Calculate available days for call-in
            let totalRecoveredDays = 0
            for (const callIn of existingCallIns) {
                totalRecoveredDays += callIn.workingDaysRecovered
            }

            eligibility.availableDays =
                leaveRequest.workingDays - totalRecoveredDays

            if (eligibility.availableDays <= 0) {
                eligibility.eligible = false
                eligibility.reasons.push(
                    "All leave days have already been recovered through call-ins"
                )
            }

            // Check if leave is active
            const today = new Date()
            if (leaveRequest.endDate < today) {
                eligibility.recommendations.push(
                    "Leave has already ended, call-in may not be appropriate"
                )
            }

            if (leaveRequest.startDate > today) {
                eligibility.recommendations.push("Leave has not started yet")
            }

            // Check authorization
            const department = await Department.findById(
                leaveRequest.department
            )
            const isDepartmentHead = department?.head?.toString() === user._id
            const hasPermission =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isDepartmentHead && !hasPermission) {
                eligibility.eligible = false
                eligibility.reasons.push(
                    "You are not authorized to create call-ins for this department"
                )
            }

            return successResponseObject(
                "Eligibility check complete",
                eligibility
            )
        } catch (error) {
            console.error("Error checking call-in eligibility:", error)
            return errorResponseObject("Failed to check call-in eligibility")
        }
    }

    /**
     * Bulk call-in creation
     * POST /api/call-ins/bulk
     */
    static async createBulkCallIns(req: Request): Promise<ResponseObject> {
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const { callIns } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                await session.abortTransaction()
                return errorResponseObject(
                    "Only HR/Admin can create bulk call-ins"
                )
            }

            if (!callIns || !Array.isArray(callIns) || callIns.length === 0) {
                await session.abortTransaction()
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "callIns",
                        message:
                            "Call-ins array is required and cannot be empty",
                    },
                ])
            }

            const results = {
                successful: [] as Array<{
                    id: string
                    leaveRequestId: any
                    workingDaysRecovered: number
                }>,
                failed: [] as Array<{ leaveRequestId: any; error: string }>,
                totalProcessed: callIns.length,
            }

            for (const callInData of callIns) {
                try {
                    const {
                        leaveRequestId,
                        callInStartDate,
                        callInEndDate,
                        reason,
                        workingDaysRecovered,
                    } = callInData

                    // Validate each call-in
                    if (
                        !leaveRequestId ||
                        !callInStartDate ||
                        !callInEndDate ||
                        !reason
                    ) {
                        results.failed.push({
                            leaveRequestId,
                            error: "Missing required fields",
                        })
                        continue
                    }

                    // Verify leave request
                    const leaveRequest = await LeaveRequest.findById(
                        leaveRequestId
                    ).session(session)
                    if (
                        !leaveRequest ||
                        leaveRequest.status !== LeaveStatus.APPROVED
                    ) {
                        results.failed.push({
                            leaveRequestId,
                            error: "Leave request not found or not approved",
                        })
                        continue
                    }

                    // Create call-in
                    const callIn = await CallIn.create(
                        [
                            {
                                leaveRequest: leaveRequestId,
                                staff: leaveRequest.staff,
                                department: leaveRequest.department,
                                callInStartDate: new Date(callInStartDate),
                                callInEndDate: new Date(callInEndDate),
                                workingDaysRecovered,
                                reason: reason.trim(),
                                requestedBy: user._id,
                                requestedAt: new Date(),
                            },
                        ],
                        { session }
                    )

                    results.successful.push({
                        id: (callIn[0] as any)._id.toString(),
                        leaveRequestId,
                        workingDaysRecovered: (callIn[0] as any)
                            .workingDaysRecovered,
                    })
                } catch (error) {
                    results.failed.push({
                        leaveRequestId: callInData.leaveRequestId,
                        error:
                            (error as any).message ||
                            "Failed to create call-in",
                    })
                }
            }

            if (results.successful.length === 0) {
                await session.abortTransaction()
                return errorResponseObject(
                    "All call-ins failed to create",
                    results
                )
            }

            await session.commitTransaction()

            // Log bulk operation
            await AuditLogController.createAuditLog({
                action: "BULK_OPERATION" as any,
                entityType: "CallIn",
                entityId: "bulk",
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created ${results.successful.length} call-ins in bulk`,
                metadata: {
                    successful: results.successful.length,
                    failed: results.failed.length,
                    totalDaysRecovered: results.successful.reduce(
                        (sum: number, c: any) => sum + c.workingDaysRecovered,
                        0
                    ),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                `Bulk call-in creation completed: ${results.successful.length} successful, ${results.failed.length} failed`,
                results
            )
        } catch (error) {
            await session.abortTransaction()
            console.error("Error creating bulk call-ins:", error)
            return errorResponseObject("Failed to create bulk call-ins")
        } finally {
            session.endSession()
        }
    }

    /**
     * Process pending call-ins (system maintenance)
     * POST /api/call-ins/process-pending
     */
    static async processPendingCallIns(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check system admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Only system administrators can process pending call-ins"
                )
            }

            // Find call-ins that may have failed processing
            // This could be identified by checking if balance adjustment was made
            const recentCallIns = await CallIn.find({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
            }).populate("leaveRequest")

            const results = {
                processed: [] as Array<{
                    id: string
                    workingDaysRecovered: number
                }>,
                failed: [] as Array<{ id: string; error: string }>,
                alreadyProcessed: [] as string[],
            }

            for (const callIn of recentCallIns) {
                try {
                    // Check if already processed by looking at balance (period-based)
                    const checkDate = new Date()
                    const balance = await LeaveBalance.findOne({
                        staff: callIn.staff,
                        leaveType: (callIn.leaveRequest as any).leaveType,
                        periodStart: { $lte: checkDate },
                        periodEnd: { $gte: checkDate },
                    })

                    // Check if the balance notes mention this call-in
                    if (
                        balance?.notes?.includes((callIn._id as any).toString())
                    ) {
                        results.alreadyProcessed.push(
                            (callIn._id as any).toString()
                        )
                        continue
                    }

                    // Process the call-in
                    await callIn.processCallIn()
                    results.processed.push({
                        id: (callIn._id as any).toString(),
                        workingDaysRecovered: callIn.workingDaysRecovered,
                    })
                } catch (error) {
                    results.failed.push({
                        id: (callIn._id as any).toString(),
                        error: (error as any).message,
                    })
                }
            }

            return successResponseObject("Pending call-ins processed", {
                totalChecked: recentCallIns.length,
                processed: results.processed.length,
                failed: results.failed.length,
                alreadyProcessed: results.alreadyProcessed.length,
                details: results,
            })
        } catch (error) {
            console.error("Error processing pending call-ins:", error)
            return errorResponseObject("Failed to process pending call-ins")
        }
    }

    /**
     * Get call-in impact analysis
     * GET /api/call-ins/impact/:leaveRequestId
     */
    static async getCallInImpact(
        req: Request,
        leaveRequestId: string
    ): Promise<ResponseObject> {
        try {
            const { callInStartDate, callInEndDate } = req.query

            if (!leaveRequestId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "leaveRequestId",
                        message: "Leave request ID is required",
                    },
                ])
            }

            const leaveRequest = await LeaveRequest.findById(
                leaveRequestId
            ).populate("staff", "name staffId")

            if (!leaveRequest) {
                return errorResponseObject("Leave request not found")
            }

            // Get current balance (period-based)
            const previewDate = new Date()
            const balance = await LeaveBalance.findOne({
                staff: (leaveRequest.staff as any)._id,
                leaveType: leaveRequest.leaveType,
                periodStart: { $lte: previewDate },
                periodEnd: { $gte: previewDate },
            })

            // Calculate potential impact
            let potentialDaysRecovered = 0
            if (callInStartDate && callInEndDate) {
                const tempCallIn = new CallIn({
                    callInStartDate: new Date(callInStartDate as string),
                    callInEndDate: new Date(callInEndDate as string),
                    leaveRequest: leaveRequestId,
                })
                potentialDaysRecovered = await tempCallIn.calculateWorkingDays()
            }

            // Get existing call-ins
            const existingCallIns = await CallIn.find({
                leaveRequest: leaveRequestId,
            }).select("callInStartDate callInEndDate workingDaysRecovered")

            const totalExistingRecovered = existingCallIns.reduce(
                (sum, c) => sum + c.workingDaysRecovered,
                0
            )

            const impact = {
                currentBalance: {
                    leaveType: leaveRequest.leaveType,
                    used: balance?.used || 0,
                    remaining: balance?.remaining || 0,
                    total: (balance as any)?.total || 0,
                },
                leaveRequestDetails: {
                    staff: (leaveRequest.staff as any).name,
                    workingDays: leaveRequest.workingDays,
                    period: {
                        start: leaveRequest.startDate,
                        end: leaveRequest.endDate,
                    },
                },
                existingCallIns: {
                    count: existingCallIns.length,
                    totalDaysRecovered: totalExistingRecovered,
                    details: existingCallIns,
                },
                potentialCallIn: {
                    daysToRecover: potentialDaysRecovered,
                    newBalanceUsed: Math.max(
                        0,
                        (balance?.used || 0) - potentialDaysRecovered
                    ),
                    newBalanceRemaining:
                        (balance?.remaining || 0) + potentialDaysRecovered,
                    remainingLeaveDays:
                        leaveRequest.workingDays -
                        totalExistingRecovered -
                        potentialDaysRecovered,
                },
                feasibility: {
                    canProceed: true,
                    warnings: [] as string[],
                },
            }

            // Check feasibility
            if (impact.potentialCallIn.remainingLeaveDays < 0) {
                impact.feasibility.canProceed = false
                impact.feasibility.warnings.push(
                    "Call-in would exceed original leave days"
                )
            }

            if (potentialDaysRecovered === 0) {
                impact.feasibility.warnings.push(
                    "No working days in the specified call-in period"
                )
            }

            return successResponseObject(
                "Call-in impact analysis complete",
                impact
            )
        } catch (error) {
            console.error("Error analyzing call-in impact:", error)
            return errorResponseObject("Failed to analyze call-in impact")
        }
    }

    /**
     * Send call-in notification
     * POST /api/call-ins/:id/notify
     */
    static async sendCallInNotification(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { notificationType = "email", customMessage } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Call-in ID is required" },
                ])
            }

            const callIn = await CallIn.findById(id)
                .populate("staff", "name email phone")
                .populate("department", "name")
                .populate("leaveRequest", "leaveType startDate endDate")
                .populate("requestedBy", "name")

            if (!callIn) {
                return errorResponseObject("Call-in not found")
            }

            // Check authorization
            const isCreator =
                (callIn.requestedBy as any)._id.toString() === user._id
            const hasPermission =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isCreator && !hasPermission) {
                return errorResponseObject(
                    "Unauthorized to send notifications for this call-in"
                )
            }

            // Prepare notification content
            const notificationContent = {
                to: (callIn.staff as any).email || (callIn.staff as any).phone,
                subject: "Call-In Notification - Return to Work Required",
                body:
                    customMessage ||
                    `
                    Dear ${(callIn.staff as any).name},
                    
                    You are being called back from your ${
                        (callIn.leaveRequest as any).leaveType
                    } leave.
                    
                    Call-In Details:
                    - Return Period: ${new Date(
                        callIn.callInStartDate
                    ).toLocaleDateString()} to ${new Date(
                        callIn.callInEndDate
                    ).toLocaleDateString()}
                    - Working Days: ${callIn.workingDaysRecovered} days
                    - Reason: ${callIn.reason}
                    - Requested By: ${(callIn.requestedBy as any).name}
                    
                    Please report to work as scheduled. Your leave balance will be adjusted accordingly.
                    
                    If you have any questions, please contact your department head or HR.
                    
                    Best regards,
                    HR Department
                `,
                type: notificationType,
                metadata: {
                    callInId: callIn._id,
                    staffId: (callIn.staff as any)._id,
                    departmentId: (callIn.department as any)._id,
                },
            }

            // Here you would integrate with your notification service
            // For now, we'll simulate the notification being sent

            // Log the notification
            await AuditLogController.createAuditLog({
                action: "NOTIFICATION_SENT" as any,
                entityType: "CallIn",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Call-in notification sent to ${
                    (callIn.staff as any).name
                }`,
                metadata: {
                    notificationType,
                    recipient: notificationContent.to,
                    hasCustomMessage: !!customMessage,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Call-in notification sent successfully",
                {
                    recipient: (callIn.staff as any).name,
                    notificationType,
                    sentAt: new Date(),
                    content: notificationContent,
                }
            )
        } catch (error) {
            console.error("Error sending call-in notification:", error)
            return errorResponseObject("Failed to send call-in notification")
        }
    }

    /**
     * Get common call-in reasons
     * GET /api/call-ins/reasons
     */
    static async getCallInReasons(req: Request): Promise<ResponseObject> {
        try {
            const { departmentId } = req.query

            // Predefined common reasons
            const commonReasons = [
                {
                    category: "Operational",
                    reasons: [
                        "Urgent project deadline requiring immediate attention",
                        "Critical system issue requiring expertise",
                        "Client emergency requiring immediate response",
                        "Unexpected high workload in department",
                    ],
                },
                {
                    category: "Coverage",
                    reasons: [
                        "Staff shortage due to unexpected absences",
                        "Peak business period requiring full staffing",
                        "Training coverage for critical role",
                        "Handover requirements for urgent tasks",
                    ],
                },
                {
                    category: "Strategic",
                    reasons: [
                        "Important meeting requiring attendance",
                        "Strategic planning session participation",
                        "Board presentation preparation",
                        "Audit or compliance requirements",
                    ],
                },
                {
                    category: "Emergency",
                    reasons: [
                        "Natural disaster response",
                        "Security incident response",
                        "Health and safety emergency",
                        "Infrastructure failure recovery",
                    ],
                },
            ]

            // Get department-specific frequent reasons if departmentId provided
            let departmentSpecific = []
            if (departmentId) {
                const recentCallIns = await CallIn.find({
                    department: departmentId,
                    createdAt: {
                        $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                    }, // Last year
                })
                    .select("reason")
                    .limit(50)

                // Extract and count unique reasons (simplified)
                const reasonCounts: any = {}
                for (const callIn of recentCallIns) {
                    const reasonKey = callIn.reason
                        .substring(0, 100)
                        .toLowerCase()
                    if (!reasonCounts[reasonKey]) {
                        reasonCounts[reasonKey] = {
                            reason: callIn.reason,
                            count: 0,
                        }
                    }
                    reasonCounts[reasonKey].count++
                }

                departmentSpecific = Object.values(reasonCounts)
                    .sort((a: any, b: any) => b.count - a.count)
                    .slice(0, 5)
                    .map((r: any) => r.reason)
            }

            return successResponseObject(
                "Call-in reasons retrieved successfully",
                {
                    commonReasons,
                    departmentSpecific:
                        departmentSpecific.length > 0
                            ? {
                                  departmentId,
                                  frequentReasons: departmentSpecific,
                              }
                            : null,
                    guidelines: {
                        minimumLength: 10,
                        recommendedLength: 50,
                        mustInclude: [
                            "specific reason",
                            "urgency level",
                            "expected duration",
                        ],
                    },
                }
            )
        } catch (error) {
            console.error("Error fetching call-in reasons:", error)
            return errorResponseObject("Failed to retrieve call-in reasons")
        }
    }

    /**
     * Get all call-ins with pagination
     * GET /api/call-ins
     */
    static async getAllCallIns(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const { page = 1, limit = 20, search } = req.query

            // Check permissions
            const canViewAll =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            let isApprover = false
            if (!canViewAll) {
                // Check if user is an approver
                const userContract = await StaffContract.findOne({
                    staff: user._id,
                    status: "active",
                })
                if (userContract?.position) {
                    const approverMatch = await JobPosition.findOne({
                        approverPosition: userContract.position,
                    })
                    isApprover = !!approverMatch
                }
            }

            if (!canViewAll && !isApprover) {
                return errorResponseObject("Unauthorized to view call-ins")
            }

            const query: any = {}

            // Approvers only see call-ins they created
            if (!canViewAll && isApprover) {
                query.requestedBy = user._id
            }

            // Build search query
            if (search) {
                const staffIds = await Staff.find({
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { staffId: { $regex: search, $options: "i" } },
                    ],
                }).select("_id")

                query.staff = { $in: staffIds.map((s) => s._id) }
            }

            const skip = (Number(page) - 1) * Number(limit)

            const [callIns, total] = await Promise.all([
                CallIn.find(query)
                    .populate("staff", "name staffId email")
                    .populate("leaveRequest", "leaveType startDate endDate workingDays")
                    .populate("department", "name")
                    .populate("requestedBy", "name")
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .lean(),
                CallIn.countDocuments(query),
            ])

            return successResponseObject("Call-ins retrieved successfully", {
                callIns,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit)),
                },
            })
        } catch (error) {
            console.error("Error getting call-ins:", error)
            return errorResponseObject("Failed to retrieve call-ins")
        }
    }

    /**
     * Get staff currently on approved leave
     * GET /api/call-ins?op=on-leave
     */
    static async getStaffOnLeave(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            console.log("[getStaffOnLeave] User:", user?.name, "Permissions:", user?.permissions)

            // Check permissions
            const canView =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER")

            if (!canView) {
                console.log("[getStaffOnLeave] User not authorized")
                return errorResponseObject("Unauthorized to view staff on leave")
            }

            const today = new Date()
            today.setHours(0, 0, 0, 0)
            console.log("[getStaffOnLeave] Today (midnight):", today.toISOString())

            // Find approved leave requests where today is within the leave period
            const query = {
                status: LeaveStatus.APPROVED,
                startDate: { $lte: today },
                endDate: { $gte: today },
            }
            console.log("[getStaffOnLeave] Query:", JSON.stringify(query, null, 2))

            const onLeaveRequests = await LeaveRequest.find(query)
                .populate("staff", "name staffId email department")
                .populate("department", "name")
                .sort({ startDate: 1 })
                .lean()

            console.log("[getStaffOnLeave] Found onLeaveRequests:", onLeaveRequests.length)

            // Also check all approved requests to see what's there
            const allApproved = await LeaveRequest.find({ status: LeaveStatus.APPROVED })
                .select("staff startDate endDate status leaveType")
                .lean()
            console.log("[getStaffOnLeave] All approved requests:", allApproved.length)
            console.log("[getStaffOnLeave] All approved:", JSON.stringify(allApproved, null, 2))

            // Calculate days remaining for each leave
            const staffOnLeave = onLeaveRequests.map((leave: any) => {
                const endDate = new Date(leave.endDate)
                const diffTime = endDate.getTime() - today.getTime()
                const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

                return {
                    staff: leave.staff,
                    leaveRequest: {
                        _id: leave._id,
                        leaveType: leave.leaveType,
                        startDate: leave.startDate,
                        endDate: leave.endDate,
                        workingDays: leave.workingDays,
                    },
                    department: leave.department,
                    daysRemaining,
                }
            })

            console.log("[getStaffOnLeave] Staff on leave processed:", staffOnLeave.length)

            return successResponseObject("Staff on leave retrieved successfully", {
                staffOnLeave,
                count: staffOnLeave.length,
            })
        } catch (error) {
            console.error("Error getting staff on leave:", error)
            return errorResponseObject("Failed to retrieve staff on leave")
        }
    }

    /**
     * Calculate working days that would be recovered for a call-in
     * POST /api/call-ins?op=calculate
     */
    static async calculateRecoveredDays(req: Request): Promise<ResponseObject> {
        try {
            const { leaveRequestId, callInStartDate, callInEndDate } = req.body

            if (!leaveRequestId || !callInStartDate) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "leaveRequestId", message: "Leave request ID is required" },
                    { field: "callInStartDate", message: "Call-in start date is required" },
                ])
            }

            // Get the leave request
            const leaveRequest = await LeaveRequest.findById(leaveRequestId)
            if (!leaveRequest) {
                return errorResponseObject("Leave request not found")
            }

            // Parse dates
            const startDate = new Date(callInStartDate)
            const endDate = callInEndDate ? new Date(callInEndDate) : new Date(callInStartDate)

            // Validate dates are within leave period
            const leaveStart = new Date(leaveRequest.startDate)
            const leaveEnd = new Date(leaveRequest.endDate)

            if (startDate < leaveStart || endDate > leaveEnd) {
                return errorResponseObject(
                    "Call-in dates must be within the leave period"
                )
            }

            // Calculate working days (excluding weekends and holidays)
            let workingDays = 0

            const current = new Date(startDate)
            while (current <= endDate) {
                const dayOfWeek = current.getDay()

                // Skip weekends
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    // Check if it's a holiday
                    const isHoliday = await Holiday.isHoliday(current)
                    if (!isHoliday) {
                        workingDays++
                    }
                }

                current.setDate(current.getDate() + 1)
            }

            // Calculate resumption date (day after call-in ends)
            const resumptionDate = new Date(endDate)
            resumptionDate.setDate(resumptionDate.getDate() + 1)

            return successResponseObject("Days calculated successfully", {
                workingDaysRecovered: workingDays,
                callInStartDate: startDate,
                callInEndDate: endDate,
                resumptionDate,
                originalLeave: {
                    startDate: leaveRequest.startDate,
                    endDate: leaveRequest.endDate,
                    workingDays: leaveRequest.workingDays,
                },
            })
        } catch (error) {
            console.error("Error calculating recovered days:", error)
            return errorResponseObject("Failed to calculate recovered days")
        }
    }

    // Helper method to convert data to CSV
    private static convertToCSV(data: any[]): string {
        if (data.length === 0) return ""

        const headers = Object.keys(data[0])
        const csvHeaders = headers.join(",")

        const csvRows = data.map((row) => {
            return headers
                .map((header) => {
                    const value = row[header]
                    if (typeof value === "object") {
                        return JSON.stringify(value).replace(/,/g, ";")
                    }
                    return String(value).replace(/,/g, ";")
                })
                .join(",")
        })

        return [csvHeaders, ...csvRows].join("\n")
    }

    /**
     * Calculate working days for a call-in period
     * Excludes weekends and holidays
     */
    private static async calculateWorkingDaysForCallIn(
        startDate: Date,
        endDate: Date
    ): Promise<number> {
        let workingDays = 0
        const current = new Date(startDate)
        const end = new Date(endDate)

        // Normalize to start of day
        current.setHours(0, 0, 0, 0)
        end.setHours(0, 0, 0, 0)

        while (current <= end) {
            const dayOfWeek = current.getDay()

            // Skip weekends (0 = Sunday, 6 = Saturday)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                // Check if it's a holiday
                const isHoliday = await Holiday.isHoliday(current)

                if (!isHoliday) {
                    workingDays++
                }
            }

            current.setDate(current.getDate() + 1)
        }

        return workingDays
    }
}

export default CallInController
