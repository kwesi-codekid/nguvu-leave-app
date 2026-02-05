import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import LeaveRequest from "../models/leave-request.model"
import LeaveBalance from "../models/leave-balance.model"
import Staff from "../models/staff.model"
import Department from "../models/department.model"
import Holiday from "../models/holiday.model"
import { LeaveStatus, LeaveTypes } from "../utils/types"
import { DateTime } from "luxon"

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

interface LeaveRecommendation {
    suggestedDates: Array<{
        startDate: string
        endDate: string
        reason: string
        score: number
    }>
    insights: string[]
    warnings: string[]
}

interface PatternAnalysis {
    patterns: Array<{
        type: string
        description: string
        frequency: string
        significance: "low" | "medium" | "high"
    }>
    anomalies: Array<{
        description: string
        staffInvolved?: string[]
        recommendedAction: string
    }>
    trends: Array<{
        trend: string
        direction: "increasing" | "decreasing" | "stable"
        insight: string
    }>
    summary: string
}

interface ReportSummary {
    executiveSummary: string
    keyFindings: string[]
    recommendations: string[]
    departmentHighlights: Array<{
        department: string
        highlight: string
    }>
    riskAreas: string[]
}

interface NLQueryResult {
    interpretation: string
    data: any[]
    summary: string
    visualizationType?: "table" | "chart" | "list" | "cards"
    followUpQuestions?: string[]
}

export class AIService {
    private static model: GenerativeModel

