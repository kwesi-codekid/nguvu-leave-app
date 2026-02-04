import { Request } from "express"
import mongoose from "mongoose"
import LeaveRequest from "../models/leave-request.model"
import LeaveBalance from "../models/leave-balance.model"
import Staff from "../models/staff.model"
import Department from "../models/department.model"
import StaffContract from "../models/staff-contract.model"
import CallIn from "../models/call-in.model"
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
    Gender,
} from "../utils/types"

export class ReportController {
    /**
     * Leave Requests Report
     * GET /api/reports/leave-requests
     */
    static async getLeaveRequestsReport(req: Request): Promise<ResponseObject> {
        try {
            const {
                startDate,
                endDate,
                departmentId,
                staffId,
                leaveType,
                status,
                groupBy = "month",
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
                    "Unauthorized to view leave requests report"
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

            // Build query - filter by actual leave dates, not creation date
            const query: any = {
                $or: [
                    // Leave starts within the date range
                    { startDate: { $gte: start, $lte: end } },
                    // Leave ends within the date range
                    { endDate: { $gte: start, $lte: end } },
                    // Leave spans the entire date range
                    { startDate: { $lte: start }, endDate: { $gte: end } }
                ],
            }

            // Apply filters
            if (departmentId) {
                // Check manager scope
                if (
                    user?.permissions?.includes("MANAGER") &&
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN")
                ) {
                    // Verify manager has access to this department
                    const managerContract = await StaffContract.findOne({
                        staff: user._id,
                        status: ContractStatus.ACTIVE,
                    }).populate("position")

                    const managerDept = await Department.findOne({
                        head: user._id,
                        _id: departmentId,
                    })

                    if (!managerDept) {
                        return errorResponseObject(
                            "Unauthorized to view this department's data"
                        )
                    }
                }
                query.department = departmentId
            }

            if (staffId) {
                query.staff = staffId
            }

            if (
                leaveType &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                query.leaveType = leaveType
            }

            if (
                status &&
                Object.values(LeaveStatus).includes(status as LeaveStatus)
            ) {
                query.status = status
            }

            // Get leave requests
            const leaveRequests = await LeaveRequest.find(query)
                .populate("staff", "name staffId")
                .populate("department", "name")
                .lean()

            // Generate statistics
            const stats = {
                total: leaveRequests.length,
                totalWorkingDays: 0,
                byStatus: {
                    [LeaveStatus.PENDING]: 0,
                    [LeaveStatus.ENDORSED]: 0,
                    [LeaveStatus.APPROVED]: 0,
                    [LeaveStatus.REJECTED]: 0,
                    [LeaveStatus.CANCELLED]: 0,
                    [LeaveStatus.WITHDRAWN]: 0,
                } as Record<string, number>,
                byLeaveType: {} as Record<string, any> as Record<string, any>,
                byDepartment: {} as Record<string, any>,
                breakdown: {},
                topStaff: [] as any[],
                topDepartments: [] as any[],
                trend: [] as any[],
            }

            // Process requests
            const staffCounts: any = {}
            const deptCounts: any = {}
            const groupedData: any = {}

            for (const request of leaveRequests) {
                stats.totalWorkingDays += request.workingDays

                // By status
                stats.byStatus[request.status]++

                // By leave type
                if (!stats.byLeaveType[request.leaveType]) {
                    stats.byLeaveType[request.leaveType] = { count: 0, days: 0 }
                }
                stats.byLeaveType[request.leaveType].count++
                stats.byLeaveType[request.leaveType].days += request.workingDays

                // By department
                const deptName = (request.department as any)?.name || "Unknown"
                if (!stats.byDepartment[deptName]) {
                    stats.byDepartment[deptName] = { count: 0, days: 0 }
                }
                stats.byDepartment[deptName].count++
                stats.byDepartment[deptName].days += request.workingDays

                // Staff counts
                const staffKey = `${(request.staff as any).staffId}_${
                    (request.staff as any).name
                }`
                staffCounts[staffKey] =
                    (staffCounts[staffKey] || 0) + request.workingDays

                // Department counts
                deptCounts[deptName] =
                    (deptCounts[deptName] || 0) + request.workingDays

                // Group by logic - use leave start date for grouping
                let groupKey = ""
                const reqDate = new Date(request.startDate)

                switch (groupBy) {
                    case "day":
                        groupKey = reqDate.toISOString().split("T")[0]
                        break
                    case "week":
                        const weekNum = this.getWeekNumber(reqDate)
                        groupKey = `${reqDate.getFullYear()}-W${weekNum}`
                        break
                    case "month":
                        groupKey = `${reqDate.getFullYear()}-${String(
                            reqDate.getMonth() + 1
                        ).padStart(2, "0")}`
                        break
                    case "department":
                        groupKey = deptName
                        break
                    case "leaveType":
                        groupKey = request.leaveType
                        break
                    default:
                        groupKey = `${reqDate.getFullYear()}-${String(
                            reqDate.getMonth() + 1
                        ).padStart(2, "0")}`
                }

                if (!groupedData[groupKey]) {
                    groupedData[groupKey] = { count: 0, days: 0, requests: [] }
                }
                groupedData[groupKey].count++
                groupedData[groupKey].days += request.workingDays
            }

            // Top staff (by days)
            stats.topStaff = Object.entries(staffCounts)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 10)
                .map(([key, days]) => {
                    const [staffId, ...nameParts] = key.split("_")
                    return {
                        staffId,
                        name: nameParts.join("_"),
                        totalDays: days,
                    }
                })

            // Top departments
            stats.topDepartments = Object.entries(deptCounts)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 5)
                .map(([dept, days]) => ({ department: dept, totalDays: days }))

            stats.breakdown = groupedData

            // Generate trend (monthly based on when leave actually occurs)
            const monthlyTrend: any = {}
            for (const request of leaveRequests) {
                const monthKey = new Date(request.startDate)
                    .toISOString()
                    .substring(0, 7)
                if (!monthlyTrend[monthKey]) {
                    monthlyTrend[monthKey] = { count: 0, days: 0 }
                }
                monthlyTrend[monthKey].count++
                monthlyTrend[monthKey].days += request.workingDays
            }
            stats.trend = Object.entries(monthlyTrend)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([month, data]) => ({ month, ...(data as any) }))

