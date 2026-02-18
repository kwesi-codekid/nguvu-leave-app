import { Request } from "express"
import mongoose from "mongoose"
import LeaveRequest from "../models/leave-request.model"
import LeaveBalance from "../models/leave-balance.model"
import Staff from "../models/staff.model"
import Department from "../models/department.model"
import StaffContract from "../models/staff-contract.model"
import JobPosition from "../models/job-position.model"
import CallIn from "../models/call-in.model"
import Holiday from "../models/holiday.model"
import AuditLogController from "./audit-log.controller"
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
} from "../utils/types"

export class DashboardController {
    /**
     * HR Dashboard
     * GET /api/dashboard/hr
     */
    static async getHRDashboard(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check HR/Admin permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject("Unauthorized to view HR dashboard")
            }

            const today = new Date()
            const currentYear = today.getFullYear()
            const currentMonth = today.getMonth()
            const thirtyDaysAgo = new Date(
                today.getTime() - 30 * 24 * 60 * 60 * 1000
            )

            // Get KPIs
            const [
                totalStaff,
                activeStaff,
                onLeaveToday,
                pendingEndorsements,
                pendingApprovals,
                requestsYTD,
                requestsLastMonth,
                callInsLastMonth,
            ] = await Promise.all([
                Staff.countDocuments({}),
                Staff.countDocuments({ status: "active" }),
                this.getStaffOnLeave(today),
                LeaveRequest.countDocuments({ status: LeaveStatus.PENDING }),
                LeaveRequest.countDocuments({ status: LeaveStatus.ENDORSED }),
                LeaveRequest.countDocuments({
                    createdAt: { $gte: new Date(currentYear, 0, 1) },
                    status: LeaveStatus.APPROVED,
                }),
                LeaveRequest.find({
                    createdAt: { $gte: thirtyDaysAgo },
                }).lean(),
                CallIn.find({
                    requestedAt: { $gte: thirtyDaysAgo },
                }).lean(),
            ])

            // Calculate average approval time
            const avgApprovalTime = await this.calculateAverageApprovalTime(
                thirtyDaysAgo
            )

            // Leave mix by type
            const leaveMix = await LeaveRequest.aggregate([
                {
                    $match: {
                        createdAt: { $gte: new Date(currentYear, 0, 1) },
                        status: LeaveStatus.APPROVED,
                    },
                },
                {
                    $group: {
                        _id: "$leaveType",
                        count: { $sum: 1 },
                        totalDays: { $sum: "$workingDays" },
                    },
                },
            ])

            // Monthly trend (YTD)
            const monthlyTrend = []
            for (let month = 0; month <= currentMonth; month++) {
                const monthStart = new Date(currentYear, month, 1)
                const monthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59)

                const [requests, approvals] = await Promise.all([
                    LeaveRequest.countDocuments({
                        createdAt: { $gte: monthStart, $lte: monthEnd },
                    }),
                    LeaveRequest.countDocuments({
                        createdAt: { $gte: monthStart, $lte: monthEnd },
                        status: LeaveStatus.APPROVED,
                    }),
                ])

