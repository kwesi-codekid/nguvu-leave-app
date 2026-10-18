import mongoose, { Schema, Document, Model, ClientSession } from "mongoose"
import {
    LeaveRequestInterface,
    LeaveTypes,
    LeaveStatus,
    EndorsementRecord,
    ApprovalRecord,
    CancellationRecord,
    DocumentAttachment,
    WorkingDaysBreakdown,
    LEAVE_TYPES_REQUIRING_DOCUMENTS,
    GENDER_RESTRICTED_LEAVES,
    Gender,
} from "../utils/types"

// Extend the interface for Mongoose document
export interface ILeaveRequest extends LeaveRequestInterface, Document {
    _id: string

    computeWorkingDays(): Promise<{ total: number; breakdown: WorkingDaysBreakdown }>
    validateRequest(): Promise<void>
    endorse(byStaff: string, comment?: string): Promise<ILeaveRequest>
    approve(byStaff: string, comment?: string, session?: ClientSession): Promise<ILeaveRequest>
    reject(byStaff: string, comment?: string): Promise<ILeaveRequest>
    cancel(byStaff: string, reason?: string, session?: ClientSession): Promise<ILeaveRequest>
    canBeCancelled(): boolean
}

// Interface for static methods
interface ILeaveRequestModel extends Model<ILeaveRequest> {
    getOverlappingRequests(
        staffId: string,
        startDate: Date,
        endDate: Date,
        excludeId?: string
    ): Promise<ILeaveRequest[]>
    getStaffRequests(
        staffId: string,
        year?: number,
        status?: LeaveStatus
    ): Promise<ILeaveRequest[]>
    getPendingEndorsements(positionId: string): Promise<ILeaveRequest[]>
    getPendingApprovals(positionId: string): Promise<ILeaveRequest[]>
}

// Sub-schemas
const DocumentAttachmentSchema = new Schema<DocumentAttachment>(
    {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        filename: { type: String, required: true },
        fileType: { type: String, required: true },
        uploadedAt: { type: Date, required: true, default: Date.now },
    },
    { _id: false }
)

const EndorsementRecordSchema = new Schema<EndorsementRecord>(
    {
        byPosition: { type: Schema.Types.ObjectId, ref: "JobPosition", required: true },
        byStaff: { type: Schema.Types.ObjectId, ref: "Staff" },
        at: { type: Date },
        comment: { type: String, maxlength: 500 },
    },
    { _id: false }
)

const ApprovalRecordSchema = new Schema<ApprovalRecord>(
    {
        byPosition: { type: Schema.Types.ObjectId, ref: "JobPosition", required: true },
        byStaff: { type: Schema.Types.ObjectId, ref: "Staff" },
        at: { type: Date },
        comment: { type: String, maxlength: 500 },
        decision: { type: String, enum: ["approved", "rejected"] },
    },
    { _id: false }
)

const CancellationRecordSchema = new Schema<CancellationRecord>(
    {
        byStaff: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
        at: { type: Date, required: true },
        reason: { type: String, maxlength: 500 },
    },
    { _id: false }
)

