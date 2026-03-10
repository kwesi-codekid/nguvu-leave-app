/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document } from "mongoose"

export enum HolidayTypes {
    VARYING = "varying",
    FIXED = "fixed",
}

export interface HolidayInterface {
    _id?: string
    name: string
    type: HolidayTypes
    startDate?: Date // Start date of the holiday
    endDate?: Date // End date of the holiday (defaults to startDate for single day)
    description?: string // Optional description of the holiday
    createdBy?: string // Staff ID who created the holiday
    createdAt?: Date
    updatedAt?: Date
}

// Standard API response format
export type ResponseObject = {
    status: "success" | "error" | "validation_error" | "not_found"
    message: string
    data?: any
    errors?: [{ field: string; message: string }]
}

export interface DepartmentInterface {
    _id?: string
    name: string
    description?: string // Optional description
    head?: string // Staff ID of the department head
    isActive?: boolean // To enable/disable departments
    staffCount?: number // Number of staff in the department
    createdBy?: string // Staff ID who created the department
    createdAt?: Date
    updatedAt?: Date
}

export enum LeaveTypes {
    ANNUAL = "annual",
    MATERNITY = "maternity",
    SICK = "sick",
    PATERNITY = "paternity",
    BEREAVEMENT = "bereavement",
}

export enum LeaveStatus {
    PENDING = "pending_endorsement",
    ENDORSED = "endorsed",
    APPROVED = "approved",
    REJECTED = "rejected",
    CANCELLED = "cancelled",
    WITHDRAWN = "withdrawn",
}

export interface DocumentAttachment {
    url: string
    publicId: string
    filename: string
    fileType: string
    uploadedAt: Date
}

// Audit Log Types
export enum AuditAction {
    // Authentication
    USER_LOGIN = "user_login",
    USER_LOGOUT = "user_logout",
    PASSWORD_CHANGE = "password_change",
    PASSWORD_RESET = "password_reset",

    // Leave Management
    LEAVE_REQUESTED = "leave_requested",
    LEAVE_CREATED = "leave_created",
    LEAVE_UPDATED = "leave_updated",
    LEAVE_ENDORSED = "leave_endorsed",
    LEAVE_APPROVED = "leave_approved",
    LEAVE_REJECTED = "leave_rejected",
    LEAVE_CANCELLED = "leave_cancelled",
    LEAVE_DELETED = "leave_deleted",

    // Call-In Management
    CALLIN_CREATED = "callin_created",

    // Staff Management
    STAFF_CREATED = "staff_created",
    STAFF_UPDATED = "staff_updated",
    STAFF_VIEWED = "staff_viewed",
    STAFF_DEACTIVATED = "staff_deactivated",
    STAFF_ACTIVATED = "staff_activated",
    STAFF_DELETED = "staff_deleted",
    ROLE_CHANGED = "role_changed",

    // Leave Balance Management
    BALANCE_CREDITED = "balance_credited",
    BALANCE_DEBITED = "balance_debited",
    BALANCE_ADJUSTED = "balance_adjusted",
    BALANCE_RESET = "balance_reset",
    BALANCE_CARRIED_FORWARD = "balance_carried_forward",

    // System Configuration
    HOLIDAY_CREATED = "holiday_created",
    HOLIDAY_UPDATED = "holiday_updated",
    HOLIDAY_DELETED = "holiday_deleted",
    DEPARTMENT_CREATED = "department_created",
    DEPARTMENT_UPDATED = "department_updated",
    DEPARTMENT_DELETED = "department_deleted",

    // Document Management
    DOCUMENT_UPLOADED = "document_uploaded",
    DOCUMENT_DELETED = "document_deleted",

    // System Events
    SYSTEM_BACKUP = "system_backup",
    SYSTEM_RESTORE = "system_restore",
    CRON_JOB_EXECUTED = "cron_job_executed",
    EMAIL_SENT = "email_sent",
    SMS_SENT = "sms_sent",
    REPORT_GENERATED = "report_generated",
}

export interface ChangeRecord {
    field: string
    oldValue: any
    newValue: any
    fieldLabel?: string // Human-readable field name
}

export interface AuditLogInterface {
    _id?: string
    action: AuditAction
    entityType: string // e.g., "Leave", "Staff", "LeaveBalance"
    entityId: string // ID of the affected entity
    performedBy: string // Staff ID who performed the action
    performedByName?: string // Staff name for quick reference
    performedByEmail?: string // Staff email for quick reference
    ipAddress?: string
    userAgent?: string
    changes?: ChangeRecord[] // Field-level change tracking
    metadata?: Record<string, any> // Additional context-specific data
    description?: string // Human-readable description of the action
    status?: "success" | "failed" // Whether the action succeeded or failed
    errorMessage?: string // Error details if action failed
    createdAt?: Date
    updatedAt?: Date
}

// Job Position Types
export interface OccupancyInterface {
    max: number
    current: number
    available: number
}

export interface JobPositionInterface {
    _id?: string
    title: string
    department: string // Department ID reference
    maxOccupancy: number // Maximum number of people allowed in this position
    currentOccupancy?: number // Virtual field - calculated from active contracts
    endorserPosition?: string // Job Position ID that endorses leave requests
    approverPosition?: string // Job Position ID that approves leave requests
    occupancy?: OccupancyInterface
    isActive?: boolean
    createdBy?: string
    createdAt?: Date
    updatedAt?: Date
}

// Contract Status Enum
export enum ContractStatus {
    PENDING = "pending", // Not yet started
    ACTIVE = "active",
    EXPIRED = "expired",
    CANCELLED = "cancelled",
    RENEWED = "renewed",
}

