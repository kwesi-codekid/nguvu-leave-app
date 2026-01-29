import mongoose, { Schema, Document, Model } from "mongoose"
import { AuditLogInterface, AuditAction, ChangeRecord } from "../utils/types"

// Extend the interface for Mongoose document
export interface IAuditLog extends AuditLogInterface, Document {
    _id: string
}

// Interface for the static methods
interface IAuditLogModel extends Model<IAuditLog> {
    logAction(data: Partial<AuditLogInterface>): Promise<IAuditLog>
    getUserActivity(
        userId: string,
        options?: {
            limit?: number
            skip?: number
            startDate?: Date
            endDate?: Date
            actions?: AuditAction[]
        }
    ): Promise<IAuditLog[]>
    getEntityHistory(
        entityType: string,
        entityId: string,
        options?: {
            limit?: number
            skip?: number
        }
    ): Promise<IAuditLog[]>
    getRecentActions(options?: {
        limit?: number
        skip?: number
        action?: AuditAction
        entityType?: string
        performedBy?: string
    }): Promise<IAuditLog[]>
}

// Define the Change Record sub-schema
const ChangeRecordSchema = new Schema<ChangeRecord>(
    {
        field: {
            type: String,
            required: true,
        },
        oldValue: {
            type: Schema.Types.Mixed,
        },
        newValue: {
            type: Schema.Types.Mixed,
        },
        fieldLabel: {
            type: String,
        },
    },
    { _id: false }
)

// Define the Audit Log schema
const AuditLogSchema = new Schema<IAuditLog>(
    {
        action: {
            type: String,
            enum: Object.values(AuditAction),
            required: true,
            index: true,
        },
        entityType: {
            type: String,
            required: true,
            index: true,
        },
        entityId: {
            type: String,
            required: true,
            index: true,
        },
        performedBy: {
            type: String,
            required: true,
            index: true,
        },
        performedByName: {
            type: String,
        },
        performedByEmail: {
            type: String,
        },
        ipAddress: {
            type: String,
        },
        userAgent: {
            type: String,
        },
        changes: {
            type: [ChangeRecordSchema],
            default: undefined,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: undefined,
        },
        description: {
            type: String,
        },
        status: {
            type: String,
            enum: ["success", "failed"],
            default: "success",
        },
        errorMessage: {
            type: String,
        },
    },
    {
        timestamps: true,
        collection: "audit_logs",
    }
)

// Create compound indexes for efficient querying
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
AuditLogSchema.index({ performedBy: 1, createdAt: -1 })
AuditLogSchema.index({ action: 1, createdAt: -1 })
AuditLogSchema.index({ createdAt: -1 })

// Optional: Add TTL index to automatically delete old logs (e.g., after 2 years)
// Uncomment the following line if you want automatic cleanup
// AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }) // 2 years in seconds

// Prevent updates to audit logs (they should be immutable)
AuditLogSchema.pre(["updateOne", "findOneAndUpdate", "updateMany"], function (next) {
    next(new Error("Audit logs cannot be modified"))
})

// Prevent deletion of audit logs (except by TTL if configured)
AuditLogSchema.pre(["deleteOne", "findOneAndDelete", "deleteMany"], function (next) {
    next(new Error("Audit logs cannot be deleted manually"))
})

// Static method to create an audit log entry
AuditLogSchema.statics.logAction = async function (
    data: Partial<AuditLogInterface>
): Promise<IAuditLog> {
    try {
        const auditLog = new this(data)
        return await auditLog.save()
    } catch (error) {
        console.error("Failed to create audit log:", error)
        throw error
    }
}

// Static method to get user activity
AuditLogSchema.statics.getUserActivity = async function (
    userId: string,
    options: {
        limit?: number
        skip?: number
        startDate?: Date
        endDate?: Date
        actions?: AuditAction[]
    } = {}
): Promise<IAuditLog[]> {
    const { limit = 50, skip = 0, startDate, endDate, actions } = options

    const query: any = { performedBy: userId }

    if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) query.createdAt.$gte = startDate
        if (endDate) query.createdAt.$lte = endDate
    }

    if (actions && actions.length > 0) {
        query.action = { $in: actions }
    }

    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean()
        .exec()
}

// Static method to get entity history
AuditLogSchema.statics.getEntityHistory = async function (
    entityType: string,
    entityId: string,
    options: { limit?: number; skip?: number } = {}
): Promise<IAuditLog[]> {
    const { limit = 50, skip = 0 } = options

    return this.find({ entityType, entityId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean()
        .exec()
}

// Static method to get recent actions with filters
AuditLogSchema.statics.getRecentActions = async function (
    options: {
        limit?: number
        skip?: number
        action?: AuditAction
        entityType?: string
        performedBy?: string
    } = {}
): Promise<IAuditLog[]> {
    const { limit = 50, skip = 0, action, entityType, performedBy } = options

    const query: any = {}

    if (action) query.action = action
    if (entityType) query.entityType = entityType
    if (performedBy) query.performedBy = performedBy

    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean()
        .exec()
}

// Virtual for formatted timestamp
AuditLogSchema.virtual("formattedCreatedAt").get(function () {
    return this.createdAt?.toLocaleString()
})

// Ensure virtual fields are included in JSON output
AuditLogSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const AuditLog = (mongoose.models.AuditLog as mongoose.Model<IAuditLog, IAuditLogModel>) || mongoose.model<IAuditLog, IAuditLogModel>("AuditLog", AuditLogSchema)

export default AuditLog