// Define the LeaveRequest schema
const LeaveRequestSchema = new Schema<ILeaveRequest>(
    {
        staff: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: true,
            index: true,
        },
        contract: {
            type: Schema.Types.ObjectId,
            ref: "StaffContract",
            required: true,
            index: true,
        },
        position: {
            type: Schema.Types.ObjectId,
            ref: "JobPosition",
            required: true,
            index: true,
        },
        department: {
            type: Schema.Types.ObjectId,
            ref: "Department",
            required: true,
            index: true,
        },
        positionTitleSnapshot: {
            type: String,
            maxlength: 100,
        },
        departmentNameSnapshot: {
            type: String,
            maxlength: 100,
        },
        leaveType: {
            type: String,
            enum: Object.values(LeaveTypes),
            required: true,
            index: true,
        },
        startDate: {
            type: Date,
            required: true,
            index: true,
        },
        endDate: {
            type: Date,
            required: true,
            validate: {
                validator: function (value: Date) {
                    return value >= this.startDate
                },
                message: "End date must be after or equal to start date",
            },
        },
        startYear: {
            type: Number,
            required: true,
            index: true,
        },
        workingDays: {
            type: Number,
            required: true,
            min: 1,
        },
        workingDaysBreakdown: {
            type: Schema.Types.Mixed,
            default: {},
        },
        status: {
            type: String,
            enum: Object.values(LeaveStatus),
            default: LeaveStatus.PENDING,
            required: true,
            index: true,
        },
        reason: {
            type: String,
            maxlength: 1000,
        },
        attachments: {
            type: [DocumentAttachmentSchema],
            default: [],
        },
        endorsement: {
            type: EndorsementRecordSchema,
            default: null,
        },
        approval: {
            type: ApprovalRecordSchema,
            default: null,
        },
        cancellation: {
            type: CancellationRecordSchema,
            default: null,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            index: true,
        },
        delegatedBy: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
        },
        balanceDebited: {
            type: Boolean,
            // false when an approved request was never deducted from a balance
            // (e.g. emergency leave created with skipValidation), so cancelling
            // it doesn't credit back days that were never taken. Unset on older
            // requests, which were all debited on approval.
        },
    },
    {
        timestamps: true,
        collection: "leave_requests",
    }
)

// Indexes
LeaveRequestSchema.index({ staff: 1, startDate: 1, endDate: 1 })
LeaveRequestSchema.index({ status: 1, createdAt: -1 })
LeaveRequestSchema.index({ startYear: 1, leaveType: 1 })

// Pre-save validation
LeaveRequestSchema.pre("save", async function () {
    // Set start year if not set
    if (!this.startYear) {
        this.startYear = this.startDate.getFullYear()
    }

    // Validate start date is in current year or future. Only on create or when
    // the start date changes: approving/cancelling a December request in
    // January must still be able to save.
    if (this.isNew || this.isModified("startDate")) {
        const currentYear = new Date().getFullYear()
        if (this.startYear < currentYear) {
            throw new Error("Leave start date cannot be in past years")
        }
    }

    // Compute working days if dates changed
    if (this.isModified("startDate") || this.isModified("endDate")) {
        const { total, breakdown } = await this.computeWorkingDays()
        this.workingDays = total
        this.workingDaysBreakdown = breakdown
    }

    // Validate request if new
    if (this.isNew) {
        await this.validateRequest()

        // Set approval chain from position
        const JobPosition = mongoose.model("JobPosition")
        const position = await JobPosition.findById(this.position)

        if (position) {
            // Snapshot position and department names
            this.positionTitleSnapshot = position.title

            const Department = mongoose.model("Department")
            const dept = await Department.findById(this.department)
            if (dept) {
                this.departmentNameSnapshot = dept.name
            }

            // Set endorsement and approval positions
            if (position.endorserPosition) {
                this.endorsement = {
                    byPosition: position.endorserPosition,
                } as EndorsementRecord
            }

            if (position.approverPosition) {
                this.approval = {
                    byPosition: position.approverPosition,
                } as ApprovalRecord
            }
        }
    }
})

// Find the balance for the period containing `date`. Sorted so that, if periods
// ever overlap, the most recent one is used consistently everywhere.
function findBalanceForDate(
    staffId: string,
    leaveType: string,
    date: Date,
    session?: ClientSession | null
) {
    const LeaveBalance = mongoose.model("LeaveBalance")
    const query = LeaveBalance.findOne({
        staff: staffId,
        leaveType,
        periodStart: { $lte: date },
        periodEnd: { $gte: date },
    }).sort({ periodStart: -1 })
    return session ? query.session(session) : query
}

// Atomically move a request between statuses so two concurrent actions (e.g. a
// double-clicked Approve) can't both debit or credit the balance.
async function claimStatus(
    doc: any,
    from: LeaveStatus,
    to: LeaveStatus,
    session?: ClientSession | null
) {
    const result = await doc.constructor.updateOne(
        { _id: doc._id, status: from },
        { $set: { status: to } },
        session ? { session } : {}
    )
    if (result.modifiedCount === 0) {
        throw new Error("This leave request has already been processed")
    }
}

