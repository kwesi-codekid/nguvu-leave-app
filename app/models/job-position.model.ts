import mongoose, { Schema, Document, Model } from "mongoose"
import { JobPositionInterface } from "../utils/types"

// Extend the interface for Mongoose document
export interface IJobPosition extends JobPositionInterface, Document {
    _id: string
    checkOccupancy(): Promise<{ current: number; max: number; available: number }>
    canAcceptMore(): Promise<boolean>
}

// Interface for static methods
interface IJobPositionModel extends Model<IJobPosition> {
    getActivePositions(departmentId?: string): Promise<IJobPosition[]>
    getPositionsByDepartment(departmentId: string): Promise<IJobPosition[]>
    findByTitle(title: string, departmentId?: string): Promise<IJobPosition | null>
    getApprovalChain(positionId: string): Promise<{
        endorser: IJobPosition | null
        approver: IJobPosition | null
    }>
    getAvailablePositions(): Promise<IJobPosition[]>
}

// Define the JobPosition schema
const JobPositionSchema = new Schema<IJobPosition>(
    {
        title: {
            type: String,
            required: [true, "Job position title is required"],
            trim: true,
            maxlength: [100, "Job title cannot exceed 100 characters"],
        },
        department: {
            type: Schema.Types.ObjectId, // Reference to Department ID
            ref: "Department",
            required: [true, "Department is required"],
            index: true,
        },
        maxOccupancy: {
            type: Number,
            required: [true, "Maximum occupancy is required"],
            min: [1, "Maximum occupancy must be at least 1"],
            default: 1,
        },
        endorserPosition: {
            type: Schema.Types.ObjectId, // Reference to another JobPosition ID
            ref: "JobPosition",
            default: null,
            index: true,
        },
        approverPosition: {
            type: Schema.Types.ObjectId, // Reference to another JobPosition ID
            ref: "JobPosition",
            default: null,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId, // Reference to Staff ID who created this
            ref: "Staff",
            index: true,
        },
    },
    {
        timestamps: true,
        collection: "job_positions",
    }
)

// Create compound indexes
JobPositionSchema.index({ title: 1, department: 1 }) // Unique combination
JobPositionSchema.index({ department: 1, isActive: 1 })
JobPositionSchema.index({ isActive: 1, title: 1 })

// Pre-save validation to ensure unique title within department
JobPositionSchema.pre("save", async function () {
    if (this.isModified("title") || this.isModified("department")) {
        const existingPosition = await mongoose.models.JobPosition.findOne({
            title: new RegExp(`^${this.title}$`, "i"),
            department: this.department,
            _id: { $ne: this._id },
        })

        if (existingPosition) {
            throw new Error(`Position "${this.title}" already exists in this department`)
        }
    }

    // Validate that endorser and approver positions exist if specified
    if (this.endorserPosition) {
        const endorserExists = await mongoose.models.JobPosition.findById(this.endorserPosition)
        if (!endorserExists) {
            throw new Error("Invalid endorser position specified")
        }
    }

    if (this.approverPosition) {
        const approverExists = await mongoose.models.JobPosition.findById(this.approverPosition)
        if (!approverExists) {
            throw new Error("Invalid approver position specified")
        }
    }
})

// Instance method to check current occupancy
JobPositionSchema.methods.checkOccupancy = async function (): Promise<{
    current: number
    max: number
    available: number
}> {
    // This will need to query StaffContract model
    const StaffContract = mongoose.model("StaffContract")

    const activeContracts = await StaffContract.countDocuments({
        position: this._id,
        status: "active",
    })

    return {
        current: activeContracts,
        max: this.maxOccupancy,
        available: Math.max(0, this.maxOccupancy - activeContracts),
    }
}

// Instance method to check if position can accept more staff
JobPositionSchema.methods.canAcceptMore = async function (): Promise<boolean> {
    const occupancy = await this.checkOccupancy()
    return occupancy.available > 0
}

// Static method to get all active positions
JobPositionSchema.statics.getActivePositions = async function (
    departmentId?: string
): Promise<IJobPosition[]> {
    const query: any = { isActive: true }

    if (departmentId) {
        query.department = departmentId
    }

    return this.find(query)
        .sort({ department: 1, title: 1 })
        .lean()
        .exec()
}

// Static method to get positions by department
JobPositionSchema.statics.getPositionsByDepartment = async function (
    departmentId: string
): Promise<IJobPosition[]> {
    return this.find({
        department: departmentId,
        isActive: true,
    })
        .sort({ title: 1 })
        .lean()
        .exec()
}

// Static method to find position by title
JobPositionSchema.statics.findByTitle = async function (
    title: string,
    departmentId?: string
): Promise<IJobPosition | null> {
    const query: any = {
        title: new RegExp(`^${title}$`, "i"),
        isActive: true,
    }

    if (departmentId) {
        query.department = departmentId
    }

    return this.findOne(query).lean().exec()
}

// Static method to get approval chain for a position
JobPositionSchema.statics.getApprovalChain = async function (
    positionId: string
): Promise<{ endorser: IJobPosition | null; approver: IJobPosition | null }> {
    const position = await this.findById(positionId).lean()

    if (!position) {
        return { endorser: null, approver: null }
    }

    const endorser = position.endorserPosition
        ? await this.findById(position.endorserPosition).lean()
        : null

    const approver = position.approverPosition
        ? await this.findById(position.approverPosition).lean()
        : null

    return { endorser, approver }
}

// Static method to get available positions (with vacancy)
JobPositionSchema.statics.getAvailablePositions = async function (): Promise<IJobPosition[]> {
    const positions = await this.find({ isActive: true }).lean()
    const StaffContract = mongoose.model("StaffContract")

    const availablePositions = []

    for (const position of positions) {
        const activeContracts = await StaffContract.countDocuments({
            position: position._id,
            status: "active",
        })

        if (activeContracts < position.maxOccupancy) {
            availablePositions.push({
                ...position,
                currentOccupancy: activeContracts,
            })
        }
    }

    return availablePositions
}

// Virtual for current occupancy
JobPositionSchema.virtual("currentOccupancy").get(async function () {
    const StaffContract = mongoose.model("StaffContract")

    const count = await StaffContract.countDocuments({
        position: this._id,
        status: "active",
    })

    return count
})

// Virtual for available slots
JobPositionSchema.virtual("availableSlots").get(async function () {
    const current = await this.currentOccupancy
    return Math.max(0, this.maxOccupancy - current)
})

// Ensure virtual fields are included in JSON output
JobPositionSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const JobPosition = (mongoose.models.JobPosition as mongoose.Model<IJobPosition, IJobPositionModel>) || mongoose.model<IJobPosition, IJobPositionModel>("JobPosition", JobPositionSchema)

export default JobPosition
