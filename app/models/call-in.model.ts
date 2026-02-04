import mongoose, { Schema, Model, Document } from "mongoose"
import { CallInInterface, LeaveStatus, LeaveTypes, AuditAction } from "../utils/types"

// Extended interface for document methods
interface CallInDocument extends Omit<CallInInterface, "_id">, Document {
    calculateWorkingDays(): Promise<number>
    processCallIn(): Promise<void>
}

// Static methods interface
interface CallInModel extends Model<CallInDocument> {
    getCallInsByStaff(staffId: string, year?: number): Promise<CallInDocument[]>
    getCallInsByDepartment(
        departmentId: string,
        startDate: Date,
        endDate: Date
    ): Promise<CallInDocument[]>
    getCallInReport(startDate: Date, endDate: Date): Promise<CallInDocument[]>
    getTotalCallInDays(staffId: string, year: number): Promise<number>
}

const callInSchema = new Schema<any>(
    {
        leaveRequest: {
            type: Schema.Types.ObjectId,
            ref: "LeaveRequest",
            required: [true, "Leave request is required"],
            index: true,
        },
        staff: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: [true, "Staff is required"],
            index: true,
        },
        department: {
            type: Schema.Types.ObjectId,
            ref: "Department",
            required: [true, "Department is required"],
            index: true,
        },
        callInStartDate: {
            type: Date,
            required: [true, "Call-in start date is required"],
        },
        callInEndDate: {
            type: Date,
            required: [true, "Call-in end date is required"],
        },
        workingDaysRecovered: {
            type: Number,
            required: [true, "Working days recovered is required"],
            min: [1, "At least 1 working day must be recovered"],
        },
        reason: {
            type: String,
            required: [true, "Reason for call-in is required"],
            trim: true,
            minlength: [10, "Reason must be at least 10 characters"],
        },
        requestedBy: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: [true, "Requesting manager is required"],
        },
        requestedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
)

// Indexes for performance
callInSchema.index({ leaveRequest: 1, callInStartDate: 1, callInEndDate: 1 })
callInSchema.index({ staff: 1, requestedAt: -1 })
callInSchema.index({ department: 1, requestedAt: -1 })
callInSchema.index({ callInStartDate: 1, callInEndDate: 1 })

// Validation: Call-in dates must be within leave period
callInSchema.pre("validate", async function () {
    const doc = this as any
    if (!doc.leaveRequest) return

    const LeaveRequest = mongoose.model("LeaveRequest")
    const leaveRequest = await LeaveRequest.findById(doc.leaveRequest)
    if (!leaveRequest) {
        throw new Error("Leave request not found")
    }

    // Check if leave is approved
    if (leaveRequest.status !== LeaveStatus.APPROVED) {
        throw new Error("Can only call in staff from approved leave")
    }

    // Check dates are within leave period
    const leaveStart = new Date(leaveRequest.startDate)
    const leaveEnd = new Date(leaveRequest.endDate)
    const callInStart = new Date(doc.callInStartDate)
    const callInEnd = new Date(doc.callInEndDate)

    if (callInStart < leaveStart || callInEnd > leaveEnd) {
        throw new Error(
            "Call-in dates must be within the original leave period"
        )
    }

    if (callInStart > callInEnd) {
        throw new Error("Call-in start date must be before end date")
    }

    // Populate staff and department from leave request if not provided
    if (!doc.staff) {
        doc.staff = leaveRequest.staff
    }
    if (!doc.department) {
        doc.department = leaveRequest.department
    }
})

// Validation: Check for overlapping call-ins
callInSchema.pre("validate", async function () {
    const doc = this as any
    if (!doc.leaveRequest || !doc.isNew) return

    const existingCallIn = await mongoose
        .model<CallInDocument>("CallIn")
        .findOne({
            leaveRequest: doc.leaveRequest,
            $or: [
                {
                    callInStartDate: { $lte: doc.callInEndDate },
                    callInEndDate: { $gte: doc.callInStartDate },
                },
            ],
        })

    if (existingCallIn) {
        throw new Error(
            "Overlapping call-in already exists for this leave period"
        )
    }
})

