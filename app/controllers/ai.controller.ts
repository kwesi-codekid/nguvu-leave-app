import { Request } from "express"
import { AIService } from "../services/ai.service"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { ResponseObject } from "../utils/types"
import ChatConversation, { ChatMode } from "../models/chat-conversation.model"

export class AIController {
    /**
     * Helper function to check if user has AI assistant access
     */
    private static hasAIAssistantPermission(user: any): boolean {
        if (!user || !user.permissions) {
            return false
        }
        
        // Get allowed permissions from environment or use defaults
        const allowedPermissions = process.env.AI_ASSISTANT_PERMISSIONS?.split(",") || ["STAFF", "HR", "ADMIN", "MANAGER"]
        
        return user.permissions.some((permission: string) => 
            allowedPermissions.includes(permission.trim().toUpperCase())
        )
    }

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

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { staffId, leaveType, preferredMonth, numberOfDays } = req.body

            // Staff can only get recommendations for themselves
            const targetStaffId = staffId || user._id.toString()

            // Enforce data access rules
            if (
                targetStaffId !== user._id.toString() &&
                !user.permissions?.includes("HR") &&
                !user.permissions?.includes("ADMIN") &&
                !user.permissions?.includes("MANAGER")
            ) {
                return errorResponseObject(
                    "You can only get leave recommendations for yourself"
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

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
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
                timeframeDays ? parseInt(timeframeDays as string) : 365,
                user._id.toString(),
                user.permissions || []
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

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
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
                departmentId as string,
                user._id.toString(),
                user.permissions || []
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

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
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

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { message, conversationId, mode } = req.body

            if (!message || typeof message !== "string" || message.trim().length < 1) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "message",
                        message: "Message is required",
                    },
                ])
            }

            // Get or create conversation
            let conversation
            if (conversationId) {
                conversation = await ChatConversation.findOne({
                    _id: conversationId,
                    staff: user._id,
                })
                if (!conversation) {
                    return errorResponseObject("Conversation not found")
                }
            } else {
                // Create new conversation
                conversation = await ChatConversation.createConversation(
                    user._id.toString(),
                    (mode as ChatMode) || ChatMode.CHAT
                )
            }

            // Get conversation history from DB
            const history = conversation.messages.map((m: any) => ({
                role: m.role,
                content: m.content,
            }))

            // Add user message to conversation
            await conversation.addMessage("user", message.trim(), { mode: mode || "chat" })

            // Generate AI response
            const response = await AIService.chat(
                message.trim(),
                history,
                user._id.toString(),
                user.permissions || []
            )

            // Add assistant response to conversation
            await conversation.addMessage("assistant", response, { mode: mode || "chat" })

            return successResponseObject("Chat response generated", {
                response,
                conversationId: conversation._id,
                title: conversation.title,
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

    /**
     * Get user's conversations
     * GET /api/ai?op=conversations
     */
    static async getConversations(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { limit, skip, search } = req.query

            let conversations
            if (search && typeof search === "string" && search.trim()) {
                conversations = await ChatConversation.searchConversations(
                    user._id.toString(),
                    search.trim(),
                    { limit: limit ? parseInt(limit as string) : 50 }
                )
            } else {
                conversations = await ChatConversation.getConversationsForStaff(
                    user._id.toString(),
                    {
                        limit: limit ? parseInt(limit as string) : 50,
                        skip: skip ? parseInt(skip as string) : 0,
                        pinnedFirst: true,
                    }
                )
            }

            const count = await ChatConversation.getConversationCount(user._id.toString())

            return successResponseObject("Conversations retrieved", {
                conversations,
                total: count,
            })
        } catch (error) {
            console.error("Get Conversations Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to get conversations"
            return errorResponseObject(message)
        }
    }

    /**
     * Get single conversation with messages
     * GET /api/ai?op=conversation&id=xxx
     */
    static async getConversation(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { id } = req.query

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Conversation ID is required" },
                ])
            }

            const conversation = await ChatConversation.findOne({
                _id: id,
                staff: user._id,
            }).lean()

            if (!conversation) {
                return errorResponseObject("Conversation not found")
            }

            return successResponseObject("Conversation retrieved", conversation)
        } catch (error) {
            console.error("Get Conversation Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to get conversation"
            return errorResponseObject(message)
        }
    }

    /**
     * Create a new conversation
     * POST /api/ai?op=create-conversation
     */
    static async createConversation(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { mode, title } = req.body

            const conversation = await ChatConversation.createConversation(
                user._id.toString(),
                (mode as ChatMode) || ChatMode.CHAT,
                title
            )

            return successResponseObject("Conversation created", {
                _id: conversation._id,
                title: conversation.title,
                mode: conversation.mode,
                isPinned: conversation.isPinned,
                lastMessageAt: conversation.lastMessageAt,
                createdAt: conversation.createdAt,
            })
        } catch (error) {
            console.error("Create Conversation Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to create conversation"
            return errorResponseObject(message)
        }
    }

    /**
     * Delete a conversation
     * POST /api/ai?op=delete-conversation
     */
    static async deleteConversation(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { conversationId } = req.body

            if (!conversationId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "conversationId", message: "Conversation ID is required" },
                ])
            }

            const result = await ChatConversation.deleteOne({
                _id: conversationId,
                staff: user._id,
            })

            if (result.deletedCount === 0) {
                return errorResponseObject("Conversation not found or unauthorized")
            }

            return successResponseObject("Conversation deleted", { deleted: true })
        } catch (error) {
            console.error("Delete Conversation Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to delete conversation"
            return errorResponseObject(message)
        }
    }

    /**
     * Toggle pin status of a conversation
     * POST /api/ai?op=pin-conversation
     */
    static async pinConversation(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { conversationId } = req.body

            if (!conversationId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "conversationId", message: "Conversation ID is required" },
                ])
            }

            const conversation = await ChatConversation.findOne({
                _id: conversationId,
                staff: user._id,
            })

            if (!conversation) {
                return errorResponseObject("Conversation not found")
            }

            const isPinned = await conversation.togglePin()

            return successResponseObject(
                isPinned ? "Conversation pinned" : "Conversation unpinned",
                { isPinned }
            )
        } catch (error) {
            console.error("Pin Conversation Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to pin conversation"
            return errorResponseObject(message)
        }
    }

    /**
     * Rename a conversation
     * POST /api/ai?op=rename-conversation
     */
    static async renameConversation(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            if (!user) {
                return errorResponseObject("Unauthorized")
            }

            // Check AI assistant permission
            if (!this.hasAIAssistantPermission(user)) {
                return errorResponseObject(
                    "You don't have permission to access AI assistant features. This feature is restricted to authorized roles."
                )
            }

            const { conversationId, title } = req.body

            if (!conversationId) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "conversationId", message: "Conversation ID is required" },
                ])
            }

            if (!title || typeof title !== "string" || title.trim().length < 1) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "title", message: "Title is required" },
                ])
            }

            const conversation = await ChatConversation.findOne({
                _id: conversationId,
                staff: user._id,
            })

            if (!conversation) {
                return errorResponseObject("Conversation not found")
            }

            await conversation.updateTitle(title.trim())

            return successResponseObject("Conversation renamed", {
                title: conversation.title,
            })
        } catch (error) {
            console.error("Rename Conversation Error:", error)
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to rename conversation"
            return errorResponseObject(message)
        }
    }
}

export default AIController
