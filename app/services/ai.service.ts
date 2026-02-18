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
     * Fetch current user's detailed information
     */
    private static async getCurrentUserDetails(userId: string): Promise<any> {
        try {
            // Get user's basic information
            const user = await Staff.findById(userId)
                .populate("department", "name")
                .lean()

            if (!user) {
                return null
            }

            // Get user's current leave balances
            const now = new Date()
            const leaveBalances = await LeaveBalance.find({
                staff: userId,
                periodStart: { $lte: now },
                periodEnd: { $gte: now },
            }).populate("leaveType", "name").lean()

            // Get user's recent leave requests
            const recentLeaves = await LeaveRequest.find({
                staff: userId,
            })
                .sort({ createdAt: -1 })
                .limit(10)
                .populate("leaveType", "name")
                .lean()

            // Get user's current active leave (if any)
            const currentDate = new Date()
            const currentLeave = await LeaveRequest.findOne({
                staff: userId,
                status: LeaveStatus.APPROVED,
                startDate: { $lte: currentDate },
                endDate: { $gte: currentDate },
            })
                .populate("leaveType", "name")
                .lean()

            return {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    staffId: user.staffId,
                    department: (user.department as any)?.name || "Unknown",
                    status: user.status,
                },
                leaveBalances: leaveBalances.map((balance: any) => ({
                    leaveType: (balance.leaveType as any)?.name || "Unknown",
                    allocated: balance.allocated,
                    used: balance.used,
                    remaining: balance.allocated - balance.used,
                    periodStart: balance.periodStart,
                    periodEnd: balance.periodEnd,
                })),
                recentLeaves: recentLeaves.map((leave: any) => ({
                    leaveType: (leave.leaveType as any)?.name || "Unknown",
                    startDate: leave.startDate,
                    endDate: leave.endDate,
                    workingDays: leave.workingDays,
                    status: leave.status,
                    createdAt: leave.createdAt,
                })),
                currentLeave: currentLeave ? {
                    leaveType: (currentLeave.leaveType as any)?.name || "Unknown",
                    startDate: currentLeave.startDate,
                    endDate: currentLeave.endDate,
                    workingDays: currentLeave.workingDays,
                } : null,
            }
        } catch (error) {
            console.error("Error fetching user details:", error)
            return null
        }
    }

    /**
     * Get user access level for data filtering
     */
    private static getUserAccessLevel(userPermissions: string[]): 'staff' | 'manager' | 'hr_admin' {
        if (userPermissions.includes('HR') || userPermissions.includes('ADMIN')) {
            return 'hr_admin'
        } else if (userPermissions.includes('MANAGER')) {
            return 'manager'
        } else {
            return 'staff'
        }
    }

    /**
     * Filter system data based on user access level
     */
    private static filterSystemDataForUser(data: any, userId: string, userPermissions: string[]): any {
        const accessLevel = this.getUserAccessLevel(userPermissions)
        
        if (accessLevel === 'hr_admin') {
            // HR and Admin can see all data
            return data
        } else if (accessLevel === 'manager') {
            // Managers can see department-level data (simplified for now)
            return data
        } else {
            // Staff can only see their own data
            return {
                ...data,
                // Filter staff lists to only include themselves
                STAFF_STATISTICS: {
                    TOTAL_STAFF: 1, // Only themselves
                    ACTIVE_STAFF: 1,
                    INACTIVE_STAFF: 0,
                },
                // Filter leave data to only show their own
                STAFF_CURRENTLY_ON_LEAVE: data.STAFF_CURRENTLY_ON_LEAVE?.filter((staff: any) => 
                    staff.name?.toLowerCase().includes("current user") || false
                ) || [],
                UPCOMING_LEAVES: data.UPCOMING_LEAVES?.filter((leave: any) => 
                    leave.name?.toLowerCase().includes("current user") || false
                ) || [],
                RECENT_LEAVE_REQUESTS: data.RECENT_LEAVE_REQUESTS?.filter((req: any) => 
                    req.name?.toLowerCase().includes("current user") || false
                ) || [],
                // Keep general statistics but limit detailed information
                DEPARTMENTS: "Department information available to authorized personnel only",
                LEAVE_BALANCE_SUMMARY: "Your personal leave balance information available through leave balance page",
            }
        }
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
            // Gather context data including current user details
            const staff = await Staff.findById(staffId)
                .populate("department")
                .lean()

            if (!staff) {
                throw new Error("Staff not found")
            }

            // Get user's current leave details for better recommendations
            const currentUserDetails = await this.getCurrentUserDetails(staffId)

            // Get staff's leave balance (period-based)
            const now = new Date()
            const balance = await LeaveBalance.findOne({
                staff: staffId,
                leaveType,
                periodStart: { $lte: now },
                periodEnd: { $gte: now },
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

            // Prepare context for AI with user details
            const context = {
                currentUser: currentUserDetails?.user || {
                    name: staff.name,
                    department: (staff.department as any)?.name || "Unknown",
                },
                leaveBalances: currentUserDetails?.leaveBalances || [],
                recentLeaves: currentUserDetails?.recentLeaves || [],
                currentLeave: currentUserDetails?.currentLeave,
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

            const prompt = `You are an AI assistant for a leave management system. Analyze the following data and suggest optimal leave dates for ${context.currentUser.name}.

CONTEXT:
- Staff: ${context.currentUser.name}
- Department: ${context.currentUser.department}
- Leave Type Requested: ${context.leaveType}
- Available Balance: ${context.availableBalance} days
- Requested Duration: ${context.requestedDays} days
- Preferred Time: ${context.preferredMonth}
- Current Date: ${context.currentDate}

CURRENT LEAVE SITUATION:
${context.currentLeave ? `- Currently on leave: ${context.currentLeave.leaveType} until ${context.currentLeave.endDate}` : '- Not currently on leave'}

LEAVE BALANCES:
${JSON.stringify(context.leaveBalances, null, 2)}

RECENT LEAVE HISTORY:
${JSON.stringify(context.recentLeaves.slice(0, 5), null, 2)}

UPCOMING HOLIDAYS:
${JSON.stringify(context.upcomingHolidays, null, 2)}

TEAM LEAVES ALREADY SCHEDULED:
${JSON.stringify(context.teamLeavesScheduled, null, 2)}

PAST LEAVE PATTERNS:
${JSON.stringify(context.pastLeavePatterns, null, 2)}

Based on this data, provide personalized leave recommendations in the following JSON format:
{
    "suggestedDates": [
        {
            "startDate": "YYYY-MM-DD",
            "endDate": "YYYY-MM-DD",
            "reason": "Why this period is recommended for ${context.currentUser.name}",
            "score": 85
        }
    ],
    "insights": [
        "Personalized insight about ${context.currentUser.name}'s leave patterns or situation"
    ],
    "warnings": [
        "Any concerns or things to consider for ${context.currentUser.name}"
    ]
}

Consider:
1. Personalize recommendations for ${context.currentUser.name}'s situation
2. Minimize team conflicts (avoid when many teammates are on leave)
3. Maximize value by combining with holidays/weekends for longer breaks
4. Consider ${context.currentUser.name}'s historical patterns and current leave balance
5. Account for any current leave status
6. Workload distribution across the year

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
        timeframeDays: number = 365,
        userId?: string,
        userPermissions?: string[]
    ): Promise<PatternAnalysis> {
        try {
            const accessLevel = userPermissions ? this.getUserAccessLevel(userPermissions) : 'hr_admin'
            
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - timeframeDays)

            // Build query based on scope and permissions
            const query: any = {
                createdAt: { $gte: startDate },
            }

            // Apply permission-based restrictions
            if (accessLevel === 'staff') {
                // Staff can only analyze their own patterns
                if (userId) {
                    query.staff = userId
                } else if (scopeId) {
                    query.staff = scopeId
                }
                // Force scope to "staff" for regular staff users
                scope = "staff"
            } else if (accessLevel === 'manager') {
                // Managers can analyze department or staff patterns
                if (scope === "company") {
                    throw new Error("Managers can only analyze department or staff patterns")
                }
                if (scope === "department" && scopeId) {
                    query.department = scopeId
                } else if (scope === "staff" && scopeId) {
                    query.staff = scopeId
                }
            } else {
                // HR/Admin can analyze any scope
                if (scope === "department" && scopeId) {
                    query.department = scopeId
                } else if (scope === "staff" && scopeId) {
                    query.staff = scopeId
                }
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
        departmentId?: string,
        userId?: string,
        userPermissions?: string[]
    ): Promise<ReportSummary> {
        try {
            const accessLevel = userPermissions ? this.getUserAccessLevel(userPermissions) : 'hr_admin'
            
            // Build query with permission restrictions
            const query: any = {
                createdAt: { $gte: startDate, $lte: endDate },
            }

            // Apply permission-based data filtering
            if (accessLevel === 'staff') {
                // Staff can only generate reports for their own data
                if (userId) {
                    query.staff = userId
                }
                // Force departmentId to user's department if provided
                if (departmentId) {
                    // Only allow if it matches user's department
                    const user = await Staff.findById(userId).select('department').lean()
                    if (user && user.department.toString() === departmentId) {
                        query.department = departmentId
                    }
                }
            } else if (accessLevel === 'manager') {
                // Managers can generate reports for their department
                if (departmentId) {
                    // Verify the manager belongs to this department
                    const user = await Staff.findById(userId).select('department').lean()
                    if (user && user.department.toString() === departmentId) {
                        query.department = departmentId
                    }
                }
            } else {
                // HR/Admin can generate reports for any department
                if (departmentId) {
                    query.department = departmentId
                }
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
            const accessLevel = this.getUserAccessLevel(userPermissions)
            
            // Fetch current user's detailed information
            const currentUserDetails = await this.getCurrentUserDetails(userId)
            
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

CURRENT USER INFORMATION:
${currentUserDetails ? JSON.stringify(currentUserDetails, null, 2) : "User information not available"}

USER PERMISSIONS: ${userPermissions.join(", ")} (Access Level: ${accessLevel})

ACCESS RESTRICTIONS:
- STAFF: Can only query their own leave data, personal balance, and general policies
- MANAGER: Can query department-level data and team patterns
- HR/ADMIN: Can query all data

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

            // Execute different query types with permission checks
            if (queryPlan.queryType === "staff_list") {
                // Query about staff - restricted based on permissions
                if (accessLevel === 'staff') {
                    // Staff can only see themselves
                    return {
                        interpretation: "Staff can only view their own information",
                        data: [],
                        summary: "For privacy reasons, staff members can only view their own leave information. Please check your personal leave balance page for details.",
                        visualizationType: "cards",
                        followUpQuestions: [
                            "What is my current leave balance?",
                            "How many leave days do I have remaining?",
                            "What are the leave policies?",
                        ],
                    }
                }

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

                // Filter based on query and permissions
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
                // Query about leave requests - filter based on permissions
                const queryFilter: any = {}

                if (accessLevel === 'staff') {
                    // Staff can only see their own leave requests
                    queryFilter.staff = userId
                } else if (accessLevel === 'manager') {
                    // Managers can see their department's leave requests
                    // This would require getting the manager's department first
                    // For now, we'll allow all but note this limitation
                }

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
    private static async getSystemDataContext(userId?: string, userPermissions?: string[]): Promise<string> {
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
                    { $match: { periodStart: { $lte: new Date() }, periodEnd: { $gte: new Date() } } },
                    {
                        $group: {
                            _id: "$leaveType",
                            totalAllocated: { $sum: "$allocated" },
                            totalUsed: { $sum: "$used" },
                        },
                    },
                ]),
            ])

            // Apply permission-based filtering at the data source level
            let staffOnLeave, upcomingLeaves, recentRequests, allStaff, allDepartments, allLeaveBalances
            
            if (userPermissions && this.getUserAccessLevel(userPermissions) === 'staff') {
                // Staff can only see their own leave information
                const staffLeaveFilter = userId ? { staff: userId } : {}
                
                staffOnLeave = await LeaveRequest.find({
                    ...staffLeaveFilter,
                    status: LeaveStatus.APPROVED,
                    startDate: { $lte: currentDate },
                    endDate: { $gte: currentDate },
                })
                    .populate("staff", "name")
                    .populate("department", "name")
                    .select("staff department startDate endDate leaveType")
                    .lean()

                const nextWeek = new Date()
                nextWeek.setDate(nextWeek.getDate() + 7)
                upcomingLeaves = await LeaveRequest.find({
                    ...staffLeaveFilter,
                    status: LeaveStatus.APPROVED,
                    startDate: { $gt: currentDate, $lte: nextWeek },
                })
                    .populate("staff", "name")
                    .populate("department", "name")
                    .select("staff department startDate endDate leaveType")
                    .lean()

                const lastWeek = new Date()
                lastWeek.setDate(lastWeek.getDate() - 7)
                recentRequests = await LeaveRequest.find({
                    ...staffLeaveFilter,
                    createdAt: { $gte: lastWeek },
                })
                    .populate("staff", "name")
                    .select("staff leaveType status workingDays createdAt")
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .lean()
                
                // Staff can see their own basic info and limited department info
                const userStaff = userId ? await Staff.findById(userId).populate("department", "name").lean() : null
                allStaff = userStaff ? [userStaff] : []
                allDepartments = userStaff && userStaff.department ? [userStaff.department] : []
                allLeaveBalances = userId ? await LeaveBalance.find({
                    staff: userId,
                    periodStart: { $lte: new Date() },
                    periodEnd: { $gte: new Date() },
                }).populate("leaveType", "name").lean() : []
                
            } else if (userPermissions && this.getUserAccessLevel(userPermissions) === 'manager') {
                // Managers can see department-level data plus broader system info
                const managerFilter = userId ? await Staff.findById(userId).select("department").lean() : null
                const deptFilter = managerFilter ? { department: managerFilter.department } : {}
                
                staffOnLeave = await LeaveRequest.find({
                    ...deptFilter,
                    status: LeaveStatus.APPROVED,
                    startDate: { $lte: currentDate },
                    endDate: { $gte: currentDate },
                })
                    .populate("staff", "name staffId")
                    .populate("department", "name")
                    .select("staff department startDate endDate leaveType")
                    .lean()

                const nextWeek = new Date()
                nextWeek.setDate(nextWeek.getDate() + 7)
                upcomingLeaves = await LeaveRequest.find({
                    ...deptFilter,
                    status: LeaveStatus.APPROVED,
                    startDate: { $gt: currentDate, $lte: nextWeek },
                })
                    .populate("staff", "name staffId")
                    .populate("department", "name")
                    .select("staff department startDate endDate leaveType")
                    .lean()

                const lastWeek = new Date()
                lastWeek.setDate(lastWeek.getDate() - 7)
                recentRequests = await LeaveRequest.find({
                    ...deptFilter,
                    createdAt: { $gte: lastWeek },
                })
                    .populate("staff", "name staffId")
                    .select("staff leaveType status workingDays createdAt")
                    .sort({ createdAt: -1 })
                    .limit(20) // Managers can see more recent requests
                    .lean()
                
                // Managers can see all staff in their department and limited other info
                allStaff = deptFilter ? await Staff.find({
                    ...deptFilter,
                    status: "active"
                }).select("name staffId department").populate("department", "name").lean() : []
                allDepartments = deptFilter ? await Department.find({
                    _id: managerFilter?.department
                }).select("name description").lean() : []
                allLeaveBalances = deptFilter ? await LeaveBalance.find({
                    ...deptFilter,
                    periodStart: { $lte: new Date() },
                    periodEnd: { $gte: new Date() },
                }).populate("leaveType staff", "name").lean() : []
                
            } else {
                // HR/Admin can see all system data for comprehensive navigation
                staffOnLeave = await LeaveRequest.find({
                    status: LeaveStatus.APPROVED,
                    startDate: { $lte: currentDate },
                    endDate: { $gte: currentDate },
                })
                    .populate("staff", "name staffId")
                    .populate("department", "name")
                    .select("staff department startDate endDate leaveType")
                    .lean()

                const nextWeek = new Date()
                nextWeek.setDate(nextWeek.getDate() + 7)
                upcomingLeaves = await LeaveRequest.find({
                    status: LeaveStatus.APPROVED,
                    startDate: { $gt: currentDate, $lte: nextWeek },
                })
                    .populate("staff", "name staffId")
                    .populate("department", "name")
                    .select("staff department startDate endDate leaveType")
                    .lean()

                const lastWeek = new Date()
                lastWeek.setDate(lastWeek.getDate() - 7)
                recentRequests = await LeaveRequest.find({
                    createdAt: { $gte: lastWeek },
                })
                    .populate("staff", "name staffId")
                    .select("staff leaveType status workingDays createdAt")
                    .sort({ createdAt: -1 })
                    .limit(50) // HR/Admin can see extensive recent history
                    .lean()
                
                // HR/Admin can see all system data
                allStaff = await Staff.find({ status: "active" })
                    .select("name staffId email department")
                    .populate("department", "name")
                    .lean()
                allDepartments = await Department.find().select("name description head isActive").lean()
                allLeaveBalances = await LeaveBalance.find({
                    periodStart: { $lte: new Date() },
                    periodEnd: { $gte: new Date() },
                }).populate("leaveType staff", "name").lean()
            }

            // Format department list
const departmentList = departments.map((d) => d.name).join(", ")

// Format staff on leave
const staffOnLeaveList = staffOnLeave.map((l) => ({
    name: (l.staff as any)?.name || "Unknown",
    staffId: (l.staff as any)?.staffId || "Unknown",
    department: (l.department as any)?.name || "Unknown",
    leaveType: l.leaveType,
    endDate: l.endDate.toISOString().split("T")[0],
}))

// Format upcoming leaves
const upcomingLeavesList = upcomingLeaves.map((l) => ({
    name: (l.staff as any)?.name || "Unknown",
    staffId: (l.staff as any)?.staffId || "Unknown",
    department: (l.department as any)?.name || "Unknown",
    leaveType: l.leaveType,
    startDate: l.startDate.toISOString().split("T")[0],
    endDate: l.endDate.toISOString().split("T")[0],
}))

// Format recent requests
const recentRequestsList = recentRequests.map((l) => ({
    name: (l.staff as any)?.name || "Unknown",
    staffId: (l.staff as any)?.staffId || "Unknown",
    leaveType: l.leaveType,
    status: l.status,
    days: l.workingDays,
    date: l.createdAt?.toISOString().split("T")[0],
}))

// Format all staff information
const allStaffList = allStaff.map((s) => ({
    name: s.name,
    staffId: s.staffId,
    email: s.email,
    department: (s.department as any)?.name || "Unknown",
    status: s.status,
}))

// Format all departments with more details
const allDepartmentsList = allDepartments.map((d: any) => ({
    name: d.name,
    description: d.description,
    head: d.head,
    isActive: d.isActive,
}))

// Format all leave balances with more context
const allLeaveBalancesList = allLeaveBalances.map((lb) => ({
    leaveType: (lb.leaveType as any)?.name || "Unknown",
    staffName: (lb.staff as any)?.name || "Unknown",
    staffId: (lb.staff as any)?.staffId || "Unknown",
    allocated: lb.allocated,
    used: lb.used,
    remaining: lb.allocated - lb.used,
    periodStart: lb.periodStart,
    periodEnd: lb.periodEnd,
}))

return `
REAL-TIME SYSTEM DATA (queried from database with permission-based filtering):
================================================================

CURRENT USER ACCESS LEVEL: ${userPermissions ? this.getUserAccessLevel(userPermissions) : 'unrestricted'}

STAFF STATISTICS:
- Total Staff Available: ${allStaff.length}
- Active Staff Available: ${allStaff.filter((s: any) => s.status === 'active').length}
- Departments Available: ${allDepartments.length}

DEPARTMENTS (${allDepartments.length} total):
${allDepartmentsList.length > 0 ? JSON.stringify(allDepartmentsList, null, 2) : "No departments available"}

STAFF DIRECTORY (${allStaffList.length} total):
${allStaffList.length > 0 ? JSON.stringify(allStaffList.slice(0, 20), null, 2) : "No staff data available"}

LEAVE BALANCES (${allLeaveBalancesList.length} total):
${allLeaveBalancesList.length > 0 ? JSON.stringify(allLeaveBalancesList.slice(0, 20), null, 2) : "No balance data available"}

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

RECENT LEAVE REQUESTS (Last 7 Days - ${recentRequestsList.length}):
${recentRequestsList.length > 0 ? JSON.stringify(recentRequestsList, null, 2) : "No recent requests"}

HOLIDAYS CONFIGURED (${holidays.length}):
${holidays.length > 0 ? JSON.stringify(holidays.map((h) => ({
    name: h.name,
    date: h.startDate?.toISOString().split("T")[0] || "TBD",
    type: h.type,
})), null, 2) : "No holidays configured"}

LEAVE BALANCE SUMMARY (${currentYear}):
${leaveBalances.length > 0 ? JSON.stringify(leaveBalances, null, 2) : "No balance data available"}

SYSTEM NAVIGATION CAPABILITIES:
- Staff Directory: Access to complete staff information (permissions apply)
- Department Structure: Full organizational hierarchy (permissions apply)
- Leave Analytics: Comprehensive leave data and patterns (permissions apply)
- Balance Tracking: All leave balances across the organization (permissions apply)
- Request History: Complete audit trail of leave requests (permissions apply)
- Holiday Management: All company holidays and schedules
- Cross-Reference: Link staff, departments, leave requests, and balances
- Trend Analysis: Identify patterns, anomalies, and insights
- Reporting: Generate comprehensive reports (permissions apply)

PERMISSION-BASED ACCESS NOTES:
- Staff users: See only their own data + general policies
- Manager users: See department data + team analytics
- HR/Admin users: Full system access for comprehensive navigation
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

            // Fetch current user's detailed information
            const currentUserDetails = await this.getCurrentUserDetails(userId)
            
            // Fetch real system data from database with user context
            const systemData = await this.getSystemDataContext(userId, userPermissions)
            
            // Filter data based on user permissions
            const filteredData = this.filterSystemDataForUser(systemData, userId, userPermissions)
            const accessLevel = this.getUserAccessLevel(userPermissions)

            // Build conversation context with filtered data and user details
            const systemContext = `You are an AI assistant for a leave management system called "Nguvu Leave Management". You help employees with:
1. Understanding leave policies and procedures
2. Answering questions about their personal leave data
3. Providing leave recommendations and insights
4. Helping with leave request processes
5. Navigating through comprehensive system data for appropriate answers

CURRENT USER INFORMATION:
${currentUserDetails ? JSON.stringify(currentUserDetails, null, 2) : "User information not available"}

The user has permissions: ${userPermissions.join(", ")} (Access Level: ${accessLevel})

IMPORTANT DATA ACCESS RESTRICTIONS:
- If user is STAFF: Only answer questions about THEIR OWN leave data, personal balance, and general policies. Do not share information about other staff members, department statistics, or company-wide data.
- If user is MANAGER: Can answer about their department's leave data and team patterns, but not sensitive HR data from other departments.
- If user is HR/ADMIN: Can access all leave data and provide comprehensive analytics.

SYSTEM NAVIGATION CAPABILITIES:
You have access to comprehensive system data that allows you to:
- Navigate through staff directory and find specific employees
- Cross-reference leave requests with staff balances and department information
- Analyze patterns across different time periods and scopes
- Connect related data points (staff ↔ departments ↔ leave requests ↔ balances)
- Provide insights by linking multiple data sources
- Generate comprehensive reports combining various data types
- Answer complex questions that require data from multiple system areas

CURRENT DATE: ${new Date().toISOString().split("T")[0]}

COMPREHENSIVE SYSTEM DATA (based on user permissions):
${filteredData}

NAVIGATION INSTRUCTIONS:
- Use the SYSTEM NAVIGATION CAPABILITIES to explore all relevant data areas
- Cross-reference between staff, departments, leave requests, and balances
- Connect related information to provide complete answers
- Navigate through the data relationships to find comprehensive insights
- For complex questions, explore multiple data areas and synthesize information
- Always use the exact numbers from the SYSTEM DATA above
- When answering questions about "my" or "your" leave data, refer to the CURRENT USER INFORMATION
${accessLevel === 'staff' ? '- ONLY answer questions about the user\'s own leave data and general policies\n- Decline requests for information about other staff members or company-wide statistics\n- Guide staff users to check their personal leave balance page for detailed information\n- You can still navigate through all available system data within your permissions' : ''}
${accessLevel === 'manager' ? '- Can provide department-level analytics and team insights\n- Cannot access sensitive HR data from other departments\n- Navigate through department staff data and team patterns\n- Cross-reference within your department scope' : ''}
${accessLevel === 'hr_admin' ? '- Can provide comprehensive analytics and access all leave data\n- Navigate through entire system without restrictions\n- Generate company-wide reports and insights\n- Cross-reference all data entities for complete analysis' : ''}

RESPONSE STYLE & FORMATTING:
- Write like a friendly, knowledgeable colleague — warm but professional. Use natural language, not robotic bullet lists.
- Start responses with a brief, natural greeting or acknowledgement when appropriate (e.g., "Great question!", "Sure thing!", "Let me pull that up for you."). Vary your openings — never repeat the same greeting.
- Use markdown formatting to make responses visually clear and scannable:
  - Use **bold** for important values, names, and key data points
  - Use tables for structured data comparisons (e.g., leave balances, department stats)
  - Use headings (### or ####) to organize longer responses into sections
  - Use numbered lists for steps/processes and bullet points for quick facts
  - Use > blockquotes for tips, recommendations, or important callouts
  - Use \`inline code\` for IDs, dates, or reference numbers
- Keep responses concise but complete — 2-4 short paragraphs for simple questions, structured sections for complex ones.
- When presenting data, weave it into sentences naturally rather than just dumping raw lists. For example, instead of "Name: John, Balance: 5" say "**John** has **5 days** remaining."
- End with a helpful follow-up suggestion or question to keep the conversation flowing naturally — but keep it brief and varied.
- If data is not available or shows 0, say so honestly with a friendly tone.
- NEVER prefix responses with "Hello [Name]" every time — only greet on the first message or when it feels natural.
- Avoid starting every response with the user's name. Be conversational, not formulaic.

CONTENT GUIDELINES:
- Navigate through the system data to find comprehensive answers
- Use cross-references to connect related information
- Provide actionable insights based on the available data
- For staff users: Focus on personal data while being helpful within permissions
- For managers: Focus on department-level insights and team analytics
- For HR/Admin: Provide strategic insights and comprehensive analysis`

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
                                text: "Got it! I have access to the live system data and I'll keep my responses natural, well-formatted with markdown, and based on actual database information. Ready to help!",
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