                monthlyTrend.push({
                    month: monthStart.toLocaleString("default", {
                        month: "short",
                    }),
                    requests,
                    approvals,
                })
            }

            // Low balance alerts (annual leave < 3 days) - period-based
            const lowBalanceAlerts = await LeaveBalance.find({
                leaveType: LeaveTypes.ANNUAL,
                periodStart: { $lte: today },
                periodEnd: { $gte: today },
                remaining: { $lte: 3 },
            })
                .populate("staff", "name staffId department")
                .limit(10)
                .lean()

            // Upcoming peaks (next 30 days)
            const next30Days = new Date(
                today.getTime() + 30 * 24 * 60 * 60 * 1000
            )
            const upcomingLeaves = await LeaveRequest.find({
                status: LeaveStatus.APPROVED,
                startDate: { $gte: today, $lte: next30Days },
            }).lean()

            const dailyPeaks: any = {}
            for (const leave of upcomingLeaves) {
                const current = new Date(leave.startDate)
                while (current <= leave.endDate && current <= next30Days) {
                    const dateKey = current.toISOString().split("T")[0]
                    dailyPeaks[dateKey] = (dailyPeaks[dateKey] || 0) + 1
                    current.setDate(current.getDate() + 1)
                }
            }

            // Find peak days
            const peakDays = Object.entries(dailyPeaks)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 5)
                .map(([date, count]) => ({ date, staffOut: count }))

            // Call-ins summary
            const callInsSummary = {
                count: callInsLastMonth.length,
                daysRecovered: callInsLastMonth.reduce(
                    (sum, c) => sum + c.workingDaysRecovered,
                    0
                ),
            }

            // System health indicators
            const systemHealth = {
                pendingActions: pendingEndorsements + pendingApprovals,
                processingBacklog:
                    pendingEndorsements > 10 || pendingApprovals > 10,
                lowBalanceStaff: lowBalanceAlerts.length,
                upcomingHolidays: await Holiday.countDocuments({
                    date: { $gte: today, $lte: next30Days },
                }),
            }

            const dashboard = {
                kpis: {
                    totalStaff,
                    activeStaff,
                    onLeaveToday: onLeaveToday.length,
                    pendingEndorsements,
                    pendingApprovals,
                    avgApprovalTime: `${avgApprovalTime} hours`,
                    requestsYTD,
                    approvalRate:
                        requestsLastMonth.length > 0
                            ? Math.round(
                                  (requestsLastMonth.filter(
                                      (r) => r.status === LeaveStatus.APPROVED
                                  ).length /
                                      requestsLastMonth.length) *
                                      100
                              )
                            : 0,
                },
                leaveMix: leaveMix.map((l) => ({
                    type: l._id,
                    count: l.count,
                    totalDays: l.totalDays,
                    percentage:
                        requestsYTD > 0
                            ? Math.round((l.count / requestsYTD) * 100)
                            : 0,
                })),
                monthlyTrend,
                lowBalanceAlerts: lowBalanceAlerts.map((l) => ({
                    staff: (l.staff as any).name,
                    staffId: (l.staff as any).staffId,
                    department: (l.staff as any).department,
                    remaining: l.remaining,
                })),
                upcomingPeaks: {
                    next30Days: peakDays,
                    highestDay: peakDays[0] || null,
                },
                callIns: callInsSummary,
                systemHealth,
                quickStats: {
                    utilizationRate: await this.calculateUtilizationRate(
                        currentYear
                    ),
                    averageLeavePerStaff:
                        activeStaff > 0
                            ? Math.round((requestsYTD / activeStaff) * 10) / 10
                            : 0,
                    delegatedRequests: await LeaveRequest.countDocuments({
                        delegatedBy: { $exists: true },
                        createdAt: { $gte: new Date(currentYear, 0, 1) },
                    }),
                },
            }

            return successResponseObject(
                "HR dashboard retrieved successfully",
                dashboard
            )
        } catch (error) {
            console.error("Error fetching HR dashboard:", error)
            return errorResponseObject("Failed to retrieve HR dashboard")
        }
    }

    /**
     * Manager Dashboard
     * GET /api/dashboard/manager
     */
    static async getManagerDashboard(req: Request): Promise<ResponseObject> {
        try {
            const { departmentId } = req.query
            const user = (req as any).user

            // Check Manager permissions
            if (
                !user?.permissions?.includes("MANAGER") &&
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to view manager dashboard"
                )
            }

            // Get manager's department if not specified
            let deptId = departmentId
            if (!deptId) {
                // Check if user is department head
                const headedDept = await Department.findOne({ head: user._id })
                if (headedDept) {
                    deptId = headedDept._id
                }

                // Try active contract's position department
                if (!deptId) {
                    const activeContract = await StaffContract.findOne({
                        staff: user._id,
                        status: ContractStatus.ACTIVE,
                    })

                    if (activeContract) {
                        const position = await JobPosition.findById(
                            activeContract.position
                        )
                        if (position) {
                            deptId = position.department
                        }
                    }
                }

                // Fallback to staff's own department
                if (!deptId && user.department) {
                    deptId = user.department
                }
            }

            if (!deptId) {
                return errorResponseObject("No department found for manager")
            }

            // Verify manager has access to this department
            if (departmentId) {
                const dept = await Department.findById(departmentId)
                if (
                    !dept ||
                    (dept.head?.toString() !== user._id &&
                        !user?.permissions?.includes("HR") &&
                        !user?.permissions?.includes("ADMIN"))
                ) {
                    return errorResponseObject(
                        "Unauthorized to view this department's dashboard"
                    )
                }
            }

            const today = new Date()
            const fourteenDaysFromNow = new Date(
                today.getTime() + 14 * 24 * 60 * 60 * 1000
            )
            const thirtyDaysAgo = new Date(
                today.getTime() - 30 * 24 * 60 * 60 * 1000
            )

            // Get department info
            const department = await Department.findById(deptId).lean()

            // Get team size
            const teamSize = await Staff.countDocuments({
                department: deptId,
                status: "active",
            })

            // Get staff on leave today in department
            const onLeaveToday = await this.getStaffOnLeave(
                today,
                deptId as string
            )

            // Get pending endorsements for this manager's position
            const managerPosition = await StaffContract.findOne({
                staff: user._id,
                status: ContractStatus.ACTIVE,
            }).select("position")

            let pendingEndorsements = 0
            let pendingApprovals = 0

            if (managerPosition) {
                pendingEndorsements = await LeaveRequest.countDocuments({
                    status: LeaveStatus.PENDING,
                    "endorsement.byPosition": managerPosition.position,
                })

                pendingApprovals = await LeaveRequest.countDocuments({
                    status: LeaveStatus.ENDORSED,
                    "approval.byPosition": managerPosition.position,
                })
            }

            // Coverage next 14 days
            const coverageData = await this.getDepartmentCoverage(
                deptId as string,
                today,
                fourteenDaysFromNow
            )

            // Team utilization
            const teamUtilization = await this.getTeamUtilization(
                deptId as string,
                today.getFullYear()
            )

            // Alerts for the department
            const alerts = []

            // Check for conflicting leaves (same dates)
            const approvedLeaves = await LeaveRequest.find({
                department: deptId,
                status: LeaveStatus.APPROVED,
                startDate: { $gte: today },
            })
                .populate("staff", "name")
                .lean()

            const dateConflicts: any = {}
            for (const leave of approvedLeaves) {
                const key = `${leave.startDate.toISOString().split("T")[0]}_${
                    leave.endDate.toISOString().split("T")[0]
                }`
                if (!dateConflicts[key]) {
                    dateConflicts[key] = []
                }
                dateConflicts[key].push((leave.staff as any).name)
            }

            for (const [dates, staffNames] of Object.entries(dateConflicts)) {
                if ((staffNames as any).length > 1) {
                    const [start, end] = dates.split("_")
                    alerts.push({
                        type: "CONFLICTING_LEAVES",
                        message: `${
                            (staffNames as any).length
                        } staff on leave simultaneously`,
                        details: {
                            staff: staffNames,
                            period: { start, end },
                        },
                    })
                }
            }

            // Low balance alerts for team (period-based)
            const lowBalances = await LeaveBalance.find({
                leaveType: LeaveTypes.ANNUAL,
                periodStart: { $lte: today },
                periodEnd: { $gte: today },
                remaining: { $lte: 3 },
            })
                .populate({
                    path: "staff",
                    match: { department: deptId },
                    select: "name staffId",
                })
                .lean()

            const teamLowBalances = lowBalances.filter((b) => b.staff)
            if (teamLowBalances.length > 0) {
                alerts.push({
                    type: "LOW_BALANCES",
                    message: `${teamLowBalances.length} team members have low annual leave balance`,
                    details: teamLowBalances.map((b) => ({
                        staff: (b.staff as any).name,
                        remaining: b.remaining,
                    })),
                })
            }

            // Recent call-ins for the department
            const recentCallIns = await CallIn.find({
                department: deptId,
                requestedAt: { $gte: thirtyDaysAgo },
            })
                .populate("staff", "name")
                .populate("leaveRequest", "leaveType")
                .sort({ requestedAt: -1 })
                .limit(5)
                .lean()

            // Average approval time for department
            const avgApprovalTime = await this.calculateAverageApprovalTime(
                thirtyDaysAgo,
                deptId as string
            )

            // Department statistics
            const departmentStats = await LeaveRequest.aggregate([
                {
                    $match: {
                        department: new mongoose.Types.ObjectId(
                            deptId as string
                        ),
                        createdAt: {
                            $gte: new Date(today.getFullYear(), 0, 1),
                        },
                    },
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ])

            const statusCounts: Record<string, number> = {
                [LeaveStatus.PENDING]: 0,
                [LeaveStatus.ENDORSED]: 0,
                [LeaveStatus.APPROVED]: 0,
                [LeaveStatus.REJECTED]: 0,
            }

            for (const stat of departmentStats) {
                if (stat._id in statusCounts) {
                    statusCounts[stat._id] = stat.count
                }
            }

            const dashboard = {
                department: {
                    id: department?._id,
                    name: department?.name || "Unknown",
                },
                kpis: {
                    teamSize,
                    onLeaveToday: onLeaveToday.length,
                    pendingEndorsements,
                    pendingApprovals,
                    avgApprovalTime: `${avgApprovalTime} hours`,
                    approvalRate:
                        statusCounts[LeaveStatus.APPROVED] + statusCounts[LeaveStatus.REJECTED] > 0
                            ? Math.round(
                                  (statusCounts[LeaveStatus.APPROVED] /
                                      (statusCounts[LeaveStatus.APPROVED] +
                                          statusCounts[LeaveStatus.REJECTED])) *
                                      100
                              )
                            : 0,
                },
                coverageNext14Days: coverageData,
                teamUtilization: teamUtilization.slice(0, 10), // Top 10 team members
                alerts,
                recentCallIns: recentCallIns.map((c) => ({
                    staff: (c.staff as any).name,
                    leaveType: (c.leaveRequest as any).leaveType,
                    daysRecovered: c.workingDaysRecovered,
                    date: c.requestedAt,
                })),
                departmentStats: statusCounts,
                quickActions: {
                    pendingActions: pendingEndorsements + pendingApprovals,
                    upcomingLeaves: await LeaveRequest.countDocuments({
                        department: deptId,
                        status: LeaveStatus.APPROVED,
                        startDate: { $gte: today, $lte: fourteenDaysFromNow },
                    }),
                    teamOnLeave: onLeaveToday.map((s) => s.name),
                    delegatedRequests: await LeaveRequest.countDocuments({
                        department: deptId,
                        delegatedBy: { $exists: true },
                        createdAt: { $gte: new Date(today.getFullYear(), 0, 1) },
                    }),
                },
            }

            return successResponseObject(
                "Manager dashboard retrieved successfully",
                dashboard
            )
        } catch (error) {
            console.error("Error fetching manager dashboard:", error)
            return errorResponseObject("Failed to retrieve manager dashboard")
        }
    }

    /**
     * Staff Dashboard
     * GET /api/dashboard/staff
     */
    static async getStaffDashboard(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const currentYear = new Date().getFullYear()
            const today = new Date()

            // Get staff details
            const staff = await Staff.findById(user._id)
                .populate("department", "name")
                .lean()

            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Get all balances for current period
            const balances = await LeaveBalance.find({
                staff: user._id,
                periodStart: { $lte: today },
                periodEnd: { $gte: today },
            }).lean()

            // Format balances
            const myBalances = balances.map((b) => ({
                leaveType: b.leaveType,
                total: (b as any).total || 0,
                used: b.used,
                remaining: b.remaining,
                accrued: b.accrued,
                adjustment: (b as any).adjustment || b.adjustments || 0,
                availableForRequest: b.availableForRequest,
                utilizationPercent:
                    (b as any).total > 0
                        ? Math.round((b.used / (b as any).total) * 100)
                        : 0,
            }))

            // Get my requests summary
            const myRequests = await LeaveRequest.find({
                staff: user._id,
                startYear: currentYear,
            }).lean()

            const requestsSummary = {
                total: myRequests.length,
                pending: myRequests.filter(
                    (r) => r.status === LeaveStatus.PENDING
                ).length,
                endorsed: myRequests.filter(
                    (r) => r.status === LeaveStatus.ENDORSED
                ).length,
                approved: myRequests.filter(
                    (r) => r.status === LeaveStatus.APPROVED
                ).length,
                rejected: myRequests.filter(
                    (r) => r.status === LeaveStatus.REJECTED
                ).length,
                cancelled: myRequests.filter(
                    (r) => r.status === LeaveStatus.CANCELLED
                ).length,
                withdrawn: myRequests.filter(
                    (r) => r.status === ("withdrawn" as any)
                ).length,
            }

            // Get upcoming leaves (approved, pending, or endorsed)
            const upcomingLeaves = await LeaveRequest.find({
                staff: user._id,
                status: { $in: [LeaveStatus.APPROVED, LeaveStatus.PENDING, LeaveStatus.ENDORSED] },
                startDate: { $gte: today },
            })
                .sort({ startDate: 1 })
                .limit(5)
                .lean()

            // Get recent requests
            const recentRequests = await LeaveRequest.find({
                staff: user._id,
            })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean()

            // Annual accrual progress (if monthly accrual)
            const annualBalance = balances.find(
                (b) => b.leaveType === LeaveTypes.ANNUAL
            )
            const annualAccrualProgress = annualBalance
                ? {
                      totalAccrued: annualBalance.accrued || 0,
                      monthlyRate:
                          Math.round(
                              ((annualBalance.accrued || 0) /
                                  (today.getMonth() + 1)) *
                                  10
                          ) / 10,
                      projectedYearEnd: Math.round(
                          ((annualBalance.accrued || 0) /
                              (today.getMonth() + 1)) *
                              12
                      ),
                      percentComplete: Math.round(
                          ((today.getMonth() + 1) / 12) * 100
                      ),
                  }
                : null

            // Alerts
            const alerts = []

            // Low annual leave balance
            if (annualBalance && annualBalance.remaining <= 3) {
                alerts.push({
                    type: "LOW_BALANCE",
                    severity: "warning",
                    message: `Only ${annualBalance.remaining} days of annual leave remaining`,
                    action: "Consider planning your leave utilization",
                })
            }

            // Check for pending requests older than 3 days
            const oldPendingRequests = myRequests.filter(
                (r) =>
                    r.status === LeaveStatus.PENDING &&
                    today.getTime() - new Date(r.createdAt as any).getTime() >
                        3 * 24 * 60 * 60 * 1000
            )

            if (oldPendingRequests.length > 0) {
                alerts.push({
                    type: "PENDING_REQUESTS",
                    severity: "info",
                    message: `${oldPendingRequests.length} request(s) pending for more than 3 days`,
                    action: "Follow up with your manager",
                })
            }

            // Check for upcoming leave in next 7 days
            const sevenDaysFromNow = new Date(
                today.getTime() + 7 * 24 * 60 * 60 * 1000
            )
            const upcomingSoon = upcomingLeaves.filter(
                (l) => new Date(l.startDate) <= sevenDaysFromNow
            )

            if (upcomingSoon.length > 0) {
                alerts.push({
                    type: "UPCOMING_LEAVE",
                    severity: "info",
                    message: `You have leave starting in the next 7 days`,
                    action: "Ensure handover arrangements are complete",
                })
            }

            // Get team members on leave (same department)
            const teamOnLeave = await this.getStaffOnLeave(
                today,
                (staff.department as any)?._id
            ).then((staffList) =>
                staffList.filter((s) => s._id.toString() !== user._id)
            )

            // Leave history summary
            const leaveHistory = await LeaveRequest.aggregate([
                {
                    $match: {
                        staff: new mongoose.Types.ObjectId(user._id),
                        status: LeaveStatus.APPROVED,
                    },
                },
                {
                    $group: {
                        _id: "$leaveType",
                        count: { $sum: 1 },
                        totalDays: { $sum: "$workingDays" },
                    },
                },
            ])

            // Monthly trend for staff's own requests (YTD)
            const monthlyTrend = []
            for (let month = 0; month <= today.getMonth(); month++) {
                const monthStart = new Date(currentYear, month, 1)
                const monthEnd = new Date(currentYear, month + 1, 0)
                const monthName = monthStart.toLocaleString("default", { month: "short" })

                const monthRequests = myRequests.filter((r) => {
                    const created = new Date(r.createdAt as any)
                    return created >= monthStart && created <= monthEnd
                })

                const monthApprovals = myRequests.filter((r) => {
                    if (r.status !== LeaveStatus.APPROVED || !r.approval?.at) return false
                    const approvedAt = new Date(r.approval.at)
                    return approvedAt >= monthStart && approvedAt <= monthEnd
                })

                monthlyTrend.push({
                    month: monthName,
                    requests: monthRequests.length,
                    approved: monthApprovals.length,
                    days: monthRequests.reduce((sum, r) => sum + r.workingDays, 0),
                })
            }

            const dashboard = {
                profile: {
                    name: staff.name,
                    staffId: staff.staffId,
                    department: (staff.department as any)?.name,
                    email: staff.email,
                },
                myBalances,
                requestsSummary,
                upcomingLeaves: upcomingLeaves.map((l) => ({
                    leaveType: l.leaveType,
                    startDate: l.startDate,
                    endDate: l.endDate,
                    workingDays: l.workingDays,
                    status: l.status,
                    daysUntilStart: Math.max(
                        0,
                        Math.ceil(
                            (new Date(l.startDate).getTime() -
                                today.getTime()) /
                                (1000 * 60 * 60 * 24)
                        )
                    ),
                })),
                recentRequests: recentRequests.map((r) => ({
                    id: r._id,
                    leaveType: r.leaveType,
                    dates: `${new Date(
                        r.startDate
                    ).toLocaleDateString()} - ${new Date(
                        r.endDate
                    ).toLocaleDateString()}`,
                    status: r.status,
                    workingDays: r.workingDays,
                    submittedOn: r.createdAt,
                })),
                annualAccrualProgress,
                alerts,
                teamOnLeave: teamOnLeave.map((s) => s.name),
                leaveHistory: leaveHistory.map((h) => ({
                    leaveType: h._id,
                    timesUsed: h.count,
                    totalDaysTaken: h.totalDays,
                })),
                monthlyTrend,
                quickStats: {
                    daysUsedThisYear: balances.reduce(
                        (sum, b) => sum + b.used,
                        0
                    ),
                    daysRemainingThisYear: balances.reduce(
                        (sum, b) => sum + b.remaining,
                        0
                    ),
                    averageDaysPerRequest:
                        myRequests.filter(
                            (r) => r.status === LeaveStatus.APPROVED
                        ).length > 0
                            ? Math.round(
                                  (myRequests
                                      .filter(
                                          (r) =>
                                              r.status === LeaveStatus.APPROVED
                                      )
                                      .reduce(
                                          (sum, r) => sum + r.workingDays,
                                          0
                                      ) /
                                      myRequests.filter(
                                          (r) =>
                                              r.status === LeaveStatus.APPROVED
                                      ).length) *
                                      10
                              ) / 10
                            : 0,
                    delegatedRequests: await LeaveRequest.countDocuments({
                        $or: [
                            { delegatedBy: user._id },
                            { staff: user._id, delegatedBy: { $exists: true } },
                        ],
                    }),
                },
            }

            return successResponseObject(
                "Staff dashboard retrieved successfully",
                dashboard
            )
        } catch (error) {
            console.error("Error fetching staff dashboard:", error)
            return errorResponseObject("Failed to retrieve staff dashboard")
        }
    }

    /**
     * Role-Based Calendar
     * GET /api/dashboard/calendar
     */
    static async getRoleBasedCalendar(req: Request): Promise<ResponseObject> {
        try {
            const {
                startDate,
                endDate,
                view = "month",
                departmentId,
                showDetails = true,
            } = req.query
            const user = (req as any).user

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

            // Build query based on role
            let query: any = {
                status: LeaveStatus.APPROVED,
                $or: [
                    { startDate: { $gte: start, $lte: end } },
                    { endDate: { $gte: start, $lte: end } },
                    { startDate: { $lte: start }, endDate: { $gte: end } },
                ],
            }

            let calendarScope = "personal"
            let canViewDetails = false

            // Determine access level
            if (
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")
            ) {
                // HR/Admin: Full organization view
                calendarScope = "organization"
                canViewDetails = true
                if (departmentId) {
                    query.department = departmentId
                }
            } else if (user?.permissions?.includes("MANAGER")) {
                // Manager: Department view
                calendarScope = "department"
                canViewDetails = true

                // Get manager's department(s)
                const managedDept = await Department.findOne({ head: user._id })
                if (managedDept) {
                    query.department = departmentId || managedDept._id
                } else {
                    // Get department from active contract
                    const contract = await StaffContract.findOne({
                        staff: user._id,
                        status: ContractStatus.ACTIVE,
                    }).populate("position")

                    if (contract) {
                        const position = await JobPosition.findById(
                            contract.position
                        )
                        if (position) {
                            query.department = position.department
                        }
                    }
                }
            } else {
                // Staff: Personal and team (privacy-aware)
                calendarScope = "personal_and_team"

                // Get staff's department
                const staff = await Staff.findById(user._id)
                if (staff?.department) {
                    query.$or = [
                        { staff: user._id },
                        { department: staff.department },
                    ]
                } else {
                    query.staff = user._id
                }
            }

            // Get leaves
            const leaves = await LeaveRequest.find(query)
                .populate("staff", "name staffId email department")
                .populate("department", "name")
                .sort({ startDate: 1 })
                .lean()

            // Format calendar events based on role
            const calendarEvents = []
            const dailyCoverage: any = {}
            const typeDistribution: any = {}

            for (const leave of leaves) {
                const isOwnLeave =
                    (leave.staff as any)._id.toString() === user._id

                // Privacy control for staff view
                const showStaffDetails = canViewDetails || isOwnLeave

                const event: any = {
                    id: leave._id,
                    start: leave.startDate,
                    end: leave.endDate,
                    leaveType: leave.leaveType,
                    color: this.getLeaveTypeColor(leave.leaveType),
                    workingDays: leave.workingDays,
                }

                if (showStaffDetails || showDetails === "true") {
                    event.title = `${(leave.staff as any).name} - ${
                        leave.leaveType
                    }`
                    event.staff = {
                        id: (leave.staff as any)._id,
                        name: (leave.staff as any).name,
                        staffId: (leave.staff as any).staffId,
                    }
                    event.department = (leave.department as any).name
                } else {
                    // Privacy mode for non-own leaves
                    event.title = `Team member - ${leave.leaveType}`
                    event.isPrivate = true
                }

                calendarEvents.push(event)

                // Calculate daily coverage
                const current = new Date(leave.startDate)
                while (current <= leave.endDate && current <= end) {
                    const dateKey = current.toISOString().split("T")[0]
                    if (!dailyCoverage[dateKey]) {
                        dailyCoverage[dateKey] = {
                            total: 0,
                            byType: {},
                            staff: [],
                        }
                    }
                    dailyCoverage[dateKey].total++
                    dailyCoverage[dateKey].byType[leave.leaveType] =
                        (dailyCoverage[dateKey].byType[leave.leaveType] || 0) +
                        1

                    if (showStaffDetails) {
                        dailyCoverage[dateKey].staff.push(
                            (leave.staff as any).name
                        )
                    }

                    current.setDate(current.getDate() + 1)
                }

                // Type distribution
                typeDistribution[leave.leaveType] =
                    (typeDistribution[leave.leaveType] || 0) + 1
            }

            // Get holidays in range
            const holidays = await Holiday.find({
                $or: [
                    { date: { $gte: start, $lte: end } },
                    {
                        type: "fixed",
                        fixedMonth: {
                            $gte: start.getMonth() + 1,
                            $lte: end.getMonth() + 1,
                        },
                    },
                ],
            }).lean()

            // Format holidays for calendar
            const holidayEvents = holidays.map((h) => ({
                id: `holiday_${h._id}`,
                title: h.name,
                date:
                    h.date ||
                    new Date(
                        start.getFullYear(),
                        (h.fixedMonth || 1) - 1,
                        h.fixedDay
                    ),
                type: "holiday",
                color: "#FF5722",
                description: h.description,
            }))

            // Calculate view-specific statistics
            const viewStats: any = {
                totalLeaves: calendarEvents.length,
                typeDistribution,
                dailyCoverage: Object.keys(dailyCoverage).length,
                peakDay: null,
                averagePerDay: 0,
            }

            // Find peak day
            let maxCoverage = 0
            let peakDate = null
            for (const [date, coverage] of Object.entries(dailyCoverage)) {
                if ((coverage as any).total > maxCoverage) {
                    maxCoverage = (coverage as any).total
                    peakDate = date
                }
            }

            if (peakDate) {
                viewStats.peakDay = {
                    date: peakDate,
                    count: maxCoverage,
                    details: dailyCoverage[peakDate],
                }
            }

            // Calculate average
            if (Object.keys(dailyCoverage).length > 0) {
                const totalCoverage = Object.values(dailyCoverage).reduce(
                    (sum: number, day: any) => sum + day.total,
                    0
                )
                viewStats.averagePerDay =
                    Math.round(
                        (totalCoverage / Object.keys(dailyCoverage).length) * 10
                    ) / 10
            }

            // Conflict detection (for managers and HR)
            const conflicts = []
            if (canViewDetails) {
                for (const [date, coverage] of Object.entries(dailyCoverage)) {
                    if ((coverage as any).total > 3) {
                        // More than 3 people on same day
                        conflicts.push({
                            date,
                            staffCount: (coverage as any).total,
                            staff: (coverage as any).staff,
                        })
                    }
                }
            }

            const calendar = {
                view,
                scope: calendarScope,
                period: { start, end },
                events: calendarEvents,
                holidays: holidayEvents,
                statistics: viewStats,
                coverage: dailyCoverage,
                conflicts: conflicts.slice(0, 10), // Limit conflicts shown
                legend: {
                    colors: {
                        [LeaveTypes.ANNUAL]: "#4CAF50",
                        [LeaveTypes.SICK]: "#FF9800",
                        [LeaveTypes.MATERNITY]: "#E91E63",
                        [LeaveTypes.PATERNITY]: "#2196F3",
                        [LeaveTypes.BEREAVEMENT]: "#9C27B0",
                        holiday: "#FF5722",
                    },
                },
            }

            return successResponseObject(
                "Calendar retrieved successfully",
                calendar
            )
        } catch (error) {
            console.error("Error fetching calendar:", error)
            return errorResponseObject("Failed to retrieve calendar")
        }
    }

    /**
     * Today Snapshot
     * GET /api/dashboard/today
     */
    static async getTodaySnapshot(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            // Determine access scope
            let scope = "personal"
            let departmentFilter = null

            if (
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")
            ) {
                scope = "organization"
            } else if (user?.permissions?.includes("MANAGER")) {
                scope = "department"
                const managedDept = await Department.findOne({ head: user._id })
                if (managedDept) {
                    departmentFilter = managedDept._id
                }
            } else {
                scope = "personal"
                const staff = await Staff.findById(user._id)
                if (staff?.department) {
                    departmentFilter = staff.department
                }
            }

            // Build query
            const query: any = {
                status: LeaveStatus.APPROVED,
                startDate: { $lte: today },
                endDate: { $gte: today },
            }

            if (scope === "department" && departmentFilter) {
                query.department = departmentFilter
            } else if (scope === "personal") {
                query.$or = [{ staff: user._id }]
                if (departmentFilter) {
                    query.$or.push({ department: departmentFilter })
                }
            }

            // Get staff on leave today
            const onLeaveToday = await LeaveRequest.find(query)
                .populate("staff", "name staffId email phone")
                .populate("department", "name")
                .populate("position", "title")
                .lean()

            // Group by department
            const byDepartment: any = {}
            const byLeaveType: any = {}

            for (const leave of onLeaveToday) {
                const deptName = (leave.department as any)?.name || "Unknown"

                if (!byDepartment[deptName]) {
                    byDepartment[deptName] = []
                }

                byDepartment[deptName].push({
                    staff: (leave.staff as any).name,
                    staffId: (leave.staff as any).staffId,
                    leaveType: leave.leaveType,
                    position: (leave.position as any)?.title,
                    daysRemaining: Math.max(
                        0,
                        Math.ceil(
                            (new Date(leave.endDate).getTime() -
                                today.getTime()) /
                                (1000 * 60 * 60 * 24)
                        )
                    ),
                })

                byLeaveType[leave.leaveType] =
                    (byLeaveType[leave.leaveType] || 0) + 1
            }

            // Get today's holiday if any
            const todayHoliday = await Holiday.findOne({
                $or: [
                    { date: today },
                    {
                        type: "fixed",
                        fixedMonth: today.getMonth() + 1,
                        fixedDay: today.getDate(),
                    },
                ],
            })

            // Get pending actions for today (for managers/HR)
            let pendingActions = {
                endorsements: 0,
                approvals: 0,
            }

            if (
                user?.permissions?.includes("MANAGER") ||
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")
            ) {
                const activeContract = await StaffContract.findOne({
                    staff: user._id,
                    status: ContractStatus.ACTIVE,
                })

                if (activeContract) {
                    pendingActions.endorsements =
                        await LeaveRequest.countDocuments({
                            status: LeaveStatus.PENDING,
                            "endorsement.byPosition": activeContract.position,
                        })

                    pendingActions.approvals =
                        await LeaveRequest.countDocuments({
                            status: LeaveStatus.ENDORSED,
                            "approval.byPosition": activeContract.position,
                        })
                }
            }

            // Get coverage statistics
            const totalStaff =
                scope === "organization"
                    ? await Staff.countDocuments({ status: "active" })
                    : scope === "department" && departmentFilter
                    ? await Staff.countDocuments({
                          department: departmentFilter,
                          status: "active",
                      })
                    : 1

            const coveragePercent =
                totalStaff > 0
                    ? Math.round((onLeaveToday.length / totalStaff) * 100)
                    : 0

            const snapshot = {
                date: today,
                scope,
                holiday: todayHoliday
                    ? {
                          name: todayHoliday.name,
                          type: todayHoliday.type,
                          description: todayHoliday.description,
                      }
                    : null,
                statistics: {
                    totalOnLeave: onLeaveToday.length,
                    byDepartment: Object.keys(byDepartment).map((dept) => ({
                        department: dept,
                        count: byDepartment[dept].length,
                    })),
                    byLeaveType,
                    coveragePercent,
                },
                staffOnLeave:
                    scope === "organization" || scope === "department"
                        ? Object.entries(byDepartment).map(([dept, staff]) => ({
                              department: dept,
                              staff: staff,
                          }))
                        : onLeaveToday
                              .filter(
                                  (l) =>
                                      (l.staff as any)._id.toString() ===
                                      user._id
                              )
                              .map((l) => ({
                                  leaveType: l.leaveType,
                                  endDate: l.endDate,
                                  daysRemaining: Math.max(
                                      0,
                                      Math.ceil(
                                          (new Date(l.endDate).getTime() -
                                              today.getTime()) /
                                              (1000 * 60 * 60 * 24)
                                      )
                                  ),
                              })),
                pendingActions,
                insights: this.generateTodayInsights(
                    onLeaveToday.length,
                    coveragePercent,
                    todayHoliday
                ),
            }

            return successResponseObject(
                "Today's snapshot retrieved successfully",
                snapshot
            )
        } catch (error) {
            console.error("Error fetching today snapshot:", error)
            return errorResponseObject("Failed to retrieve today's snapshot")
        }
    }

    /**
     * Upcoming Leave Forecast
     * GET /api/dashboard/forecast
     */
    static async getUpcomingForecast(req: Request): Promise<ResponseObject> {
        try {
            const { days = 30, departmentId } = req.query
            const user = (req as any).user

            const forecastDays = Math.min(90, Math.max(7, Number(days)))
            const today = new Date()
            const endDate = new Date(
                today.getTime() + forecastDays * 24 * 60 * 60 * 1000
            )

            // Determine access scope
            let query: any = {
                status: LeaveStatus.APPROVED,
                startDate: { $lte: endDate },
                endDate: { $gte: today },
            }

            if (departmentId) {
                // Check access to department
                if (user?.permissions?.includes("MANAGER")) {
                    const dept = await Department.findById(departmentId)
                    if (
                        !dept ||
                        (dept.head?.toString() !== user._id &&
                            !user?.permissions?.includes("HR") &&
                            !user?.permissions?.includes("ADMIN"))
                    ) {
                        return errorResponseObject(
                            "Unauthorized to view this department's forecast"
                        )
                    }
                }
                query.department = departmentId
            } else if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                // For managers, limit to their department
                if (user?.permissions?.includes("MANAGER")) {
                    const managedDept = await Department.findOne({
                        head: user._id,
                    })
                    if (managedDept) {
                        query.department = managedDept._id
                    }
                } else {
                    // For regular staff, show only their leaves
                    query.staff = user._id
                }
            }

            // Get upcoming leaves
            const upcomingLeaves = await LeaveRequest.find(query)
                .populate("staff", "name staffId")
                .populate("department", "name")
                .lean()

            // Calculate daily forecast
            const dailyForecast: any = {}
            const weeklyForecast: any = {}
            const monthlyForecast: any = {}

            for (let d = 0; d < forecastDays; d++) {
                const currentDate = new Date(
                    today.getTime() + d * 24 * 60 * 60 * 1000
                )
                const dateKey = currentDate.toISOString().split("T")[0]
                const weekKey = `W${this.getWeekNumber(
                    currentDate
                )}-${currentDate.getFullYear()}`
                const monthKey = `${currentDate.getFullYear()}-${String(
                    currentDate.getMonth() + 1
                ).padStart(2, "0")}`

                dailyForecast[dateKey] = {
                    date: currentDate,
                    dayOfWeek: currentDate.toLocaleDateString("en", {
                        weekday: "short",
                    }),
                    staffOut: 0,
                    byType: {},
                    isWeekend:
                        currentDate.getDay() === 0 ||
                        currentDate.getDay() === 6,
                }

                if (!weeklyForecast[weekKey]) {
                    weeklyForecast[weekKey] = {
                        weekStart: this.getWeekStart(currentDate),
                        totalStaffDays: 0,
                        peakDay: 0,
                        avgDaily: 0,
                    }
                }

                if (!monthlyForecast[monthKey]) {
                    monthlyForecast[monthKey] = {
                        month: currentDate.toLocaleDateString("en", {
                            month: "long",
                            year: "numeric",
                        }),
                        totalStaffDays: 0,
                        peakDay: 0,
                    }
                }
            }

            // Process leaves
            for (const leave of upcomingLeaves) {
                const leaveStart = new Date(
                    Math.max(leave.startDate.getTime(), today.getTime())
                )
                const leaveEnd = new Date(
                    Math.min(leave.endDate.getTime(), endDate.getTime())
                )

                const current = new Date(leaveStart)
                while (current <= leaveEnd) {
                    const dateKey = current.toISOString().split("T")[0]
                    const weekKey = `W${this.getWeekNumber(
                        current
                    )}-${current.getFullYear()}`
                    const monthKey = `${current.getFullYear()}-${String(
                        current.getMonth() + 1
                    ).padStart(2, "0")}`

                    if (dailyForecast[dateKey]) {
                        dailyForecast[dateKey].staffOut++
                        dailyForecast[dateKey].byType[leave.leaveType] =
                            (dailyForecast[dateKey].byType[leave.leaveType] ||
                                0) + 1

                        if (!dailyForecast[dateKey].isWeekend) {
                            weeklyForecast[weekKey].totalStaffDays++
                            monthlyForecast[monthKey].totalStaffDays++
                        }

                        weeklyForecast[weekKey].peakDay = Math.max(
                            weeklyForecast[weekKey].peakDay,
                            dailyForecast[dateKey].staffOut
                        )

                        monthlyForecast[monthKey].peakDay = Math.max(
                            monthlyForecast[monthKey].peakDay,
                            dailyForecast[dateKey].staffOut
                        )
                    }

                    current.setDate(current.getDate() + 1)
                }
            }

            // Calculate averages for weekly forecast
            for (const week in weeklyForecast) {
                weeklyForecast[week].avgDaily =
                    weeklyForecast[week].totalStaffDays / 5 // Assuming 5 working days
            }

            // Get holidays in forecast period
            const holidays = await Holiday.find({
                $or: [
                    { date: { $gte: today, $lte: endDate } },
                    {
                        type: "fixed",
                        $or: this.getMonthRangeForFixedHolidays(today, endDate),
                    },
                ],
            }).lean()

            // Mark holidays in daily forecast
            for (const holiday of holidays) {
                const holidayDate =
                    holiday.date ||
                    new Date(
                        today.getFullYear(),
                        (holiday.fixedMonth || 1) - 1,
                        holiday.fixedDay
                    )
                const dateKey = holidayDate.toISOString().split("T")[0]

                if (dailyForecast[dateKey]) {
                    dailyForecast[dateKey].isHoliday = true
                    dailyForecast[dateKey].holidayName = holiday.name
                }
            }

            // Identify peak periods
            const peakPeriods = []
            const dailyEntries = Object.entries(dailyForecast)
                .sort((a, b) => (b[1] as any).staffOut - (a[1] as any).staffOut)
                .slice(0, 5)

            for (const [date, data] of dailyEntries) {
                if ((data as any).staffOut > 0) {
                    peakPeriods.push({
                        date,
                        staffOut: (data as any).staffOut,
                        dayOfWeek: (data as any).dayOfWeek,
                        isHoliday: (data as any).isHoliday,
                        byType: (data as any).byType,
                    })
                }
            }

            // Coverage alerts
            const alerts = []
            const totalStaff = query.department
                ? await Staff.countDocuments({
                      department: query.department,
                      status: "active",
                  })
                : await Staff.countDocuments({ status: "active" })

            for (const [date, data] of Object.entries(dailyForecast)) {
                const coverage = ((data as any).staffOut / totalStaff) * 100
                if (
                    coverage > 30 &&
                    !(data as any).isWeekend &&
                    !(data as any).isHoliday
                ) {
                    alerts.push({
                        date,
                        message: `High absence rate: ${Math.round(
                            coverage
                        )}% of staff on leave`,
                        severity: coverage > 50 ? "high" : "medium",
                        staffOut: (data as any).staffOut,
                    })
                }
            }

            const forecast = {
                period: {
                    start: today,
                    end: endDate,
                    days: forecastDays,
                },
                summary: {
                    totalLeaves: upcomingLeaves.length,
                    totalStaffDays: Object.values(dailyForecast).reduce(
                        (sum: number, day: any) =>
                            sum + (day.isWeekend ? 0 : day.staffOut),
                        0
                    ),
                    averageDailyAbsence:
                        Math.round(
                            (Object.values(dailyForecast).reduce(
                                (sum: number, day: any) => sum + day.staffOut,
                                0
                            ) /
                                forecastDays) *
                                10
                        ) / 10,
                    peakAbsence: Math.max(
                        ...Object.values(dailyForecast).map(
                            (d: any) => d.staffOut
                        )
                    ),
                },
                dailyBreakdown: Object.entries(dailyForecast)
                    .slice(0, 14) // Show first 14 days in detail
                    .map(([date, data]) => ({
                        date,
                        ...(data as any),
                    })),
                weeklyBreakdown: Object.entries(weeklyForecast).map(
                    ([week, data]) => ({
                        week,
                        ...(data as any),
                    })
                ),
                monthlyBreakdown: Object.entries(monthlyForecast).map(
                    ([month, data]) => ({
                        month,
                        ...(data as any),
                    })
                ),
                peakPeriods,
                alerts: alerts.slice(0, 10),
                recommendations: this.generateForecastRecommendations(
                    peakPeriods,
                    alerts,
                    totalStaff
                ),
            }

            return successResponseObject(
                "Forecast generated successfully",
                forecast
            )
        } catch (error) {
            console.error("Error generating forecast:", error)
            return errorResponseObject("Failed to generate forecast")
        }
    }

    // Helper Methods
    private static async getStaffOnLeave(
        date: Date,
        departmentId?: string
    ): Promise<any[]> {
        const query: any = {
            status: LeaveStatus.APPROVED,
            startDate: { $lte: date },
            endDate: { $gte: date },
        }

        if (departmentId) {
            query.department = departmentId
        }

        return await LeaveRequest.find(query)
            .populate("staff", "name staffId email")
            .lean()
            .then((leaves) => leaves.map((l) => l.staff))
    }

    private static async calculateAverageApprovalTime(
        since: Date,
        departmentId?: string
    ): Promise<number> {
        const query: any = {
            status: { $in: [LeaveStatus.APPROVED, LeaveStatus.REJECTED] },
            createdAt: { $gte: since },
        }

        if (departmentId) {
            query.department = departmentId
        }

        const requests = await LeaveRequest.find(query).lean()

        if (requests.length === 0) return 0

        let totalTime = 0
        let count = 0

        for (const request of requests) {
            const created = new Date(request.createdAt as any).getTime()
            const decided = request.approval?.at
                ? new Date(request.approval.at as any).getTime()
                : request.endorsement?.at
                ? new Date(request.endorsement.at as any).getTime()
                : created

            totalTime += decided - created
            count++
        }

        return count > 0 ? Math.round(totalTime / count / (60 * 60 * 1000)) : 0 // Return in hours
    }

    private static async calculateUtilizationRate(
        year: number
    ): Promise<number> {
        const balances = await LeaveBalance.find({ year }).lean()

        if (balances.length === 0) return 0

        const totalAllocated = balances.reduce(
            (sum, b) => sum + (b as any).total,
            0
        )
        const totalUsed = balances.reduce((sum, b) => sum + b.used, 0)

        return totalAllocated > 0
            ? Math.round((totalUsed / totalAllocated) * 100)
            : 0
    }

    private static async getDepartmentCoverage(
        departmentId: string,
        startDate: Date,
        endDate: Date
    ): Promise<any[]> {
        const coverage = []
        const current = new Date(startDate)

        while (current <= endDate) {
            const staffOut = await LeaveRequest.countDocuments({
                department: departmentId,
                status: LeaveStatus.APPROVED,
                startDate: { $lte: current },
                endDate: { $gte: current },
            })

            coverage.push({
                date: current.toISOString().split("T")[0],
                dayOfWeek: current.toLocaleDateString("en", {
                    weekday: "short",
                }),
                staffOut,
                isWeekend: current.getDay() === 0 || current.getDay() === 6,
            })

            current.setDate(current.getDate() + 1)
        }

        return coverage
    }

    private static async getTeamUtilization(
        departmentId: string,
        year: number
    ): Promise<any[]> {
        const staffInDept = await Staff.find({
            department: departmentId,
            status: "active",
        }).lean()

        const utilization = []

        for (const staff of staffInDept) {
            const balances = await LeaveBalance.find({
                staff: staff._id,
                year,
            }).lean()

            const totalAllocated = balances.reduce(
                (sum, b) => sum + (b as any).total,
                0
            )
            const totalUsed = balances.reduce((sum, b) => sum + b.used, 0)
            const totalRemaining = balances.reduce(
                (sum, b) => sum + b.remaining,
                0
            )

            utilization.push({
                staff: {
                    id: staff._id,
                    name: staff.name,
                    staffId: staff.staffId,
                },
                allocated: totalAllocated,
                used: totalUsed,
                remaining: totalRemaining,
                utilizationRate:
                    totalAllocated > 0
                        ? Math.round((totalUsed / totalAllocated) * 100)
                        : 0,
            })
        }

        return utilization.sort((a, b) => b.utilizationRate - a.utilizationRate)
    }

    private static getLeaveTypeColor(leaveType: string): string {
        const colors: Record<string, string> = {
            [LeaveTypes.ANNUAL]: "#4CAF50",
            [LeaveTypes.SICK]: "#FF9800",
            [LeaveTypes.MATERNITY]: "#E91E63",
            [LeaveTypes.PATERNITY]: "#2196F3",
            [LeaveTypes.BEREAVEMENT]: "#9C27B0",
        }
        return colors[leaveType] || "#607D8B"
    }

    private static getWeekNumber(date: Date): number {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const pastDaysOfYear =
            (date.getTime() - firstDayOfYear.getTime()) / 86400000
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
    }

    private static getWeekStart(date: Date): Date {
        const d = new Date(date)
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
        return new Date(d.setDate(diff))
    }

    private static getMonthRangeForFixedHolidays(
        startDate: Date,
        endDate: Date
    ): any[] {
        const conditions = []
        const startMonth = startDate.getMonth() + 1
        const endMonth = endDate.getMonth() + 1
        const startYear = startDate.getFullYear()
        const endYear = endDate.getFullYear()

        if (startYear === endYear) {
            for (let month = startMonth; month <= endMonth; month++) {
                conditions.push({ fixedMonth: month })
            }
        } else {
            // Handle year boundary
            for (let month = startMonth; month <= 12; month++) {
                conditions.push({ fixedMonth: month })
            }
            for (let month = 1; month <= endMonth; month++) {
                conditions.push({ fixedMonth: month })
            }
        }

        return conditions
    }

    private static generateTodayInsights(
        staffOut: number,
        coverage: number,
        holiday: any
    ): string[] {
        const insights = []

        if (holiday) {
            insights.push(`Today is ${holiday.name} (${holiday.type} holiday)`)
        }

        if (coverage > 30) {
            insights.push(
                `High absence rate today: ${coverage}% of staff on leave`
            )
        } else if (coverage < 10) {
            insights.push(`Good coverage today with only ${coverage}% absence`)
        }

        if (staffOut === 0) {
            insights.push("Full team coverage today - no one on leave")
        } else if (staffOut === 1) {
            insights.push("Only 1 person on leave today")
        } else {
            insights.push(`${staffOut} people are on leave today`)
        }

        const dayOfWeek = new Date().getDay()
        if (dayOfWeek === 1) {
            insights.push(
                "Start of the work week - ensure handovers are complete"
            )
        } else if (dayOfWeek === 5) {
            insights.push("End of work week - prepare for weekend coverage")
        }

        return insights
    }

    private static generateForecastRecommendations(
        peakPeriods: any[],
        alerts: any[],
        totalStaff: number
    ): string[] {
        const recommendations = []

        if (
            peakPeriods.length > 0 &&
            peakPeriods[0].staffOut > totalStaff * 0.3
        ) {
            recommendations.push(
                `Peak absence period on ${peakPeriods[0].date} with ${peakPeriods[0].staffOut} staff out. Consider coverage planning.`
            )
        }

        if (alerts.filter((a) => a.severity === "high").length > 0) {
            recommendations.push(
                "Multiple high-risk coverage periods detected. Review staffing arrangements."
            )
        }

        const holidayPeaks = peakPeriods.filter((p) => p.isHoliday)
        if (holidayPeaks.length > 0) {
            recommendations.push(
                "Leave requests cluster around holidays. Consider holiday coverage policies."
            )
        }

        if (
            peakPeriods.filter(
                (p) => p.dayOfWeek === "Mon" || p.dayOfWeek === "Fri"
            ).length > 3
        ) {
            recommendations.push(
                "Pattern of extended weekends detected. Monitor for potential abuse."
            )
        }

        if (recommendations.length === 0) {
            recommendations.push(
                "Leave distribution looks balanced for the forecast period."
            )
        }

        return recommendations
    }
}

export default DashboardController
