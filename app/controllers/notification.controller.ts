import { Request } from "express"
import mongoose from "mongoose"
import Notification, {
    NotificationType,
    NotificationPriority,
} from "../models/notification.model"
import Staff from "../models/staff.model"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { ResponseObject } from "../utils/types"

export class NotificationController {
    /**
     * Get notifications for the authenticated user
     * GET /api/notifications
     */
    static async getNotifications(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const {
                page = 1,
                limit = 20,
                unreadOnly = false,
            } = req.query

            const skip = (Number(page) - 1) * Number(limit)
            const isUnreadOnly = unreadOnly === "true" || unreadOnly === true

            const [notifications, total, unreadCount] = await Promise.all([
                Notification.getNotifications(user._id, {
                    limit: Number(limit),
                    skip,
                    unreadOnly: isUnreadOnly,
                }),
                Notification.countDocuments({
                    recipient: user._id,
                    $or: [
                        { expiresAt: { $exists: false } },
                        { expiresAt: { $gt: new Date() } },
                    ],
                    ...(isUnreadOnly ? { isRead: false } : {}),
                }),
                Notification.getUnreadCount(user._id),
            ])

            return successResponseObject("Notifications retrieved successfully", {
                notifications,
                unreadCount,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit)),
                },
            })
        } catch (error) {
            console.error("Error getting notifications:", error)
            return errorResponseObject("Failed to get notifications")
        }
    }

    /**
     * Get unread notification count
     * GET /api/notifications?op=count
     */
    static async getUnreadCount(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const count = await Notification.getUnreadCount(user._id)

            return successResponseObject("Unread count retrieved successfully", {
                unreadCount: count,
            })
        } catch (error) {
            console.error("Error getting unread count:", error)
            return errorResponseObject("Failed to get unread count")
        }
    }

    /**
     * Mark a notification as read
     * PATCH /api/notifications/:id
     */
    static async markAsRead(req: Request, notificationId: string): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            const notification = await Notification.findOne({
                _id: notificationId,
                recipient: user._id,
            })

            if (!notification) {
                return errorResponseObject("Notification not found")
            }

            await notification.markAsRead()

            return successResponseObject("Notification marked as read", {
                notification: notification.toObject(),
            })
        } catch (error) {
            console.error("Error marking notification as read:", error)
            return errorResponseObject("Failed to mark notification as read")
        }
    }

    /**
     * Mark all notifications as read
     * PATCH /api/notifications?op=mark-all-read
     */
    static async markAllAsRead(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const count = await Notification.markAllAsRead(user._id)

            return successResponseObject("All notifications marked as read", {
                markedCount: count,
            })
        } catch (error) {
            console.error("Error marking all notifications as read:", error)
            return errorResponseObject("Failed to mark all notifications as read")
        }
    }

    /**
     * Delete a notification
     * DELETE /api/notifications/:id
     */
    static async deleteNotification(req: Request, notificationId: string): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            const notification = await Notification.findOneAndDelete({
                _id: notificationId,
                recipient: user._id,
            })

            if (!notification) {
                return errorResponseObject("Notification not found")
            }

            return successResponseObject("Notification deleted successfully")
        } catch (error) {
            console.error("Error deleting notification:", error)
            return errorResponseObject("Failed to delete notification")
        }
    }

    /**
     * Delete all read notifications
     * DELETE /api/notifications?op=clear-read
     */
    static async clearReadNotifications(req: Request): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            const result = await Notification.deleteMany({
                recipient: user._id,
                isRead: true,
            })

            return successResponseObject("Read notifications cleared", {
                deletedCount: result.deletedCount,
            })
        } catch (error) {
            console.error("Error clearing read notifications:", error)
            return errorResponseObject("Failed to clear read notifications")
        }
    }

    // =====================================================
    // HELPER METHODS FOR CREATING NOTIFICATIONS
    // These are called from other controllers/services
    // =====================================================

    /**
     * Send notification to a single staff member
     */
    static async sendNotification(data: {
        recipientId: string
        title: string
        message: string
        type?: NotificationType
        priority?: NotificationPriority
        link?: string
        metadata?: Record<string, any>
        expiresAt?: Date
    }): Promise<void> {
        try {
            await Notification.create({
                recipient: data.recipientId,
                title: data.title,
                message: data.message,
                type: data.type || NotificationType.INFO,
                priority: data.priority || NotificationPriority.NORMAL,
                link: data.link,
                metadata: data.metadata,
                expiresAt: data.expiresAt,
            })
        } catch (error) {
            console.error("Error sending notification:", error)
        }
    }

    /**
     * Send notification to multiple staff members
     */
    static async sendBulkNotifications(data: {
        recipientIds: string[]
        title: string
        message: string
        type?: NotificationType
        priority?: NotificationPriority
        link?: string
        metadata?: Record<string, any>
        expiresAt?: Date
    }): Promise<void> {
        try {
            const notifications = data.recipientIds.map((recipientId) => ({
                recipient: recipientId,
                title: data.title,
                message: data.message,
                type: data.type || NotificationType.INFO,
                priority: data.priority || NotificationPriority.NORMAL,
                link: data.link,
                metadata: data.metadata,
                expiresAt: data.expiresAt,
            }))

            await Notification.insertMany(notifications)
        } catch (error) {
            console.error("Error sending bulk notifications:", error)
        }
    }

    /**
     * Send notification to all staff with specific permissions
     */
    static async notifyByPermission(data: {
        permissions: string[]
        title: string
        message: string
        type?: NotificationType
        priority?: NotificationPriority
        link?: string
        metadata?: Record<string, any>
        excludeStaffId?: string
    }): Promise<void> {
        try {
            const query: any = {
                status: "active",
                permissions: { $in: data.permissions },
            }

            if (data.excludeStaffId) {
                query._id = { $ne: data.excludeStaffId }
            }

            const staff = await Staff.find(query).select("_id").lean()
            const recipientIds = staff.map((s) => s._id.toString())

            if (recipientIds.length > 0) {
                await this.sendBulkNotifications({
                    recipientIds,
                    title: data.title,
                    message: data.message,
                    type: data.type,
                    priority: data.priority,
                    link: data.link,
                    metadata: data.metadata,
                })
            }
        } catch (error) {
            console.error("Error notifying by permission:", error)
        }
    }

    /**
     * Send notification to department head
     */
    static async notifyDepartmentHead(data: {
        departmentId: string
        title: string
        message: string
        type?: NotificationType
        priority?: NotificationPriority
        link?: string
        metadata?: Record<string, any>
    }): Promise<void> {
        try {
            const Department = mongoose.model("Department")
            const department = await Department.findById(data.departmentId)
                .select("head")
                .lean()

            if (department?.head) {
                await this.sendNotification({
                    recipientId: department.head.toString(),
                    title: data.title,
                    message: data.message,
                    type: data.type,
                    priority: data.priority,
                    link: data.link,
                    metadata: data.metadata,
                })
            }
        } catch (error) {
            console.error("Error notifying department head:", error)
        }
    }

    // =====================================================
    // SPECIFIC NOTIFICATION HELPERS
    // =====================================================

    /**
     * Notify when a leave request is submitted
     */
    static async notifyLeaveSubmitted(data: {
        staffId: string
        staffName: string
        leaveRequestId: string
        leaveType: string
        startDate: string
        endDate: string
        departmentId: string
    }): Promise<void> {
        // Notify the staff member (confirmation)
        await this.sendNotification({
            recipientId: data.staffId,
            title: "Leave Request Submitted",
            message: `Your ${data.leaveType} leave request from ${data.startDate} to ${data.endDate} has been submitted for approval.`,
            type: NotificationType.LEAVE_SUBMITTED,
            link: "/leave-requests",
            metadata: {
                entityType: "LeaveRequest",
                entityId: data.leaveRequestId,
                leaveType: data.leaveType,
            },
        })

        // Notify department head/managers
        await this.notifyDepartmentHead({
            departmentId: data.departmentId,
            title: "New Leave Request",
            message: `${data.staffName} has submitted a ${data.leaveType} leave request from ${data.startDate} to ${data.endDate}.`,
            type: NotificationType.LEAVE_SUBMITTED,
            priority: NotificationPriority.HIGH,
            link: "/leave-requests",
            metadata: {
                entityType: "LeaveRequest",
                entityId: data.leaveRequestId,
                actorId: data.staffId,
                actorName: data.staffName,
            },
        })
    }

    /**
     * Notify when a leave request is endorsed
     */
    static async notifyLeaveEndorsed(data: {
        staffId: string
        leaveRequestId: string
        leaveType: string
        endorsedBy: string
    }): Promise<void> {
        // Notify the staff member
        await this.sendNotification({
            recipientId: data.staffId,
            title: "Leave Request Endorsed",
            message: `Your ${data.leaveType} leave request has been endorsed by ${data.endorsedBy} and is pending final approval.`,
            type: NotificationType.LEAVE_ENDORSED,
            link: "/leave-requests",
            metadata: {
                entityType: "LeaveRequest",
                entityId: data.leaveRequestId,
            },
        })

        // Notify HR/Admin for final approval
        await this.notifyByPermission({
            permissions: ["HR", "ADMIN"],
            title: "Leave Request Pending Approval",
            message: `A ${data.leaveType} leave request has been endorsed and requires final approval.`,
            type: NotificationType.LEAVE_ENDORSED,
            priority: NotificationPriority.HIGH,
            link: "/leave-requests",
            metadata: {
                entityType: "LeaveRequest",
                entityId: data.leaveRequestId,
            },
        })
    }

    /**
     * Notify when a leave request is approved
     */
    static async notifyLeaveApproved(data: {
        staffId: string
        leaveRequestId: string
        leaveType: string
        startDate: string
        endDate: string
        approvedBy: string
    }): Promise<void> {
        await this.sendNotification({
            recipientId: data.staffId,
            title: "Leave Request Approved",
            message: `Your ${data.leaveType} leave request from ${data.startDate} to ${data.endDate} has been approved by ${data.approvedBy}. Enjoy your leave!`,
            type: NotificationType.LEAVE_APPROVED,
            priority: NotificationPriority.HIGH,
            link: "/leave-requests",
            metadata: {
                entityType: "LeaveRequest",
                entityId: data.leaveRequestId,
            },
        })
    }

    /**
     * Notify when a leave request is rejected
     */
    static async notifyLeaveRejected(data: {
        staffId: string
        leaveRequestId: string
        leaveType: string
        rejectedBy: string
        reason?: string
    }): Promise<void> {
        await this.sendNotification({
            recipientId: data.staffId,
            title: "Leave Request Rejected",
            message: `Your ${data.leaveType} leave request has been rejected by ${data.rejectedBy}.${data.reason ? ` Reason: ${data.reason}` : ""}`,
            type: NotificationType.LEAVE_REJECTED,
            priority: NotificationPriority.HIGH,
            link: "/leave-requests",
            metadata: {
                entityType: "LeaveRequest",
                entityId: data.leaveRequestId,
                reason: data.reason,
            },
        })
    }

    /**
     * Notify when a staff member is called in from leave
     */
    static async notifyCallIn(data: {
        staffId: string
        staffName: string
        callInId: string
        reason: string
        callInDate: string
        requestedBy: string
        departmentId: string
    }): Promise<void> {
        // Notify the staff member
        await this.sendNotification({
            recipientId: data.staffId,
            title: "Call-In Notice",
            message: `You have been called back from leave starting ${data.callInDate}. Reason: ${data.reason}`,
            type: NotificationType.CALLIN_CREATED,
            priority: NotificationPriority.URGENT,
            link: "/call-ins",
            metadata: {
                entityType: "CallIn",
                entityId: data.callInId,
                actorName: data.requestedBy,
            },
        })

        // Notify HR/Admin
        await this.notifyByPermission({
            permissions: ["HR", "ADMIN"],
            title: "Staff Called In",
            message: `${data.staffName} has been called back from leave by ${data.requestedBy}.`,
            type: NotificationType.CALLIN_CREATED,
            link: "/call-ins",
            metadata: {
                entityType: "CallIn",
                entityId: data.callInId,
                staffId: data.staffId,
                staffName: data.staffName,
            },
            excludeStaffId: data.staffId,
        })
    }

    /**
     * Notify when leave balance is low
     */
    static async notifyLowBalance(data: {
        staffId: string
        leaveType: string
        remainingDays: number
    }): Promise<void> {
        await this.sendNotification({
            recipientId: data.staffId,
            title: "Low Leave Balance Alert",
            message: `Your ${data.leaveType} leave balance is running low. You have ${data.remainingDays} day(s) remaining.`,
            type: NotificationType.BALANCE_LOW,
            priority: NotificationPriority.NORMAL,
            link: "/profile",
            metadata: {
                leaveType: data.leaveType,
                remainingDays: data.remainingDays,
            },
        })
    }

    /**
     * Create a system announcement for all active staff
     */
    static async createAnnouncement(data: {
        title: string
        message: string
        priority?: NotificationPriority
        link?: string
        expiresAt?: Date
        createdBy: string
    }): Promise<ResponseObject> {
        try {
            const activeStaff = await Staff.find({ status: "active" })
                .select("_id")
                .lean()

            const recipientIds = activeStaff.map((s) => s._id.toString())

            await this.sendBulkNotifications({
                recipientIds,
                title: data.title,
                message: data.message,
                type: NotificationType.SYSTEM_ANNOUNCEMENT,
                priority: data.priority || NotificationPriority.NORMAL,
                link: data.link,
                expiresAt: data.expiresAt,
                metadata: {
                    createdBy: data.createdBy,
                },
            })

            return successResponseObject("Announcement created successfully", {
                recipientCount: recipientIds.length,
            })
        } catch (error) {
            console.error("Error creating announcement:", error)
            return errorResponseObject("Failed to create announcement")
        }
    }
}

export default NotificationController
