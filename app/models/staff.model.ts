import mongoose, { Schema, Document, Model } from "mongoose"
import bcrypt from "bcryptjs"
import {
    StaffInterface,
    StaffAuthFields,
    Gender,
    AccountStatus,
    DocumentAttachment,
    Address,
    EmergencyContact,
} from "../utils/types"

export interface IStaff extends StaffInterface, StaffAuthFields, Document {
    _id: string
    hasEmail: boolean
    displayName: string

    setPassword(password: string): Promise<void>
    verifyPassword(password: string): Promise<boolean>

    setOTP(code: string, ttlMinutes: number): Promise<void>
    clearOTP(): Promise<void>

    setResetCode(code: string, ttlMinutes: number): Promise<void>
    clearResetCode(): Promise<void>

    setOnLeave(onLeave: boolean): Promise<void>
}

interface IStaffModel extends Model<IStaff> {
    findByPhone(phone: string): Promise<IStaff | null>
    findByEmail(email: string): Promise<IStaff | null>
}

const AddressSchema = new Schema<Address>(
    {
        line1: String,
        line2: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
    },
    { _id: false }
)

const EmergencyContactSchema = new Schema<EmergencyContact>(
    {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relation: { type: String },
    },
    { _id: false }
)

const DocumentAttachmentSchema = new Schema<DocumentAttachment>(
    {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        filename: { type: String, required: true },
        fileType: { type: String, required: true },
        uploadedAt: { type: Date, required: true },
    },
    { _id: false }
)

const StaffSchema = new Schema<IStaff>(
    {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, unique: true, trim: true, index: true },
        email: { type: String, trim: true, lowercase: true }, // unique via partial index below
        staffId: { type: String, required: true, unique: true, trim: true, index: true },
        department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
        permissions: { type: [String], default: [] },
        gender: { type: String, enum: Object.values(Gender), required: true },
        profileImage: { type: DocumentAttachmentSchema, default: null },
        address: { type: AddressSchema, default: null },
        emergencyContact: { type: EmergencyContactSchema, default: null },
        status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE, index: true },
        isOnLeave: { type: Boolean, default: false, index: true },
        currentContract: { type: Schema.Types.ObjectId, ref: "StaffContract", default: null },
        createdBy: { type: Schema.Types.ObjectId, ref: "Staff", index: true },

        // Auth fields
        passwordHash: { type: String, select: false, default: null },
        otpCodeHash: { type: String, select: false, default: null },
        otpExpiresAt: { type: Date, select: false, default: null },
        resetCodeHash: { type: String, select: false, default: null },
        resetCodeExpiresAt: { type: Date, select: false, default: null },
        passwordLastChangedAt: { type: Date, select: false, default: null },
    },
    { timestamps: true, collection: "staff" }
)

// Indexes
StaffSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } })

// Normalize and validate
StaffSchema.pre("save", async function () {
    if (this.isModified("email") && this.email) {
        this.email = this.email.toLowerCase().trim()
    }
    // Deduplicate permissions
    if (this.isModified("permissions") && Array.isArray(this.permissions)) {
        this.permissions = Array.from(new Set(this.permissions))
    }
})

// Auth helpers
const SALT_ROUNDS = 10

StaffSchema.methods.setPassword = async function (password: string) {
    const salt = await bcrypt.genSalt(SALT_ROUNDS)
    this.passwordHash = await bcrypt.hash(password, salt)
    this.passwordLastChangedAt = new Date()
}

StaffSchema.methods.verifyPassword = async function (password: string) {
    if (!this.passwordHash) return false
    return bcrypt.compare(password, this.passwordHash)
}

StaffSchema.methods.setOTP = async function (code: string, ttlMinutes: number) {
    const salt = await bcrypt.genSalt(SALT_ROUNDS)
    this.otpCodeHash = await bcrypt.hash(code, salt)
    const expires = new Date()
    expires.setMinutes(expires.getMinutes() + ttlMinutes)
    this.otpExpiresAt = expires
}

StaffSchema.methods.clearOTP = async function () {
    this.otpCodeHash = null
    this.otpExpiresAt = null
}

StaffSchema.methods.setResetCode = async function (code: string, ttlMinutes: number) {
    const salt = await bcrypt.genSalt(SALT_ROUNDS)
    this.resetCodeHash = await bcrypt.hash(code, salt)
    const expires = new Date()
    expires.setMinutes(expires.getMinutes() + ttlMinutes)
    this.resetCodeExpiresAt = expires
}

StaffSchema.methods.clearResetCode = async function () {
    this.resetCodeHash = null
    this.resetCodeExpiresAt = null
}

StaffSchema.methods.setOnLeave = async function (onLeave: boolean) {
    this.isOnLeave = onLeave
    await this.save()
}

// Virtuals
StaffSchema.virtual("hasEmail").get(function () {
    return !!this.email
})

StaffSchema.virtual("displayName").get(function () {
    return this.name
})

// Hide sensitive fields from JSON output
StaffSchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        delete ret.passwordHash
        delete ret.otpCodeHash
        delete ret.otpExpiresAt
        delete ret.resetCodeHash
        delete ret.resetCodeExpiresAt
        delete ret.passwordLastChangedAt
        return ret
    },
})

const Staff = (mongoose.models.Staff as mongoose.Model<IStaff, IStaffModel>) || mongoose.model<IStaff, IStaffModel>("Staff", StaffSchema)
export default Staff
