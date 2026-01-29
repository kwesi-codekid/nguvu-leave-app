import mongoose, { Schema, Document, Model } from "mongoose"
import { LeaveBalanceInterface, LeaveTypes, LEAVE_CAPS } from "../utils/types"

// Extend the interface for Mongoose document
export interface ILeaveBalance extends LeaveBalanceInterface, Document {
    _id: string
    remaining: number // Virtual field
    availableForRequest: number // Virtual field for annual leave

    canRequest(days: number): boolean
    debit(days: number, reason?: string): Promise<ILeaveBalance>
    credit(days: number, reason?: string): Promise<ILeaveBalance>
    updateAccrual(asOfDate?: Date): Promise<ILeaveBalance>
    resetForNewYear(): Promise<ILeaveBalance>
}

// Interface for static methods
interface ILeaveBalanceModel extends Model<ILeaveBalance> {
    getOrCreate(staffId: string, year: number, leaveType: LeaveTypes): Promise<ILeaveBalance>
    initializeForStaff(staffId: string, year: number): Promise<ILeaveBalance[]>
    processMonthlyAccruals(year?: number, month?: number): Promise<number>
    getStaffBalances(staffId: string, year: number): Promise<ILeaveBalance[]>
    resetAllForNewYear(year: number): Promise<number>
}

// Define the LeaveBalance schema
const LeaveBalanceSchema = new Schema<ILeaveBalance>(
    {
        staff: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: true,
            index: true,
        },
        year: {
            type: Number,
            required: true,
            index: true,
            validate: {
                validator: function (value: number) {
                    return value >= 2000 && value <= 2100
                },
                message: "Year must be between 2000 and 2100",
            },
        },
        leaveType: {
            type: String,
            enum: Object.values(LeaveTypes),
            required: true,
        },
        allocated: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        accrued: {
            type: Number,
            default: 0,
            min: 0,
            // Only used for annual leave
        },
        used: {
            type: Number,
            default: 0,
            min: 0,
        },
        adjustments: {
            type: Number,
            default: 0,
            // Only for annual leave - can be positive or negative
        },
        lastAccrualAt: {
            type: Date,
            // Only for annual leave - tracks last monthly accrual
        },
        notes: {
            type: String,
            maxlength: 500,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            index: true,
        },
    },
    {
        timestamps: true,
        collection: "leave_balances",
    }
)

// Create unique compound index
LeaveBalanceSchema.index({ staff: 1, year: 1, leaveType: 1 }, { unique: true })
LeaveBalanceSchema.index({ year: 1, leaveType: 1 })

// Virtual for remaining balance
LeaveBalanceSchema.virtual("remaining").get(function () {
    if (this.leaveType === LeaveTypes.ANNUAL) {
        // For annual: remaining = accrued + adjustments - used
        return Math.max(0, (this.accrued || 0) + (this.adjustments || 0) - this.used)
    }
    // For others: remaining = allocated - used
    return Math.max(0, this.allocated - this.used)
})

// Virtual for available for request (annual leave only)
LeaveBalanceSchema.virtual("availableForRequest").get(function () {
    if (this.leaveType === LeaveTypes.ANNUAL) {
        // Can request up to 30 days total, regardless of accrued
        return Math.max(0, 30 - this.used)
    }
    // For others, same as remaining
    return this.remaining
})

// Instance method to check if request is allowed
LeaveBalanceSchema.methods.canRequest = function (days: number): boolean {
    if (this.leaveType === LeaveTypes.ANNUAL) {
        // For annual leave, can request up to 30 days total
        return this.used + days <= 30
    }
    // For other types, check against remaining balance
    return this.used + days <= this.allocated
}

// Instance method to debit balance
LeaveBalanceSchema.methods.debit = async function (
    days: number,
    reason?: string
): Promise<ILeaveBalance> {
    if (!this.canRequest(days)) {
        throw new Error(
            `Insufficient balance. Available: ${
                this.leaveType === LeaveTypes.ANNUAL
                    ? this.availableForRequest
                    : this.remaining
            } days`
        )
    }

    this.used += days
    if (reason && this.notes) {
        this.notes = `${this.notes}\n${new Date().toISOString()}: Debited ${days} days - ${reason}`
    } else if (reason) {
        this.notes = `${new Date().toISOString()}: Debited ${days} days - ${reason}`
    }

    return await this.save()
}

// Instance method to credit balance (for cancellations)
LeaveBalanceSchema.methods.credit = async function (
    days: number,
    reason?: string
): Promise<ILeaveBalance> {
    this.used = Math.max(0, this.used - days)

    if (reason && this.notes) {
        this.notes = `${this.notes}\n${new Date().toISOString()}: Credited ${days} days - ${reason}`
    } else if (reason) {
        this.notes = `${new Date().toISOString()}: Credited ${days} days - ${reason}`
    }

    return await this.save()
}