// Run a compensating step after a failure without letting its own failure
// replace the original error (inside an aborted transaction it will fail, and
// the abort rolls everything back anyway).
async function undo(step: Promise<unknown>) {
    try {
        await step
    } catch (error) {
        console.error("[LeaveRequest] Failed to undo partial update:", error)
    }
}

// Instance method to compute working days
LeaveRequestSchema.methods.computeWorkingDays = async function (): Promise<{
    total: number
    breakdown: WorkingDaysBreakdown
}> {
    const Holiday = mongoose.model("Holiday")
    const breakdown: WorkingDaysBreakdown = {}
    let total = 0

    const currentDate = new Date(this.startDate)
    const endDate = new Date(this.endDate)

    while (currentDate <= endDate) {
        const year = currentDate.getFullYear()

        // Skip weekends
        const dayOfWeek = currentDate.getDay()
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Check if it's a holiday
            const isHoliday = await Holiday.isHoliday(currentDate)

            if (!isHoliday) {
                breakdown[year] = (breakdown[year] || 0) + 1
                total++
            }
        }

        currentDate.setDate(currentDate.getDate() + 1)
    }

    return { total, breakdown }
}

// Instance method to validate request
LeaveRequestSchema.methods.validateRequest = async function (): Promise<void> {
    const Staff = mongoose.model("Staff")

    // Get staff details
    const staff = await Staff.findById(this.staff)
    if (!staff) {
        throw new Error("Staff not found")
    }

    // Check document requirements
    if (LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(this.leaveType)) {
        if (!this.attachments || this.attachments.length === 0) {
            throw new Error(`${this.leaveType} leave requires supporting documents`)
        }
    }

    // Check gender restrictions
    if (this.leaveType in GENDER_RESTRICTED_LEAVES) {
        const requiredGender = GENDER_RESTRICTED_LEAVES[this.leaveType as keyof typeof GENDER_RESTRICTED_LEAVES]
        if (staff.gender !== requiredGender) {
            throw new Error(
                `${this.leaveType} leave is only available for ${requiredGender} staff`
            )
        }
    }

    // Get staff ID (handle both populated and non-populated staff field)
    const staffId = this.staff._id ? this.staff._id.toString() : this.staff.toString()

    // Check balance availability (period-based lookup)
    const balance = await findBalanceForDate(staffId, this.leaveType, new Date(this.startDate))

    if (!balance) {
        throw new Error(
            `No ${this.leaveType} balance found for the current leave period`
        )
    }

    if (!balance.canRequest(this.workingDays)) {
        throw new Error(
            `Insufficient leave balance. Available: ${balance.availableForRequest} days, Requested: ${this.workingDays} days`
        )
    }

    // Check for overlapping requests
    const overlapping = await (this.constructor as ILeaveRequestModel).getOverlappingRequests(
        staffId,
        this.startDate,
        this.endDate,
        this._id
    )

    if (overlapping.length > 0) {
        throw new Error("You have overlapping leave requests for the selected dates")
    }
}

