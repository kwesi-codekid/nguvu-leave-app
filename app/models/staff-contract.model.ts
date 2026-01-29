import mongoose, { Schema, Document, Model } from "mongoose"
import { StaffContractInterface, ContractStatus } from "../utils/types"

// Extend the interface for Mongoose document
export interface IStaffContract extends StaffContractInterface, Document {
    _id: string
    isActive(): boolean
    isPending(): boolean
    isExpired(): boolean
    terminate(terminatedBy: string, reason?: string): Promise<IStaffContract>
    renew(newEndDate?: Date, salary?: number): Promise<IStaffContract>
    activate(): Promise<IStaffContract>
}

// Interface for static methods
interface IStaffContractModel extends Model<IStaffContract> {
    getActiveContracts(staffId?: string): Promise<IStaffContract[]>
    getContractsByPosition(positionId: string): Promise<IStaffContract[]>
    getContractHistory(staffId: string): Promise<IStaffContract[]>
    getCurrentContract(staffId: string): Promise<IStaffContract | null>
    getExpiringContracts(days: number): Promise<IStaffContract[]>
    updateExpiredContracts(): Promise<number>
    checkPositionAvailability(positionId: string): Promise<boolean>
}

// Define the StaffContract schema
const StaffContractSchema = new Schema<IStaffContract>(
    {
        staff: {
            type: Schema.Types.ObjectId, // Reference to Staff ID
            ref: "Staff",
            required: [true, "Staff ID is required"],
            index: true,
        },
        position: {
            type: Schema.Types.ObjectId, // Reference to JobPosition ID
            ref: "JobPosition",
            required: [true, "Position is required"],
            index: true,
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"],
            index: true,
        },
        endDate: {
            type: Date,
            default: null, // Null for permanent contracts
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(ContractStatus),
            default: ContractStatus.PENDING,
            required: true,
            index: true,
        },
        salary: {
            type: Number,
            min: [0, "Salary cannot be negative"],
            default: null,
        },
        currency: {
            type: String,
            default: "USD",
            maxlength: [3, "Currency code must be 3 characters"],
        },
        previousContract: {
            type: Schema.Types.ObjectId, // Reference to previous StaffContract ID
            ref: "StaffContract",
            default: null,
        },
        terminatedBy: {
            type: Schema.Types.ObjectId, // Reference to Staff ID who terminated
            ref: "Staff",
            default: null,
        },
        terminationReason: {
            type: String,
            maxlength: [500, "Termination reason cannot exceed 500 characters"],
            default: null,
        },
        terminationDate: {
            type: Date,
            default: null,
        },
        createdBy: {
            type: Schema.Types.ObjectId, // Reference to Staff ID who created this
            ref: "Staff",
            index: true,
        },
    },
    {
        timestamps: true,
        collection: "staff_contracts",
    }
)

// Create compound indexes
StaffContractSchema.index({ staff: 1, status: 1, startDate: -1 })
StaffContractSchema.index({ position: 1, status: 1 })
StaffContractSchema.index({ status: 1, endDate: 1 })
StaffContractSchema.index({ staff: 1, position: 1, status: 1 })

// Pre-save validation
StaffContractSchema.pre("save", async function () {
    // Validate dates
    if (this.endDate && this.startDate >= this.endDate) {
        throw new Error("End date must be after start date")
    }

    // Check if staff already has an active contract (only for new contracts)
    if (this.isNew && this.status === ContractStatus.ACTIVE) {
        const existingActive = await mongoose.models.StaffContract.findOne({
            staff: this.staff,
            status: ContractStatus.ACTIVE,
            _id: { $ne: this._id },
        })

        if (existingActive) {
            throw new Error("Staff already has an active contract")
        }
    }

    // Check position availability (only for new active contracts)
    if (this.isNew && this.status === ContractStatus.ACTIVE) {
        const JobPosition = mongoose.model("JobPosition")
        const position = await JobPosition.findById(this.position)

        if (!position) {
            throw new Error("Invalid position specified")
        }

        const activeContracts = await mongoose.models.StaffContract.countDocuments({
            position: this.position,
            status: ContractStatus.ACTIVE,
            _id: { $ne: this._id },
        })

        if (activeContracts >= position.maxOccupancy) {
            throw new Error(`Position "${position.title}" has reached maximum occupancy`)
        }
    }

    // Auto-activate if start date has passed and status is pending
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDate = new Date(this.startDate)
    startDate.setHours(0, 0, 0, 0)

    if (this.status === ContractStatus.PENDING && startDate <= today) {
        this.status = ContractStatus.ACTIVE
    }

    // Auto-expire if end date has passed and status is active
    if (this.endDate) {
        const endDate = new Date(this.endDate)
        endDate.setHours(23, 59, 59, 999)

        if (this.status === ContractStatus.ACTIVE && endDate < today) {
            this.status = ContractStatus.EXPIRED
        }
    }
})

// Instance method to check if contract is active
StaffContractSchema.methods.isActive = function (): boolean {
    return this.status === ContractStatus.ACTIVE
}

// Instance method to check if contract is pending
StaffContractSchema.methods.isPending = function (): boolean {
    return this.status === ContractStatus.PENDING
}

// Instance method to check if contract is expired
StaffContractSchema.methods.isExpired = function (): boolean {
    return this.status === ContractStatus.EXPIRED
}

