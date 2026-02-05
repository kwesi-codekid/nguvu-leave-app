import { Request } from "express"
import { AIService } from "../services/ai.service"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { ResponseObject } from "../utils/types"

export class AIController {
    /**
     * Get Smart Leave Recommendations
     * POST /api/ai?op=recommendations
     */
    static async getLeaveRecommendations(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            const { staffId, leaveType, preferredMonth, numberOfDays } = req.body

            // Staff can only get recommendations for themselves unless they're HR/Admin
            const targetStaffId = staffId || user._id.toString()

            if (
                targetStaffId !== user._id.toString() &&
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "You can only get recommendations for yourself"
                )
            }

            if (!leaveType) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "leaveType", message: "Leave type is required" },
                ])
            }

            const recommendations = await AIService.getLeaveRecommendations(
                targetStaffId,
                leaveType,
                preferredMonth ? parseInt(preferredMonth) : undefined,
                numberOfDays ? parseInt(numberOfDays) : undefined
            )

            return successResponseObject(
                "Leave recommendations generated successfully",
                recommendations
            )
        } catch (error) {
            console.error("AI Recommendations Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to generate recommendations"
            return errorResponseObject(message)
        }
    }

    /**
     * Analyze Leave Patterns
     * GET /api/ai?op=patterns
     */
    static async analyzePatterns(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Only HR/Admin/Manager can analyze patterns
            if (
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN") &&
                !user.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "Unauthorized to analyze leave patterns"
                )
            }

            const { scope, scopeId, timeframeDays } = req.query

            const validScopes = ["company", "department", "staff"]
            const analysisScope = (scope as string) || "company"

            if (!validScopes.includes(analysisScope)) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "scope",
                        message:
                            "Invalid scope. Use: company, department, or staff",
                    },
                ])
            }

            // Managers can only analyze their department
            if (
                user.permissions?.includes("MANAGER") &&
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN")
            ) {
                if (analysisScope === "company") {
                    return errorResponseObject(
                        "Managers can only analyze department or staff patterns"
                    )
                }
            }

            const analysis = await AIService.analyzeLeavePatterns(
                analysisScope as "company" | "department" | "staff",
                scopeId as string,
                timeframeDays ? parseInt(timeframeDays as string) : 365
            )

            return successResponseObject(
                "Leave pattern analysis completed successfully",
                analysis
            )
        } catch (error) {
            console.error("AI Pattern Analysis Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to analyze patterns"
            return errorResponseObject(message)
        }
    }

    /**
     * Generate AI Report Summary
     * GET /api/ai?op=report
     */
    static async generateReport(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Only HR/Admin can generate AI reports
            if (
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized to generate AI reports"
                )
            }

            const { reportType, startDate, endDate, departmentId } = req.query

            if (!startDate || !endDate) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "dates",
                        message: "Start date and end date are required",
                    },
                ])
            }

            const validReportTypes = ["monthly", "quarterly", "annual", "custom"]
            const type = (reportType as string) || "custom"

            if (!validReportTypes.includes(type)) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "reportType",
                        message:
                            "Invalid report type. Use: monthly, quarterly, annual, or custom",
                    },
                ])
            }

            const start = new Date(startDate as string)
            const end = new Date(endDate as string)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return errorResponseObject("Invalid date format")
            }

            const report = await AIService.generateReport(
                type as "monthly" | "quarterly" | "annual" | "custom",
                start,
                end,
                departmentId as string
            )

            return successResponseObject(
                "AI report summary generated successfully",
                report
            )
        } catch (error) {
            console.error("AI Report Generation Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to generate report"
            return errorResponseObject(message)
        }
    }

    /**
     * Process Natural Language Query
     * POST /api/ai?op=query
     */
    static async processQuery(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            const { query } = req.body

            if (!query || typeof query !== "string" || query.trim().length < 3) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "query",
                        message:
                            "Query is required and must be at least 3 characters",
                    },
                ])
            }

            const result = await AIService.processNaturalLanguageQuery(
                query.trim(),
                user._id.toString(),
                user.permissions || []
            )

            return successResponseObject(
                "Query processed successfully",
                result
            )
        } catch (error) {
            console.error("AI Query Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to process query"
            return errorResponseObject(message)
        }
    }

    /**
     * Chat with AI Assistant
     * POST /api/ai?op=chat
     */
    static async chat(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            const { message, conversationHistory } = req.body

            if (!message || typeof message !== "string" || message.trim().length < 1) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "message",
                        message: "Message is required",
                    },
                ])
            }

            const history = Array.isArray(conversationHistory)
                ? conversationHistory
                : []

            const response = await AIService.chat(
                message.trim(),
                history,
                user._id.toString(),
                user.permissions || []
            )

            return successResponseObject("Chat response generated", {
                response,
                conversationHistory: [
                    ...history,
                    { role: "user", content: message.trim() },
                    { role: "assistant", content: response },
                ],
            })
        } catch (error) {
            console.error("AI Chat Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to generate response"
            return errorResponseObject(message)
        }
    }
}

export default AIController