// Instance method to endorse
LeaveRequestSchema.methods.endorse = async function (
    byStaff: string,
    comment?: string
): Promise<ILeaveRequest> {
    if (this.status !== LeaveStatus.PENDING) {
        throw new Error("Only pending requests can be endorsed")
    }

    // Check if endorser and approver positions are the same. The positions may
    // be populated documents, so compare their ids.
    const idOf = (value: any) => (value?._id ?? value)?.toString()
    const isSingleLevelApproval = this.endorsement?.byPosition &&
                                   this.approval?.byPosition &&
                                   idOf(this.endorsement.byPosition) === idOf(this.approval.byPosition)

    if (isSingleLevelApproval) {
        // Single-level approval: directly approve the request

        // Get staff ID (handle both populated and non-populated staff field)
        const staffId = this.staff._id ? this.staff._id.toString() : this.staff.toString()

        // Debit balance (period-based lookup)
        const balance = await findBalanceForDate(staffId, this.leaveType, new Date(this.startDate))

        if (!balance) {
            throw new Error(`No ${this.leaveType} balance found for the current leave period`)
        }

        this.status = LeaveStatus.APPROVED

        // Set both endorsement and approval records
        if (this.endorsement) {
            this.endorsement.byStaff = byStaff
            this.endorsement.at = new Date()
            this.endorsement.comment = comment
        }

        if (this.approval) {
            this.approval.byStaff = byStaff
            this.approval.at = new Date()
            this.approval.comment = comment || "Auto-approved (single-level approval)"
            this.approval.decision = "approved"
        }

        // Fail on schema errors (e.g. an over-long comment) before the balance changes
        const validationError = this.validateSync()
        if (validationError) throw validationError

        await claimStatus(this, LeaveStatus.PENDING, LeaveStatus.APPROVED)
        try {
            await balance.debit(
                this.workingDays,
                `Leave request ${this._id} approved (single-level)`
            )
        } catch (error) {
            await undo(claimStatus(this, LeaveStatus.APPROVED, LeaveStatus.PENDING))
            throw error
        }

        try {
            return await this.save()
        } catch (error) {
            // Don't leave the balance debited for a request that isn't approved
            await undo(balance.credit(this.workingDays, `Leave request ${this._id} approval failed to save`))
            await undo(claimStatus(this, LeaveStatus.APPROVED, LeaveStatus.PENDING))
            throw error
        }
    } else {
        // Two-level approval: standard endorsement flow
        this.status = LeaveStatus.ENDORSED
        if (this.endorsement) {
            this.endorsement.byStaff = byStaff
            this.endorsement.at = new Date()
            this.endorsement.comment = comment
        }
    }

    return await this.save()
}

// Instance method to approve
LeaveRequestSchema.methods.approve = async function (
    byStaff: string,
    comment?: string,
    session?: ClientSession
): Promise<ILeaveRequest> {
    if (this.status !== LeaveStatus.ENDORSED) {
        throw new Error("Only endorsed requests can be approved")
    }

    // Get staff ID (handle both populated and non-populated staff field)
    const staffId = this.staff._id ? this.staff._id.toString() : this.staff.toString()

    // Debit balance (period-based lookup). Loading it in the session makes the
    // debit's save part of the same transaction when one is in use.
    const balance = await findBalanceForDate(staffId, this.leaveType, new Date(this.startDate), session)

    if (!balance) {
        throw new Error(`No ${this.leaveType} balance found for the current leave period`)
    }

    this.status = LeaveStatus.APPROVED
    if (this.approval) {
        this.approval.byStaff = byStaff
        this.approval.at = new Date()
        this.approval.comment = comment
        this.approval.decision = "approved"
    }

    // Fail on schema errors (e.g. an over-long comment) before the balance changes
    const validationError = this.validateSync()
    if (validationError) throw validationError

    await claimStatus(this, LeaveStatus.ENDORSED, LeaveStatus.APPROVED, session)
    try {
        await balance.debit(
            this.workingDays,
            `Leave request ${this._id} approved`
        )
    } catch (error) {
        await undo(claimStatus(this, LeaveStatus.APPROVED, LeaveStatus.ENDORSED, session))
        throw error
    }

    try {
        return await this.save({ session })
    } catch (error) {
        // Don't leave the balance debited for a request that isn't approved
        await undo(balance.credit(this.workingDays, `Leave request ${this._id} approval failed to save`))
        await undo(claimStatus(this, LeaveStatus.APPROVED, LeaveStatus.ENDORSED, session))
        throw error
    }
}

// Instance method to reject
LeaveRequestSchema.methods.reject = async function (
    byStaff: string,
    comment?: string
): Promise<ILeaveRequest> {
    if (this.status !== LeaveStatus.ENDORSED) {
        throw new Error("Only endorsed requests can be rejected")
    }

    this.status = LeaveStatus.REJECTED
    if (this.approval) {
        this.approval.byStaff = byStaff
        this.approval.at = new Date()
        this.approval.comment = comment
        this.approval.decision = "rejected"
    }

    return await this.save()
}

