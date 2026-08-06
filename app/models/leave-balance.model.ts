import mongoose, { Schema, Document, Model } from "mongoose"
import { LeaveBalanceInterface, LeaveTypes, LEAVE_CAPS } from "../utils/types"
import { getContractPeriod, getMonthsInPeriod, getTotalMonthsInPeriod, formatPeriod } from "../utils/contract-period"

// Extend the interface for Mongoose document
export interface ILeaveBalance extends LeaveBalanceInterface, Document {
    _id: string
    remaining: number // Virtual field
    availableForRequest: number // Virtual field for annual leave
    periodLabel: string // Virtual field - formatted period

    canRequest(days: number): boolean
    debit(days: number, reason?: string): Promise<ILeaveBalance>
    credit(days: number, reason?: string): Promise<ILeaveBalance>
    updateAccrual(asOfDate?: Date): Promise<ILeaveBalance>
    resetForNewPeriod(): Promise<ILeaveBalance>
}

// Interface for static methods
interface ILeaveBalanceModel extends Model<ILeaveBalance> {
    getOrCreate(staffId: string, periodStart: Date, periodEnd: Date, leaveType: LeaveTypes): Promise<ILeaveBalance>
    initializeForStaff(staffId: string, periodStart: Date, periodEnd: Date): Promise<ILeaveBalance[]>
    processMonthlyAccruals(): Promise<number>
    getStaffBalances(staffId: string, periodStart: Date): Promise<ILeaveBalance[]>
    createNewPeriodBalances(): Promise<number>
}

