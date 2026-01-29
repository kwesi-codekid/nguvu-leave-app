import mongoose, { Schema, Document, Model } from "mongoose"
import { DepartmentInterface } from "../utils/types"

// Extend the interface for Mongoose document
export interface IDepartment extends DepartmentInterface, Document {
    _id: string
    assignHead(staffId: string): Promise<IDepartment>
    removeHead(): Promise<IDepartment>
}

// Interface for static methods
interface IDepartmentModel extends Model<IDepartment> {
    getActiveDepartments(): Promise<IDepartment[]>
    getDepartmentByHead(staffId: string): Promise<IDepartment | null>
    findByName(name: string): Promise<IDepartment | null>
    getAllDepartments(includeInactive?: boolean): Promise<IDepartment[]>
}

// Define the Department schema
const DepartmentSchema = new Schema<IDepartment>(
    {
        name: {
            type: String,
            required: [true, "Department name is required"],
            unique: true,
            trim: true,
            maxlength: [100, "Department name cannot exceed 100 characters"],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, "Department description cannot exceed 500 characters"],
            default: null,
        },
        head: {
            type: Schema.Types.ObjectId, // Reference to Staff
            ref: "Staff",
            index: true,
            default: null,
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
        collection: "departments",
    }
)

// Create indexes
DepartmentSchema.index({ name: 1 }, { unique: true })
DepartmentSchema.index({ isActive: 1, name: 1 })

// Pre-save middleware to ensure name uniqueness (case-insensitive)
DepartmentSchema.pre("save", async function () {
    if (this.isModified("name")) {
        // Check for existing department with same name (case-insensitive)
        const existingDept = await mongoose.models.Department.findOne({
            name: new RegExp(`^${this.name}$`, "i"),
            _id: { $ne: this._id },
        })

        if (existingDept) {
            throw new Error(`Department with name "${this.name}" already exists`)
        }
    }
})

// Instance method to assign a department head
DepartmentSchema.methods.assignHead = async function (staffId: string): Promise<IDepartment> {
    this.head = staffId
    return await this.save()
}

// Instance method to remove the department head
DepartmentSchema.methods.removeHead = async function (): Promise<IDepartment> {
    this.head = undefined
    return await this.save()
}

// Static method to get all active departments
DepartmentSchema.statics.getActiveDepartments = async function (): Promise<IDepartment[]> {
    return this.find({ isActive: true })
        .sort({ name: 1 })
        .lean()
        .exec()
}

// Static method to get department by head
DepartmentSchema.statics.getDepartmentByHead = async function (
    staffId: string
): Promise<IDepartment | null> {
    return this.findOne({ head: staffId, isActive: true })
        .lean()
        .exec()
}

// Static method to find department by name (case-insensitive)
DepartmentSchema.statics.findByName = async function (
    name: string
): Promise<IDepartment | null> {
    return this.findOne({
        name: new RegExp(`^${name}$`, "i"),
        isActive: true,
    })
        .lean()
        .exec()
}

// Static method to get all departments (with option to include inactive)
DepartmentSchema.statics.getAllDepartments = async function (
    includeInactive: boolean = false
): Promise<IDepartment[]> {
    const query = includeInactive ? {} : { isActive: true }

    return this.find(query)
        .sort({ isActive: -1, name: 1 }) // Active first, then alphabetical
        .lean()
        .exec()
}

// Virtual to check if department has a head
DepartmentSchema.virtual("hasHead").get(function () {
    return !!this.head
})

// Virtual for department status
DepartmentSchema.virtual("status").get(function () {
    return this.isActive ? "active" : "inactive"
})

// Method to get department statistics (can be extended later)
DepartmentSchema.methods.getStats = async function () {
    // This can be extended to include staff count, leave statistics, etc.
    return {
        departmentId: this._id,
        name: this.name,
        hasHead: !!this.head,
        isActive: this.isActive,
        createdAt: this.createdAt,
    }
}

// Ensure virtual fields are included in JSON output
DepartmentSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const Department = (mongoose.models.Department as mongoose.Model<IDepartment, IDepartmentModel>) || mongoose.model<IDepartment, IDepartmentModel>("Department", DepartmentSchema)

export default Department