            // Format as CSV if requested
            if (format === "csv") {
                const csvData = this.convertLeaveRequestsToCSV(leaveRequests)

                // Log export
                await AuditLogController.createAuditLog({
                    action: AuditAction.REPORT_GENERATED,
                    entityType: "Report",
                    entityId: "leave-requests",
                    performedBy: user._id,
                    performedByName: user.name,
                    performedByEmail: user.email,
                    description: "Generated leave requests report (CSV)",
                    metadata: {
                        dateRange: { start, end },
                        filters: { departmentId, staffId, leaveType, status },
                        recordCount: leaveRequests.length,
                    },
                    ipAddress: req.ip || req.socket.remoteAddress,
                    userAgent: req.headers["user-agent"],
                })

                return successResponseObject(
                    "Leave requests report generated (CSV)",
                    {
                        csv: csvData,
                        filename: `leave-requests-report-${
                            start.toISOString().split("T")[0]
                        }-to-${end.toISOString().split("T")[0]}.csv`,
                        stats,
                    }
                )
            }

            // Log report generation
            await AuditLogController.createAuditLog({
                action: AuditAction.REPORT_GENERATED,
                entityType: "Report",
                entityId: "leave-requests",
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: "Generated leave requests report",
                metadata: {
                    dateRange: { start, end },
                    filters: { departmentId, staffId, leaveType, status },
                    recordCount: leaveRequests.length,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Leave requests report generated successfully",
                {
                    period: { start, end },
                    filters: {
                        departmentId,
                        staffId,
                        leaveType,
                        status,
                        groupBy,
                    },
                    statistics: stats,
                    details:
                        leaveRequests.length <= 100
                            ? leaveRequests
                            : "Too many records, use CSV export for details",
                }
            )
        } catch (error) {
            console.error("Error generating leave requests report:", error)
            return errorResponseObject(
                "Failed to generate leave requests report"
            )
        }
    }