// Define the LeaveBalance schema
const LeaveBalanceSchema = new Schema<any>(
    {
        staff: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: true,
            index: true,
        },
        year: {
            type: Number,
            index: true,
            // Auto-derived from periodStart in pre-save hook
        },
        periodStart: {
            type: Date,
            required: true,
            index: true,
        },
        periodEnd: {
            type: Date,
            required: true,
            index: true,
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
            // Monthly accrual for annual leave; equals allocated for other types
        },
        used: {
            type: Number,
            default: 0,
            min: 0,
        },
        adjustments: {
            type: Number,
            default: 0,
            // Can be positive or negative
        },
        lastAccrualAt: {
            type: Date,
            // Tracks last monthly accrual
        },
        manuallySet: {
            type: Boolean,
            default: false,
            // When true, updateAccrual() will not overwrite the accrued value
        },
        notes: {
            type: String,
            maxlength: 2000,
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

// Create unique compound index on period-based fields
LeaveBalanceSchema.index({ staff: 1, periodStart: 1, leaveType: 1 }, { unique: true })
// Keep a non-unique index on year for backward compatibility queries
LeaveBalanceSchema.index({ staff: 1, year: 1, leaveType: 1 })
LeaveBalanceSchema.index({ periodStart: 1, periodEnd: 1, leaveType: 1 })

// Pre-save hook: auto-derive year from periodStart
LeaveBalanceSchema.pre("save", function () {
    if (this.periodStart) {
        this.year = new Date(this.periodStart).getFullYear()
    }
})

// Virtual for remaining balance
LeaveBalanceSchema.virtual("remaining").get(function () {
    // Annual leave: remaining = accrued + adjustments - used (can be negative if borrowed)
    // Other types: remaining = allocated + adjustments - used (full allocation available immediately)
    const base = this.leaveType === LeaveTypes.ANNUAL ? (this.accrued || 0) : this.allocated
    return base + (this.adjustments || 0) - this.used
})

// Virtual for available for request (max requestable for all types)
LeaveBalanceSchema.virtual("availableForRequest").get(function () {
    // Can request up to allocated days total, even if not yet fully accrued.
    // Adjustments (e.g. carried-over leave from a previous year) are added on
    // top of the allocation so they are genuinely requestable, not just shown.
    // Legacy records may hold accrued values above the allocation cap; those
    // days were granted, so they must stay requestable too.
    const base = Math.max(Number(this.allocated) || 0, Number(this.accrued) || 0)
    return Math.max(0, base + (Number(this.adjustments) || 0) - (Number(this.used) || 0))
})

// Virtual for formatted period label
LeaveBalanceSchema.virtual("periodLabel").get(function () {
    if (this.periodStart && this.periodEnd) {
        return formatPeriod(this.periodStart, this.periodEnd)
    }
    return `Year ${this.year}`
})

// Instance method to check if request is allowed
LeaveBalanceSchema.methods.canRequest = function (days: number): boolean {
    // Can request up to allocated + adjustments total (even if not yet fully
    // accrued). Adjustments include carried-over leave, which is spendable.
    // Accrued can exceed allocated on legacy records; granted days stay
    // requestable, so take the higher of the two as the base.
    const base = Math.max(Number(this.allocated) || 0, Number(this.accrued) || 0)
    return this.used + days <= base + (Number(this.adjustments) || 0)
}

// Instance method to debit balance
LeaveBalanceSchema.methods.debit = async function (
    days: number,
    reason?: string
): Promise<ILeaveBalance> {
    if (!this.canRequest(days)) {
        throw new Error(
            `Insufficient balance. Available: ${this.availableForRequest} days`
        )
    }

    this.used += days

    const newNote = `${new Date().toISOString()}: Debited ${days} days - ${reason}`

    if (this.notes) {
        const combinedNotes = `${this.notes}\n${newNote}`
        if (combinedNotes.length <= 2000) {
            this.notes = combinedNotes
        } else {
            const maxOldLength = 2000 - newNote.length - 1
            const truncatedOld = this.notes.substring(this.notes.length - maxOldLength)
            this.notes = `${truncatedOld}\n${newNote}`
        }
    } else {
        this.notes = newNote
    }

    return await this.save()
}

// Instance method to credit balance (for cancellations)
LeaveBalanceSchema.methods.credit = async function (
    days: number,
    reason?: string
): Promise<ILeaveBalance> {
    this.used = Math.max(0, this.used - days)

    const newNote = `${new Date().toISOString()}: Credited ${days} days - ${reason}`

    if (this.notes) {
        const combinedNotes = `${this.notes}\n${newNote}`
        if (combinedNotes.length <= 2000) {
            this.notes = combinedNotes
        } else {
            const maxOldLength = 2000 - newNote.length - 1
            const truncatedOld = this.notes.substring(this.notes.length - maxOldLength)
            this.notes = `${truncatedOld}\n${newNote}`
        }
    } else {
        this.notes = newNote
    }

    return await this.save()
}

// Instance method to update accrual (monthly accrual only applies to annual leave)
LeaveBalanceSchema.methods.updateAccrual = async function (
    asOfDate?: Date
): Promise<ILeaveBalance> {
    // Non-annual leave types get their full cap immediately (no monthly accrual)
    if (this.leaveType !== LeaveTypes.ANNUAL) {
        const fullCap = LEAVE_CAPS[this.leaveType] || 0
        let needsSave = false

        // Ensure allocated matches the full cap
        if (this.allocated !== fullCap) {
            this.allocated = fullCap
            needsSave = true
        }

        // Ensure accrued equals allocated
        if ((this.accrued || 0) !== this.allocated) {
            this.accrued = this.allocated
            this.lastAccrualAt = new Date()
            needsSave = true
        }

        if (needsSave) {
            return await this.save()
        }
        return this
    }

    // Annual leave: monthly accrual logic

    // If accrued was manually set, do not overwrite it with formula-based accrual
    if (this.manuallySet) {
        return this
    }

    const now = asOfDate || new Date()
    const periodStart = new Date(this.periodStart)
    const periodEnd = new Date(this.periodEnd)

    // Clamp effective date to period bounds
    const effectiveDate = now > periodEnd ? periodEnd : now < periodStart ? periodStart : now

    // If we haven't reached the period yet, no accrual
    if (now < periodStart) {
        return this
    }

    // Calculate months worked within this period
    const monthsWorked = getMonthsInPeriod(periodStart, effectiveDate)

    // Calculate total months in this period (for pro-rating partial periods)
    const totalPeriodMonths = getTotalMonthsInPeriod(periodStart, periodEnd)

    // Monthly rate = allocated / totalPeriodMonths
    const monthlyRate = totalPeriodMonths > 0 ? this.allocated / totalPeriodMonths : 0

    // Max accrual = allocated (full period allocation)
    const maxAccrual = this.allocated

    // Calculate new accrual (monthlyRate days per month, capped at allocated)
    const newAccrual = Math.min(maxAccrual, monthsWorked * monthlyRate)

    if (newAccrual > (this.accrued || 0)) {
        this.accrued = newAccrual
        this.lastAccrualAt = effectiveDate

        const newNote = `${effectiveDate.toISOString()}: Accrued to ${newAccrual} days (${monthsWorked} months in period)`

        if (this.notes) {
            const combinedNotes = `${this.notes}\n${newNote}`
            if (combinedNotes.length <= 2000) {
                this.notes = combinedNotes
            } else {
                const maxOldLength = 2000 - newNote.length - 1
                const truncatedOld = this.notes.substring(this.notes.length - maxOldLength)
                this.notes = `${truncatedOld}\n${newNote}`
            }
        } else {
            this.notes = newNote
        }

        return await this.save()
    }

    return this
}

// Instance method to reset for new period
LeaveBalanceSchema.methods.resetForNewPeriod = async function (): Promise<ILeaveBalance> {
    const totalPeriodMonths = getTotalMonthsInPeriod(this.periodStart, this.periodEnd)

    // Annual leave: pro-rated based on period length (accrues monthly)
    // Other types: full cap allocation (available immediately)
    this.allocated = this.leaveType === LeaveTypes.ANNUAL
        ? totalPeriodMonths * 2.5
        : (LEAVE_CAPS[this.leaveType] || 0)
    this.used = 0
    this.adjustments = 0
    this.manuallySet = false
    this.lastAccrualAt = undefined

    // Calculate initial accrual based on contract period
    this.accrued = 0 // Will be updated by updateAccrual
    await this.updateAccrual()
    this.notes = `${new Date().toISOString()}: Reset for period ${formatPeriod(this.periodStart, this.periodEnd)} with pro-rated accrual`

    return await this.save()
}

// Static method to get or create a balance record
LeaveBalanceSchema.statics.getOrCreate = async function (
    staffId: string,
    periodStart: Date,
    periodEnd: Date,
    leaveType: LeaveTypes
): Promise<ILeaveBalance> {
    // Normalize periodStart to midnight for consistent querying
    const normalizedStart = new Date(periodStart)
    normalizedStart.setHours(0, 0, 0, 0)

    let balance = await this.findOne({
        staff: staffId,
        periodStart: normalizedStart,
        leaveType,
    })

    if (!balance) {
        // Annual leave: pro-rated based on period length (accrues monthly)
        // Other types: full cap allocation (available immediately)
        const totalPeriodMonths = getTotalMonthsInPeriod(periodStart, periodEnd)
        const allocated = leaveType === LeaveTypes.ANNUAL
            ? totalPeriodMonths * 2.5
            : (LEAVE_CAPS[leaveType] || 0)

        balance = new this({
            staff: staffId,
            periodStart: normalizedStart,
            periodEnd: new Date(periodEnd),
            leaveType,
            allocated,
            accrued: 0,
            used: 0,
            adjustments: 0,
        })

        // Save first to create the record
        await balance.save()

        // Initialize accrual (annual: based on months worked; others: full allocation)
        await balance.updateAccrual()
    }

    return balance
}

// Static method to initialize all leave types for a staff member
LeaveBalanceSchema.statics.initializeForStaff = async function (
    staffId: string,
    periodStart: Date,
    periodEnd: Date
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

        const balance = await this.getOrCreate(staffId, periodStart, periodEnd, leaveType as LeaveTypes)
        balances.push(balance)
    }

    return balances
}

// Static method to process monthly accruals (only annual leave accrues monthly)
LeaveBalanceSchema.statics.processMonthlyAccruals = async function (): Promise<number> {
    const now = new Date()

    // Only annual leave balances accrue monthly
    const balances = await this.find({
        leaveType: LeaveTypes.ANNUAL,
        periodStart: { $lte: now },
        periodEnd: { $gte: now },
    })

    let updated = 0
    for (const balance of balances) {
        const before = balance.accrued
        await balance.updateAccrual(now)
        if (balance.accrued !== before) updated++
    }

    return updated
}

// Static method to get all balances for a staff member by period
LeaveBalanceSchema.statics.getStaffBalances = async function (
    staffId: string,
    periodStart: Date
): Promise<ILeaveBalance[]> {
    // Normalize periodStart
    const normalizedStart = new Date(periodStart)
    normalizedStart.setHours(0, 0, 0, 0)

    return this.find({ staff: staffId, periodStart: normalizedStart })
        .sort({ leaveType: 1 })
        .lean()
        .exec()
}

// Static method to create new period balances (replaces resetAllForNewYear)
// Called daily to check for contract anniversaries
LeaveBalanceSchema.statics.createNewPeriodBalances = async function (): Promise<number> {
    const StaffContract = mongoose.model("StaffContract")
    const now = new Date()

    // Get all active contracts
    const activeContracts = await StaffContract.find({ status: "active" })

    let count = 0
    for (const contract of activeContracts) {
        // Get the current period for this contract
        const period = getContractPeriod(
            { startDate: contract.startDate, endDate: contract.endDate },
            now
        )

        if (!period) continue // Contract not active for current date

        // Check if balances already exist for this period
        const normalizedStart = new Date(period.periodStart)
        normalizedStart.setHours(0, 0, 0, 0)

        const existing = await this.findOne({
            staff: contract.staff,
            periodStart: normalizedStart,
        })

        if (!existing) {
            // Create balances for this new period
            await this.initializeForStaff(
                contract.staff.toString(),
                period.periodStart,
                period.periodEnd
            )
            count++
        }
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
const LeaveBalance = (mongoose.models.LeaveBalance as (mongoose.Model<ILeaveBalance> & ILeaveBalanceModel)) || mongoose.model<ILeaveBalance, ILeaveBalanceModel>(
    "LeaveBalance",
    LeaveBalanceSchema
)

export default LeaveBalance