// Validation: Only authorized staff (department heads, HR, Admin) can create call-ins
// Note: The controller already performs thorough permission checks before saving.
// This hook validates the requesting staff exists but defers permission logic to the controller
callInSchema.pre("validate", async function () {
    const doc = this as any
    if (!doc.requestedBy || !doc.department || !doc.isNew) return

    const Staff = mongoose.model("Staff")
    const requestingStaff = await Staff.findById(doc.requestedBy)
    if (!requestingStaff) {
        throw new Error("Requesting staff not found")
    }

    // Permission checks are handled by the controller
    // The controller validates HR/Admin/Department head permissions before reaching here
})

// Method: Calculate working days in call-in period
callInSchema.methods.calculateWorkingDays = async function (): Promise<number> {
    const doc = this as any
    const startDate = new Date(doc.callInStartDate)
    const endDate = new Date(doc.callInEndDate)

    // Get holidays in the period
    const Holiday = mongoose.model("Holiday")
    const holidays = await Holiday.find({
        $or: [
            // Varying holidays with specific dates
            {
                type: "varying",
                date: {
                    $gte: startDate,
                    $lte: endDate,
                },
            },
            // Fixed holidays (need to check month and day)
            {
                type: "fixed",
            },
        ],
    })

    let workingDays = 0
    const current = new Date(startDate)

    while (current <= endDate) {
        const dayOfWeek = current.getDay()

        // Skip weekends
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Check if it's a holiday
            const isHoliday = holidays.some((holiday: any) => {
                if (holiday.type === "varying") {
                    return (
                        holiday.date &&
                        new Date(holiday.date).toDateString() ===
                            current.toDateString()
                    )
                } else if (holiday.type === "fixed") {
                    return (
                        holiday.fixedMonth === current.getMonth() + 1 &&
                        holiday.fixedDay === current.getDate()
                    )
                }
                return false
            })

            if (!isHoliday) {
                workingDays++
            }
        }

        current.setDate(current.getDate() + 1)
    }

    return workingDays
}

// Method: Process call-in (credit balance automatically)
callInSchema.methods.processCallIn = async function (): Promise<void> {
    const doc = this as any
    try {
        const LeaveRequest = mongoose.model("LeaveRequest")
        const LeaveBalance = mongoose.model("LeaveBalance")
        const AuditLog = mongoose.model("AuditLog")

        const leaveRequest = await LeaveRequest.findById(doc.leaveRequest)
        if (!leaveRequest) {
            throw new Error("Leave request not found")
        }

        const currentYear = new Date().getFullYear()

        // Find the leave balance for the staff
        const leaveBalance = await LeaveBalance.findOne({
            staff: doc.staff,
            year: currentYear,
            leaveType: leaveRequest.leaveType,
        })

        if (!leaveBalance) {
            throw new Error(
                `Leave balance not found for staff ${doc.staff} for year ${currentYear}`
            )
        }

        // Credit the working days back to the balance
        const daysToCredit = doc.workingDaysRecovered

        // Update the used days (reduce by the credited amount)
        leaveBalance.used = Math.max(0, leaveBalance.used - daysToCredit)

        // Add note about the call-in
        const note = `Call-in processed: ${daysToCredit} days credited back from leave ${doc.leaveRequest}`
        leaveBalance.notes = leaveBalance.notes
            ? `${leaveBalance.notes}\n${note}`
            : note

        await leaveBalance.save()

        // Create audit log entry
        await AuditLog.create({
            action: AuditAction.CALLIN_CREATED,
            entityType: "CallIn",
            entityId: doc._id,
            performedBy: doc.requestedBy,
            description: `Call-in created for ${daysToCredit} days`,
            metadata: {
                leaveRequestId: doc.leaveRequest,
                staffId: doc.staff,
                departmentId: doc.department,
                daysRecovered: daysToCredit,
                callInPeriod: {
                    start: doc.callInStartDate,
                    end: doc.callInEndDate,
                },
            },
            status: "success",
        })

        // Also create audit log for balance credit
        await AuditLog.create({
            action: AuditAction.BALANCE_CREDITED,
            entityType: "LeaveBalance",
            entityId: leaveBalance._id,
            performedBy: doc.requestedBy,
            description: `${daysToCredit} days credited due to call-in`,
            metadata: {
                callInId: doc._id,
                leaveType: leaveRequest.leaveType,
                previousUsed: leaveBalance.used + daysToCredit,
                newUsed: leaveBalance.used,
                daysCredied: daysToCredit,
            },
            status: "success",
        })
    } catch (error) {
        // Log the error
        const AuditLog = mongoose.model("AuditLog")
        await AuditLog.create({
            action: AuditAction.CALLIN_CREATED,
            entityType: "CallIn",
            entityId: doc._id,
            performedBy: doc.requestedBy,
            description: "Failed to process call-in",
            errorMessage:
                error instanceof Error ? error.message : "Unknown error",
            status: "failed",
        })
        throw error
    }
}

