import { Request } from "express"
// import { Parser } from "json2csv"
import LeaveBalance from "../models/leave-balance.model"
import Staff from "../models/staff.model"
import StaffContract from "../models/staff-contract.model"
import Department from "../models/department.model"
import { AuditLogController } from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import {
    AuditAction,
    ResponseObject,
    LeaveTypes,
    LEAVE_CAPS,
    ContractStatus,
    Gender,
    AccountStatus,
} from "../utils/types"

// Type definitions
interface AuthenticatedRequest extends Request {
    user?: {
        _id: string
        permissions?: string[]
        [key: string]: unknown
    }
}

interface BalanceQuery {
    staff?: string | { $in: string[] }
    year?: number
    leaveType?: string
}

interface StaffFilter {
    status?: string
    department?: string
    _id?: { $in: string[] }
}

interface LeaveTypeSummary {
    type: string
    totalStaff: number
    totalAllocated: number
    totalAccrued: number
    totalUsed: number
    totalRemaining: number
    totalAvailable: number
    utilizationRate: number
    staffWithBalance: Array<{
        staffId: string
        name: string
        department?: string
        used: number
        remaining: number
        available: number
    }>
    averageUsed?: number
    averageRemaining?: number
    staffCount?: number
    lowBalanceCount?: number
}

interface StaffUsage {
    staff: {
        _id?: string
        name: string
        staffId: string
        department?: string | { name?: string }
    }
    totalUsed: number
    byType: Record<string, number>
}

interface EnhancedBalance {
    id: string
    staff: unknown
    year: number
    leaveType: string
    allocated: number
    accrued?: number
    used: number
    adjustments?: number
    remaining: number
    availableForRequest: number
    lastAccrualAt?: Date
    utilizationRate: number
    canRequest: boolean
    transactions: Array<{ date?: string; description: string }>
    createdAt?: Date
    updatedAt?: Date
    accrualInfo?: {
        currentAccrued: number
        expectedAccrual: number
        isBehind: boolean
        nextAccrualAmount: number
    }
}

