import mongoose, { Schema, Model, Document } from "mongoose"

// Notification types
export enum NotificationType {
    // Leave-related
    LEAVE_SUBMITTED = "leave_submitted",
    LEAVE_ENDORSED = "leave_endorsed",
    LEAVE_APPROVED = "leave_approved",
    LEAVE_REJECTED = "leave_rejected",
    LEAVE_CANCELLED = "leave_cancelled",
    LEAVE_REMINDER = "leave_reminder",

    // Call-in related
    CALLIN_CREATED = "callin_created",
    CALLIN_CANCELLED = "callin_cancelled",

    // Balance related
    BALANCE_LOW = "balance_low",
    BALANCE_CREDITED = "balance_credited",
    BALANCE_DEBITED = "balance_debited",

    // System
    SYSTEM_ANNOUNCEMENT = "system_announcement",
    PROFILE_UPDATED = "profile_updated",

    // General
    INFO = "info",
    WARNING = "warning",
    SUCCESS = "success",
    ERROR = "error",
}

// Notification priority
export enum NotificationPriority {
    LOW = "low",
    NORMAL = "normal",
    HIGH = "high",
    URGENT = "urgent",
}

export interface NotificationInterface {
    _id: string
    recipient: mongoose.Types.ObjectId // Staff who receives the notification
    title: string
    message: string
    type: NotificationType
    priority: NotificationPriority
    isRead: boolean
    readAt?: Date
    link?: string // Optional link to navigate to
    metadata?: {
        entityType?: string // e.g., "LeaveRequest", "CallIn"
        entityId?: string
        actorId?: string // Who triggered the notification
        actorName?: string
        [key: string]: any
    }
    expiresAt?: Date // Optional expiration date
    createdAt: Date
    updatedAt: Date
}

interface NotificationDocument extends Omit<NotificationInterface, "_id">, Document {
    markAsRead(): Promise<void>
}

interface NotificationModel extends Model<NotificationDocument> {
    getUnreadCount(staffId: string): Promise<number>
    getNotifications(staffId: string, options?: { limit?: number; skip?: number; unreadOnly?: boolean }): Promise<NotificationDocument[]>
    markAllAsRead(staffId: string): Promise<number>
    createNotification(data: Partial<NotificationInterface>): Promise<NotificationDocument>
    createBulkNotifications(notifications: Partial<NotificationInterface>[]): Promise<NotificationDocument[]>
    deleteExpiredNotifications(): Promise<number>
}

const notificationSchema = new Schema<NotificationDocument>(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: [true, "Recipient is required"],
            index: true,
        },
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [200, "Title cannot exceed 200 characters"],
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
            maxlength: [1000, "Message cannot exceed 1000 characters"],
        },
        type: {
            type: String,
            enum: Object.values(NotificationType),
            default: NotificationType.INFO,
            index: true,
        },
        priority: {
            type: String,
            enum: Object.values(NotificationPriority),
            default: NotificationPriority.NORMAL,
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        readAt: {
            type: Date,
        },
        link: {
            type: String,
            trim: true,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
        expiresAt: {
            type: Date,
            index: true,
        },
    },
    {
        timestamps: true,
    }
)

// Compound indexes for common queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, createdAt: -1 })
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index for auto-deletion

// Instance method: Mark notification as read
notificationSchema.methods.markAsRead = async function (): Promise<void> {
    if (!this.isRead) {
        this.isRead = true
        this.readAt = new Date()
        await this.save()
    }
}

// Static method: Get unread count for a staff member
notificationSchema.statics.getUnreadCount = async function (
    staffId: string
): Promise<number> {
    return this.countDocuments({
        recipient: staffId,
        isRead: false,
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } },
        ],
    })
}

// Static method: Get notifications for a staff member
notificationSchema.statics.getNotifications = async function (
    staffId: string,
    options: { limit?: number; skip?: number; unreadOnly?: boolean } = {}
): Promise<NotificationDocument[]> {
    const { limit = 20, skip = 0, unreadOnly = false } = options

    const query: any = {
        recipient: staffId,
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } },
        ],
    }

    if (unreadOnly) {
        query.isRead = false
    }

    return this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
}

// Static method: Mark all notifications as read for a staff member
notificationSchema.statics.markAllAsRead = async function (
    staffId: string
): Promise<number> {
    const result = await this.updateMany(
        { recipient: staffId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
    )
    return result.modifiedCount
}

// Static method: Create a notification
notificationSchema.statics.createNotification = async function (
    data: Partial<NotificationInterface>
): Promise<NotificationDocument> {
    return this.create(data)
}

// Static method: Create bulk notifications (e.g., for announcements)
notificationSchema.statics.createBulkNotifications = async function (
    notifications: Partial<NotificationInterface>[]
): Promise<NotificationDocument[]> {
    return this.insertMany(notifications)
}

// Static method: Delete expired notifications (called by scheduled job)
notificationSchema.statics.deleteExpiredNotifications = async function (): Promise<number> {
    const result = await this.deleteMany({
        expiresAt: { $lt: new Date() },
    })
    return result.deletedCount
}

const Notification = (mongoose.models.Notification as NotificationModel) ||
    mongoose.model<NotificationDocument, NotificationModel>("Notification", notificationSchema)

export default Notification
