import { Request } from "express"
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
import { getContractPeriod, formatPeriod, getTotalMonthsInPeriod } from "../utils/contract-period"

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
    periodStart?: Date | { $lte: Date }
    periodEnd?: Date | { $gte: Date }
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
    periodStart?: Date
    periodEnd?: Date
    periodLabel?: string
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
        monthlyRate: number
        isBehind: boolean
        nextAccrualAmount: number
    }
}

export class LeaveBalanceController {
    /**
     * Helper: Get a staff member's current contract period
     */
    private static async getStaffCurrentPeriod(
        staffId: string,
        asOfDate?: Date
    ): Promise<{ periodStart: Date; periodEnd: Date; contract: any } | null> {
        const contract = await StaffContract.findOne({
            staff: staffId,
            status: ContractStatus.ACTIVE,
        })

        if (!contract) return null

        const period = getContractPeriod(
            { startDate: contract.startDate, endDate: contract.endDate },
            asOfDate || new Date()
        )

        if (!period) return null

        return { ...period, contract }
    }

    /**
     * Helper: Find the current balance for a staff member by period
     */
    private static async findCurrentBalance(
        staffId: string,
        leaveType: string,
        asOfDate?: Date
    ) {
        const now = asOfDate || new Date()
        return LeaveBalance.findOne({
            staff: staffId,
            leaveType,
            periodStart: { $lte: now },
            periodEnd: { $gte: now },
        })
    }

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
                staffId === user?._id?.toString()

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

            // Build query - use period-based lookup
            const now = new Date()
            let query: any = { staff: staffId }

            if (year) {
                // If year specified, find balances where periodStart falls in that year
                const queryYear = Number(year)
                if (queryYear < 2000 || queryYear > 2100) {
                    return validationErrorResponseObject("Validation failed", [
                        {
                            field: "year",
                            message: "Year must be between 2000 and 2100",
                        },
                    ])
                }
                query.year = queryYear
            } else {
                // Default: find balance for current period
                const period = await this.getStaffCurrentPeriod(staffId)
                if (period) {
                    const normalizedStart = new Date(period.periodStart)
                    normalizedStart.setHours(0, 0, 0, 0)
                    query.periodStart = normalizedStart
                } else {
                    // Fallback: find any active period
                    query.periodStart = { $lte: now }
                    query.periodEnd = { $gte: now }
                }
            }

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

            // Ensure accruals are up to date before fetching
            const balancesToUpdate = await LeaveBalance.find(query)
            for (const bal of balancesToUpdate) {
                await bal.updateAccrual()
            }

            // Get balances
            const balances = await LeaveBalance.find(query)
                .sort({ leaveType: 1 })
                .lean()

            // Enhance with virtual fields and additional info
            const enhancedBalances = balances.map((balance) => {
                // Annual leave: remaining = accrued + adjustments - used (can be negative if borrowed)
                // Other types: remaining = allocated + adjustments - used (full allocation available)
                const base = balance.leaveType === LeaveTypes.ANNUAL
                    ? (balance.accrued || 0)
                    : balance.allocated
                const remaining = base + (balance.adjustments || 0) - balance.used

                // Can request up to allocated + adjustments - used (full allocation
                // plus any carried-over/adjusted days, not just accrued). Legacy
                // records can hold accrued above the cap; granted days stay requestable.
                const availableForRequest = Math.max(0, Math.max(balance.allocated, balance.accrued || 0) + (balance.adjustments || 0) - balance.used)

                // Monthly rate for display
                const totalPeriodMonths = balance.periodStart && balance.periodEnd
                    ? getTotalMonthsInPeriod(balance.periodStart, balance.periodEnd)
                    : 12
                const monthlyRate = totalPeriodMonths > 0
                    ? +(balance.allocated / totalPeriodMonths).toFixed(2)
                    : 0

                return {
                    ...balance,
                    remaining,
                    availableForRequest,
                    monthlyRate,
                    periodLabel: balance.periodStart && balance.periodEnd
                        ? formatPeriod(balance.periodStart, balance.periodEnd)
                        : `Year ${balance.year}`,
                    utilizationRate:
                        balance.allocated > 0
                            ? Math.round(
                                  (balance.used / balance.allocated) * 100
                              )
                            : 0,
                    isLowBalance: remaining <= 2,
                    isNegative: remaining < 0,
                    canRequest: availableForRequest > 0,
                }
            })

            // Get period label for summary
            const periodLabel = enhancedBalances.length > 0 && enhancedBalances[0].periodLabel
                ? enhancedBalances[0].periodLabel
                : `Year ${year || now.getFullYear()}`