export class LeaveBalanceController {
    /**
     * Get all leave balances for a staff member
     * GET /api/leave-balances/staff/:staffId
     */
    static async getStaffBalances(
        req: Request,
        staffId: string
    ): Promise<ResponseObject> {
        try {
            const { year, leaveType } = req.query
            const user = (req as AuthenticatedRequest).user

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
                return errorResponseObject(
                    "Unauthorized to view these balances"
                )
            }

            // Verify staff exists
            const staff = await Staff.findById(staffId)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Build query
            const query: BalanceQuery = { staff: staffId }

            // Default to current year if not specified
            const queryYear = year ? Number(year) : new Date().getFullYear()
            if (queryYear < 2000 || queryYear > 2100) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "year",
                        message: "Year must be between 2000 and 2100",
                    },
                ])
            }
            query.year = queryYear

            // Filter by leave type if specified
            if (leaveType) {
                const leaveTypeStr =
                    typeof leaveType === "string"
                        ? leaveType
                        : String(leaveType)
                if (
                    !Object.values(LeaveTypes).includes(
                        leaveTypeStr as LeaveTypes
                    )
                ) {
                    return validationErrorResponseObject("Validation failed", [
                        { field: "leaveType", message: "Invalid leave type" },
                    ])
                }
                query.leaveType = leaveTypeStr
            }

            // Get balances
            const balances = await LeaveBalance.find(query)
                .sort({ leaveType: 1 })
                .lean()

            // Enhance with virtual fields and additional info
            const enhancedBalances = balances.map((balance) => {
                const remaining =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(
                              0,
                              (balance.accrued || 0) +
                                  (balance.adjustments || 0) -
                                  balance.used
                          )
                        : Math.max(0, balance.allocated - balance.used)

                const availableForRequest =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(0, 30 - balance.used)
                        : remaining

                return {
                    ...balance,
                    remaining,
                    availableForRequest,
                    utilizationRate:
                        balance.allocated > 0
                            ? Math.round(
                                  (balance.used / balance.allocated) * 100
                              )
                            : 0,
                    isLowBalance: remaining <= 2,
                    canRequest: availableForRequest > 0,
                }
            })

            // Summary statistics
            const summary = {
                staffName: staff.name,
                staffId: staff.staffId,
                year: queryYear,
                totalAvailable: enhancedBalances.reduce(
                    (sum, b) => sum + b.availableForRequest,
                    0
                ),
                totalUsed: enhancedBalances.reduce((sum, b) => sum + b.used, 0),
                balanceCount: enhancedBalances.length,
            }

            return successResponseObject(
                "Leave balances retrieved successfully",
                {
                    summary,
                    balances: enhancedBalances,
                }
            )
        } catch (error) {
            console.error("Error fetching staff balances:", error)
            return errorResponseObject("Failed to retrieve leave balances")
        }
    }

    /**
     * Get single leave balance
     * GET /api/leave-balances/staff/:staffId/type/:leaveType
     */
    static async getBalance(
        req: Request,
        staffId: string,
        leaveType: string
    ): Promise<ResponseObject> {
        try {
            const { year } = req.query
            const user = (req as AuthenticatedRequest).user

            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            if (
                !leaveType ||
                !Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "leaveType",
                        message: "Valid leave type is required",
                    },
                ])
            }

            // Check permissions
            const canView =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER") ||
                staffId === user?._id

            if (!canView) {
                return errorResponseObject("Unauthorized to view this balance")
            }

            const queryYear = year ? Number(year) : new Date().getFullYear()

            // Get balance
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: queryYear,
                leaveType,
            }).populate("staff", "name staffId email")

            if (!balance) {
                return errorResponseObject("Leave balance not found")
            }

            // Parse transaction history from notes
            const transactions = balance.notes
                ? balance.notes
                      .split("\n")
                      .map((note) => {
                          const match = note.match(/^([\d\-T:.Z]+): (.+)$/)
                          if (match) {
                              return {
                                  date: match[1],
                                  description: match[2],
                              }
                          }
                          return { description: note }
                      })
                      .reverse()
                : []

            // Enhanced balance info
            const enhancedBalance: EnhancedBalance = {
                id: balance._id,
                staff: balance.staff,
                year: balance.year,
                leaveType: balance.leaveType,
                allocated: balance.allocated,
                accrued: balance.accrued,
                used: balance.used,
                adjustments: balance.adjustments,
                remaining: balance.remaining,
                availableForRequest: balance.availableForRequest,
                lastAccrualAt: balance.lastAccrualAt,
                utilizationRate:
                    balance.allocated > 0
                        ? Math.round((balance.used / balance.allocated) * 100)
                        : 0,
                canRequest: balance.availableForRequest > 0,
                transactions,
                createdAt: balance.createdAt,
                updatedAt: balance.updatedAt,
            }

            // Add accrual info for annual leave
            if (leaveType === LeaveTypes.ANNUAL) {
                const currentMonth = new Date().getMonth() + 1
                const expectedAccrual = Math.min(30, currentMonth * 2.5)
                enhancedBalance.accrualInfo = {
                    currentAccrued: balance.accrued || 0,
                    expectedAccrual,
                    isBehind: (balance.accrued || 0) < expectedAccrual,
                    nextAccrualAmount: Math.min(
                        2.5,
                        30 - (balance.accrued || 0)
                    ),
                }
            }

            return successResponseObject(
                "Leave balance retrieved successfully",
                enhancedBalance
            )
        } catch (error) {
            console.error("Error fetching balance:", error)
            return errorResponseObject("Failed to retrieve leave balance")
        }
    }

    /**
     * Get department leave balances summary
     * GET /api/leave-balances/department/:departmentId
     */
    static async getDepartmentBalances(
        req: Request,
        departmentId: string
    ): Promise<ResponseObject> {
        try {
            const { year } = req.query
            const user = (req as AuthenticatedRequest).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view department balances"
                )
            }

            if (!departmentId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "departmentId",
                        message: "Department ID is required",
                    },
                ])
            }

            // Verify department
            const department = await Department.findById(departmentId)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            const queryYear = year ? Number(year) : new Date().getFullYear()

            // Get all staff in department
            const staffInDept = await Staff.find({
                department: departmentId,
                status: AccountStatus.ACTIVE,
            }).select("_id name staffId")

            if (staffInDept.length === 0) {
                return successResponseObject("No staff in department", {
                    department: department.name,
                    year: queryYear,
                    staffCount: 0,
                    balances: [],
                })
            }

            const staffIds = staffInDept.map((s) => s._id)

            // Get all balances for department staff
            const balances = await LeaveBalance.find({
                staff: { $in: staffIds },
                year: queryYear,
            }).lean()

            // Group by leave type
            const byLeaveType: Record<string, LeaveTypeSummary> = {}
            const byStaff: Record<
                string,
                {
                    staffId?: string
                    name?: string
                    staffCode?: string
                    balances: Array<{
                        leaveType: string
                        used: number
                        remaining: number
                        available: number
                        isLow: boolean
                    }>
                }
            > = {}

            for (const balance of balances) {
                // By leave type aggregation
                if (!byLeaveType[balance.leaveType]) {
                    byLeaveType[balance.leaveType] = {
                        type: balance.leaveType,
                        totalStaff: 0,
                        totalAllocated: 0,
                        totalAccrued: 0,
                        totalUsed: 0,
                        totalRemaining: 0,
                        totalAvailable: 0,
                        utilizationRate: 0,
                        staffWithBalance: [],
                        staffCount: 0,
                        lowBalanceCount: 0,
                    }
                }

                const remaining =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(
                              0,
                              (balance.accrued || 0) +
                                  (balance.adjustments || 0) -
                                  balance.used
                          )
                        : Math.max(0, balance.allocated - balance.used)

                const available =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(0, 30 - balance.used)
                        : remaining

                byLeaveType[balance.leaveType].totalAllocated +=
                    balance.allocated
                byLeaveType[balance.leaveType].totalUsed += balance.used
                byLeaveType[balance.leaveType].totalRemaining += remaining
                byLeaveType[balance.leaveType].totalAvailable += available
                byLeaveType[balance.leaveType].staffCount =
                    (byLeaveType[balance.leaveType].staffCount || 0) + 1
                if (remaining <= 2)
                    byLeaveType[balance.leaveType].lowBalanceCount =
                        (byLeaveType[balance.leaveType].lowBalanceCount || 0) +
                        1

                // By staff aggregation
                const staffId = balance.staff.toString()
                if (!byStaff[staffId]) {
                    const staffMember = staffInDept.find(
                        (s) => s._id.toString() === staffId
                    )
                    byStaff[staffId] = {
                        staffId: staffMember?._id?.toString(),
                        name: staffMember?.name,
                        staffCode: staffMember?.staffId,
                        balances: [],
                    }
                }

                byStaff[staffId].balances.push({
                    leaveType: balance.leaveType,
                    used: balance.used,
                    remaining,
                    available,
                    isLow: remaining <= 2,
                })
            }

            // Calculate averages for leave types
            Object.values(byLeaveType).forEach((lt: LeaveTypeSummary) => {
                lt.averageUsed = Math.round(lt.totalUsed / (lt.staffCount || 1))
                lt.averageRemaining = Math.round(
                    lt.totalRemaining / (lt.staffCount || 1)
                )
                lt.utilizationRate =
                    lt.totalAllocated > 0
                        ? Math.round((lt.totalUsed / lt.totalAllocated) * 100)
                        : 0
            })

            const summary = {
                department: department.name,
                year: queryYear,
                staffCount: staffInDept.length,
                byLeaveType: Object.values(byLeaveType),
                byStaff: Object.values(byStaff),
                alerts: {
                    lowBalanceStaff: Object.values(byStaff).filter((s) =>
                        s.balances.some((b) => b.isLow)
                    ).length,
                    totalLowBalances: Object.values(byLeaveType).reduce(
                        (sum: number, lt: LeaveTypeSummary) =>
                            sum + (lt.lowBalanceCount || 0),
                        0
                    ),
                },
            }

            return successResponseObject(
                "Department balances retrieved successfully",
                summary
            )
        } catch (error) {
            console.error("Error fetching department balances:", error)
            return errorResponseObject("Failed to retrieve department balances")
        }
    }

    /**
     * Initialize leave balances for a staff member
     * POST /api/leave-balances/initialize
     */
    static async initializeBalances(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, year } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can initialize balances"
                )
            }

            // Validation
            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            const balanceYear = year || new Date().getFullYear()
            if (balanceYear < 2000 || balanceYear > 2100) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "year",
                        message: "Year must be between 2000 and 2100",
                    },
                ])
            }

            // Verify staff exists
            const staff = await Staff.findById(staffId)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Verify staff has an active contract
            const activeContract = await StaffContract.findOne({
                staff: staffId,
                status: ContractStatus.ACTIVE
            })
            
            if (!activeContract) {
                return errorResponseObject(
                    "Staff member must have an active contract to initialize balances"
                )
            }

            // Check if balances already exist
            const existingBalances = await LeaveBalance.find({
                staff: staffId,
                year: balanceYear,
            })

            if (existingBalances.length > 0) {
                return errorResponseObject(
                    `Leave balances already exist for ${balanceYear}`
                )
            }

            // Initialize balances
            const balancesToCreate = []

            // Annual leave - starts at 0, will accrue
            balancesToCreate.push({
                staff: staffId,
                year: balanceYear,
                leaveType: LeaveTypes.ANNUAL,
                allocated: 30, // Max that can be accrued
                accrued: 0, // Will accrue monthly
                used: 0,
                adjustments: 0,
                notes: `Initialized for year ${balanceYear}`,
                createdBy: user._id,
            })

            // Sick leave
            balancesToCreate.push({
                staff: staffId,
                year: balanceYear,
                leaveType: LeaveTypes.SICK,
                allocated: LEAVE_CAPS[LeaveTypes.SICK],
                used: 0,
                notes: `Initialized for year ${balanceYear}`,
                createdBy: user._id,
            })

            // Bereavement leave
            balancesToCreate.push({
                staff: staffId,
                year: balanceYear,
                leaveType: LeaveTypes.BEREAVEMENT,
                allocated: LEAVE_CAPS[LeaveTypes.BEREAVEMENT],
                used: 0,
                notes: `Initialized for year ${balanceYear}`,
                createdBy: user._id,
            })

            // Gender-specific leaves
            if (staff.gender === Gender.MALE) {
                balancesToCreate.push({
                    staff: staffId,
                    year: balanceYear,
                    leaveType: LeaveTypes.PATERNITY,
                    allocated: LEAVE_CAPS[LeaveTypes.PATERNITY],
                    used: 0,
                    notes: `Initialized for year ${balanceYear}`,
                    createdBy: user._id,
                })
            } else if (staff.gender === Gender.FEMALE) {
                balancesToCreate.push({
                    staff: staffId,
                    year: balanceYear,
                    leaveType: LeaveTypes.MATERNITY,
                    allocated: LEAVE_CAPS[LeaveTypes.MATERNITY],
                    used: 0,
                    notes: `Initialized for year ${balanceYear}`,
                    createdBy: user._id,
                })
            }

            // Create all balances
            const createdBalances = await LeaveBalance.insertMany(
                balancesToCreate
            )

            // If current year, update annual leave accrual based on contract start date
            if (balanceYear === new Date().getFullYear()) {
                const annualBalance = createdBalances.find(
                    (b) => b.leaveType === LeaveTypes.ANNUAL
                )
                if (annualBalance) {
                    const contractStartDate = new Date(activeContract.startDate)
                    const currentDate = new Date()
                    let accruedDays = 0
                    
                    // Only accrue if contract started in current year
                    if (contractStartDate.getFullYear() === currentDate.getFullYear()) {
                        // Calculate months from contract start to current month
                        const startMonth = contractStartDate.getMonth()
                        const currentMonth = currentDate.getMonth()
                        const monthsWorked = Math.max(0, currentMonth - startMonth + 1)
                        accruedDays = Math.min(30, monthsWorked * 2.5)
                    } else if (contractStartDate.getFullYear() < currentDate.getFullYear()) {
                        // Contract from previous year, use standard calculation
                        accruedDays = Math.min(30, (currentDate.getMonth() + 1) * 2.5)
                    }
                    // If contract starts in future (shouldn't happen but safe check), no accrual
                    
                    await LeaveBalance.findByIdAndUpdate(annualBalance._id, {
                        $set: {
                            accrued: accruedDays,
                        },
                    })
                }
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: staffId,
                performedBy: user._id,
                performedByName: (user?.name as string) || "System",
                performedByEmail: (user?.email as string) || "system@leave.com",
                description: `Initialized leave balances for ${staff.name} for year ${balanceYear}`,
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    year: balanceYear,
                    balanceTypes: balancesToCreate.map((b) => b.leaveType),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Leave balances initialized successfully",
                {
                    staffName: staff.name,
                    year: balanceYear,
                    balancesCreated: createdBalances.length,
                }
            )
        } catch (error) {
            console.error("Error initializing balances:", error)
            return errorResponseObject("Failed to initialize leave balances")
        }
    }

    /**
     * Adjust leave balance (annual leave only)
     * PUT /api/leave-balances/adjust
     */
    static async adjustBalance(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, adjustment, reason } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can adjust balances"
                )
            }

            // Validation
            const errors = []

            if (!staffId) {
                errors.push({
                    field: "staffId",
                    message: "Staff ID is required",
                })
            }

            if (adjustment === undefined || adjustment === null) {
                errors.push({
                    field: "adjustment",
                    message: "Adjustment amount is required",
                })
            } else if (typeof adjustment !== "number") {
                errors.push({
                    field: "adjustment",
                    message: "Adjustment must be a number",
                })
            }

            if (!reason || !reason.trim()) {
                errors.push({
                    field: "reason",
                    message: "Adjustment reason is required",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Get current year annual leave balance
            const currentYear = new Date().getFullYear()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType: LeaveTypes.ANNUAL,
            })

            if (!balance) {
                return errorResponseObject(
                    "Annual leave balance not found for current year"
                )
            }

            // Apply adjustment
            const oldAdjustment = balance.adjustments || 0
            const newAdjustment = oldAdjustment + adjustment

            // Ensure total doesn't go negative
            const totalAvailable =
                (balance.accrued || 0) + newAdjustment - balance.used
            if (totalAvailable < 0) {
                return errorResponseObject(
                    "Adjustment would result in negative balance"
                )
            }

            // Update balance
            balance.adjustments = newAdjustment
            const timestamp = new Date().toISOString()
            const adjustmentNote = `${timestamp}: Adjustment of ${
                adjustment > 0 ? "+" : ""
            }${adjustment} days - ${reason}`
            balance.notes = balance.notes
                ? `${balance.notes}\n${adjustmentNote}`
                : adjustmentNote

            await balance.save()

            // Get staff info for audit
            const staff = await Staff.findById(staffId)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: balance._id,
                performedBy: user._id,
                performedByName: user.name as string,
                performedByEmail: user.email as string,
                description: `Adjusted annual leave balance for ${
                    staff?.name
                }: ${adjustment > 0 ? "+" : ""}${adjustment} days`,
                changes: [
                    {
                        field: "adjustments",
                        oldValue: oldAdjustment,
                        newValue: newAdjustment,
                        fieldLabel: "Adjustments",
                    },
                ],
                metadata: {
                    staffName: staff?.name,
                    staffId: staff?.staffId,
                    adjustment,
                    reason,
                    year: currentYear,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Balance adjusted successfully", {
                balance: {
                    id: balance._id,
                    leaveType: balance.leaveType,
                    accrued: balance.accrued,
                    adjustments: balance.adjustments,
                    used: balance.used,
                    remaining: balance.remaining,
                    availableForRequest: balance.availableForRequest,
                },
                adjustment: {
                    amount: adjustment,
                    reason,
                    appliedAt: timestamp,
                },
            })
        } catch (error) {
            console.error("Error adjusting balance:", error)
            return errorResponseObject("Failed to adjust leave balance")
        }
    }

    /**
     * Reset leave balance to default
     * PUT /api/leave-balances/reset
     */
    static async resetBalance(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, leaveType, year, reason } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can reset balances"
                )
            }

            // Validation
            const errors = []

            if (!staffId) {
                errors.push({
                    field: "staffId",
                    message: "Staff ID is required",
                })
            }

            if (!leaveType || !Object.values(LeaveTypes).includes(leaveType)) {
                errors.push({
                    field: "leaveType",
                    message: "Valid leave type is required",
                })
            }

            if (!reason || !reason.trim()) {
                errors.push({
                    field: "reason",
                    message: "Reset reason is required",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            const resetYear = year || new Date().getFullYear()

            // Find balance
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: resetYear,
                leaveType,
            })

            if (!balance) {
                return errorResponseObject("Leave balance not found")
            }

            // Store old values for audit
            const oldValues: Record<string, any> = {
                allocated: balance.allocated,
                accrued: balance.accrued,
                used: balance.used,
                adjustments: balance.adjustments,
            }

            // Reset based on leave type
            if (leaveType === LeaveTypes.ANNUAL) {
                // Annual leave resets to 0
                balance.allocated = 30 // Max that can be accrued
                balance.accrued = 0
                balance.used = 0
                balance.adjustments = 0
                balance.lastAccrualAt = undefined
            } else {
                // Other leaves reset to yearly cap
                balance.allocated = LEAVE_CAPS[leaveType as LeaveTypes] || 0
                balance.used = 0
            }

            const timestamp = new Date().toISOString()
            const resetNote = `${timestamp}: Balance reset - ${reason}`
            balance.notes = resetNote // Replace notes with reset info

            await balance.save()

            // Get staff info
            const staff = await Staff.findById(staffId)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: balance._id,
                performedBy: user._id,
                performedByName: user.name as string,
                performedByEmail: user.email as string,
                description: `Reset ${leaveType} balance for ${staff?.name}`,
                changes: Object.keys(oldValues).map((key) => ({
                    field: key,
                    oldValue: oldValues[key],
                    newValue: (balance as any)[key],
                    fieldLabel: key.charAt(0).toUpperCase() + key.slice(1),
                })),
                metadata: {
                    staffName: staff?.name,
                    staffId: staff?.staffId,
                    leaveType,
                    year: resetYear,
                    reason,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Balance reset successfully", {
                balance: {
                    id: balance._id,
                    leaveType: balance.leaveType,
                    allocated: balance.allocated,
                    accrued: balance.accrued,
                    used: balance.used,
                    adjustments: balance.adjustments,
                    remaining: balance.remaining,
                },
                resetAt: timestamp,
            })
        } catch (error) {
            console.error("Error resetting balance:", error)
            return errorResponseObject("Failed to reset leave balance")
        }
    }

    /**
     * Update accrual for a specific staff
     * PUT /api/leave-balances/update-accrual
     */
    static async updateAccrual(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, asOfDate } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can update accruals"
                )
            }

            if (!staffId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "staffId", message: "Staff ID is required" },
                ])
            }

            // Get current year annual leave balance
            const currentYear = new Date().getFullYear()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType: LeaveTypes.ANNUAL,
            })

            if (!balance) {
                return errorResponseObject(
                    "Annual leave balance not found for current year"
                )
            }

            // Get staff's active contract to check start date
            const contract = await StaffContract.findOne({
                staff: staffId,
                status: ContractStatus.ACTIVE
            })

            if (!contract) {
                return errorResponseObject(
                    "No active contract found for staff member"
                )
            }

            const effectiveDate = asOfDate ? new Date(asOfDate) : new Date()
            const oldAccrued = balance.accrued || 0
            const contractStartDate = new Date(contract.startDate)
            let newAccrued = oldAccrued

            // Only update accrual if contract started before or on the effective date
            if (contractStartDate <= effectiveDate) {
                // Check if this is the first year of the contract
                if (contractStartDate.getFullYear() === currentYear) {
                    // Pro-rated accrual for first year employees
                    const startMonth = contractStartDate.getMonth()
                    const effectiveMonth = effectiveDate.getMonth()
                    const monthsWorked = Math.max(0, effectiveMonth - startMonth + 1)
                    newAccrued = Math.min(30, monthsWorked * 2.5)
                    
                    if (newAccrued !== oldAccrued) {
                        balance.accrued = newAccrued
                        balance.lastAccrualAt = effectiveDate
                        await balance.save()
                    }
                } else {
                    // Standard accrual for existing employees
                    await balance.updateAccrual(effectiveDate)
                    newAccrued = balance.accrued || 0
                }
            }

            const accrualIncreased = newAccrued > oldAccrued

            // Get staff info
            const staff = await Staff.findById(staffId)

            if (accrualIncreased) {
                // Log to audit
                await AuditLogController.createAuditLog({
                    action: AuditAction.BALANCE_ADJUSTED,
                    entityType: "LeaveBalance",
                    entityId: balance._id,
                    performedBy: user._id,
                    performedByName: (user?.name as string) || "System",
                    performedByEmail:
                        (user?.email as string) || "system@leave.com",
                    description: `Updated annual leave accrual for ${staff?.name}`,
                    changes: [
                        {
                            field: "accrued",
                            oldValue: oldAccrued,
                            newValue: newAccrued,
                            fieldLabel: "Accrued Days",
                        },
                    ],
                    metadata: {
                        staffName: staff?.name,
                        staffId: staff?.staffId,
                        year: currentYear,
                        asOfDate: effectiveDate,
                    },
                    ipAddress: req.ip || req.socket.remoteAddress,
                    userAgent: req.headers["user-agent"],
                })
            }

            return successResponseObject(
                accrualIncreased
                    ? "Accrual updated successfully"
                    : "Accrual already up to date",
                {
                    staffName: staff?.name,
                    previousAccrual: oldAccrued,
                    currentAccrual: newAccrued,
                    increased: newAccrued - oldAccrued,
                    lastAccrualAt: balance.lastAccrualAt,
                    remaining: balance.remaining,
                }
            )
        } catch (error) {
            console.error("Error updating accrual:", error)
            return errorResponseObject("Failed to update accrual")
        }
    }

    /**
     * Process monthly accruals for all active staff with contracts
     * PUT /api/leave-balances/process-accruals
     */
    static async processMonthlyAccruals(req: Request): Promise<ResponseObject> {
        try {
            const { year, month } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check Admin/System permission
            if (
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("SYSTEM")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only Admin/System can process accruals"
                )
            }

            const processYear = year || new Date().getFullYear()
            const asOfDate = month
                ? new Date(processYear, month - 1, 28) // Use 28th to avoid month-end issues
                : new Date()

            // Get all staff with active contracts
            const activeContracts = await StaffContract.find({
                status: ContractStatus.ACTIVE,
            })
                .select("staff")
                .distinct("staff")

            if (activeContracts.length === 0) {
                return successResponseObject("No active contracts found", {
                    processed: 0,
                    year: processYear,
                })
            }

            // Get active staff details
            const activeStaff = await Staff.find({
                _id: { $in: activeContracts },
                status: AccountStatus.ACTIVE,
            }).select("_id")

            const activeStaffIds = activeStaff.map((s) => s._id)

            // Find all annual leave balances for active staff with contracts
            const balances = await LeaveBalance.find({
                staff: { $in: activeStaffIds },
                year: processYear,
                leaveType: LeaveTypes.ANNUAL,
            })

            let updatedCount = 0
            const updateResults = []

            for (const balance of balances) {
                // Get the staff's contract to check start date
                const contract = await StaffContract.findOne({
                    staff: balance.staff,
                    status: ContractStatus.ACTIVE
                })
                
                if (!contract) continue // Skip if no active contract
                
                const oldAccrued = balance.accrued || 0
                const contractStartDate = new Date(contract.startDate)
                
                // Only process accrual if contract started before or during the processing date
                if (contractStartDate <= asOfDate) {
                    // Check if this is the first year of the contract
                    if (contractStartDate.getFullYear() === processYear) {
                        // Pro-rated accrual for first year employees
                        const startMonth = contractStartDate.getMonth()
                        const processMonth = asOfDate.getMonth()
                        const monthsWorked = Math.max(0, processMonth - startMonth + 1)
                        const expectedAccrual = Math.min(30, monthsWorked * 2.5)
                        
                        // Update only if expected is more than current
                        if (expectedAccrual > oldAccrued) {
                            balance.accrued = expectedAccrual
                            balance.lastAccrualAt = asOfDate
                            await balance.save()
                            
                            updatedCount++
                            updateResults.push({
                                staffId: balance.staff,
                                previousAccrual: oldAccrued,
                                newAccrual: expectedAccrual,
                                increase: expectedAccrual - oldAccrued,
                            })
                        }
                    } else {
                        // Standard accrual for existing employees
                        await balance.updateAccrual(asOfDate)
                        const newAccrued = balance.accrued || 0
                        
                        if (newAccrued > oldAccrued) {
                            updatedCount++
                            updateResults.push({
                                staffId: balance.staff,
                                previousAccrual: oldAccrued,
                                newAccrual: newAccrued,
                                increase: newAccrued - oldAccrued,
                            })
                        }
                    }
                }
            }

            // Log to audit
            if (updatedCount > 0) {
                await AuditLogController.createAuditLog({
                    action: AuditAction.BALANCE_ADJUSTED,
                    entityType: "LeaveBalance",
                    entityId: "BULK",
                    performedBy: user?._id || "SYSTEM",
                    performedByName: (user?.name as string) || "System",
                    performedByEmail:
                        (user?.email as string) || "system@leave.com",
                    description: `Processed monthly accruals for ${updatedCount} staff`,
                    metadata: {
                        year: processYear,
                        month: month || new Date().getMonth() + 1,
                        processedCount: updatedCount,
                        totalEligible: balances.length,
                        asOfDate,
                    },
                    ipAddress: req.ip || req.socket.remoteAddress || "SYSTEM",
                    userAgent: req.headers["user-agent"] || "System Process",
                })
            }

            return successResponseObject(
                "Monthly accruals processed successfully",
                {
                    summary: {
                        year: processYear,
                        month: month || new Date().getMonth() + 1,
                        totalEligibleStaff: balances.length,
                        totalUpdated: updatedCount,
                        processedAt: new Date(),
                    },
                    details: updateResults,
                }
            )
        } catch (error) {
            console.error("Error processing monthly accruals:", error)
            return errorResponseObject("Failed to process monthly accruals")
        }
    }

    /**
     * Debit leave balance (when leave is approved)
     * PUT /api/leave-balances/debit
     */
    static async debitBalance(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, leaveType, days, reason, leaveRequestId } =
                req.body
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin/System permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("SYSTEM")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin/System can debit balances"
                )
            }

            // Validation
            const errors = []

            if (!staffId) {
                errors.push({
                    field: "staffId",
                    message: "Staff ID is required",
                })
            }

            if (!leaveType || !Object.values(LeaveTypes).includes(leaveType)) {
                errors.push({
                    field: "leaveType",
                    message: "Valid leave type is required",
                })
            }

            if (!days || days <= 0) {
                errors.push({
                    field: "days",
                    message: "Days must be a positive number",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Get current year balance
            const currentYear = new Date().getFullYear()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType,
            })

            if (!balance) {
                return errorResponseObject(
                    `${leaveType} balance not found for current year`
                )
            }

            // Check if sufficient balance
            if (!balance.canRequest(days)) {
                const available =
                    leaveType === LeaveTypes.ANNUAL
                        ? balance.availableForRequest
                        : balance.remaining

                return errorResponseObject(
                    `Insufficient ${leaveType} balance. Available: ${available} days, Requested: ${days} days`
                )
            }

            const oldUsed = balance.used

            // Debit the balance
            try {
                const debitReason =
                    reason ||
                    (leaveRequestId
                        ? `Leave request #${leaveRequestId}`
                        : "Leave approved")
                await balance.debit(days, debitReason)
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Failed to debit balance"
                return errorResponseObject(message)
            }

            // Get staff info
            const staff = await Staff.findById(staffId)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_APPROVED,
                entityType: "LeaveBalance",
                entityId: balance._id,
                performedBy: user._id || "SYSTEM",
                performedByName: (user?.name as string) || "System",
                performedByEmail: (user?.email as string) || "system@leave.com",
                description: `Debited ${days} days from ${staff?.name}'s ${leaveType} balance`,
                changes: [
                    {
                        field: "used",
                        oldValue: oldUsed,
                        newValue: balance.used,
                        fieldLabel: "Used Days",
                    },
                ],
                metadata: {
                    staffName: staff?.name,
                    staffId: staff?.staffId,
                    leaveType,
                    days,
                    reason: reason || "Leave approved",
                    leaveRequestId,
                    year: currentYear,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Balance debited successfully", {
                balance: {
                    id: balance._id,
                    leaveType: balance.leaveType,
                    used: balance.used,
                    remaining: balance.remaining,
                    availableForRequest: balance.availableForRequest,
                },
                transaction: {
                    type: "debit",
                    days,
                    reason: reason || "Leave approved",
                    timestamp: new Date(),
                },
            })
        } catch (error) {
            console.error("Error debiting balance:", error)
            return errorResponseObject("Failed to debit leave balance")
        }
    }

    /**
     * Credit leave balance (when leave is cancelled)
     * PUT /api/leave-balances/credit
     */
    static async creditBalance(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, leaveType, days, reason, leaveRequestId } =
                req.body
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin/System permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("SYSTEM")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin/System can credit balances"
                )
            }

            // Validation
            const errors = []

            if (!staffId) {
                errors.push({
                    field: "staffId",
                    message: "Staff ID is required",
                })
            }

            if (!leaveType || !Object.values(LeaveTypes).includes(leaveType)) {
                errors.push({
                    field: "leaveType",
                    message: "Valid leave type is required",
                })
            }

            if (!days || days <= 0) {
                errors.push({
                    field: "days",
                    message: "Days must be a positive number",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Get current year balance
            const currentYear = new Date().getFullYear()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType,
            })

            if (!balance) {
                return errorResponseObject(
                    `${leaveType} balance not found for current year`
                )
            }

            const oldUsed = balance.used

            // Credit the balance
            const creditReason =
                reason ||
                (leaveRequestId
                    ? `Leave request #${leaveRequestId} cancelled`
                    : "Leave cancelled")
            await balance.credit(days, creditReason)

            // Get staff info
            const staff = await Staff.findById(staffId)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.LEAVE_CANCELLED,
                entityType: "LeaveBalance",
                entityId: balance._id,
                performedBy: user._id || "SYSTEM",
                performedByName: (user?.name as string) || "System",
                performedByEmail: (user?.email as string) || "system@leave.com",
                description: `Credited ${days} days to ${staff?.name}'s ${leaveType} balance`,
                changes: [
                    {
                        field: "used",
                        oldValue: oldUsed,
                        newValue: balance.used,
                        fieldLabel: "Used Days",
                    },
                ],
                metadata: {
                    staffName: staff?.name,
                    staffId: staff?.staffId,
                    leaveType,
                    days,
                    reason: creditReason,
                    leaveRequestId,
                    year: currentYear,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Balance credited successfully", {
                balance: {
                    id: balance._id,
                    leaveType: balance.leaveType,
                    used: balance.used,
                    remaining: balance.remaining,
                    availableForRequest: balance.availableForRequest,
                },
                transaction: {
                    type: "credit",
                    days,
                    reason: creditReason,
                    timestamp: new Date(),
                },
            })
        } catch (error) {
            console.error("Error crediting balance:", error)
            return errorResponseObject("Failed to credit leave balance")
        }
    }

    /**
     * Check leave availability
     * GET /api/leave-balances/check-availability
     */
    static async checkAvailability(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, leaveType, days } = req.query
            const user = (req as AuthenticatedRequest).user

            if (!staffId || !leaveType || !days) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "parameters",
                        message: "staffId, leaveType, and days are required",
                    },
                ])
            }

            // Check permissions
            const canCheck =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN") ||
                user?.permissions?.includes("MANAGER") ||
                staffId === user?._id

            if (!canCheck) {
                return errorResponseObject("Unauthorized to check availability")
            }

            if (!Object.values(LeaveTypes).includes(leaveType as LeaveTypes)) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "leaveType", message: "Invalid leave type" },
                ])
            }

            const requestedDays = Number(days)
            if (isNaN(requestedDays) || requestedDays <= 0) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "days",
                        message: "Days must be a positive number",
                    },
                ])
            }

            // Get current year balance
            const currentYear = new Date().getFullYear()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType,
            })

            if (!balance) {
                return successResponseObject("Balance check completed", {
                    available: false,
                    reason: `No ${leaveType} balance found for current year`,
                    balance: null,
                })
            }

            const canRequest = balance.canRequest(requestedDays)
            const availableDays =
                leaveType === LeaveTypes.ANNUAL
                    ? balance.availableForRequest
                    : balance.remaining

            let reason = ""
            if (!canRequest) {
                if (leaveType === LeaveTypes.ANNUAL) {
                    reason = `Cannot exceed 30 days total annual leave. Available: ${availableDays} days`
                } else {
                    reason = `Insufficient balance. Available: ${availableDays} days`
                }
            }

            return successResponseObject("Availability checked successfully", {
                available: canRequest,
                reason: canRequest ? "Sufficient balance available" : reason,
                balance: {
                    leaveType: balance.leaveType,
                    allocated: balance.allocated,
                    accrued: balance.accrued,
                    used: balance.used,
                    adjustments: balance.adjustments,
                    remaining: balance.remaining,
                    availableForRequest: availableDays,
                    requestedDays,
                },
            })
        } catch (error) {
            console.error("Error checking availability:", error)
            return errorResponseObject("Failed to check leave availability")
        }
    }

    /**
     * Validate leave request
     * POST /api/leave-balances/validate-request
     */
    static async validateLeaveRequest(req: Request): Promise<ResponseObject> {
        try {
            const { staffId, leaveType, days } = req.body

            // Validation
            const errors = []

            if (!staffId) {
                errors.push({
                    field: "staffId",
                    message: "Staff ID is required",
                })
            }

            if (!leaveType || !Object.values(LeaveTypes).includes(leaveType)) {
                errors.push({
                    field: "leaveType",
                    message: "Valid leave type is required",
                })
            }

            if (!days || days <= 0) {
                errors.push({
                    field: "days",
                    message: "Days must be a positive number",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Get staff info for gender validation
            const staff = await Staff.findById(staffId)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Gender-specific leave validation
            if (
                leaveType === LeaveTypes.MATERNITY &&
                staff.gender !== Gender.FEMALE
            ) {
                return errorResponseObject(
                    "Maternity leave is only available for female staff"
                )
            }

            if (
                leaveType === LeaveTypes.PATERNITY &&
                staff.gender !== Gender.MALE
            ) {
                return errorResponseObject(
                    "Paternity leave is only available for male staff"
                )
            }

            // Get current year balance
            const currentYear = new Date().getFullYear()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType,
            })

            if (!balance) {
                return successResponseObject("Validation completed", {
                    valid: false,
                    reason: `No ${leaveType} balance found for current year`,
                    staffName: staff.name,
                })
            }

            const canRequest = balance.canRequest(days)
            const availableDays =
                leaveType === LeaveTypes.ANNUAL
                    ? balance.availableForRequest
                    : balance.remaining

            const validationResult = {
                valid: canRequest,
                staffName: staff.name,
                leaveType,
                requestedDays: days,
                availableDays,
                currentUsed: balance.used,
                allocated: balance.allocated,
                reason: canRequest
                    ? "Request is valid"
                    : `Insufficient balance. Available: ${availableDays} days, Requested: ${days} days`,
            }

            return successResponseObject(
                "Leave request validated",
                validationResult
            )
        } catch (error) {
            console.error("Error validating leave request:", error)
            return errorResponseObject("Failed to validate leave request")
        }
    }

    /**
     * Get balance summary report
     * GET /api/leave-balances/report/summary
     */
    static async getBalanceSummaryReport(
        req: Request
    ): Promise<ResponseObject> {
        try {
            const { year, department } = req.query
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can view summary reports"
                )
            }

            const reportYear = year ? Number(year) : new Date().getFullYear()

            // Build staff filter
            const staffFilter: StaffFilter = { status: AccountStatus.ACTIVE }
            if (department && typeof department === "string") {
                staffFilter.department = department
            }

            // Get active staff with contracts
            const activeContracts = await StaffContract.find({
                status: ContractStatus.ACTIVE,
            })
                .select("staff")
                .distinct("staff")

            staffFilter._id = { $in: activeContracts }

            const activeStaff = await Staff.find(staffFilter)
                .select("_id name staffId department")
                .populate("department", "name")

            if (activeStaff.length === 0) {
                return successResponseObject("No active staff found", {
                    year: reportYear,
                    totalStaff: 0,
                    summary: [],
                })
            }

            const staffIds = activeStaff.map((s) => s._id)

            // Get all balances
            const balances = await LeaveBalance.find({
                staff: { $in: staffIds },
                year: reportYear,
            }).lean()

            // Aggregate by leave type
            const byLeaveType: Record<string, LeaveTypeSummary> = {}

            for (const leaveType of Object.values(LeaveTypes)) {
                byLeaveType[leaveType] = {
                    type: leaveType,
                    totalStaff: 0,
                    totalAllocated: 0,
                    totalAccrued: 0,
                    totalUsed: 0,
                    totalRemaining: 0,
                    totalAvailable: 0,
                    utilizationRate: 0,
                    staffWithBalance: [],
                }
            }

            // Process balances
            for (const balance of balances) {
                const lt = byLeaveType[balance.leaveType]
                if (!lt) continue

                const remaining =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(
                              0,
                              (balance.accrued || 0) +
                                  (balance.adjustments || 0) -
                                  balance.used
                          )
                        : Math.max(0, balance.allocated - balance.used)

                const available =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(0, 30 - balance.used)
                        : remaining

                lt.totalStaff++
                lt.totalAllocated += balance.allocated
                lt.totalAccrued += balance.accrued || 0
                lt.totalUsed += balance.used
                lt.totalRemaining += remaining
                lt.totalAvailable += available

                const staffMember = activeStaff.find(
                    (s) => s._id.toString() === balance.staff.toString()
                )
                if (staffMember) {
                    lt.staffWithBalance.push({
                        staffId: staffMember.staffId,
                        name: staffMember.name,
                        department: (
                            staffMember.department as { name?: string }
                        )?.name,
                        used: balance.used,
                        remaining,
                        available,
                    })
                }
            }

            // Calculate utilization rates
            Object.values(byLeaveType).forEach((lt: LeaveTypeSummary) => {
                if (lt.totalAllocated > 0) {
                    lt.utilizationRate = Math.round(
                        (lt.totalUsed / lt.totalAllocated) * 100
                    )
                }
                lt.averageUsed =
                    lt.totalStaff > 0
                        ? Math.round(lt.totalUsed / lt.totalStaff)
                        : 0
                lt.averageRemaining =
                    lt.totalStaff > 0
                        ? Math.round(lt.totalRemaining / lt.totalStaff)
                        : 0
            })

            // Overall summary
            const overallSummary = {
                year: reportYear,
                totalStaff: activeStaff.length,
                totalBalanceRecords: balances.length,
                overallUtilization:
                    Math.round(
                        (Object.values(byLeaveType).reduce(
                            (sum: number, lt: LeaveTypeSummary) =>
                                sum + lt.totalUsed,
                            0
                        ) /
                            Object.values(byLeaveType).reduce(
                                (sum: number, lt: LeaveTypeSummary) =>
                                    sum + lt.totalAllocated,
                                0
                            )) *
                            100
                    ) || 0,
                totalDaysUsed: Object.values(byLeaveType).reduce(
                    (sum: number, lt: LeaveTypeSummary) => sum + lt.totalUsed,
                    0
                ),
                totalDaysAvailable: Object.values(byLeaveType).reduce(
                    (sum: number, lt: LeaveTypeSummary) =>
                        sum + lt.totalAvailable,
                    0
                ),
            }

            return successResponseObject("Balance summary report generated", {
                summary: overallSummary,
                byLeaveType: Object.values(byLeaveType).filter(
                    (lt: LeaveTypeSummary) => lt.totalStaff > 0
                ),
                generatedAt: new Date(),
            })
        } catch (error) {
            console.error("Error generating balance summary:", error)
            return errorResponseObject(
                "Failed to generate balance summary report"
            )
        }
    }

    /**
     * Get low balance alert
     * GET /api/leave-balances/report/low-balance
     */
    static async getLowBalanceAlert(req: Request): Promise<ResponseObject> {
        try {
            const { threshold = 2 } = req.query
            const user = (req as AuthenticatedRequest).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can view low balance alerts"
                )
            }

            const thresholdDays = Number(threshold)
            const currentYear = new Date().getFullYear()

            // Get all active staff with contracts
            const activeContracts = await StaffContract.find({
                status: ContractStatus.ACTIVE,
            })
                .select("staff")
                .distinct("staff")

            const activeStaff = await Staff.find({
                _id: { $in: activeContracts },
                status: AccountStatus.ACTIVE,
            })
                .select("_id name staffId department")
                .populate("department", "name")

            const staffIds = activeStaff.map((s) => s._id)

            // Get all current year balances
            const balances = await LeaveBalance.find({
                staff: { $in: staffIds },
                year: currentYear,
            }).lean()

            const lowBalanceAlerts = []

            for (const balance of balances) {
                const remaining =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(
                              0,
                              (balance.accrued || 0) +
                                  (balance.adjustments || 0) -
                                  balance.used
                          )
                        : Math.max(0, balance.allocated - balance.used)

                if (remaining <= thresholdDays) {
                    const staffMember = activeStaff.find(
                        (s) => s._id.toString() === balance.staff.toString()
                    )
                    if (staffMember) {
                        lowBalanceAlerts.push({
                            staff: {
                                id: staffMember._id,
                                name: staffMember.name,
                                staffId: staffMember.staffId,
                                department: (
                                    staffMember.department as { name?: string }
                                )?.name,
                            },
                            leaveType: balance.leaveType,
                            remaining,
                            used: balance.used,
                            allocated: balance.allocated,
                            severity:
                                remaining === 0
                                    ? "critical"
                                    : remaining <= 1
                                    ? "high"
                                    : "medium",
                        })
                    }
                }
            }

            // Group by department
            const byDepartment: Record<
                string,
                {
                    department: string
                    alerts: Array<{
                        staff: {
                            id: string
                            name: string
                            staffId: string
                            department?: string
                        }
                        leaveType: string
                        remaining: number
                        used: number
                        allocated: number
                        severity: string
                    }>
                    count: number
                }
            > = {}
            for (const alert of lowBalanceAlerts) {
                const dept = alert.staff.department || "Unknown"
                if (!byDepartment[dept]) {
                    byDepartment[dept] = {
                        department: dept,
                        alerts: [],
                        count: 0,
                    }
                }
                byDepartment[dept].alerts.push(alert)
                byDepartment[dept].count++
            }

            // Sort alerts by severity and remaining days
            lowBalanceAlerts.sort((a, b) => {
                if (a.severity !== b.severity) {
                    const severityOrder: Record<string, number> = {
                        critical: 0,
                        high: 1,
                        medium: 2,
                    }
                    return severityOrder[a.severity] - severityOrder[b.severity]
                }
                return a.remaining - b.remaining
            })

            return successResponseObject("Low balance alerts generated", {
                summary: {
                    threshold: thresholdDays,
                    totalAlerts: lowBalanceAlerts.length,
                    criticalCount: lowBalanceAlerts.filter(
                        (a) => a.severity === "critical"
                    ).length,
                    highCount: lowBalanceAlerts.filter(
                        (a) => a.severity === "high"
                    ).length,
                    mediumCount: lowBalanceAlerts.filter(
                        (a) => a.severity === "medium"
                    ).length,
                },
                alerts: lowBalanceAlerts,
                byDepartment: Object.values(byDepartment),
                generatedAt: new Date(),
            })
        } catch (error) {
            console.error("Error generating low balance alerts:", error)
            return errorResponseObject("Failed to generate low balance alerts")
        }
    }

    /**
     * Get year-end report
     * GET /api/leave-balances/report/year-end
     */
    static async getYearEndReport(req: Request): Promise<ResponseObject> {
        try {
            const { year } = req.query
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can view year-end reports"
                )
            }

            const reportYear = year
                ? Number(year)
                : new Date().getFullYear() - 1

            // Get all balances for the year
            const balances = await LeaveBalance.find({ year: reportYear })
                .populate("staff", "name staffId department")
                .lean()

            if (balances.length === 0) {
                return successResponseObject("No data for year-end report", {
                    year: reportYear,
                    message: "No leave balance records found for this year",
                })
            }

            // Aggregate statistics
            const statistics: {
                byLeaveType: Record<string, any>
                byDepartment: Record<string, any>
                topUsers: any[]
                leastUsers: any[]
                unusedLeave: any[]
            } = {
                byLeaveType: {},
                byDepartment: {},
                topUsers: [],
                leastUsers: [],
                unusedLeave: [],
            }

            // Process by leave type
            for (const leaveType of Object.values(LeaveTypes)) {
                const typeBalances = balances.filter(
                    (b) => b.leaveType === leaveType
                )
                if (typeBalances.length === 0) continue

                const totalUsed = typeBalances.reduce(
                    (sum, b) => sum + b.used,
                    0
                )
                const totalAllocated = typeBalances.reduce(
                    (sum, b) => sum + b.allocated,
                    0
                )

                statistics.byLeaveType[leaveType] = {
                    staffCount: typeBalances.length,
                    totalAllocated,
                    totalUsed,
                    totalUnused: totalAllocated - totalUsed,
                    utilizationRate:
                        totalAllocated > 0
                            ? Math.round((totalUsed / totalAllocated) * 100)
                            : 0,
                    averageUsed: Math.round(totalUsed / typeBalances.length),
                }
            }

            // Top users (most leave taken)
            const staffUsage: Record<string, StaffUsage> = {}
            for (const balance of balances) {
                const staffId = (balance.staff as any)._id.toString()
                if (!staffUsage[staffId]) {
                    staffUsage[staffId] = {
                        staff: balance.staff as any,
                        totalUsed: 0,
                        byType: {},
                    }
                }
                staffUsage[staffId].totalUsed += balance.used
                staffUsage[staffId].byType[balance.leaveType] = balance.used
            }

            const staffUsageArray = Object.values(staffUsage)
            staffUsageArray.sort(
                (a: StaffUsage, b: StaffUsage) => b.totalUsed - a.totalUsed
            )

            statistics.topUsers = staffUsageArray.slice(0, 10).map((s) => ({
                name: s.staff.name,
                staffId: s.staff.staffId,
                totalDays: s.totalUsed,
                breakdown: s.byType,
            }))

            statistics.leastUsers = staffUsageArray
                .filter((s) => s.totalUsed > 0)
                .slice(-10)
                .reverse()
                .map((s) => ({
                    name: s.staff.name,
                    staffId: s.staff.staffId,
                    totalDays: s.totalUsed,
                    breakdown: s.byType,
                }))

            // Unused leave (staff who didn't use any leave)
            statistics.unusedLeave = staffUsageArray
                .filter((s) => s.totalUsed === 0)
                .map((s) => ({
                    name: s.staff.name,
                    staffId: s.staff.staffId,
                }))

            // Summary
            const summary = {
                year: reportYear,
                totalStaff: new Set(
                    balances.map((b) => (b.staff as any)._id.toString())
                ).size,
                totalBalanceRecords: balances.length,
                totalDaysAllocated: balances.reduce(
                    (sum, b) => sum + b.allocated,
                    0
                ),
                totalDaysUsed: balances.reduce((sum, b) => sum + b.used, 0),
                overallUtilization:
                    Math.round(
                        (balances.reduce((sum, b) => sum + b.used, 0) /
                            balances.reduce((sum, b) => sum + b.allocated, 0)) *
                            100
                    ) || 0,
                message:
                    "All balances will reset for the new year. Annual leave starts at 0, other leaves at full allocation.",
            }

            return successResponseObject("Year-end report generated", {
                summary,
                statistics,
                generatedAt: new Date(),
            })
        } catch (error) {
            console.error("Error generating year-end report:", error)
            return errorResponseObject("Failed to generate year-end report")
        }
    }

    /**
     * Get leave utilization report
     * GET /api/leave-balances/report/utilization
     */
    static async getLeaveUtilizationReport(
        req: Request
    ): Promise<ResponseObject> {
        try {
            const { year, department, leaveType } = req.query
            const user = (req as AuthenticatedRequest).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view utilization reports"
                )
            }

            const reportYear = year ? Number(year) : new Date().getFullYear()

            // Build query
            const query: BalanceQuery = { year: reportYear }

            if (
                leaveType &&
                typeof leaveType === "string" &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                query.leaveType = leaveType
            }

            // Get staff filter if department specified
            let staffIds: string[] = []
            if (department && typeof department === "string") {
                const deptStaff = await Staff.find({ department }).select("_id")
                staffIds = deptStaff.map((s) => s._id.toString())

                if (staffIds.length > 0) {
                    query.staff = { $in: staffIds }
                }
            }

            // Get balances
            const balances = await LeaveBalance.find(query)
                .populate("staff", "name staffId department")
                .populate({
                    path: "staff",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .lean()

            // Calculate utilization metrics
            const utilizationData = balances.map((balance) => {
                const remaining =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(
                              0,
                              (balance.accrued || 0) +
                                  (balance.adjustments || 0) -
                                  balance.used
                          )
                        : Math.max(0, balance.allocated - balance.used)

                const utilizationRate =
                    balance.allocated > 0
                        ? Math.round((balance.used / balance.allocated) * 100)
                        : 0

                const staffInfo = balance.staff as any
                return {
                    staff: {
                        name: staffInfo.name,
                        staffId: staffInfo.staffId,
                        department: staffInfo.department?.name,
                    },
                    leaveType: balance.leaveType,
                    allocated: balance.allocated,
                    accrued: balance.accrued || 0,
                    used: balance.used,
                    remaining,
                    utilizationRate,
                    category:
                        utilizationRate === 0
                            ? "unused"
                            : utilizationRate < 25
                            ? "low"
                            : utilizationRate < 50
                            ? "moderate"
                            : utilizationRate < 75
                            ? "high"
                            : "very_high",
                }
            })

            // Group by utilization category
            const byCategory: Record<string, any[]> = {
                unused: utilizationData.filter((d) => d.category === "unused"),
                low: utilizationData.filter((d) => d.category === "low"),
                moderate: utilizationData.filter(
                    (d) => d.category === "moderate"
                ),
                high: utilizationData.filter((d) => d.category === "high"),
                very_high: utilizationData.filter(
                    (d) => d.category === "very_high"
                ),
            }

            // Summary statistics
            const summary = {
                year: reportYear,
                totalRecords: utilizationData.length,
                averageUtilization:
                    Math.round(
                        utilizationData.reduce(
                            (sum, d) => sum + d.utilizationRate,
                            0
                        ) / utilizationData.length
                    ) || 0,
                byCategory: Object.keys(byCategory).map((cat) => ({
                    category: cat,
                    count: byCategory[cat].length,
                    percentage: Math.round(
                        (byCategory[cat].length / utilizationData.length) * 100
                    ),
                })),
                filters: {
                    department: department || null,
                    leaveType: leaveType || null,
                },
            }

            return successResponseObject("Utilization report generated", {
                summary,
                details: utilizationData,
                byCategory,
                generatedAt: new Date(),
            })
        } catch (error) {
            console.error("Error generating utilization report:", error)
            return errorResponseObject("Failed to generate utilization report")
        }
    }

    /**
     * Initialize balances for new year
     * POST /api/leave-balances/initialize-new-year
     */
    static async initializeNewYear(req: Request): Promise<ResponseObject> {
        try {
            const { year } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can initialize new year"
                )
            }

            if (!year || year < 2000 || year > 2100) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "year",
                        message: "Valid year between 2000 and 2100 is required",
                    },
                ])
            }

            // Check if year already initialized
            const existingBalances = await LeaveBalance.findOne({ year })
            if (existingBalances) {
                return errorResponseObject(
                    `Year ${year} has already been initialized`
                )
            }

            // Get all active staff with contracts
            const activeContracts = await StaffContract.find({
                status: ContractStatus.ACTIVE,
            })
                .select("staff")
                .distinct("staff")

            const activeStaff = await Staff.find({
                _id: { $in: activeContracts },
                status: AccountStatus.ACTIVE,
            })

            if (activeStaff.length === 0) {
                return successResponseObject("No active staff to initialize", {
                    year,
                    staffInitialized: 0,
                })
            }

            const balancesToCreate = []

            for (const staff of activeStaff) {
                // Get staff's active contract to determine accrual
                const contract = await StaffContract.findOne({
                    staff: staff._id,
                    status: ContractStatus.ACTIVE
                })
                
                // Calculate initial accrual based on contract start date if initializing current year
                let initialAccrual = 0
                if (contract && year === new Date().getFullYear()) {
                    const contractStartDate = new Date(contract.startDate)
                    if (contractStartDate.getFullYear() === year) {
                        // Contract started this year, pro-rate the accrual
                        const startMonth = contractStartDate.getMonth()
                        const currentMonth = new Date().getMonth()
                        const monthsWorked = Math.max(0, currentMonth - startMonth + 1)
                        initialAccrual = Math.min(30, monthsWorked * 2.5)
                    } else if (contractStartDate.getFullYear() < year) {
                        // Contract from previous year, give accrual for months passed
                        initialAccrual = Math.min(30, (new Date().getMonth() + 1) * 2.5)
                    }
                }
                
                // Annual leave - starts at 0 or prorated based on contract
                balancesToCreate.push({
                    staff: staff._id,
                    year,
                    leaveType: LeaveTypes.ANNUAL,
                    allocated: 30,
                    accrued: initialAccrual,
                    used: 0,
                    adjustments: 0,
                    notes: `New year initialization for ${year}`,
                    createdBy: user._id,
                })

                // Sick leave - full allocation
                balancesToCreate.push({
                    staff: staff._id,
                    year,
                    leaveType: LeaveTypes.SICK,
                    allocated: LEAVE_CAPS[LeaveTypes.SICK],
                    used: 0,
                    notes: `New year initialization for ${year}`,
                    createdBy: user._id,
                })

                // Bereavement leave - full allocation
                balancesToCreate.push({
                    staff: staff._id,
                    year,
                    leaveType: LeaveTypes.BEREAVEMENT,
                    allocated: LEAVE_CAPS[LeaveTypes.BEREAVEMENT],
                    used: 0,
                    notes: `New year initialization for ${year}`,
                    createdBy: user._id,
                })

                // Gender-specific leaves
                if (staff.gender === Gender.MALE) {
                    balancesToCreate.push({
                        staff: staff._id,
                        year,
                        leaveType: LeaveTypes.PATERNITY,
                        allocated: LEAVE_CAPS[LeaveTypes.PATERNITY],
                        used: 0,
                        notes: `New year initialization for ${year}`,
                        createdBy: user._id,
                    })
                } else if (staff.gender === Gender.FEMALE) {
                    balancesToCreate.push({
                        staff: staff._id,
                        year,
                        leaveType: LeaveTypes.MATERNITY,
                        allocated: LEAVE_CAPS[LeaveTypes.MATERNITY],
                        used: 0,
                        notes: `New year initialization for ${year}`,
                        createdBy: user._id,
                    })
                }
            }

            // Bulk create
            const createdBalances = await LeaveBalance.insertMany(
                balancesToCreate
            )

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: "BULK",
                performedBy: user._id,
                performedByName: user.name as string,
                performedByEmail: user.email as string,
                description: `Initialized leave balances for ${activeStaff.length} staff for year ${year}`,
                metadata: {
                    year,
                    staffCount: activeStaff.length,
                    balancesCreated: createdBalances.length,
                    leaveTypes: [
                        ...new Set(balancesToCreate.map((b) => b.leaveType)),
                    ],
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("New year initialized successfully", {
                year,
                staffInitialized: activeStaff.length,
                totalBalancesCreated: createdBalances.length,
                message:
                    "All staff have been initialized with fresh leave balances. Annual leave starts at 0 and will accrue monthly.",
            })
        } catch (error) {
            console.error("Error initializing new year:", error)
            return errorResponseObject("Failed to initialize new year")
        }
    }

    /**
     * Process year end
     * POST /api/leave-balances/process-year-end
     */
    static async processYearEnd(req: Request): Promise<ResponseObject> {
        try {
            const { year } = req.body
            const user = (req as AuthenticatedRequest).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can process year end"
                )
            }

            const yearToClose = year || new Date().getFullYear() - 1

            // Get all balances for the year
            const balances = await LeaveBalance.find({ year: yearToClose })

            if (balances.length === 0) {
                return errorResponseObject(
                    `No balances found for year ${yearToClose}`
                )
            }

            // Calculate final statistics
            const statistics = {
                totalStaff: new Set(balances.map((b) => b.staff.toString()))
                    .size,
                totalBalances: balances.length,
                totalDaysUsed: balances.reduce((sum, b) => sum + b.used, 0),
                totalDaysAllocated: balances.reduce(
                    (sum, b) => sum + b.allocated,
                    0
                ),
                totalDaysUnused: 0,
                byLeaveType: {} as Record<string, any>,
            }

            // Calculate by leave type
            for (const leaveType of Object.values(LeaveTypes)) {
                const typeBalances = balances.filter(
                    (b) => b.leaveType === leaveType
                )
                if (typeBalances.length > 0) {
                    const allocated = typeBalances.reduce(
                        (sum, b) => sum + b.allocated,
                        0
                    )
                    const used = typeBalances.reduce(
                        (sum, b) => sum + b.used,
                        0
                    )

                    statistics.byLeaveType[leaveType] = {
                        allocated,
                        used,
                        unused: allocated - used,
                        utilizationRate: Math.round((used / allocated) * 100),
                    }

                    statistics.totalDaysUnused += allocated - used
                }
            }

            // Mark year as closed in audit log
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: "YEAR_END",
                performedBy: user._id,
                performedByName: user.name as string,
                performedByEmail: user.email as string,
                description: `Processed year-end for ${yearToClose}`,
                metadata: {
                    year: yearToClose,
                    statistics,
                    processedAt: new Date(),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Year-end processed successfully", {
                year: yearToClose,
                statistics,
                message:
                    "Year-end processing complete. No balances carried forward. Initialize new year to create fresh balances.",
                processedAt: new Date(),
            })
        } catch (error) {
            console.error("Error processing year end:", error)
            return errorResponseObject("Failed to process year end")
        }
    }

    /**
     * Get balance history
     * GET /api/leave-balances/history/:staffId
     */
    static async getBalanceHistory(
        req: Request,
        staffId: string
    ): Promise<ResponseObject> {
        try {
            const { year, leaveType } = req.query
            const user = (req as AuthenticatedRequest).user

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
                    "Unauthorized to view balance history"
                )
            }

            // Build query
            const query: BalanceQuery = { staff: staffId }

            if (year) {
                query.year = Number(year)
            }

            if (
                leaveType &&
                typeof leaveType === "string" &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                query.leaveType = leaveType
            }

            // Get balances with notes (transaction history)
            const balances = await LeaveBalance.find(query)
                .sort({ year: -1, leaveType: 1 })
                .lean()

            // Parse transaction history from notes
            const history = []

            for (const balance of balances) {
                const transactions = []

                if (balance.notes) {
                    const lines = balance.notes.split("\n")
                    for (const line of lines) {
                        const match = line.match(/^([\d\-T:.Z]+): (.+)$/)
                        if (match) {
                            transactions.push({
                                date: match[1],
                                description: match[2],
                                type: match[2].includes("Debit")
                                    ? "debit"
                                    : match[2].includes("Credit")
                                    ? "credit"
                                    : match[2].includes("Adjustment")
                                    ? "adjustment"
                                    : match[2].includes("Accrued")
                                    ? "accrual"
                                    : match[2].includes("Reset")
                                    ? "reset"
                                    : "other",
                            })
                        }
                    }
                }

                history.push({
                    year: balance.year,
                    leaveType: balance.leaveType,
                    summary: {
                        allocated: balance.allocated,
                        accrued: balance.accrued || 0,
                        used: balance.used,
                        adjustments: balance.adjustments || 0,
                        remaining:
                            balance.leaveType === LeaveTypes.ANNUAL
                                ? Math.max(
                                      0,
                                      (balance.accrued || 0) +
                                          (balance.adjustments || 0) -
                                          balance.used
                                  )
                                : Math.max(0, balance.allocated - balance.used),
                    },
                    transactions: transactions.reverse(), // Show newest first
                    createdAt: balance.createdAt,
                    updatedAt: balance.updatedAt,
                })
            }

            // Get staff info
            const staff = await Staff.findById(staffId).select("name staffId")

            return successResponseObject(
                "Balance history retrieved successfully",
                {
                    staff: {
                        id: staffId,
                        name: staff?.name,
                        staffId: staff?.staffId,
                    },
                    totalRecords: history.length,
                    history,
                }
            )
        } catch (error) {
            console.error("Error fetching balance history:", error)
            return errorResponseObject("Failed to retrieve balance history")
        }
    }

    /**
     * Export balances to CSV
     * GET /api/leave-balances/export
     */
    static async exportBalances(req: Request): Promise<ResponseObject> {
        try {
            const { year, department, format = "csv" } = req.query
            const user = (req as AuthenticatedRequest).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can export balances"
                )
            }

            const exportYear = year ? Number(year) : new Date().getFullYear()

            // Build staff filter
            let staffIds: string[] = []
            if (department && typeof department === "string") {
                const deptStaff = await Staff.find({ department }).select("_id")
                staffIds = deptStaff.map((s) => s._id.toString())
            }

            // Build query
            const query: BalanceQuery = { year: exportYear }
            if (staffIds.length > 0) {
                query.staff = { $in: staffIds }
            }

            // Get balances with staff details
            const balances = await LeaveBalance.find(query)
                .populate("staff", "name staffId email department")
                .populate({
                    path: "staff",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .sort({ staff: 1, leaveType: 1 })
                .lean()

            if (balances.length === 0) {
                return errorResponseObject("No balances found to export")
            }

            // Prepare data for export
            const exportData = balances.map((balance) => {
                const remaining =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? Math.max(
                              0,
                              (balance.accrued || 0) +
                                  (balance.adjustments || 0) -
                                  balance.used
                          )
                        : Math.max(0, balance.allocated - balance.used)

                const staffData = balance.staff as any

                return {
                    "Staff ID": staffData.staffId,
                    "Staff Name": staffData.name,
                    Email: staffData.email || "N/A",
                    Department: staffData.department?.name || "N/A",
                    Year: balance.year,
                    "Leave Type": balance.leaveType,
                    Allocated: balance.allocated,
                    Accrued: balance.accrued || 0,
                    Used: balance.used,
                    Adjustments: balance.adjustments || 0,
                    Remaining: remaining,
                    "Last Updated": balance.updatedAt,
                }
            })

            if (format === "csv") {
                const fields = Object.keys(exportData[0])
                const csvHeader = fields.join(",")
                const csvRows = exportData.map((row) =>
                    fields
                        .map((field) => `"${(row as any)[field] || ""}"`)
                        .join(",")
                )
                const csv = [csvHeader, ...csvRows].join("\n")

                return successResponseObject("Balances exported successfully", {
                    format: "csv",
                    filename: `leave_balances_${exportYear}_${Date.now()}.csv`,
                    data: csv,
                    recordCount: exportData.length,
                })
            } else {
                return successResponseObject("Balances exported successfully", {
                    format: "json",
                    filename: `leave_balances_${exportYear}_${Date.now()}.json`,
                    data: exportData,
                    recordCount: exportData.length,
                })
            }
        } catch (error) {
            console.error("Error exporting balances:", error)
            return errorResponseObject("Failed to export leave balances")
        }
    }
}

export default LeaveBalanceController