    /**
     * Leave Balances Report
     * GET /api/reports/leave-balances
     */
    static async getLeaveBalancesReport(req: Request): Promise<ResponseObject> {
        try {
            const {
                year,
                departmentId,
                staffId,
                leaveType,
                lowBalanceThreshold = 3,
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
                    "Unauthorized to view leave balances report"
                )
            }

            const yearNum = year ? Number(year) : new Date().getFullYear()

            // Build query
            const query: any = { year: yearNum }

            if (staffId) {
                query.staff = staffId
            }

            if (
                leaveType &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                query.leaveType = leaveType
            }

            // Get balances with staff population
            let balances = await LeaveBalance.find(query)
                .populate({
                    path: "staff",
                    select: "name staffId email department status gender",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .lean()

            // Filter by department if specified
            if (departmentId) {
                // Check manager scope
                if (
                    user?.permissions?.includes("MANAGER") &&
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN")
                ) {
                    const managerDept = await Department.findOne({
                        head: user._id,
                        _id: departmentId,
                    })

                    if (!managerDept) {
                        return errorResponseObject(
                            "Unauthorized to view this department's data"
                        )
                    }
                }

                balances = balances.filter(
                    (b) =>
                        (b.staff as any).department?._id?.toString() ===
                        departmentId
                )
            }

            // Calculate statistics
            const stats = {
                totalRecords: balances.length,
                byLeaveType: {} as Record<string, any> as Record<string, any>,
                totals: {
                    totalAllocated: 0,
                    totalUsed: 0,
                    totalRemaining: 0,
                    totalAvailableForRequest: 0,
                },
                lowBalance: [] as any[],
                utilizationByType: {},
                averages: {
                    used: 0,
                    remaining: 0,
                    utilizationPercent: 0,
                },
            }

            // Process balances
            const perStaffPerType: any[] = []
            const staffUtilization: any = {}
            const threshold = Number(lowBalanceThreshold)

            for (const balance of balances) {
                const staff = balance.staff as any
                const staffKey = staff._id.toString()

                // Initialize staff utilization tracking
                if (!staffUtilization[staffKey]) {
                    staffUtilization[staffKey] = {
                        staff: {
                            id: staff._id,
                            name: staff.name,
                            staffId: staff.staffId,
                            department: staff.department?.name,
                        },
                        balances: [],
                    }
                }

                // Calculate available for request (for annual leave)
                const availableForRequest =
                    balance.leaveType === LeaveTypes.ANNUAL
                        ? balance.availableForRequest
                        : balance.remaining

                // Add to per staff per type
                const record = {
                    staff: {
                        id: staff._id,
                        name: staff.name,
                        staffId: staff.staffId,
                        department: staff.department?.name,
                    },
                    leaveType: balance.leaveType,
                    total: balance.allocated,
                    accrued: balance.accrued,
                    adjustment: balance.adjustments,
                    used: balance.used,
                    remaining: balance.remaining,
                    availableForRequest,
                    utilizationPercent:
                        balance.allocated > 0
                            ? Math.round(
                                  (balance.used / balance.allocated) * 100
                              )
                            : 0,
                    isLowBalance: balance.remaining <= threshold,
                    lastUpdated: balance.updatedAt,
                }

                perStaffPerType.push(record)
                staffUtilization[staffKey].balances.push(record)

                // Check for low balance
                if (balance.remaining <= threshold) {
                    stats.lowBalance.push({
                        staff: record.staff,
                        leaveType: balance.leaveType,
                        remaining: balance.remaining,
                        threshold,
                    })
                }

                // By leave type stats
                if (!stats.byLeaveType[balance.leaveType]) {
                    stats.byLeaveType[balance.leaveType] = {
                        count: 0,
                        totalAllocated: 0,
                        totalUsed: 0,
                        totalRemaining: 0,
                        avgUtilization: 0,
                    }
                }
                stats.byLeaveType[balance.leaveType].count++
                stats.byLeaveType[balance.leaveType].totalAllocated +=
                    balance.allocated
                stats.byLeaveType[balance.leaveType].totalUsed += balance.used
                stats.byLeaveType[balance.leaveType].totalRemaining +=
                    balance.remaining

                // Totals
                stats.totals.totalAllocated += balance.allocated
                stats.totals.totalUsed += balance.used
                stats.totals.totalRemaining += balance.remaining
                if (balance.leaveType === LeaveTypes.ANNUAL) {
                    stats.totals.totalAvailableForRequest += availableForRequest
                }
            }

            // Calculate averages and utilization
            if (balances.length > 0) {
                stats.averages.used =
                    Math.round(
                        (stats.totals.totalUsed / balances.length) * 10
                    ) / 10
                stats.averages.remaining =
                    Math.round(
                        (stats.totals.totalRemaining / balances.length) * 10
                    ) / 10
                stats.averages.utilizationPercent =
                    stats.totals.totalAllocated > 0
                        ? Math.round(
                              (stats.totals.totalUsed /
                                  stats.totals.totalAllocated) *
                                  100
                          )
                        : 0

                // Calculate average utilization by type
                for (const type in stats.byLeaveType) {
                    const typeStats = stats.byLeaveType[type]
                    typeStats.avgUtilization =
                        typeStats.totalAllocated > 0
                            ? Math.round(
                                  (typeStats.totalUsed /
                                      typeStats.totalAllocated) *
                                      100
                              )
                            : 0
                }
            }

            // Format as CSV if requested
            if (format === "csv") {
                const csvData = this.convertBalancesToCSV(perStaffPerType)

                return successResponseObject(
                    "Leave balances report generated (CSV)",
                    {
                        csv: csvData,
                        filename: `leave-balances-report-${yearNum}.csv`,
                        stats,
                    }
                )
            }

            return successResponseObject(
                "Leave balances report generated successfully",
                {
                    year: yearNum,
                    filters: {
                        departmentId,
                        staffId,
                        leaveType,
                        lowBalanceThreshold,
                    },
                    statistics: stats,
                    perStaffPerType: perStaffPerType.slice(0, 100), // Limit for response size
                    totalRecords: perStaffPerType.length,
                }
            )
        } catch (error) {
            console.error("Error generating leave balances report:", error)
            return errorResponseObject(
                "Failed to generate leave balances report"
            )
        }
    }

    /**
     * Approvals SLA Report
     * GET /api/reports/approvals-sla
     */
    static async getApprovalsSlAReport(req: Request): Promise<ResponseObject> {
        try {
            const { startDate, endDate, departmentId, approverPositionId } =
                req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view approvals SLA report"
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

            // Build query for processed requests
            // Note: SLA report uses createdAt since it measures processing time from request creation
            const query: any = {
                createdAt: { $gte: start, $lte: end },
                status: {
                    $in: [
                        LeaveStatus.APPROVED,
                        LeaveStatus.REJECTED,
                        LeaveStatus.ENDORSED,
                    ],
                },
            }

            if (departmentId) {
                query.department = departmentId
            }

            if (approverPositionId) {
                query["approval.byPosition"] = approverPositionId
            }

            // Get leave requests
            const requests = await LeaveRequest.find(query)
                .populate("department", "name")
                .populate("endorsement.byPosition", "title")
                .populate("endorsement.byStaff", "name")
                .populate("approval.byPosition", "title")
                .populate("approval.byStaff", "name")
                .lean()

            // Calculate SLA metrics
            const metrics = {
                totalProcessed: requests.length,
                avgTimes: {
                    requestToEndorsement: 0,
                    endorsementToApproval: 0,
                    requestToFinalDecision: 0,
                },
                distributions: {
                    under24h: 0,
                    under48h: 0,
                    under72h: 0,
                    over72h: 0,
                },
                breachRates: {
                    endorsement48h: 0,
                    approval48h: 0,
                    total72h: 0,
                },
                byApprover: {},
                byDepartment: {},
                bottlenecks: [] as any[],
            }

            let totalRequestToEndorsement = 0
            let totalEndorsementToApproval = 0
            let totalRequestToFinal = 0
            let endorsementCount = 0
            let approvalCount = 0

            const approverStats: any = {}
            const deptStats: any = {}

            for (const request of requests) {
                const createdAt = new Date(
                    request.createdAt || new Date()
                ).getTime()
                let finalDecisionTime = createdAt

                // Request to endorsement time
                if (request.endorsement?.at) {
                    const endorsedAt = new Date(
                        request.endorsement.at
                    ).getTime()
                    const timeToEndorse = endorsedAt - createdAt
                    totalRequestToEndorsement += timeToEndorse
                    endorsementCount++

                    // Check 48h breach for endorsement
                    if (timeToEndorse > 48 * 60 * 60 * 1000) {
                        metrics.breachRates.endorsement48h++
                    }

                    // Endorsement to approval time
                    if (request.approval?.at) {
                        const approvedAt = new Date(
                            request.approval.at
                        ).getTime()
                        const timeToApprove = approvedAt - endorsedAt
                        totalEndorsementToApproval += timeToApprove
                        approvalCount++
                        finalDecisionTime = approvedAt

                        // Check 48h breach for approval
                        if (timeToApprove > 48 * 60 * 60 * 1000) {
                            metrics.breachRates.approval48h++
                        }
                    } else {
                        finalDecisionTime = endorsedAt
                    }
                }

                // Total processing time
                const totalTime = finalDecisionTime - createdAt
                totalRequestToFinal += totalTime

                // Check 72h total breach
                if (totalTime > 72 * 60 * 60 * 1000) {
                    metrics.breachRates.total72h++
                }

                // Distribution buckets
                const hoursToProcess = totalTime / (60 * 60 * 1000)
                if (hoursToProcess <= 24) metrics.distributions.under24h++
                else if (hoursToProcess <= 48) metrics.distributions.under48h++
                else if (hoursToProcess <= 72) metrics.distributions.under72h++
                else metrics.distributions.over72h++

                // By approver stats
                if (request.approval?.byStaff) {
                    const approverId = (
                        request.approval.byStaff as any
                    )._id.toString()
                    const approverName = (request.approval.byStaff as any).name

                    if (!approverStats[approverId]) {
                        approverStats[approverId] = {
                            name: approverName,
                            count: 0,
                            avgTime: 0,
                            totalTime: 0,
                            breaches: 0,
                        }
                    }

                    approverStats[approverId].count++
                    approverStats[approverId].totalTime += totalTime
                    if (totalTime > 72 * 60 * 60 * 1000) {
                        approverStats[approverId].breaches++
                    }
                }

                // By department stats
                const deptName = (request.department as any)?.name || "Unknown"
                if (!deptStats[deptName]) {
                    deptStats[deptName] = {
                        count: 0,
                        avgTime: 0,
                        totalTime: 0,
                        breaches: 0,
                    }
                }
                deptStats[deptName].count++
                deptStats[deptName].totalTime += totalTime
                if (totalTime > 72 * 60 * 60 * 1000) {
                    deptStats[deptName].breaches++
                }
            }

            // Calculate averages
            if (endorsementCount > 0) {
                metrics.avgTimes.requestToEndorsement = Math.round(
                    totalRequestToEndorsement /
                        endorsementCount /
                        (60 * 60 * 1000)
                ) // hours
            }

            if (approvalCount > 0) {
                metrics.avgTimes.endorsementToApproval = Math.round(
                    totalEndorsementToApproval /
                        approvalCount /
                        (60 * 60 * 1000)
                ) // hours
            }

            if (requests.length > 0) {
                metrics.avgTimes.requestToFinalDecision = Math.round(
                    totalRequestToFinal / requests.length / (60 * 60 * 1000)
                ) // hours

                // Calculate breach rates as percentages
                metrics.breachRates.endorsement48h = Math.round(
                    (metrics.breachRates.endorsement48h / endorsementCount) *
                        100
                )
                metrics.breachRates.approval48h = Math.round(
                    (metrics.breachRates.approval48h / approvalCount) * 100
                )
                metrics.breachRates.total72h = Math.round(
                    (metrics.breachRates.total72h / requests.length) * 100
                )
            }

            // Process approver stats
            for (const approverId in approverStats) {
                const stats = approverStats[approverId]
                stats.avgTime = Math.round(
                    stats.totalTime / stats.count / (60 * 60 * 1000)
                ) // hours
                stats.breachRate = Math.round(
                    (stats.breaches / stats.count) * 100
                )
                delete stats.totalTime // Clean up
            }
            metrics.byApprover = Object.values(approverStats).sort(
                (a: any, b: any) => b.avgTime - a.avgTime
            )

            // Process department stats
            for (const dept in deptStats) {
                const stats = deptStats[dept]
                stats.avgTime = Math.round(
                    stats.totalTime / stats.count / (60 * 60 * 1000)
                ) // hours
                stats.breachRate = Math.round(
                    (stats.breaches / stats.count) * 100
                )
                delete stats.totalTime
            }
            metrics.byDepartment = Object.entries(deptStats)
                .map(([name, stats]) => ({
                    department: name,
                    ...(stats as any),
                }))
                .sort((a, b) => b.avgTime - a.avgTime)

            // Identify bottlenecks
            if (metrics.avgTimes.requestToEndorsement > 24) {
                metrics.bottlenecks.push({
                    stage: "Endorsement",
                    avgTime: metrics.avgTimes.requestToEndorsement,
                    message:
                        "Endorsement stage taking longer than 24 hours on average",
                })
            }

            if (metrics.avgTimes.endorsementToApproval > 24) {
                metrics.bottlenecks.push({
                    stage: "Approval",
                    avgTime: metrics.avgTimes.endorsementToApproval,
                    message:
                        "Approval stage taking longer than 24 hours on average",
                })
            }

            return successResponseObject(
                "Approvals SLA report generated successfully",
                {
                    period: { start, end },
                    filters: { departmentId, approverPositionId },
                    metrics,
                    recommendations: this.generateSLARecommendations(metrics),
                }
            )
        } catch (error) {
            console.error("Error generating approvals SLA report:", error)
            return errorResponseObject(
                "Failed to generate approvals SLA report"
            )
        }
    }

    /**
     * Utilization Report
     * GET /api/reports/utilization
     */
    static async getUtilizationReport(req: Request): Promise<ResponseObject> {
        try {
            const { year, departmentId, staffId, leaveType } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view utilization report"
                )
            }

            const yearNum = year ? Number(year) : new Date().getFullYear()

            // Build query
            const balanceQuery: any = { year: yearNum }

            if (staffId) {
                balanceQuery.staff = staffId
            }

            if (
                leaveType &&
                Object.values(LeaveTypes).includes(leaveType as LeaveTypes)
            ) {
                balanceQuery.leaveType = leaveType
            }

            // Get balances
            let balances = await LeaveBalance.find(balanceQuery)
                .populate({
                    path: "staff",
                    select: "name staffId department status",
                    populate: {
                        path: "department",
                        select: "name",
                    },
                })
                .lean()

            // Filter by department if specified
            if (departmentId) {
                balances = balances.filter(
                    (b) =>
                        (b.staff as any).department?._id?.toString() ===
                        departmentId
                )
            }

            // Calculate utilization metrics
            const utilization = {
                year: yearNum,
                overall: {
                    totalAllocated: 0,
                    totalUsed: 0,
                    totalRemaining: 0,
                    utilizationRate: 0,
                },
                byLeaveType: {} as Record<string, any>,
                topConsumers: [] as any[],
                underutilized: [] as any[],
                departmentComparisons: {},
                yearToDateTrend: [] as any[],
                recommendations: [] as any[],
            }

            const staffUtilization: any = {}
            const deptUtilization: any = {}

            // Process balances
            for (const balance of balances) {
                const staff = balance.staff as any
                const deptName = staff.department?.name || "No Department"

                // Overall stats
                utilization.overall.totalAllocated += balance.allocated
                utilization.overall.totalUsed += balance.used
                utilization.overall.totalRemaining += balance.remaining

                // By leave type
                if (!utilization.byLeaveType[balance.leaveType]) {
                    utilization.byLeaveType[balance.leaveType] = {
                        allocated: 0,
                        used: 0,
                        remaining: 0,
                        utilizationRate: 0,
                        staffCount: 0,
                    }
                }
                utilization.byLeaveType[balance.leaveType].allocated +=
                    balance.allocated
                utilization.byLeaveType[balance.leaveType].used += balance.used
                utilization.byLeaveType[balance.leaveType].remaining +=
                    balance.remaining
                utilization.byLeaveType[balance.leaveType].staffCount++

                // Staff utilization
                if (!staffUtilization[staff._id]) {
                    staffUtilization[staff._id] = {
                        staff: {
                            id: staff._id,
                            name: staff.name,
                            staffId: staff.staffId,
                            department: deptName,
                        },
                        totalAllocated: 0,
                        totalUsed: 0,
                        utilizationRate: 0,
                        byType: {} as Record<string, any>,
                    }
                }
                staffUtilization[staff._id].totalAllocated += balance.allocated
                staffUtilization[staff._id].totalUsed += balance.used
                staffUtilization[staff._id].byType[balance.leaveType] = {
                    allocated: balance.allocated,
                    used: balance.used,
                    rate:
                        balance.allocated > 0
                            ? Math.round(
                                  (balance.used / balance.allocated) * 100
                              )
                            : 0,
                }

                // Department utilization
                if (!deptUtilization[deptName]) {
                    deptUtilization[deptName] = {
                        allocated: 0,
                        used: 0,
                        staffCount: new Set(),
                        byType: {} as Record<string, any>,
                    }
                }
                deptUtilization[deptName].allocated += balance.allocated
                deptUtilization[deptName].used += balance.used
                deptUtilization[deptName].staffCount.add(staff._id.toString())

                if (!deptUtilization[deptName].byType[balance.leaveType]) {
                    deptUtilization[deptName].byType[balance.leaveType] = {
                        allocated: 0,
                        used: 0,
                    }
                }
                deptUtilization[deptName].byType[balance.leaveType].allocated +=
                    balance.allocated
                deptUtilization[deptName].byType[balance.leaveType].used +=
                    balance.used
            }

            // Calculate rates
            if (utilization.overall.totalAllocated > 0) {
                utilization.overall.utilizationRate = Math.round(
                    (utilization.overall.totalUsed /
                        utilization.overall.totalAllocated) *
                        100
                )
            }

            for (const type in utilization.byLeaveType) {
                const typeUtil = utilization.byLeaveType[type]
                if (typeUtil.allocated > 0) {
                    typeUtil.utilizationRate = Math.round(
                        (typeUtil.used / typeUtil.allocated) * 100
                    )
                }
            }

            // Process staff utilization
            for (const staffId in staffUtilization) {
                const util = staffUtilization[staffId]
                if (util.totalAllocated > 0) {
                    util.utilizationRate = Math.round(
                        (util.totalUsed / util.totalAllocated) * 100
                    )
                }
            }

            // Top consumers
            utilization.topConsumers = Object.values(staffUtilization)
                .sort((a: any, b: any) => b.utilizationRate - a.utilizationRate)
                .slice(0, 10)
                .map((s: any) => ({
                    staff: s.staff,
                    utilizationRate: s.utilizationRate,
                    daysUsed: s.totalUsed,
                    daysAllocated: s.totalAllocated,
                }))

            // Underutilized staff (less than 50% utilization)
            utilization.underutilized = Object.values(staffUtilization)
                .filter((s: any) => s.utilizationRate < 50)
                .sort((a: any, b: any) => a.utilizationRate - b.utilizationRate)
                .slice(0, 10)
                .map((s: any) => ({
                    staff: s.staff,
                    utilizationRate: s.utilizationRate,
                    daysUsed: s.totalUsed,
                    daysAllocated: s.totalAllocated,
                    daysRemaining: s.totalAllocated - s.totalUsed,
                }))

            // Department comparisons
            for (const dept in deptUtilization) {
                const deptData: any = deptUtilization[dept]
                ;(utilization.departmentComparisons as any)[dept] = {
                    staffCount: deptData.staffCount.size,
                    allocated: deptData.allocated,
                    used: deptData.used,
                    utilizationRate:
                        deptData.allocated > 0
                            ? Math.round(
                                  (deptData.used / deptData.allocated) * 100
                              )
                            : 0,
                    avgPerStaff:
                        deptData.staffCount.size > 0
                            ? Math.round(
                                  deptData.used / deptData.staffCount.size
                              )
                            : 0,
                }
            }

            // Generate recommendations
            if (utilization.overall.utilizationRate < 60) {
                utilization.recommendations.push({
                    type: "LOW_UTILIZATION",
                    message:
                        "Overall leave utilization is below 60%. Consider promoting work-life balance initiatives.",
                })
            }

            if (utilization.overall.utilizationRate > 90) {
                utilization.recommendations.push({
                    type: "HIGH_UTILIZATION",
                    message:
                        "Leave utilization is very high. Monitor for potential burnout risks.",
                })
            }

            if (utilization.underutilized.length > 5) {
                utilization.recommendations.push({
                    type: "MANY_UNDERUTILIZED",
                    message: `${utilization.underutilized.length} staff members have used less than 50% of their leave. Consider individual follow-ups.`,
                })
            }

            // Year to date trend (monthly) - based on when leaves actually occurred
            const currentMonth = new Date().getMonth() + 1
            for (let month = 1; month <= currentMonth; month++) {
                const monthStart = new Date(yearNum, month - 1, 1)
                const monthEnd = new Date(yearNum, month, 0) // Last day of the month
                
                const monthlyRequests = await LeaveRequest.countDocuments({
                    $or: [
                        // Leave starts within this month
                        { startDate: { $gte: monthStart, $lte: monthEnd } },
                        // Leave ends within this month
                        { endDate: { $gte: monthStart, $lte: monthEnd } },
                        // Leave spans the entire month
                        { startDate: { $lte: monthStart }, endDate: { $gte: monthEnd } }
                    ],
                    status: LeaveStatus.APPROVED,
                })

                utilization.yearToDateTrend.push({
                    month: new Date(yearNum, month - 1, 1).toLocaleString(
                        "default",
                        { month: "short" }
                    ),
                    requests: monthlyRequests,
                })
            }

            return successResponseObject(
                "Utilization report generated successfully",
                {
                    filters: {
                        year: yearNum,
                        departmentId,
                        staffId,
                        leaveType,
                    },
                    utilization,
                }
            )
        } catch (error) {
            console.error("Error generating utilization report:", error)
            return errorResponseObject("Failed to generate utilization report")
        }
    }

    /**
     * Department Summary Report
     * GET /api/reports/department-summary
     */
    static async getDepartmentSummaryReport(
        req: Request
    ): Promise<ResponseObject> {
        try {
            const { startDate, endDate, departmentId } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN") &&
                !user?.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to view department summary report"
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

            // Get departments
            let departments = []
            if (departmentId) {
                // Check manager scope if needed
                if (
                    user?.permissions?.includes("MANAGER") &&
                    !user?.permissions?.includes("HR") &&
                    !user?.permissions?.includes("ADMIN")
                ) {
                    const managerDept = await Department.findOne({
                        head: user._id,
                        _id: departmentId,
                    })

                    if (!managerDept) {
                        return errorResponseObject(
                            "Unauthorized to view this department's data"
                        )
                    }
                }

                const dept = await Department.findById(departmentId)
                if (dept) departments.push(dept)
            } else {
                departments = await Department.find({})
            }

            const summaries = []

            for (const dept of departments) {
                // Get staff count
                const staffCount = await Staff.countDocuments({
                    department: dept._id,
                    status: "active",
                })

                // Get leave requests for department - filter by actual leave dates
                const leaveRequests = await LeaveRequest.find({
                    department: dept._id,
                    $or: [
                        // Leave starts within the date range
                        { startDate: { $gte: start, $lte: end } },
                        // Leave ends within the date range
                        { endDate: { $gte: start, $lte: end } },
                        // Leave spans the entire date range
                        { startDate: { $lte: start }, endDate: { $gte: end } }
                    ],
                }).lean()

                // Calculate statistics
                const stats = {
                    department: {
                        id: dept._id,
                        name: dept.name,
                    },
                    staffCount,
                    period: { start, end },
                    requests: {
                        total: leaveRequests.length,
                        byStatus: {
                            [LeaveStatus.PENDING]: 0,
                            [LeaveStatus.ENDORSED]: 0,
                            [LeaveStatus.APPROVED]: 0,
                            [LeaveStatus.REJECTED]: 0,
                            [LeaveStatus.CANCELLED]: 0,
                            [LeaveStatus.WITHDRAWN]: 0,
                        },
                        byType: {} as Record<string, any>,
                    },
                    totalStaffDays: 0,
                    coverage: {
                        averageDaysPerStaff: 0,
                        peakDays: [] as any[],
                    },
                    approvalMetrics: {
                        approvalRate: 0,
                        rejectionRate: 0,
                        avgProcessingTime: 0,
                    },
                }

                // Process requests
                const dailyCoverage: any = {}
                let totalProcessingTime = 0
                let processedCount = 0

                for (const request of leaveRequests) {
                    // By status
                    ;(stats.requests.byStatus as any)[request.status]++

                    // By type
                    if (!stats.requests.byType[request.leaveType]) {
                        stats.requests.byType[request.leaveType] = {
                            count: 0,
                            days: 0,
                        }
                    }
                    stats.requests.byType[request.leaveType].count++
                    stats.requests.byType[request.leaveType].days +=
                        request.workingDays

                    // Total days
                    if (request.status === LeaveStatus.APPROVED) {
                        stats.totalStaffDays += request.workingDays

                        // Track daily coverage for approved leaves
                        const leaveStart = new Date(request.startDate)
                        const leaveEnd = new Date(request.endDate)
                        const current = new Date(leaveStart)

                        while (current <= leaveEnd) {
                            const dateKey = current.toISOString().split("T")[0]
                            dailyCoverage[dateKey] =
                                (dailyCoverage[dateKey] || 0) + 1
                            current.setDate(current.getDate() + 1)
                        }
                    }

                    // Processing time
                    if (
                        request.status === LeaveStatus.APPROVED ||
                        request.status === LeaveStatus.REJECTED
                    ) {
                        const created = new Date(
                            request.createdAt || new Date()
                        ).getTime()
                        const decided = request.approval?.at
                            ? new Date(request.approval.at).getTime()
                            : request.endorsement?.at
                            ? new Date(request.endorsement.at).getTime()
                            : created

                        totalProcessingTime += decided - created
                        processedCount++
                    }
                }

                // Calculate metrics
                if (staffCount > 0) {
                    stats.coverage.averageDaysPerStaff =
                        Math.round((stats.totalStaffDays / staffCount) * 10) /
                        10
                }

                // Find peak days
                const sortedDays = Object.entries(dailyCoverage)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 5)
                stats.coverage.peakDays = sortedDays.map(([date, count]) => ({
                    date,
                    staffOnLeave: count,
                }))

                // Approval metrics
                const totalDecided =
                    (stats.requests.byStatus as any)[LeaveStatus.APPROVED] +
                    (stats.requests.byStatus as any)[LeaveStatus.REJECTED]
                if (totalDecided > 0) {
                    stats.approvalMetrics.approvalRate = Math.round(
                        ((stats.requests.byStatus as any)[LeaveStatus.APPROVED] / totalDecided) * 100
                    )
                    stats.approvalMetrics.rejectionRate = Math.round(
                        ((stats.requests.byStatus as any)[LeaveStatus.REJECTED] / totalDecided) * 100
                    )
                }

                if (processedCount > 0) {
                    stats.approvalMetrics.avgProcessingTime = Math.round(
                        totalProcessingTime / processedCount / (60 * 60 * 1000)
                    ) // hours
                }

                summaries.push(stats)
            }

            // Overall statistics
            const overall = {
                totalDepartments: summaries.length,
                totalStaffDays: summaries.reduce(
                    (sum, s) => sum + s.totalStaffDays,
                    0
                ),
                totalRequests: summaries.reduce(
                    (sum, s) => sum + s.requests.total,
                    0
                ),
                avgRequestsPerDept:
                    summaries.length > 0
                        ? Math.round(
                              summaries.reduce(
                                  (sum, s) => sum + s.requests.total,
                                  0
                              ) / summaries.length
                          )
                        : 0,
            }

            return successResponseObject(
                "Department summary report generated successfully",
                {
                    period: { start, end },
                    overall,
                    departments: summaries,
                }
            )
        } catch (error) {
            console.error("Error generating department summary report:", error)
            return errorResponseObject(
                "Failed to generate department summary report"
            )
        }
    }

    /**
     * Year-End Report
     * GET /api/reports/year-end
     */
    static async getYearEndReport(req: Request): Promise<ResponseObject> {
        try {
            const { year } = req.query
            const user = (req as any).user

            // Check permissions
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to view year-end report"
                )
            }

            const yearNum = year ? Number(year) : new Date().getFullYear()
            const nextYear = yearNum + 1

            // Get all balances for the year
            const balances = await LeaveBalance.find({ year: yearNum })
                .populate("staff", "name staffId email department gender")
                .lean()

            // Get pending leaves crossing year boundary
            const crossingLeaves = await LeaveRequest.find({
                status: LeaveStatus.APPROVED,
                startDate: { $lte: new Date(yearNum, 11, 31) },
                endDate: { $gte: new Date(nextYear, 0, 1) },
            })
                .populate("staff", "name staffId")
                .lean()

            // Process balances by staff
            const staffBalances: any = {}
            const resetPreview = {
                annual: [] as any[],
                others: [] as any[],
            }

            for (const balance of balances) {
                const staff = balance.staff as any
                const staffId = staff._id.toString()

                if (!staffBalances[staffId]) {
                    staffBalances[staffId] = {
                        staff: {
                            id: staff._id,
                            name: staff.name,
                            staffId: staff.staffId,
                            department: staff.department,
                        },
                        balances: [],
                        totals: {
                            allocated: 0,
                            used: 0,
                            remaining: 0,
                        },
                    }
                }

                const balanceInfo = {
                    leaveType: balance.leaveType,
                    total: balance.allocated,
                    used: balance.used,
                    remaining: balance.remaining,
                    yearEndStatus:
                        balance.remaining > 0
                            ? "UNUSED_BALANCE"
                            : "FULLY_UTILIZED",
                    nextYearReset:
                        balance.leaveType === LeaveTypes.ANNUAL
                            ? { to: 0, loss: balance.remaining }
                            : {
                                  to:
                                      (balance as any).yearlyCap ||
                                      balance.allocated,
                                  retained: 0,
                              },
                }

                staffBalances[staffId].balances.push(balanceInfo)
                staffBalances[staffId].totals.allocated += balance.allocated
                staffBalances[staffId].totals.used += balance.used
                staffBalances[staffId].totals.remaining += balance.remaining

                // Reset preview
                if (
                    balance.leaveType === LeaveTypes.ANNUAL &&
                    balance.remaining > 0
                ) {
                    resetPreview.annual.push({
                        staff: staff.name,
                        staffId: staff.staffId,
                        remaining: balance.remaining,
                        willLose: balance.remaining,
                    })
                } else if (balance.remaining !== (balance as any).yearlyCap) {
                    resetPreview.others.push({
                        staff: staff.name,
                        staffId: staff.staffId,
                        leaveType: balance.leaveType,
                        currentRemaining: balance.remaining,
                        willResetTo:
                            (balance as any).yearlyCap || balance.allocated,
                    })
                }
            }

            // Calculate summary statistics
            const summary = {
                year: yearNum,
                totalStaff: Object.keys(staffBalances).length,
                totalDaysAllocated: 0,
                totalDaysUsed: 0,
                totalDaysRemaining: 0,
                utilizationRate: 0,
                byLeaveType: {} as Record<string, any>,
            }

            for (const staffId in staffBalances) {
                const staffData = staffBalances[staffId]
                summary.totalDaysAllocated += staffData.totals.allocated
                summary.totalDaysUsed += staffData.totals.used
                summary.totalDaysRemaining += staffData.totals.remaining

                for (const balance of staffData.balances) {
                    if (!summary.byLeaveType[balance.leaveType]) {
                        summary.byLeaveType[balance.leaveType] = {
                            allocated: 0,
                            used: 0,
                            remaining: 0,
                            staffCount: 0,
                        }
                    }
                    summary.byLeaveType[balance.leaveType].allocated +=
                        balance.total
                    summary.byLeaveType[balance.leaveType].used += balance.used
                    summary.byLeaveType[balance.leaveType].remaining +=
                        balance.remaining
                    summary.byLeaveType[balance.leaveType].staffCount++
                }
            }

            if (summary.totalDaysAllocated > 0) {
                summary.utilizationRate = Math.round(
                    (summary.totalDaysUsed / summary.totalDaysAllocated) * 100
                )
            }

            // Recommendations
            const recommendations = []

            if (resetPreview.annual.length > 0) {
                const totalLoss = resetPreview.annual.reduce(
                    (sum: number, s: any) => sum + s.willLose,
                    0
                )
                recommendations.push({
                    type: "ANNUAL_LEAVE_LOSS",
                    priority: "HIGH",
                    message: `${resetPreview.annual.length} staff will lose ${totalLoss} days of unused annual leave`,
                    action: "Consider sending reminders to utilize remaining leave or review carry-forward policy",
                })
            }

            if (crossingLeaves.length > 0) {
                recommendations.push({
                    type: "CROSSING_LEAVES",
                    priority: "MEDIUM",
                    message: `${crossingLeaves.length} approved leaves cross into next year`,
                    action: "Ensure proper balance tracking for cross-year leaves",
                })
            }

            if (summary.utilizationRate < 60) {
                recommendations.push({
                    type: "LOW_UTILIZATION",
                    priority: "MEDIUM",
                    message: "Overall leave utilization is below 60%",
                    action: "Review leave policies and encourage work-life balance",
                })
            }

            recommendations.push({
                type: "YEAR_END_PROCESSING",
                priority: "HIGH",
                message: "Prepare for year-end balance reset",
                action: "Run balance initialization for next year after December 31",
            })

            return successResponseObject(
                "Year-end report generated successfully",
                {
                    summary,
                    resetPreview: {
                        annualLeaveReset: {
                            affectedStaff: resetPreview.annual.length,
                            totalDaysToLose: resetPreview.annual.reduce(
                                (sum: number, s: any) => sum + s.willLose,
                                0
                            ),
                            details: resetPreview.annual.slice(0, 20), // Limit for response
                        },
                        otherLeavesReset: {
                            affectedStaff: resetPreview.others.length,
                            details: resetPreview.others.slice(0, 20),
                        },
                    },
                    crossingLeaves: {
                        count: crossingLeaves.length,
                        details: crossingLeaves.map((l) => ({
                            staff: (l.staff as any).name,
                            staffId: (l.staff as any).staffId,
                            leaveType: l.leaveType,
                            startDate: l.startDate,
                            endDate: l.endDate,
                            daysInNextYear: this.calculateDaysInNextYear(
                                l.endDate,
                                nextYear
                            ),
                        })),
                    },
                    recommendations,
                    nextSteps: [
                        "Review staff with high unused balances",
                        "Send year-end leave utilization reminders",
                        "Prepare next year's leave balance initialization",
                        "Archive current year's data for compliance",
                    ],
                }
            )
        } catch (error) {
            console.error("Error generating year-end report:", error)
            return errorResponseObject("Failed to generate year-end report")
        }
    }

    // Helper Methods
    private static getWeekNumber(date: Date): number {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const pastDaysOfYear =
            (date.getTime() - firstDayOfYear.getTime()) / 86400000
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
    }

    private static calculateDaysInNextYear(
        endDate: Date,
        nextYear: number
    ): number {
        const nextYearStart = new Date(nextYear, 0, 1)
        if (endDate < nextYearStart) return 0

        const diffTime = endDate.getTime() - nextYearStart.getTime()
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    }

    private static generateSLARecommendations(metrics: any): string[] {
        const recommendations = []

        if (metrics.avgTimes.requestToEndorsement > 24) {
            recommendations.push(
                "Consider setting up automatic notifications for pending endorsements"
            )
        }

        if (metrics.avgTimes.endorsementToApproval > 24) {
            recommendations.push(
                "Review approval workflow to reduce delays between endorsement and approval"
            )
        }

        if (metrics.breachRates.total72h > 20) {
            recommendations.push(
                "Over 20% of requests exceed 72-hour SLA. Consider process improvements"
            )
        }

        if (metrics.bottlenecks.length > 0) {
            recommendations.push(
                "Address identified bottlenecks to improve overall processing time"
            )
        }

        if (
            metrics.byApprover.length > 0 &&
            metrics.byApprover[0].avgTime > 48
        ) {
            recommendations.push(
                "Provide training or support to approvers with longest processing times"
            )
        }

        return recommendations
    }

    private static convertLeaveRequestsToCSV(requests: any[]): string {
        if (requests.length === 0) return ""

        const headers = [
            "Staff ID",
            "Staff Name",
            "Department",
            "Leave Type",
            "Start Date",
            "End Date",
            "Working Days",
            "Status",
            "Request Date",
            "Endorsement Date",
            "Approval Date",
        ]

        const rows = requests.map((r) => [
            (r.staff as any)?.staffId || "",
            (r.staff as any)?.name || "",
            (r.department as any)?.name || "",
            r.leaveType,
            new Date(r.startDate).toLocaleDateString(),
            new Date(r.endDate).toLocaleDateString(),
            r.workingDays,
            r.status,
            new Date(r.createdAt).toLocaleDateString(),
            r.endorsement?.at
                ? new Date(r.endorsement.at).toLocaleDateString()
                : "",
            r.approval?.at ? new Date(r.approval.at).toLocaleDateString() : "",
        ])

        return [headers.join(","), ...rows.map((row) => row.join(","))].join(
            "\n"
        )
    }

    private static convertBalancesToCSV(balances: any[]): string {
        if (balances.length === 0) return ""

        const headers = [
            "Staff ID",
            "Staff Name",
            "Department",
            "Leave Type",
            "Total",
            "Used",
            "Remaining",
            "Available for Request",
            "Utilization %",
            "Low Balance",
        ]

        const rows = balances.map((b) => [
            b.staff.staffId,
            b.staff.name,
            b.staff.department || "",
            b.leaveType,
            b.total,
            b.used,
            b.remaining,
            b.availableForRequest,
            b.utilizationPercent,
            b.isLowBalance ? "Yes" : "No",
        ])

        return [headers.join(","), ...rows.map((row) => row.join(","))].join(
            "\n"
        )
    }
}

export default ReportController