// Instance method to update accrual (for annual leave)
LeaveBalanceSchema.methods.updateAccrual = async function (
    asOfDate?: Date
): Promise<ILeaveBalance> {
    if (this.leaveType !== LeaveTypes.ANNUAL) {
        return this // Only annual leave accrues
    }

    // Get staff's active contract to determine accrual start
    const StaffContract = mongoose.model("StaffContract")
    const contract = await StaffContract.findOne({
        staff: this.staff,
        status: "active"
    })

    if (!contract) {
        // No active contract, no accrual
        return this
    }

    const now = asOfDate || new Date()
    const yearStart = new Date(this.year, 0, 1)
    const yearEnd = new Date(this.year, 11, 31, 23, 59, 59)
    const contractStart = new Date(contract.startDate)

    // Determine the effective start date for accrual calculation
    // Use the later of: contract start date or year start
    const accrualStartDate = contractStart > yearStart ? contractStart : yearStart

    // Ensure we're within the year
    const effectiveDate = now > yearEnd ? yearEnd : now < yearStart ? yearStart : now

    // If contract hasn't started yet or effective date is before contract start, no accrual
    if (effectiveDate < accrualStartDate) {
        return this
    }

    // Calculate months from accrual start to effective date
    let monthsWorked = 0
    if (effectiveDate >= accrualStartDate) {
        const yearDiff = effectiveDate.getFullYear() - accrualStartDate.getFullYear()
        const monthDiff = effectiveDate.getMonth() - accrualStartDate.getMonth()
        monthsWorked = Math.max(0, (yearDiff * 12) + monthDiff + 1) // +1 to include current month
    }

    // Calculate new accrual (2.5 days per month, max 30)
    const newAccrual = Math.min(30, monthsWorked * 2.5)

    if (newAccrual > (this.accrued || 0)) {
        this.accrued = newAccrual
        this.lastAccrualAt = effectiveDate

        if (this.notes) {
            this.notes = `${this.notes}\n${effectiveDate.toISOString()}: Accrued to ${newAccrual} days (${monthsWorked} months from contract start)`
        } else {
            this.notes = `${effectiveDate.toISOString()}: Accrued to ${newAccrual} days (${monthsWorked} months from contract start)`
        }

        return await this.save()
    }

    return this
}

// Instance method to reset for new year
LeaveBalanceSchema.methods.resetForNewYear = async function (): Promise<ILeaveBalance> {
    // Reset values for the new year
    this.allocated = LEAVE_CAPS[this.leaveType] || 0
    this.used = 0
    this.adjustments = 0
    this.lastAccrualAt = undefined

    // For annual leave, calculate initial accrual based on contract
    if (this.leaveType === LeaveTypes.ANNUAL) {
        this.accrued = 0 // Will be updated by updateAccrual
        // Update accrual based on contract start date
        await this.updateAccrual()
        this.notes = `${new Date().toISOString()}: Reset for year ${this.year} with pro-rated accrual`
    } else {
        this.accrued = 0
        this.notes = `${new Date().toISOString()}: Reset for year ${this.year}`
    }

    return await this.save()
}

// Static method to get or create a balance record
LeaveBalanceSchema.statics.getOrCreate = async function (
    staffId: string,
    year: number,
    leaveType: LeaveTypes
): Promise<ILeaveBalance> {
    let balance = await this.findOne({ staff: staffId, year, leaveType })

    if (!balance) {
        const allocated = LEAVE_CAPS[leaveType] || 0
        balance = new this({
            staff: staffId,
            year,
            leaveType,
            allocated,
            accrued: 0,
            used: 0,
            adjustments: 0,
        })

        // Save first to create the record
        await balance.save()

        // For annual leave, initialize accrual based on contract
        // The updateAccrual method will now properly check contract start date
        if (leaveType === LeaveTypes.ANNUAL) {
            await balance.updateAccrual()
        }
    }

    return balance
}

// Static method to initialize all leave types for a staff member
LeaveBalanceSchema.statics.initializeForStaff = async function (
    staffId: string,
    year: number
): Promise<ILeaveBalance[]> {
    const Staff = mongoose.model("Staff")
    const staff = await Staff.findById(staffId)

    if (!staff) {
        throw new Error("Staff not found")
    }

    const balances: ILeaveBalance[] = []

    for (const leaveType of Object.values(LeaveTypes)) {
        // Skip gender-specific leaves if not applicable
        if (leaveType === LeaveTypes.MATERNITY && staff.gender !== "female") continue
        if (leaveType === LeaveTypes.PATERNITY && staff.gender !== "male") continue

        const balance = await this.getOrCreate(staffId, year, leaveType as LeaveTypes)
        balances.push(balance)
    }

    return balances
}

// Static method to process monthly accruals
LeaveBalanceSchema.statics.processMonthlyAccruals = async function (
    year?: number,
    month?: number
): Promise<number> {
    const currentYear = year || new Date().getFullYear()
    const asOfDate = month
        ? new Date(currentYear, month - 1, 28) // Use 28th to avoid month-end issues
        : new Date()

    // Find all annual leave balances for the year
    const balances = await this.find({
        year: currentYear,
        leaveType: LeaveTypes.ANNUAL,
    })

    let updated = 0
    for (const balance of balances) {
        const before = balance.accrued
        await balance.updateAccrual(asOfDate)
        if (balance.accrued !== before) updated++
    }

    return updated
}

// Static method to get all balances for a staff member
LeaveBalanceSchema.statics.getStaffBalances = async function (
    staffId: string,
    year: number
): Promise<ILeaveBalance[]> {
    return this.find({ staff: staffId, year })
        .sort({ leaveType: 1 })
        .lean()
        .exec()
}

// Static method to reset all balances for a new year
LeaveBalanceSchema.statics.resetAllForNewYear = async function (
    year: number
): Promise<number> {
    const StaffContract = mongoose.model("StaffContract")

    // Get all active staff
    const activeContracts = await StaffContract.find({ status: "active" })
    const staffIds = [...new Set(activeContracts.map(c => c.staff.toString()))]

    let count = 0
    for (const staffId of staffIds) {
        await this.initializeForStaff(staffId, year)
        count++
    }

    return count
}

// Ensure virtual fields are included in JSON output
LeaveBalanceSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const LeaveBalance = (mongoose.models.LeaveBalance as mongoose.Model<ILeaveBalance, ILeaveBalanceModel>) || mongoose.model<ILeaveBalance, ILeaveBalanceModel>(
    "LeaveBalance",
    LeaveBalanceSchema
)

export default LeaveBalance