    private static getModel(): GenerativeModel {
        if (!this.model) {
            this.model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 8192,
                },
            })
        }
        return this.model
    }

    /**
     * Smart Leave Recommendations
     * Suggests optimal leave dates based on team availability, holidays, and patterns
     */
    static async getLeaveRecommendations(
        staffId: string,
        leaveType: string,
        preferredMonth?: number,
        numberOfDays?: number
    ): Promise<LeaveRecommendation> {
        try {
            // Gather context data
            const staff = await Staff.findById(staffId)
                .populate("department")
                .lean()

            if (!staff) {
                throw new Error("Staff not found")
            }

            const currentYear = new Date().getFullYear()

            // Get staff's leave balance
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                year: currentYear,
                leaveType,
            }).lean()

            // Get upcoming holidays
            const holidays = await Holiday.find({
                $or: [
                    { type: "fixed" },
                    {
                        type: "varying",
                        startDate: { $gte: new Date() },
                    },
                ],
            }).lean()

            // Get team members' approved leaves
            const teamLeaves = await LeaveRequest.find({
                department: staff.department,
                status: LeaveStatus.APPROVED,
                startDate: { $gte: new Date() },
            })
                .populate("staff", "name")
                .lean()

            // Get staff's past leave patterns
            const pastLeaves = await LeaveRequest.find({
                staff: staffId,
                status: LeaveStatus.APPROVED,
                startDate: {
                    $gte: new Date(currentYear - 1, 0, 1),
                },
            }).lean()

            // Prepare context for AI
            const context = {
                staffName: staff.name,
                department: (staff.department as any)?.name || "Unknown",
                leaveType,
                availableBalance: balance
                    ? balance.allocated - balance.used
                    : 0,
                requestedDays: numberOfDays || 5,
                preferredMonth: preferredMonth
                    ? DateTime.local().set({ month: preferredMonth }).monthLong
                    : "any month",
                upcomingHolidays: holidays.map((h) => ({
                    name: h.name,
                    date: h.startDate?.toISOString().split("T")[0],
                })),
                teamLeavesScheduled: teamLeaves.map((l) => ({
                    staffName: (l.staff as any)?.name,
                    dates: `${l.startDate.toISOString().split("T")[0]} to ${l.endDate.toISOString().split("T")[0]}`,
                })),
                pastLeavePatterns: pastLeaves.map((l) => ({
                    type: l.leaveType,
                    startMonth: new Date(l.startDate).getMonth() + 1,
                    duration: l.workingDays,
                })),
                currentDate: new Date().toISOString().split("T")[0],
            }

            const prompt = `You are an AI assistant for a leave management system. Analyze the following data and suggest optimal leave dates.

CONTEXT:
- Staff: ${context.staffName}
- Department: ${context.department}
- Leave Type Requested: ${context.leaveType}
- Available Balance: ${context.availableBalance} days
- Requested Duration: ${context.requestedDays} days
- Preferred Time: ${context.preferredMonth}
- Current Date: ${context.currentDate}

UPCOMING HOLIDAYS:
${JSON.stringify(context.upcomingHolidays, null, 2)}

TEAM LEAVES ALREADY SCHEDULED:
${JSON.stringify(context.teamLeavesScheduled, null, 2)}

STAFF'S PAST LEAVE PATTERNS:
${JSON.stringify(context.pastLeavePatterns, null, 2)}

Based on this data, provide leave recommendations in the following JSON format:
{
    "suggestedDates": [
        {
            "startDate": "YYYY-MM-DD",
            "endDate": "YYYY-MM-DD",
            "reason": "Why this period is recommended",
            "score": 85
        }
    ],
    "insights": [
        "Insight about their leave patterns or team dynamics"
    ],
    "warnings": [
        "Any concerns or things to consider"
    ]
}

Consider:
1. Minimize team conflicts (avoid when many teammates are on leave)
2. Maximize value by combining with holidays/weekends for longer breaks
3. Staff's historical patterns (if they prefer certain times)
4. Balance availability
5. Workload distribution across the year

Provide 3 suggestions ranked by score (0-100). Return ONLY valid JSON.`

            const model = this.getModel()
            const result = await model.generateContent(prompt)
            const response = result.response.text()

            // Parse JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                throw new Error("Invalid AI response format")
            }

            return JSON.parse(jsonMatch[0]) as LeaveRecommendation
        } catch (error) {
            console.error("AI Recommendation Error:", error)
            throw error
        }
    }

    /**
     * Leave Pattern Analysis
     * Identifies trends and anomalies in leave data
     */
    static async analyzeLeavePatterns(
        scope: "company" | "department" | "staff",
        scopeId?: string,
        timeframeDays: number = 365
    ): Promise<PatternAnalysis> {
        try {
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - timeframeDays)

            // Build query based on scope
            const query: any = {
                createdAt: { $gte: startDate },
            }

            if (scope === "department" && scopeId) {
                query.department = scopeId
            } else if (scope === "staff" && scopeId) {
                query.staff = scopeId
            }

            // Get leave requests
            const leaveRequests = await LeaveRequest.find(query)
                .populate("staff", "name staffId")
                .populate("department", "name")
                .lean()

            // Aggregate data for analysis
            const leavesByType: Record<string, number> = {}
            const leavesByMonth: Record<number, number> = {}
            const leavesByDayOfWeek: Record<number, number> = {}
            const leavesByStatus: Record<string, number> = {}
            const staffLeaveCount: Record<string, number> = {}
            const departmentLeaveCount: Record<string, number> = {}

            leaveRequests.forEach((leave) => {
                // By type
                leavesByType[leave.leaveType] =
                    (leavesByType[leave.leaveType] || 0) + 1

                // By month
                const month = new Date(leave.startDate).getMonth()
                leavesByMonth[month] = (leavesByMonth[month] || 0) + 1

                // By day of week (start date)
                const dayOfWeek = new Date(leave.startDate).getDay()
                leavesByDayOfWeek[dayOfWeek] =
                    (leavesByDayOfWeek[dayOfWeek] || 0) + 1

                // By status
                leavesByStatus[leave.status] =
                    (leavesByStatus[leave.status] || 0) + 1

                // By staff
                const staffName = (leave.staff as any)?.name || "Unknown"
                staffLeaveCount[staffName] =
                    (staffLeaveCount[staffName] || 0) + leave.workingDays

                // By department
                const deptName = (leave.department as any)?.name || "Unknown"
                departmentLeaveCount[deptName] =
                    (departmentLeaveCount[deptName] || 0) + leave.workingDays
            })

            // Get staff who haven't taken leave
            const allStaff = await Staff.find({ status: "active" })
                .select("name staffId")
                .lean()
            const staffWithLeave = new Set(
                leaveRequests.map((l) => (l.staff as any)?._id?.toString())
            )
            const staffWithoutLeave = allStaff.filter(
                (s) => !staffWithLeave.has(s._id.toString())
            )

            const analysisData = {
                totalLeaveRequests: leaveRequests.length,
                timeframeDays,
                scope,
                leavesByType,
                leavesByMonth,
                leavesByDayOfWeek,
                leavesByStatus,
                topLeaveUsers: Object.entries(staffLeaveCount)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10),
                departmentBreakdown: Object.entries(departmentLeaveCount)
                    .sort((a, b) => b[1] - a[1]),
                staffWithoutLeave: staffWithoutLeave.map((s) => s.name),
                averageLeaveDuration:
                    leaveRequests.reduce((sum, l) => sum + l.workingDays, 0) /
                    (leaveRequests.length || 1),
            }

            const prompt = `You are an HR analytics AI. Analyze the following leave data and identify patterns, anomalies, and trends.

LEAVE DATA ANALYSIS (${scope} level, last ${timeframeDays} days):
${JSON.stringify(analysisData, null, 2)}

Provide analysis in the following JSON format:
{
    "patterns": [
        {
            "type": "seasonal|behavioral|departmental|type-based",
            "description": "Clear description of the pattern",
            "frequency": "weekly|monthly|quarterly|yearly",
            "significance": "low|medium|high"
        }
    ],
    "anomalies": [
        {
            "description": "Description of unusual pattern or behavior",
            "staffInvolved": ["names if applicable"],
            "recommendedAction": "What HR should do"
        }
    ],
    "trends": [
        {
            "trend": "Name of the trend",
            "direction": "increasing|decreasing|stable",
            "insight": "What this means for the organization"
        }
    ],
    "summary": "2-3 sentence executive summary of key findings"
}

Focus on:
1. Seasonal patterns (holidays, school breaks, etc.)
2. Day-of-week preferences (Monday/Friday patterns)
3. Staff who haven't taken leave (burnout risk)
4. Department imbalances
5. Leave type distributions
6. Rejection rates and reasons

Return ONLY valid JSON.`

            const model = this.getModel()
            const result = await model.generateContent(prompt)
            const response = result.response.text()

            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                throw new Error("Invalid AI response format")
            }

            return JSON.parse(jsonMatch[0]) as PatternAnalysis
        } catch (error) {
            console.error("AI Pattern Analysis Error:", error)
            throw error
        }
    }

    /**
     * Automated Report Generation
     * Generates AI-powered summaries of leave data
     */
    static async generateReport(
        reportType: "monthly" | "quarterly" | "annual" | "custom",
        startDate: Date,
        endDate: Date,
        departmentId?: string
    ): Promise<ReportSummary> {
        try {
            // Build query
            const query: any = {
                createdAt: { $gte: startDate, $lte: endDate },
            }

            if (departmentId) {
                query.department = departmentId
            }

            // Get leave data
            const leaveRequests = await LeaveRequest.find(query)
                .populate("staff", "name staffId")
                .populate("department", "name")
                .lean()

            // Get all departments
            const departments = await Department.find().select("name").lean()

            // Aggregate statistics
            const stats = {
                totalRequests: leaveRequests.length,
                approvedRequests: leaveRequests.filter(
                    (l) => l.status === LeaveStatus.APPROVED
                ).length,
                rejectedRequests: leaveRequests.filter(
                    (l) => l.status === LeaveStatus.REJECTED
                ).length,
                pendingRequests: leaveRequests.filter(
                    (l) =>
                        l.status === LeaveStatus.PENDING ||
                        l.status === LeaveStatus.ENDORSED
                ).length,
                totalDaysUsed: leaveRequests
                    .filter((l) => l.status === LeaveStatus.APPROVED)
                    .reduce((sum, l) => sum + l.workingDays, 0),
                byLeaveType: {} as Record<string, { count: number; days: number }>,
                byDepartment: {} as Record<string, { count: number; days: number }>,
                approvalRate: 0,
                averageProcessingTime: 0,
            }

            // Calculate by type
            leaveRequests.forEach((leave) => {
                if (!stats.byLeaveType[leave.leaveType]) {
                    stats.byLeaveType[leave.leaveType] = { count: 0, days: 0 }
                }
                stats.byLeaveType[leave.leaveType].count++
                if (leave.status === LeaveStatus.APPROVED) {
                    stats.byLeaveType[leave.leaveType].days += leave.workingDays
                }

                const deptName = (leave.department as any)?.name || "Unknown"
                if (!stats.byDepartment[deptName]) {
                    stats.byDepartment[deptName] = { count: 0, days: 0 }
                }
                stats.byDepartment[deptName].count++
                if (leave.status === LeaveStatus.APPROVED) {
                    stats.byDepartment[deptName].days += leave.workingDays
                }
            })

            // Calculate rates
            stats.approvalRate =
                stats.totalRequests > 0
                    ? Math.round(
                          (stats.approvedRequests / stats.totalRequests) * 100
                      )
                    : 0

            // Get staff utilization data
            const staffCount = await Staff.countDocuments({ status: "active" })

            const reportData = {
                reportType,
                period: {
                    start: startDate.toISOString().split("T")[0],
                    end: endDate.toISOString().split("T")[0],
                },
                totalActiveStaff: staffCount,
                totalDepartments: departments.length,
                statistics: stats,
            }

            const prompt = `You are an HR report writer AI. Generate an executive summary for the following leave management report.

REPORT DATA:
${JSON.stringify(reportData, null, 2)}

Generate a professional report summary in the following JSON format:
{
    "executiveSummary": "A 3-4 sentence executive summary highlighting key metrics and overall health of leave management",
    "keyFindings": [
        "Important finding 1",
        "Important finding 2",
        "Important finding 3",
        "Important finding 4"
    ],
    "recommendations": [
        "Actionable recommendation 1",
        "Actionable recommendation 2",
        "Actionable recommendation 3"
    ],
    "departmentHighlights": [
        {
            "department": "Department Name",
            "highlight": "Notable observation about this department"
        }
    ],
    "riskAreas": [
        "Any concerns that need management attention"
    ]
}

Consider:
1. Leave utilization rates
2. Department-specific trends
3. Approval/rejection patterns
4. Staff wellbeing indicators
5. Operational efficiency

Return ONLY valid JSON.`

            const model = this.getModel()
            const result = await model.generateContent(prompt)
            const response = result.response.text()

            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                throw new Error("Invalid AI response format")
            }

            return JSON.parse(jsonMatch[0]) as ReportSummary
        } catch (error) {
            console.error("AI Report Generation Error:", error)
            throw error
        }
    }

    /**
     * Natural Language Query
     * Interprets natural language questions and returns relevant data
     */
    static async processNaturalLanguageQuery(
        query: string,
        userId: string,
        userPermissions: string[]
    ): Promise<NLQueryResult> {
        try {
            // Get current context
            const currentDate = new Date()
            const currentYear = currentDate.getFullYear()

            // Fetch relevant base data for context
            const totalStaff = await Staff.countDocuments({ status: "active" })
            const departments = await Department.find()
                .select("name")
                .lean()
            const leaveTypes = Object.values(LeaveTypes)

            // First, use AI to understand the query and generate a response plan
            const interpretationPrompt = `You are an AI assistant for a leave management system. Interpret the following natural language query and determine what data needs to be retrieved.

USER QUERY: "${query}"

USER PERMISSIONS: ${JSON.stringify(userPermissions)}
(Users can only see data they're authorized to access based on permissions: STAFF, MANAGER, HR, ADMIN)

AVAILABLE DATA:
- Staff records (${totalStaff} active staff)
- Departments: ${departments.map((d) => d.name).join(", ")}
- Leave types: ${leaveTypes.join(", ")}
- Leave requests (with status: pending_endorsement, endorsed, approved, rejected, cancelled, withdrawn)
- Leave balances
- Holidays

Current date: ${currentDate.toISOString().split("T")[0]}

Respond in JSON format:
{
    "queryType": "staff_list|leave_data|statistics|comparison|timeline|balance",
    "interpretation": "How you understood the query",
    "dataNeeded": {
        "collection": "staff|leaveRequests|leaveBalances|holidays",
        "filters": {
            "description": "What filters to apply"
        },
        "timeframe": "specific dates or relative period if applicable",
        "aggregation": "count|sum|average|group if needed"
    },
    "suggestedVisualization": "table|chart|list|cards"
}

Return ONLY valid JSON.`

            const model = this.getModel()
            const interpretResult = await model.generateContent(interpretationPrompt)
            const interpretation = interpretResult.response.text()

            const interpretMatch = interpretation.match(/\{[\s\S]*\}/)
            if (!interpretMatch) {
                throw new Error("Could not interpret query")
            }

            const queryPlan = JSON.parse(interpretMatch[0])

            // Execute the query based on interpretation
            let data: any[] = []
            let summary = ""

            // Execute different query types
            if (queryPlan.queryType === "staff_list") {
                // Query about staff
                const sixMonthsAgo = new Date()
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

                // Get staff with their recent leave data
                const staffData = await Staff.find({ status: "active" })
                    .select("name staffId email department")
                    .populate("department", "name")
                    .lean()

                // Get leave requests for analysis
                const recentLeaves = await LeaveRequest.find({
                    status: LeaveStatus.APPROVED,
                    createdAt: { $gte: sixMonthsAgo },
                })
                    .select("staff startDate endDate workingDays")
                    .lean()

                const staffLeaveMap = new Map<string, Date>()
                recentLeaves.forEach((leave) => {
                    const staffIdStr = leave.staff.toString()
                    const existingDate = staffLeaveMap.get(staffIdStr)
                    const leaveDate = new Date(leave.startDate)
                    if (!existingDate || leaveDate > existingDate) {
                        staffLeaveMap.set(staffIdStr, leaveDate)
                    }
                })

                // Filter based on query
                if (
                    query.toLowerCase().includes("haven't taken leave") ||
                    query.toLowerCase().includes("no leave")
                ) {
                    data = staffData.filter(
                        (s) => !staffLeaveMap.has(s._id.toString())
                    )
                    summary = `Found ${data.length} staff members who haven't taken any approved leave in the last 6 months.`
                } else {
                    data = staffData
                    summary = `Found ${data.length} active staff members.`
                }
            } else if (queryPlan.queryType === "leave_data") {
                // Query about leave requests
                const queryFilter: any = {}

                if (query.toLowerCase().includes("next week")) {
                    const nextWeekStart = new Date()
                    nextWeekStart.setDate(
                        nextWeekStart.getDate() +
                            (7 - nextWeekStart.getDay() + 1)
                    )
                    const nextWeekEnd = new Date(nextWeekStart)
                    nextWeekEnd.setDate(nextWeekEnd.getDate() + 6)

                    queryFilter.status = LeaveStatus.APPROVED
                    queryFilter.$or = [
                        {
                            startDate: {
                                $gte: nextWeekStart,
                                $lte: nextWeekEnd,
                            },
                        },
                        {
                            startDate: { $lte: nextWeekStart },
                            endDate: { $gte: nextWeekStart },
                        },
                    ]
                } else if (query.toLowerCase().includes("this month")) {
                    const monthStart = new Date(
                        currentYear,
                        currentDate.getMonth(),
                        1
                    )
                    const monthEnd = new Date(
                        currentYear,
                        currentDate.getMonth() + 1,
                        0
                    )
                    queryFilter.startDate = { $gte: monthStart, $lte: monthEnd }
                } else if (query.toLowerCase().includes("pending")) {
                    queryFilter.status = {
                        $in: [LeaveStatus.PENDING, LeaveStatus.ENDORSED],
                    }
                } else if (query.toLowerCase().includes("approved")) {
                    queryFilter.status = LeaveStatus.APPROVED
                }

                data = await LeaveRequest.find(queryFilter)
                    .populate("staff", "name staffId")
                    .populate("department", "name")
                    .sort({ startDate: 1 })
                    .limit(50)
                    .lean()

                summary = `Found ${data.length} leave requests matching your query.`
            } else if (queryPlan.queryType === "statistics") {
                // Statistical queries
                const stats: any = {}

                if (query.toLowerCase().includes("department")) {
                    const deptStats = await LeaveRequest.aggregate([
                        {
                            $match: {
                                status: LeaveStatus.APPROVED,
                                startDate: {
                                    $gte: new Date(currentYear, 0, 1),
                                },
                            },
                        },
                        {
                            $group: {
                                _id: "$department",
                                totalRequests: { $sum: 1 },
                                totalDays: { $sum: "$workingDays" },
                            },
                        },
                        { $sort: { totalDays: -1 } },
                    ])

                    // Populate department names
                    for (const stat of deptStats) {
                        const dept = await Department.findById(stat._id)
                            .select("name")
                            .lean()
                        stat.departmentName = dept?.name || "Unknown"
                    }

                    data = deptStats
                    summary = `Department leave statistics for ${currentYear}.`
                } else {
                    // General stats
                    const totalRequests = await LeaveRequest.countDocuments({
                        createdAt: { $gte: new Date(currentYear, 0, 1) },
                    })
                    const approvedRequests = await LeaveRequest.countDocuments({
                        status: LeaveStatus.APPROVED,
                        createdAt: { $gte: new Date(currentYear, 0, 1) },
                    })

                    data = [
                        {
                            metric: "Total Requests (This Year)",
                            value: totalRequests,
                        },
                        {
                            metric: "Approved Requests",
                            value: approvedRequests,
                        },
                        {
                            metric: "Approval Rate",
                            value: `${Math.round((approvedRequests / totalRequests) * 100)}%`,
                        },
                    ]
                    summary = `Leave statistics for ${currentYear}.`
                }
            }

            // Generate a natural language response
            const responsePrompt = `Based on the query "${query}" and the following data, provide a brief, helpful summary.

DATA FOUND:
${JSON.stringify(data.slice(0, 20), null, 2)}
${data.length > 20 ? `\n... and ${data.length - 20} more results` : ""}

Provide a natural, conversational response that:
1. Directly answers the user's question
2. Highlights key insights
3. Suggests follow-up questions they might want to ask

Keep it concise (2-4 sentences).`

            const responseResult = await model.generateContent(responsePrompt)
            const naturalResponse = responseResult.response.text()

            return {
                interpretation: queryPlan.interpretation,
                data: data.slice(0, 50), // Limit returned data
                summary: naturalResponse,
                visualizationType: queryPlan.suggestedVisualization,
                followUpQuestions: [
                    "Show me the breakdown by department",
                    "What are the trends over the last 6 months?",
                    "Who has the most leave days remaining?",
                ],
            }
        } catch (error) {
            console.error("AI NL Query Error:", error)
            throw error
        }
    }

    /**
     * Fetch real-time system data for chat context
     */
    private static async getSystemDataContext(): Promise<string> {
        try {
            const currentYear = new Date().getFullYear()
            const currentDate = new Date()

            // Get real counts from database
            const [
                totalStaff,
                activeStaff,
                departments,
                pendingLeaves,
                endorsedLeaves,
                approvedLeavesThisYear,
                rejectedLeavesThisYear,
                totalLeavesThisYear,
                holidays,
                leaveBalances,
            ] = await Promise.all([
                Staff.countDocuments(),
                Staff.countDocuments({ status: "active" }),
                Department.find().select("name").lean(),
                LeaveRequest.countDocuments({ status: LeaveStatus.PENDING }),
                LeaveRequest.countDocuments({ status: LeaveStatus.ENDORSED }),
                LeaveRequest.countDocuments({
                    status: LeaveStatus.APPROVED,
                    createdAt: { $gte: new Date(currentYear, 0, 1) },
                }),
                LeaveRequest.countDocuments({
                    status: LeaveStatus.REJECTED,
                    createdAt: { $gte: new Date(currentYear, 0, 1) },
                }),
                LeaveRequest.countDocuments({
                    createdAt: { $gte: new Date(currentYear, 0, 1) },
                }),
                Holiday.find().select("name startDate type").lean(),
                LeaveBalance.aggregate([
                    { $match: { year: currentYear } },
                    {
                        $group: {
                            _id: "$leaveType",
                            totalAllocated: { $sum: "$allocated" },
                            totalUsed: { $sum: "$used" },
                        },
                    },
                ]),
            ])

            // Get staff currently on leave
            const staffOnLeave = await LeaveRequest.find({
                status: LeaveStatus.APPROVED,
                startDate: { $lte: currentDate },
                endDate: { $gte: currentDate },
            })
                .populate("staff", "name")
                .populate("department", "name")
                .select("staff department startDate endDate leaveType")
                .lean()

            // Get upcoming leaves (next 7 days)
            const nextWeek = new Date()
            nextWeek.setDate(nextWeek.getDate() + 7)
            const upcomingLeaves = await LeaveRequest.find({
                status: LeaveStatus.APPROVED,
                startDate: { $gt: currentDate, $lte: nextWeek },
            })
                .populate("staff", "name")
                .populate("department", "name")
                .select("staff department startDate endDate leaveType")
                .lean()

            // Get recent leave requests (last 7 days)
            const lastWeek = new Date()
            lastWeek.setDate(lastWeek.getDate() - 7)
            const recentRequests = await LeaveRequest.find({
                createdAt: { $gte: lastWeek },
            })
                .populate("staff", "name")
                .select("staff leaveType status workingDays createdAt")
                .sort({ createdAt: -1 })
                .limit(10)
                .lean()

            // Format department list
            const departmentList = departments.map((d) => d.name).join(", ")

            // Format staff on leave
            const staffOnLeaveList = staffOnLeave.map((l) => ({
                name: (l.staff as any)?.name || "Unknown",
                department: (l.department as any)?.name || "Unknown",
                leaveType: l.leaveType,
                endDate: l.endDate.toISOString().split("T")[0],
            }))

            // Format upcoming leaves
            const upcomingLeavesList = upcomingLeaves.map((l) => ({
                name: (l.staff as any)?.name || "Unknown",
                department: (l.department as any)?.name || "Unknown",
                leaveType: l.leaveType,
                startDate: l.startDate.toISOString().split("T")[0],
                endDate: l.endDate.toISOString().split("T")[0],
            }))

            // Format recent requests
            const recentRequestsList = recentRequests.map((l) => ({
                name: (l.staff as any)?.name || "Unknown",
                leaveType: l.leaveType,
                status: l.status,
                days: l.workingDays,
                date: l.createdAt.toISOString().split("T")[0],
            }))

            // Format holidays
            const holidayList = holidays.map((h) => ({
                name: h.name,
                date: h.startDate?.toISOString().split("T")[0] || "TBD",
                type: h.type,
            }))

            return `
REAL-TIME SYSTEM DATA (queried from database):
============================================

STAFF STATISTICS:
- Total Staff: ${totalStaff}
- Active Staff: ${activeStaff}
- Inactive Staff: ${totalStaff - activeStaff}

DEPARTMENTS (${departments.length} total):
${departmentList || "No departments configured"}

LEAVE REQUEST STATISTICS (${currentYear}):
- Total Requests This Year: ${totalLeavesThisYear}
- Pending Approval: ${pendingLeaves}
- Endorsed (Awaiting Final Approval): ${endorsedLeaves}
- Approved This Year: ${approvedLeavesThisYear}
- Rejected This Year: ${rejectedLeavesThisYear}
- Approval Rate: ${totalLeavesThisYear > 0 ? Math.round((approvedLeavesThisYear / totalLeavesThisYear) * 100) : 0}%

STAFF CURRENTLY ON LEAVE (${staffOnLeave.length}):
${staffOnLeaveList.length > 0 ? JSON.stringify(staffOnLeaveList, null, 2) : "No one is currently on leave"}

UPCOMING LEAVES (Next 7 Days - ${upcomingLeaves.length}):
${upcomingLeavesList.length > 0 ? JSON.stringify(upcomingLeavesList, null, 2) : "No upcoming leaves scheduled"}

RECENT LEAVE REQUESTS (Last 7 Days):
${recentRequestsList.length > 0 ? JSON.stringify(recentRequestsList, null, 2) : "No recent requests"}

HOLIDAYS CONFIGURED (${holidays.length}):
${holidayList.length > 0 ? JSON.stringify(holidayList, null, 2) : "No holidays configured"}

LEAVE BALANCE SUMMARY (${currentYear}):
${leaveBalances.length > 0 ? JSON.stringify(leaveBalances, null, 2) : "No balance data available"}
`
        } catch (error) {
            console.error("Error fetching system data:", error)
            return "\nNote: Could not fetch real-time system data. Some statistics may be unavailable.\n"
        }
    }

    /**
     * Chat with AI about leave data
     * More conversational interaction - NOW WITH REAL DATABASE DATA
     */
    static async chat(
        message: string,
        conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
        userId: string,
        userPermissions: string[]
    ): Promise<string> {
        try {
            const model = this.getModel()

            // Fetch real system data from database
            const systemData = await this.getSystemDataContext()

            // Build conversation context with REAL data
            const systemContext = `You are an AI assistant for a leave management system called "Nguvu Leave Management". You help HR staff, managers, and employees with:
1. Understanding leave policies
2. Analyzing leave patterns
3. Answering questions about leave data
4. Providing recommendations

The user has permissions: ${userPermissions.join(", ")}

IMPORTANT: You MUST use the REAL-TIME SYSTEM DATA below to answer questions. DO NOT make up or hallucinate any numbers, names, or statistics. If the data shows 0 or empty, say so honestly.

Current date: ${new Date().toISOString().split("T")[0]}

${systemData}

INSTRUCTIONS:
- Always use the exact numbers from the REAL-TIME SYSTEM DATA above
- If asked about staff count, use the "Total Staff" or "Active Staff" numbers
- If asked about departments, list ONLY the departments shown above
- If asked about pending leaves, use the "Pending Approval" number
- If data is not available or shows 0, say "According to the system, there are currently 0..." or "No data available"
- Never invent or estimate numbers - only report what's in the data above
- Be helpful, concise, and professional`

            const formattedHistory = conversationHistory.map((msg) => ({
                role: msg.role === "user" ? "user" : "model",
                parts: [{ text: msg.content }],
            }))

            const chat = model.startChat({
                history: [
                    { role: "user", parts: [{ text: systemContext }] },
                    {
                        role: "model",
                        parts: [
                            {
                                text: "I understand. I have access to the real-time system data and will only provide accurate information based on the actual database. I'm ready to help with leave management questions.",
                            },
                        ],
                    },
                    ...formattedHistory,
                ],
            })

            const result = await chat.sendMessage(message)
            return result.response.text()
        } catch (error) {
            console.error("AI Chat Error:", error)
            throw error
        }
    }
}

export default AIService