// Instance method to terminate contract
StaffContractSchema.methods.terminate = async function (
    terminatedBy: string,
    reason?: string
): Promise<IStaffContract> {
    if (this.status === ContractStatus.CANCELLED || this.status === ContractStatus.EXPIRED) {
        throw new Error("Cannot terminate a contract that is already cancelled or expired")
    }

    this.status = ContractStatus.CANCELLED
    this.terminatedBy = terminatedBy
    this.terminationReason = reason || "Contract terminated"
    this.terminationDate = new Date()

    return await this.save()
}

// Instance method to renew contract
StaffContractSchema.methods.renew = async function (
    newEndDate?: Date,
    salary?: number
): Promise<IStaffContract> {
    if (this.status !== ContractStatus.ACTIVE && this.status !== ContractStatus.EXPIRED) {
        throw new Error("Can only renew active or expired contracts")
    }

    // Mark current contract as renewed
    this.status = ContractStatus.RENEWED
    await this.save()

    // Create new contract
    const StaffContract = mongoose.model("StaffContract")
    const newContract = new StaffContract({
        staff: this.staff,
        position: this.position,
        startDate: this.endDate ? new Date(this.endDate.getTime() + 86400000) : new Date(), // Next day after current end
        endDate: newEndDate,
        status: ContractStatus.ACTIVE,
        salary: salary || this.salary,
        currency: this.currency,
        previousContract: this._id,
        createdBy: this.createdBy,
    })

    return await newContract.save()
}

// Instance method to activate pending contract
StaffContractSchema.methods.activate = async function (): Promise<IStaffContract> {
    if (this.status !== ContractStatus.PENDING) {
        throw new Error("Can only activate pending contracts")
    }

    // Check if staff already has an active contract
    const existingActive = await mongoose.models.StaffContract.findOne({
        staff: this.staff,
        status: ContractStatus.ACTIVE,
        _id: { $ne: this._id },
    })

    if (existingActive) {
        throw new Error("Staff already has an active contract")
    }

    this.status = ContractStatus.ACTIVE
    return await this.save()
}

// Static method to get all active contracts
StaffContractSchema.statics.getActiveContracts = async function (
    staffId?: string
): Promise<IStaffContract[]> {
    const query: any = { status: ContractStatus.ACTIVE }

    if (staffId) {
        query.staff = staffId
    }

    return this.find(query)
        .sort({ startDate: -1 })
        .lean()
        .exec()
}

// Static method to get contracts by position
StaffContractSchema.statics.getContractsByPosition = async function (
    positionId: string
): Promise<IStaffContract[]> {
    return this.find({
        position: positionId,
        status: { $in: [ContractStatus.ACTIVE, ContractStatus.PENDING] },
    })
        .sort({ status: 1, startDate: -1 })
        .lean()
        .exec()
}

// Static method to get contract history for a staff
StaffContractSchema.statics.getContractHistory = async function (
    staffId: string
): Promise<IStaffContract[]> {
    return this.find({ staff: staffId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
}

// Static method to get current contract for a staff
StaffContractSchema.statics.getCurrentContract = async function (
    staffId: string
): Promise<IStaffContract | null> {
    return this.findOne({
        staff: staffId,
        status: ContractStatus.ACTIVE,
    })
        .lean()
        .exec()
}

// Static method to get contracts expiring within specified days
StaffContractSchema.statics.getExpiringContracts = async function (
    days: number
): Promise<IStaffContract[]> {
    const today = new Date()
    const futureDate = new Date()
    futureDate.setDate(today.getDate() + days)

    return this.find({
        status: ContractStatus.ACTIVE,
        endDate: {
            $gte: today,
            $lte: futureDate,
        },
    })
        .sort({ endDate: 1 })
        .lean()
        .exec()
}

// Static method to update expired contracts (can be called by cron job)
StaffContractSchema.statics.updateExpiredContracts = async function (): Promise<number> {
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    const result = await this.updateMany(
        {
            status: ContractStatus.ACTIVE,
            endDate: { $lt: today },
        },
        {
            $set: { status: ContractStatus.EXPIRED },
        }
    )

    return result.modifiedCount || 0
}

// Static method to check if a position has availability
StaffContractSchema.statics.checkPositionAvailability = async function (
    positionId: string
): Promise<boolean> {
    const JobPosition = mongoose.model("JobPosition")
    const position = await JobPosition.findById(positionId)

    if (!position || !position.isActive) {
        return false
    }

    const activeContracts = await this.countDocuments({
        position: positionId,
        status: ContractStatus.ACTIVE,
    })

    return activeContracts < position.maxOccupancy
}

// Virtual for contract duration in days
StaffContractSchema.virtual("durationInDays").get(function () {
    if (!this.endDate) {
        return null // Permanent contract
    }

    const start = new Date(this.startDate)
    const end = new Date(this.endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays
})

// Virtual for remaining days (for active contracts)
StaffContractSchema.virtual("remainingDays").get(function () {
    if (this.status !== ContractStatus.ACTIVE || !this.endDate) {
        return null
    }

    const today = new Date()
    const end = new Date(this.endDate)
    const diffTime = end.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return Math.max(0, diffDays)
})

// Virtual for contract type
StaffContractSchema.virtual("contractType").get(function () {
    return this.endDate ? "fixed-term" : "permanent"
})

// Ensure virtual fields are included in JSON output
StaffContractSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const StaffContract = (mongoose.models.StaffContract as mongoose.Model<IStaffContract, IStaffContractModel>) || mongoose.model<IStaffContract, IStaffContractModel>(
    "StaffContract",
    StaffContractSchema
)

export default StaffContract