// Hook: Calculate working days before saving and track if new
callInSchema.pre("save", async function () {
    const doc = this as any
    // Track if this is a new document (isNew becomes false after save)
    doc._wasNew = doc.isNew

    if (doc.isNew) {
        // Calculate working days if not provided
        if (!doc.workingDaysRecovered) {
            doc.workingDaysRecovered = await doc.calculateWorkingDays()
        }
    }
})

// Hook: Process call-in after saving (automatic balance credit)
callInSchema.post("save", async function (doc) {
    const callInDoc = doc as any
    // Only process for new call-ins
    if (callInDoc._wasNew) {
        try {
            await callInDoc.processCallIn()
        } catch (error) {
            console.error("Error processing call-in:", error)
            // The call-in is saved but processing failed
            // This should be handled by monitoring/alerts
        }
    }
})

// Static method: Get call-ins by staff
callInSchema.statics.getCallInsByStaff = async function (
    staffId: string,
    year?: number
): Promise<CallInDocument[]> {
    const query: any = { staff: staffId }

    if (year) {
        const startOfYear = new Date(year, 0, 1)
        const endOfYear = new Date(year, 11, 31, 23, 59, 59)
        query.callInStartDate = { $gte: startOfYear, $lte: endOfYear }
    }

    return this.find(query)
        .populate("leaveRequest", "leaveType startDate endDate")
        .populate("department", "name")
        .populate("requestedBy", "name")
        .sort({ requestedAt: -1 })
}

// Static method: Get call-ins by department
callInSchema.statics.getCallInsByDepartment = async function (
    departmentId: string,
    startDate: Date,
    endDate: Date
): Promise<CallInDocument[]> {
    return this.find({
        department: departmentId,
        callInStartDate: { $gte: startDate, $lte: endDate },
    })
        .populate("staff", "name staffId")
        .populate("leaveRequest", "leaveType")
        .populate("requestedBy", "name")
        .sort({ requestedAt: -1 })
}

// Static method: Get company-wide call-in report
callInSchema.statics.getCallInReport = async function (
    startDate: Date,
    endDate: Date
): Promise<CallInDocument[]> {
    return this.find({
        callInStartDate: { $gte: startDate, $lte: endDate },
    })
        .populate("staff", "name staffId department")
        .populate("department", "name")
        .populate("leaveRequest", "leaveType")
        .populate("requestedBy", "name")
        .sort({ department: 1, requestedAt: -1 })
}

// Static method: Get total call-in days for a staff in a year
callInSchema.statics.getTotalCallInDays = async function (
    staffId: string,
    year: number
): Promise<number> {
    const startOfYear = new Date(year, 0, 1)
    const endOfYear = new Date(year, 11, 31, 23, 59, 59)

    const result = await this.aggregate([
        {
            $match: {
                staff: new mongoose.Types.ObjectId(staffId),
                callInStartDate: { $gte: startOfYear, $lte: endOfYear },
            },
        },
        {
            $group: {
                _id: null,
                totalDays: { $sum: "$workingDaysRecovered" },
            },
        },
    ])

    return result.length > 0 ? result[0].totalDays : 0
}

// Virtual: Check if call-in has recovered all leave days
callInSchema.virtual("hasRecoveredFullLeave").get(async function () {
    const doc = this as any
    const LeaveRequest = mongoose.model("LeaveRequest")
    const leaveRequest = await LeaveRequest.findById(doc.leaveRequest)
    if (!leaveRequest) return false

    // Check if the call-in period equals the leave period
    return (
        doc.callInStartDate.toDateString() ===
            leaveRequest.startDate.toDateString() &&
        doc.callInEndDate.toDateString() === leaveRequest.endDate.toDateString()
    )
})

const CallIn = (mongoose.models.CallIn as mongoose.Model<CallInDocument, CallInModel>) || mongoose.model<CallInDocument, CallInModel>(
    "CallIn",
    callInSchema
)

export default CallIn