// Instance method to check if can be cancelled
LeaveRequestSchema.methods.canBeCancelled = function (): boolean {
    if (this.status !== LeaveStatus.APPROVED) {
        return false
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDate = new Date(this.startDate)
    startDate.setHours(0, 0, 0, 0)

    return startDate > today
}

// Instance method to cancel
LeaveRequestSchema.methods.cancel = async function (
    byStaff: string,
    reason?: string,
    session?: ClientSession
): Promise<ILeaveRequest> {
    if (!this.canBeCancelled()) {
        throw new Error("This leave request cannot be cancelled")
    }

    // Get staff ID (handle both populated and non-populated staff field)
    const staffId = this.staff._id ? this.staff._id.toString() : this.staff.toString()

    // Only credit back days that were actually deducted
    const wasDebited = this.get("balanceDebited") !== false

    // Credit back the balance (period-based lookup)
    const balance = wasDebited
        ? await findBalanceForDate(staffId, this.leaveType, new Date(this.startDate), session)
        : null

    if (wasDebited && !balance) {
        throw new Error(`No ${this.leaveType} balance found for the current leave period`)
    }

    this.status = LeaveStatus.CANCELLED
    this.cancellation = {
        byStaff,
        at: new Date(),
        reason,
    }

    // Fail on schema errors (e.g. an over-long reason) before the balance changes
    const validationError = this.validateSync()
    if (validationError) throw validationError

    await claimStatus(this, LeaveStatus.APPROVED, LeaveStatus.CANCELLED, session)
    if (balance) {
        try {
            await balance.credit(
                this.workingDays,
                `Leave request ${this._id} cancelled`
            )
        } catch (error) {
            await undo(claimStatus(this, LeaveStatus.CANCELLED, LeaveStatus.APPROVED, session))
            throw error
        }
    }

    try {
        return await this.save({ session })
    } catch (error) {
        // Don't leave days credited back for a request that is still approved
        if (balance) {
            await undo(balance.debit(this.workingDays, `Leave request ${this._id} cancellation failed to save`))
        }
        await undo(claimStatus(this, LeaveStatus.CANCELLED, LeaveStatus.APPROVED, session))
        throw error
    }
}

// Static method to get overlapping requests
LeaveRequestSchema.statics.getOverlappingRequests = async function (
    staffId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string
): Promise<ILeaveRequest[]> {
    const query: any = {
        staff: staffId,
        status: { $in: [LeaveStatus.PENDING, LeaveStatus.ENDORSED, LeaveStatus.APPROVED] },
        $or: [
            // Request starts within the date range
            { startDate: { $gte: startDate, $lte: endDate } },
            // Request ends within the date range
            { endDate: { $gte: startDate, $lte: endDate } },
            // Request encompasses the date range
            { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
        ],
    }

    if (excludeId) {
        query._id = { $ne: excludeId }
    }

    return this.find(query).lean().exec()
}

// Static method to get staff requests
LeaveRequestSchema.statics.getStaffRequests = async function (
    staffId: string,
    year?: number,
    status?: LeaveStatus
): Promise<ILeaveRequest[]> {
    const query: any = { staff: staffId }

    if (year) {
        query.startYear = year
    }

    if (status) {
        query.status = status
    }

    return this.find(query)
        .sort({ createdAt: -1 })
        .populate("position department")
        .lean()
        .exec()
}

// Static method to get pending endorsements
LeaveRequestSchema.statics.getPendingEndorsements = async function (
    positionId: string
): Promise<ILeaveRequest[]> {
    return this.find({
        status: LeaveStatus.PENDING,
        "endorsement.byPosition": positionId,
    })
        .sort({ createdAt: 1 })
        .populate("staff position department")
        .lean()
        .exec()
}

// Static method to get pending approvals
LeaveRequestSchema.statics.getPendingApprovals = async function (
    positionId: string
): Promise<ILeaveRequest[]> {
    return this.find({
        status: LeaveStatus.ENDORSED,
        "approval.byPosition": positionId,
    })
        .sort({ createdAt: 1 })
        .populate("staff position department")
        .lean()
        .exec()
}

// Ensure virtual fields are included in JSON output
LeaveRequestSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const LeaveRequest = (mongoose.models.LeaveRequest as mongoose.Model<ILeaveRequest, ILeaveRequestModel>) || mongoose.model<ILeaveRequest, ILeaveRequestModel>(
    "LeaveRequest",
    LeaveRequestSchema
)

export default LeaveRequest