// Staff Contract Types
export interface StaffContractInterface {
    _id?: string
    staff: string // Staff ID reference
    position: string // JobPosition ID reference
    startDate: Date
    endDate?: Date // Null/undefined for permanent contracts
    status: ContractStatus
    salary?: number // Optional compensation
    currency?: string // Currency for salary (e.g., "USD", "GHS")
    previousContract?: string // Reference to previous contract (for renewals/reassignments)
    terminatedBy?: string // Staff ID who terminated the contract
    terminationReason?: string
    terminationDate?: Date
    createdBy?: string
    createdAt?: Date
    updatedAt?: Date
}

// User/Staff Types
export enum Gender {
    MALE = "male",
    FEMALE = "female",
}

export enum AccountStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
}

export interface Address {
    line1?: string
    line2?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
}

export interface EmergencyContact {
    name: string
    phone: string
    relation?: string
}

export interface StaffInterface {
    _id?: string
    name: string
    phone: string
    email?: string
    staffId: string
    department: string // Department ID
    permissions: string[]
    gender: Gender
    profileImage?: DocumentAttachment
    address?: Address
    emergencyContact?: EmergencyContact
    status?: AccountStatus
    isOnLeave?: boolean
    currentContract?: string // StaffContract ID
    createdBy?: string
    createdAt?: Date
    updatedAt?: Date
}

export interface StaffAuthFields {
    passwordHash?: string
    otpCodeHash?: string
    otpExpiresAt?: Date
    resetCodeHash?: string
    resetCodeExpiresAt?: Date
    passwordLastChangedAt?: Date
}

// User interface (alias for StaffInterface with additional fields)
export interface UserInterface extends StaffInterface {
    company?: string
}

// Companies type
export type Companies = string

// Leave Balance Types
export interface LeaveBalanceInterface {
    _id?: string
    staff: string // Staff ID reference
    year: number // Derived from periodStart.getFullYear()
    periodStart: Date // Start of the contract-based leave period
    periodEnd: Date // End of the contract-based leave period
    leaveType: LeaveTypes
    allocated: number // Max allowed for the period (pro-rated if partial period)
    accrued?: number // For annual leave only - actual accrued amount
    used: number // Days taken
    adjustments?: number // For annual leave only - manual adjustments
    lastAccrualAt?: Date // For annual leave - track last accrual
    manuallySet?: boolean // When true, updateAccrual() will not overwrite accrued
    notes?: string
    createdBy?: string
    createdAt?: Date
    updatedAt?: Date
}

// Leave Request Types
export interface EndorsementRecord {
    byPosition: string // JobPosition ID that endorsed
    byStaff?: string // Staff ID who actually endorsed
    at?: Date
    comment?: string
}

export interface ApprovalRecord {
    byPosition: string // JobPosition ID that approved
    byStaff?: string // Staff ID who actually approved
    at?: Date
    comment?: string
    decision?: "approved" | "rejected"
}

export interface CancellationRecord {
    byStaff: string // Staff ID who cancelled
    at: Date
    reason?: string
}

export interface WorkingDaysBreakdown {
    [year: number]: number // e.g., { 2024: 2, 2025: 3 } for cross-year leave
}

export interface LeaveRequestInterface {
    _id?: string
    staff: string // Staff ID reference
    contract: string // StaffContract ID reference
    position: string // JobPosition ID at time of request
    department: string // Department ID at time of request
    positionTitleSnapshot?: string // Position title at time of request
    departmentNameSnapshot?: string // Department name at time of request
    leaveType: LeaveTypes
    startDate: Date
    endDate: Date
    startYear: number // Year of start date for easier querying
    workingDays: number // Total working days (excluding weekends/holidays)
    workingDaysBreakdown?: WorkingDaysBreakdown // Days per year for cross-year leaves
    status: LeaveStatus
    reason?: string
    attachments?: DocumentAttachment[]
    endorsement?: EndorsementRecord
    approval?: ApprovalRecord
    cancellation?: CancellationRecord
    delegatedBy?: string // Staff ID who requested on behalf
    createdBy?: string
    createdAt?: Date
    updatedAt?: Date
}

// Leave type caps
export const LEAVE_CAPS = {
    [LeaveTypes.ANNUAL]: 30,
    [LeaveTypes.BEREAVEMENT]: 10,
    [LeaveTypes.MATERNITY]: 30,
    [LeaveTypes.PATERNITY]: 5,
    [LeaveTypes.SICK]: 60,
} as const

// Leave types requiring documents
export const LEAVE_TYPES_REQUIRING_DOCUMENTS = [
    LeaveTypes.MATERNITY,
    LeaveTypes.PATERNITY,
    LeaveTypes.BEREAVEMENT,
    LeaveTypes.SICK,
] as const

// Gender-restricted leave types
export const GENDER_RESTRICTED_LEAVES = {
    [LeaveTypes.MATERNITY]: Gender.FEMALE,
    [LeaveTypes.PATERNITY]: Gender.MALE,
} as const

// Call-In Types
export interface CallInInterface {
    _id?: string
    leaveRequest: string // LeaveRequest ID reference
    staff: string // Staff ID reference (denormalized for quick access)
    department: string // Department ID reference (denormalized for quick access)
    callInStartDate: Date
    callInEndDate: Date
    workingDaysRecovered: number // Calculated working days in the call-in period
    reason: string
    requestedBy: string // Staff ID of the manager who created the call-in
    requestedAt: Date
    createdAt?: Date
    updatedAt?: Date
}