            // Summary statistics
            const summary = {
                staffName: staff.name,
                staffId: staff.staffId,
                year: enhancedBalances[0]?.year || (year ? Number(year) : now.getFullYear()),
                periodLabel,
                periodStart: enhancedBalances[0]?.periodStart,
                periodEnd: enhancedBalances[0]?.periodEnd,
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
                staffId === user?._id?.toString()

            if (!canView) {
                return errorResponseObject("Unauthorized to view this balance")
            }

            // Get balance - period-based
            let balance
            if (year) {
                const queryYear = Number(year)
                balance = await LeaveBalance.findOne({
                    staff: staffId,
                    year: queryYear,
                    leaveType,
                }).populate("staff", "name staffId email")
            } else {
                balance = await this.findCurrentBalance(staffId, leaveType)
                if (balance) {
                    await balance.populate("staff", "name staffId email")
                }
            }

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
                periodStart: balance.periodStart,
                periodEnd: balance.periodEnd,
                periodLabel: balance.periodLabel,
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

            // Add accrual info for all leave types
            if (balance.periodStart) {
                const periodMonths = getTotalMonthsInPeriod(balance.periodStart, balance.periodEnd)
                const monthlyRate = periodMonths > 0 ? balance.allocated / periodMonths : 0
                const now = new Date()
                const periodStart = new Date(balance.periodStart)
                const monthsElapsed = Math.max(1,
                    (now.getFullYear() - periodStart.getFullYear()) * 12 +
                    (now.getMonth() - periodStart.getMonth()) + 1
                )
                const expectedAccrual = Math.min(balance.allocated, monthsElapsed * monthlyRate)
                enhancedBalance.accrualInfo = {
                    currentAccrued: balance.accrued || 0,
                    expectedAccrual,
                    monthlyRate: +monthlyRate.toFixed(2),
                    isBehind: (balance.accrued || 0) < expectedAccrual,
                    nextAccrualAmount: Math.min(
                        monthlyRate,
                        balance.allocated - (balance.accrued || 0)
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

            // Get all staff in department
            const staffInDept = await Staff.find({
                department: departmentId,
                status: AccountStatus.ACTIVE,
            }).select("_id name staffId")

            if (staffInDept.length === 0) {
                return successResponseObject("No staff in department", {
                    department: department.name,
                    staffCount: 0,
                    balances: [],
                })
            }

            const staffIds = staffInDept.map((s) => s._id)

            // Get balances - period-based (each staff may have different periods)
            const now = new Date()
            let balances
            if (year) {
                const queryYear = Number(year)
                balances = await LeaveBalance.find({
                    staff: { $in: staffIds },
                    year: queryYear,
                }).lean()
            } else {
                // Find current period balances for all staff
                balances = await LeaveBalance.find({
                    staff: { $in: staffIds },
                    periodStart: { $lte: now },
                    periodEnd: { $gte: now },
                }).lean()
            }

            // Group by leave type
            const byLeaveType: Record<string, LeaveTypeSummary> = {}
            const byStaff: Record<
                string,
                {
                    staffId?: string
                    name?: string
                    staffCode?: string
                    periodLabel?: string
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
                    (balance.accrued || 0) +
                    (balance.adjustments || 0) -
                    balance.used

                const available = Math.max(0, Math.max(balance.allocated, balance.accrued || 0) + (balance.adjustments || 0) - balance.used)

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
                        periodLabel: balance.periodStart && balance.periodEnd
                            ? formatPeriod(balance.periodStart, balance.periodEnd)
                            : undefined,
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
            const { staffId } = req.body
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

            // Get the current period from contract dates
            const period = getContractPeriod(
                { startDate: activeContract.startDate, endDate: activeContract.endDate },
                new Date()
            )

            if (!period) {
                return errorResponseObject(
                    "Cannot determine leave period from contract dates"
                )
            }

            // Check if balances already exist for this period
            const normalizedStart = new Date(period.periodStart)
            normalizedStart.setHours(0, 0, 0, 0)

            const existingBalances = await LeaveBalance.find({
                staff: staffId,
                periodStart: normalizedStart,
            })

            if (existingBalances.length > 0) {
                return errorResponseObject(
                    `Leave balances already exist for period ${formatPeriod(period.periodStart, period.periodEnd)}`
                )
            }

            // Calculate pro-rated allocation
            const totalPeriodMonths = getTotalMonthsInPeriod(period.periodStart, period.periodEnd)
            const proRateFactor = totalPeriodMonths / 12
            const periodLabel = formatPeriod(period.periodStart, period.periodEnd)

            // Initialize balances
            const balancesToCreate = []

            // Annual leave - starts at 0, will accrue
            balancesToCreate.push({
                staff: staffId,
                periodStart: normalizedStart,
                periodEnd: period.periodEnd,
                leaveType: LeaveTypes.ANNUAL,
                allocated: totalPeriodMonths * 2.5,
                accrued: 0,
                used: 0,
                adjustments: 0,
                notes: `Initialized for period ${periodLabel}`,
                createdBy: user._id,
            })

            // Sick leave
            balancesToCreate.push({
                staff: staffId,
                periodStart: normalizedStart,
                periodEnd: period.periodEnd,
                leaveType: LeaveTypes.SICK,
                allocated: Math.round(LEAVE_CAPS[LeaveTypes.SICK] * proRateFactor),
                used: 0,
                notes: `Initialized for period ${periodLabel}`,
                createdBy: user._id,
            })

            // Bereavement leave
            balancesToCreate.push({
                staff: staffId,
                periodStart: normalizedStart,
                periodEnd: period.periodEnd,
                leaveType: LeaveTypes.BEREAVEMENT,
                allocated: Math.round(LEAVE_CAPS[LeaveTypes.BEREAVEMENT] * proRateFactor),
                used: 0,
                notes: `Initialized for period ${periodLabel}`,
                createdBy: user._id,
            })

            // Gender-specific leaves
            if (staff.gender === Gender.MALE) {
                balancesToCreate.push({
                    staff: staffId,
                    periodStart: normalizedStart,
                    periodEnd: period.periodEnd,
                    leaveType: LeaveTypes.PATERNITY,
                    allocated: Math.round(LEAVE_CAPS[LeaveTypes.PATERNITY] * proRateFactor),
                    used: 0,
                    notes: `Initialized for period ${periodLabel}`,
                    createdBy: user._id,
                })
            } else if (staff.gender === Gender.FEMALE) {
                balancesToCreate.push({
                    staff: staffId,
                    periodStart: normalizedStart,
                    periodEnd: period.periodEnd,
                    leaveType: LeaveTypes.MATERNITY,
                    allocated: Math.round(LEAVE_CAPS[LeaveTypes.MATERNITY] * proRateFactor),
                    used: 0,
                    notes: `Initialized for period ${periodLabel}`,
                    createdBy: user._id,
                })
            }

            // Create all balances
            const createdBalances = await LeaveBalance.insertMany(
                balancesToCreate
            )

            // Update annual leave accrual
            const annualBalance = await LeaveBalance.findOne({
                staff: staffId,
                periodStart: normalizedStart,
                leaveType: LeaveTypes.ANNUAL,
            })
            if (annualBalance) {
                await annualBalance.updateAccrual()
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: staffId,
                performedBy: user._id,
                performedByName: (user?.name as string) || "System",
                performedByEmail: (user?.email as string) || "system@leave.com",
                description: `Initialized leave balances for ${staff.name} for period ${periodLabel}`,
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    periodStart: period.periodStart,
                    periodEnd: period.periodEnd,
                    periodLabel,
                    balanceTypes: balancesToCreate.map((b) => b.leaveType),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Leave balances initialized successfully",
                {
                    staffName: staff.name,
                    periodLabel,
                    periodStart: period.periodStart,
                    periodEnd: period.periodEnd,
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

            // Get current period annual leave balance
            const balance = await this.findCurrentBalance(staffId, LeaveTypes.ANNUAL)

            if (!balance) {
                return errorResponseObject(
                    "Annual leave balance not found for current period"
                )
            }

            // Apply adjustment
            const oldAdjustment = balance.adjustments || 0
            const newAdjustment = oldAdjustment + adjustment

            // Ensure total doesn't go negative
            const baseAmount = balance.leaveType === LeaveTypes.ANNUAL
                ? (balance.accrued || 0)
                : balance.allocated
            const totalAvailable = baseAmount + newAdjustment - balance.used
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
                    periodLabel: balance.periodLabel,
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
                    periodLabel: balance.periodLabel,
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
            const { staffId, leaveType, reason } = req.body
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

            // Find current period balance
            const balance = await this.findCurrentBalance(staffId, leaveType)

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

            // Reset using period method
            await balance.resetForNewPeriod()

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
                    reason,
                    periodLabel: balance.periodLabel,
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
                    periodLabel: balance.periodLabel,
                },
                resetAt: new Date().toISOString(),
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

            const effectiveDate = asOfDate ? new Date(asOfDate) : new Date()

            // Get current period annual leave balance
            const balance = await this.findCurrentBalance(staffId, LeaveTypes.ANNUAL, effectiveDate)

            if (!balance) {
                return errorResponseObject(
                    "Annual leave balance not found for current period"
                )
            }

            // Get staff's active contract to check
            const contract = await StaffContract.findOne({
                staff: staffId,
                status: ContractStatus.ACTIVE
            })

            if (!contract) {
                return errorResponseObject(
                    "No active contract found for staff member"
                )
            }

            const oldAccrued = balance.accrued || 0

            // Update accrual using period-based method
            await balance.updateAccrual(effectiveDate)
            const newAccrued = balance.accrued || 0

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
                        asOfDate: effectiveDate,
                        periodLabel: balance.periodLabel,
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
                    periodLabel: balance.periodLabel,
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

            const now = new Date()

            // Find all annual leave balances where current date falls within the period
            const balances = await LeaveBalance.find({
                leaveType: LeaveTypes.ANNUAL,
                periodStart: { $lte: now },
                periodEnd: { $gte: now },
            })

            if (balances.length === 0) {
                return successResponseObject("No active period balances found", {
                    processed: 0,
                })
            }

            let updatedCount = 0
            const updateResults = []

            for (const balance of balances) {
                const oldAccrued = balance.accrued || 0
                await balance.updateAccrual(now)
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
                        processedCount: updatedCount,
                        totalEligible: balances.length,
                        processedAt: now,
                    },
                    ipAddress: req.ip || req.socket.remoteAddress || "SYSTEM",
                    userAgent: req.headers["user-agent"] || "System Process",
                })
            }

            return successResponseObject(
                "Monthly accruals processed successfully",
                {
                    summary: {
                        totalEligibleStaff: balances.length,
                        totalUpdated: updatedCount,
                        processedAt: now,
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

            // Get current period balance
            const balance = await this.findCurrentBalance(staffId, leaveType)

            if (!balance) {
                return errorResponseObject(
                    `${leaveType} balance not found for current period`
                )
            }

            // Check if sufficient balance
            if (!balance.canRequest(days)) {
                return errorResponseObject(
                    `Insufficient ${leaveType} balance. Available: ${balance.availableForRequest} days, Requested: ${days} days`
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
                    periodLabel: balance.periodLabel,
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
                    periodLabel: balance.periodLabel,
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

            // Get current period balance
            const balance = await this.findCurrentBalance(staffId, leaveType)

            if (!balance) {
                return errorResponseObject(
                    `${leaveType} balance not found for current period`
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
                    periodLabel: balance.periodLabel,
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
                    periodLabel: balance.periodLabel,
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
                staffId === user?._id?.toString()

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

            // Get current period balance
            const balance = await this.findCurrentBalance(
                staffId as string,
                leaveType as string
            )

            if (!balance) {
                return successResponseObject("Balance check completed", {
                    available: false,
                    reason: `No ${leaveType} balance found for current period`,
                    balance: null,
                })
            }

            const canRequest = balance.canRequest(requestedDays)
            const availableDays = balance.availableForRequest

            let reason = ""
            if (!canRequest) {
                reason = `Insufficient balance. Available: ${availableDays} days`
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
                    periodLabel: balance.periodLabel,
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

            // Get current period balance
            const balance = await this.findCurrentBalance(staffId, leaveType)

            if (!balance) {
                return successResponseObject("Validation completed", {
                    valid: false,
                    reason: `No ${leaveType} balance found for current period`,
                    staffName: staff.name,
                })
            }

            const canRequest = balance.canRequest(days)
            const availableDays = balance.availableForRequest

            const validationResult = {
                valid: canRequest,
                staffName: staff.name,
                leaveType,
                requestedDays: days,
                availableDays,
                currentUsed: balance.used,
                allocated: balance.allocated,
                periodLabel: balance.periodLabel,
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
                    totalStaff: 0,
                    summary: [],
                })
            }

            const staffIds = activeStaff.map((s) => s._id)
            const now = new Date()

            // Get balances - either by year or current period
            let balances
            if (year) {
                const reportYear = Number(year)
                balances = await LeaveBalance.find({
                    staff: { $in: staffIds },
                    year: reportYear,
                }).lean()
            } else {
                balances = await LeaveBalance.find({
                    staff: { $in: staffIds },
                    periodStart: { $lte: now },
                    periodEnd: { $gte: now },
                }).lean()
            }

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
                    (balance.accrued || 0) +
                    (balance.adjustments || 0) -
                    balance.used

                const available = Math.max(0, Math.max(balance.allocated, balance.accrued || 0) + (balance.adjustments || 0) - balance.used)

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
            const now = new Date()

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

            // Get all current period balances
            const balances = await LeaveBalance.find({
                staff: { $in: staffIds },
                periodStart: { $lte: now },
                periodEnd: { $gte: now },
            }).lean()

            const lowBalanceAlerts = []

            for (const balance of balances) {
                const remaining =
                    (balance.accrued || 0) +
                    (balance.adjustments || 0) -
                    balance.used

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
     * Get year-end report (supports both year and period queries)
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

            // Get all balances for the year (via denormalized year field)
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

            // Unused leave
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

            const now = new Date()

            // Build query
            let query: any = {}
            if (year) {
                query.year = Number(year)
            } else {
                query.periodStart = { $lte: now }
                query.periodEnd = { $gte: now }
            }

            if (
                leaveType &&
                typeof leaveType === "string" &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                query.leaveType = leaveType
            }

            // Get staff filter if department specified
            if (department && typeof department === "string") {
                const deptStaff = await Staff.find({ department }).select("_id")
                const staffIds = deptStaff.map((s) => s._id.toString())

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
                    (balance.accrued || 0) +
                    (balance.adjustments || 0) -
                    balance.used

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
                    periodLabel: balance.periodStart && balance.periodEnd
                        ? formatPeriod(balance.periodStart, balance.periodEnd)
                        : undefined,
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
     * Initialize balances for new period (replaces initializeNewYear)
     * POST /api/leave-balances/initialize-new-year
     */
    static async initializeNewYear(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as AuthenticatedRequest).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can initialize new periods"
                )
            }

            // Use the model's createNewPeriodBalances which checks all active contracts
            const count = await LeaveBalance.createNewPeriodBalances()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: "BULK",
                performedBy: user._id,
                performedByName: user.name as string,
                performedByEmail: user.email as string,
                description: `Created new period balances for ${count} staff members`,
                metadata: {
                    staffCount: count,
                    processedAt: new Date(),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("New period balances created successfully", {
                staffInitialized: count,
                message:
                    "Staff with new contract anniversary periods have been initialized with fresh leave balances.",
            })
        } catch (error) {
            console.error("Error initializing new periods:", error)
            return errorResponseObject("Failed to initialize new periods")
        }
    }

    /**
     * Process year end (kept for backward compatibility, works with period data)
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

            // Get all balances for the year (using denormalized year field)
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
                staffId === user?._id?.toString()

            if (!canView) {
                return errorResponseObject(
                    "Unauthorized to view balance history"
                )
            }

            // Build query
            const query: any = { staff: staffId }

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
                .sort({ periodStart: -1, leaveType: 1 })
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
                    periodStart: balance.periodStart,
                    periodEnd: balance.periodEnd,
                    periodLabel: balance.periodStart && balance.periodEnd
                        ? formatPeriod(balance.periodStart, balance.periodEnd)
                        : `Year ${balance.year}`,
                    leaveType: balance.leaveType,
                    summary: {
                        allocated: balance.allocated,
                        accrued: balance.accrued || 0,
                        used: balance.used,
                        adjustments: balance.adjustments || 0,
                        remaining:
                            (balance.accrued || 0) +
                            (balance.adjustments || 0) -
                            balance.used,
                    },
                    transactions: transactions.reverse(),
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

            const now = new Date()

            // Build staff filter
            let staffIds: string[] = []
            if (department && typeof department === "string") {
                const deptStaff = await Staff.find({ department }).select("_id")
                staffIds = deptStaff.map((s) => s._id.toString())
            }

            // Build query
            let query: any = {}
            if (year) {
                query.year = Number(year)
            } else {
                query.periodStart = { $lte: now }
                query.periodEnd = { $gte: now }
            }
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
                    (balance.accrued || 0) +
                    (balance.adjustments || 0) -
                    balance.used

                const staffData = balance.staff as any

                return {
                    "Staff ID": staffData.staffId,
                    "Staff Name": staffData.name,
                    Email: staffData.email || "N/A",
                    Department: staffData.department?.name || "N/A",
                    Year: balance.year,
                    "Period": balance.periodStart && balance.periodEnd
                        ? formatPeriod(balance.periodStart, balance.periodEnd)
                        : `Year ${balance.year}`,
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
                    filename: `leave_balances_${Date.now()}.csv`,
                    data: csv,
                    recordCount: exportData.length,
                })
            } else {
                return successResponseObject("Balances exported successfully", {
                    format: "json",
                    filename: `leave_balances_${Date.now()}.json`,
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
