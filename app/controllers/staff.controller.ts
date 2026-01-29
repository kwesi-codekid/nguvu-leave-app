import { Request } from "express"
import Staff from "../models/staff.model"
import Department from "../models/department.model"
import StaffContract from "../models/staff-contract.model"
import LeaveRequest from "../models/leave-request.model"
import AuditLogController from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import {
    AuditAction,
    ResponseObject,
    Gender,
    AccountStatus,
    GENDER_RESTRICTED_LEAVES,
} from "../utils/types"
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary"

export class StaffController {
    /**
     * Create a new staff member
     * POST /api/staff
     */
    static async createStaff(req: Request): Promise<ResponseObject> {
        try {
            const {
                name,
                phone,
                email,
                staffId,
                department,
                permissions = [],
                gender,
                address,
                emergencyContact,
                password,
            } = req.body
            const user = (req as any).user // Assuming auth middleware adds user

            // Check if user has HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can create staff"
                )
            }

            // Validation
            const errors = []

            if (!name || !name.trim()) {
                errors.push({
                    field: "name",
                    message: "Staff name is required",
                })
            }

            if (!phone || !phone.trim()) {
                errors.push({
                    field: "phone",
                    message: "Phone number is required",
                })
            }

            if (!staffId || !staffId.trim()) {
                errors.push({
                    field: "staffId",
                    message: "Staff ID is required",
                })
            }

            if (!department) {
                errors.push({
                    field: "department",
                    message: "Department is required",
                })
            }

            if (!gender || !Object.values(Gender).includes(gender)) {
                errors.push({
                    field: "gender",
                    message: "Valid gender is required (male or female)",
                })
            }

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errors.push({ field: "email", message: "Invalid email format" })
            }

            if (emergencyContact) {
                if (!emergencyContact.name) {
                    errors.push({
                        field: "emergencyContact.name",
                        message: "Emergency contact name is required",
                    })
                }
                if (!emergencyContact.phone) {
                    errors.push({
                        field: "emergencyContact.phone",
                        message: "Emergency contact phone is required",
                    })
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Check for unique constraints
            const [existingPhone, existingEmail, existingStaffId] =
                await Promise.all([
                    Staff.findOne({ phone: phone.trim() }),
                    email
                        ? Staff.findOne({ email: email.trim().toLowerCase() })
                        : null,
                    Staff.findOne({ staffId: staffId.trim() }),
                ])

            if (existingPhone) {
                return errorResponseObject("Phone number already registered")
            }

            if (existingEmail) {
                return errorResponseObject("Email address already registered")
            }

            if (existingStaffId) {
                return errorResponseObject("Staff ID already exists")
            }

            // Verify department exists
            const departmentExists = await Department.findById(department)
            if (!departmentExists || !departmentExists.isActive) {
                return errorResponseObject("Invalid or inactive department")
            }

            // Create staff data
            const staffData: any = {
                name: name.trim(),
                phone: phone.trim(),
                email: email?.trim().toLowerCase() || undefined,
                staffId: staffId.trim(),
                department,
                permissions: Array.isArray(permissions)
                    ? [...new Set(permissions)]
                    : [],
                gender,
                status: AccountStatus.ACTIVE,
                createdBy: user._id,
            }

            if (address) {
                staffData.address = address
            }

            if (emergencyContact) {
                staffData.emergencyContact = {
                    name: emergencyContact.name.trim(),
                    phone: emergencyContact.phone.trim(),
                    relation: emergencyContact.relation?.trim(),
                }
            }

            // Create staff member
            const newStaff = new Staff(staffData)

            // Set password if provided
            if (password) {
                await newStaff.setPassword(password)
            }

            await newStaff.save()

            // Populate for response
            const populatedStaff = await Staff.findById(newStaff._id)
                .populate("department", "name")
                .populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_CREATED,
                entityType: "Staff",
                entityId: newStaff._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created staff member: ${name} (${staffId})`,
                metadata: {
                    staffName: name,
                    staffId: staffId,
                    department: departmentExists.name,
                    hasPassword: !!password,
                    hasEmail: !!email,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Staff member created successfully",
                populatedStaff
            )
        } catch (error) {
            console.error("Error creating staff:", error)
            return errorResponseObject("Failed to create staff member")
        }
    }

    /**
     * Update staff profile
     * PUT /api/staff/:id
     */
    static async updateStaff(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const {
                name,
                phone,
                email,
                staffId,
                department,
                gender,
                address,
                emergencyContact,
            } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            // Find existing staff
            const staff = await Staff.findById(id)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Check permissions
            const isSelf = user._id === id
            const isHRAdmin =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isSelf && !isHRAdmin) {
                return errorResponseObject(
                    "Unauthorized. You can only update your own profile"
                )
            }

            // Validation
            const errors = []
            const changes = []
            const updates: any = {}

            // Name validation and tracking
            if (name !== undefined) {
                if (!name.trim()) {
                    errors.push({
                        field: "name",
                        message: "Name cannot be empty",
                    })
                } else if (name.trim() !== staff.name) {
                    changes.push({
                        field: "name",
                        oldValue: staff.name,
                        newValue: name.trim(),
                        fieldLabel: "Name",
                    })
                    updates.name = name.trim()
                }
            }

            // Phone validation and tracking
            if (phone !== undefined && phone.trim() !== staff.phone) {
                const existingPhone = await Staff.findOne({
                    phone: phone.trim(),
                    _id: { $ne: id },
                })
                if (existingPhone) {
                    errors.push({
                        field: "phone",
                        message: "Phone number already registered",
                    })
                } else {
                    changes.push({
                        field: "phone",
                        oldValue: staff.phone,
                        newValue: phone.trim(),
                        fieldLabel: "Phone Number",
                    })
                    updates.phone = phone.trim()
                }
            }

            // Email validation and tracking
            if (email !== undefined) {
                const newEmail = email?.trim().toLowerCase() || undefined
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    errors.push({
                        field: "email",
                        message: "Invalid email format",
                    })
                } else if (newEmail !== staff.email) {
                    if (newEmail) {
                        const existingEmail = await Staff.findOne({
                            email: newEmail,
                            _id: { $ne: id },
                        })
                        if (existingEmail) {
                            errors.push({
                                field: "email",
                                message: "Email already registered",
                            })
                        }
                    }
                    if (errors.length === 0) {
                        changes.push({
                            field: "email",
                            oldValue: staff.email || "",
                            newValue: newEmail || "",
                            fieldLabel: "Email Address",
                        })
                        updates.email = newEmail
                    }
                }
            }

            // StaffId validation and tracking (HR/Admin only)
            if (staffId !== undefined && isHRAdmin) {
                if (!staffId.trim()) {
                    errors.push({
                        field: "staffId",
                        message: "Staff ID cannot be empty",
                    })
                } else if (staffId.trim() !== staff.staffId) {
                    const existingStaffId = await Staff.findOne({
                        staffId: staffId.trim(),
                        _id: { $ne: id },
                    })
                    if (existingStaffId) {
                        errors.push({
                            field: "staffId",
                            message: "Staff ID already exists",
                        })
                    } else {
                        changes.push({
                            field: "staffId",
                            oldValue: staff.staffId,
                            newValue: staffId.trim(),
                            fieldLabel: "Staff ID",
                        })
                        updates.staffId = staffId.trim()
                    }
                }
            }

            // Department change (HR/Admin only)
            if (
                department !== undefined &&
                isHRAdmin &&
                department !== staff.department?.toString()
            ) {
                const newDept = await Department.findById(department)
                if (!newDept || !newDept.isActive) {
                    errors.push({
                        field: "department",
                        message: "Invalid or inactive department",
                    })
                } else {
                    changes.push({
                        field: "department",
                        oldValue: staff.department,
                        newValue: department,
                        fieldLabel: "Department",
                    })
                    updates.department = department
                }
            }

            // Gender validation and tracking (HR/Admin only)
            if (gender !== undefined && isHRAdmin && gender !== staff.gender) {
                if (!Object.values(Gender).includes(gender)) {
                    errors.push({
                        field: "gender",
                        message: "Invalid gender value",
                    })
                } else {
                    // Check if staff has gender-restricted leaves
                    const hasMaternityLeave = await LeaveRequest.findOne({
                        staff: id,
                        leaveType: "maternity",
                        status: {
                            $in: [
                                "approved",
                                "pending_endorsement",
                                "endorsed",
                            ],
                        },
                    })

                    const hasPaternityLeave = await LeaveRequest.findOne({
                        staff: id,
                        leaveType: "paternity",
                        status: {
                            $in: [
                                "approved",
                                "pending_endorsement",
                                "endorsed",
                            ],
                        },
                    })

                    if (hasMaternityLeave && gender === Gender.MALE) {
                        errors.push({
                            field: "gender",
                            message:
                                "Cannot change to male - staff has maternity leave records",
                        })
                    } else if (hasPaternityLeave && gender === Gender.FEMALE) {
                        errors.push({
                            field: "gender",
                            message:
                                "Cannot change to female - staff has paternity leave records",
                        })
                    } else {
                        changes.push({
                            field: "gender",
                            oldValue: staff.gender,
                            newValue: gender,
                            fieldLabel: "Gender",
                        })
                        updates.gender = gender
                    }
                }
            }

            // Address update
            if (address !== undefined) {
                const addressChanged =
                    JSON.stringify(address) !==
                    JSON.stringify(staff.address || {})
                if (addressChanged) {
                    changes.push({
                        field: "address",
                        oldValue: staff.address || {},
                        newValue: address || {},
                        fieldLabel: "Address",
                    })
                    updates.address = address || null
                }
            }

            // Emergency contact update
            if (emergencyContact !== undefined) {
                if (emergencyContact && !emergencyContact.name) {
                    errors.push({
                        field: "emergencyContact.name",
                        message: "Emergency contact name is required",
                    })
                }
                if (emergencyContact && !emergencyContact.phone) {
                    errors.push({
                        field: "emergencyContact.phone",
                        message: "Emergency contact phone is required",
                    })
                }

                if (errors.length === 0) {
                    const contactChanged =
                        JSON.stringify(emergencyContact) !==
                        JSON.stringify(staff.emergencyContact || {})
                    if (contactChanged) {
                        changes.push({
                            field: "emergencyContact",
                            oldValue: staff.emergencyContact || {},
                            newValue: emergencyContact || {},
                            fieldLabel: "Emergency Contact",
                        })
                        updates.emergencyContact = emergencyContact
                            ? {
                                  name: emergencyContact.name.trim(),
                                  phone: emergencyContact.phone.trim(),
                                  relation: emergencyContact.relation?.trim(),
                              }
                            : null
                    }
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            if (Object.keys(updates).length === 0) {
                return successResponseObject("No changes to update", staff)
            }

            // Update staff
            const updatedStaff = await Staff.findByIdAndUpdate(id, updates, {
                new: true,
                runValidators: true,
            }).populate("department", "name")

            if (!updatedStaff) {
                return errorResponseObject("Failed to update staff member")
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_UPDATED,
                entityType: "Staff",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated staff profile: ${updatedStaff.name} (${updatedStaff.staffId})`,
                changes,
                metadata: {
                    staffName: updatedStaff.name,
                    staffId: updatedStaff.staffId,
                    selfUpdate: isSelf,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Staff profile updated successfully",
                updatedStaff
            )
        } catch (error) {
            console.error("Error updating staff:", error)
            return errorResponseObject("Failed to update staff profile")
        }
    }

    /**
     * Get staff list with search, pagination and filters
     * GET /api/staff
     */
    static async getStaff(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                search = "",
                department,
                status,
                gender,
                isOnLeave,
                hasContract,
                sortBy = "name",
                sortOrder = "asc",
                includeInactive = false,
            } = req.query

            // Validate pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Build query
            const query: any = {}

            // Free text search
            if (search && typeof search === "string" && search.trim()) {
                const searchTerm = search.trim()
                query.$or = [
                    { name: { $regex: searchTerm, $options: "i" } },
                    { staffId: { $regex: searchTerm, $options: "i" } },
                    { email: { $regex: searchTerm, $options: "i" } },
                    { phone: { $regex: searchTerm, $options: "i" } },
                ]
            }

            // Filter by department
            if (department) {
                query.department = department
            }

            // Filter by status
            if (status) {
                if (
                    Object.values(AccountStatus).includes(
                        status as AccountStatus
                    )
                ) {
                    query.status = status
                }
            } else if (!includeInactive || includeInactive === "false") {
                query.status = AccountStatus.ACTIVE
            }

            // Filter by gender
            if (gender && Object.values(Gender).includes(gender as Gender)) {
                query.gender = gender
            }

            // Filter by leave status
            if (isOnLeave === "true") {
                query.isOnLeave = true
            } else if (isOnLeave === "false") {
                query.isOnLeave = false
            }

            // Filter by contract status
            if (hasContract === "true") {
                query.currentContract = { $ne: null }
            } else if (hasContract === "false") {
                query.currentContract = null
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = [
                "name",
                "staffId",
                "createdAt",
                "updatedAt",
            ]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "name"
            sortOptions[sortField as string] = sortOrder === "desc" ? -1 : 1

            // Execute queries
            const [staffList, totalCount] = await Promise.all([
                Staff.find(query)
                    .populate("department", "name")
                    .populate(
                        "currentContract",
                        "position startDate endDate status"
                    )
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                Staff.countDocuments(query),
            ])

            // Add computed fields
            const staffWithDetails = staffList.map((staff) => ({
                ...staff,
                hasEmail: !!staff.email,
                hasContract: !!staff.currentContract,
                hasEmergencyContact: !!staff.emergencyContact,
            }))

            // Response with pagination metadata
            const response = {
                staff: staffWithDetails,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalCount / limitNum),
                    totalRecords: totalCount,
                    recordsPerPage: limitNum,
                    hasNext: skip + limitNum < totalCount,
                    hasPrev: pageNum > 1,
                },
                filters: {
                    search: search || null,
                    department: department || null,
                    status: status || null,
                    gender: gender || null,
                    isOnLeave: isOnLeave || null,
                    hasContract: hasContract || null,
                },
            }

            return successResponseObject(
                "Staff list retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching staff:", error)
            return errorResponseObject("Failed to retrieve staff list")
        }
    }

    /**
     * Get specific staff by ID
     * GET /api/staff/:id
     */
    static async getStaffById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { includeContracts = false } = req.query
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            const staff = await Staff.findById(id)
                .populate("department", "name description")
                .populate("currentContract")
                .populate("createdBy", "name email")
                .lean()

            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Check permissions for sensitive data
            const isSelf = user._id === id
            const isHRAdmin =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            // Prepare response based on permissions
            let staffData: any = {
                ...staff,
                hasEmail: !!staff.email,
                hasContract: !!staff.currentContract,
            }

            // Include contract history if requested and authorized
            if (includeContracts === "true" && (isSelf || isHRAdmin)) {
                const contracts = await StaffContract.find({ staff: id })
                    .populate("position", "title")
                    .sort({ startDate: -1 })
                    .lean()

                staffData.contractHistory = contracts
            }

            // Remove sensitive data for non-authorized users
            if (!isSelf && !isHRAdmin) {
                delete staffData.emergencyContact
                delete staffData.address
                delete staffData.permissions
            }

            return successResponseObject(
                "Staff details retrieved successfully",
                staffData
            )
        } catch (error) {
            console.error("Error fetching staff details:", error)
            return errorResponseObject("Failed to retrieve staff details")
        }
    }

    /**
     * Update staff status
     * PUT /api/staff/:id/status
     */
    static async updateStaffStatus(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { status } = req.body
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can change staff status"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            if (!status || !Object.values(AccountStatus).includes(status)) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "status",
                        message:
                            "Valid status is required (active, inactive, suspended)",
                    },
                ])
            }

            // Find staff
            const staff = await Staff.findById(id)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            if (staff.status === status) {
                return successResponseObject("Status unchanged", staff)
            }

            const oldStatus = staff.status

            // Update status
            staff.status = status

            // If deactivating, set isOnLeave to false
            if (status === AccountStatus.INACTIVE) {
                staff.isOnLeave = false
            }

            await staff.save()

            // Log to audit
            await AuditLogController.createAuditLog({
                action:
                    status === AccountStatus.ACTIVE
                        ? AuditAction.STAFF_ACTIVATED
                        : status === AccountStatus.INACTIVE
                        ? AuditAction.STAFF_DEACTIVATED
                        : AuditAction.STAFF_UPDATED,
                entityType: "Staff",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Changed staff status: ${staff.name} from ${oldStatus} to ${status}`,
                changes: [
                    {
                        field: "status",
                        oldValue: oldStatus,
                        newValue: status,
                        fieldLabel: "Account Status",
                    },
                ],
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    oldStatus,
                    newStatus: status,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                `Staff ${
                    status === AccountStatus.ACTIVE
                        ? "activated"
                        : status === AccountStatus.INACTIVE
                        ? "deactivated"
                        : "suspended"
                } successfully`,
                staff
            )
        } catch (error) {
            console.error("Error updating staff status:", error)
            return errorResponseObject("Failed to update staff status")
        }
    }

    /**
     * Assign permissions to staff
     * PUT /api/staff/:id/permissions
     */
    static async assignPermissions(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { permissions } = req.body
            const user = (req as any).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can assign permissions"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            if (!Array.isArray(permissions)) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "permissions",
                        message: "Permissions must be an array",
                    },
                ])
            }

            // Find staff
            const staff = await Staff.findById(id)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            const oldPermissions = [...staff.permissions]
            const newPermissions = [...new Set(permissions)] // Remove duplicates

            // Check if permissions changed
            const changed =
                JSON.stringify(oldPermissions.sort()) !==
                JSON.stringify(newPermissions.sort())

            if (!changed) {
                return successResponseObject("Permissions unchanged", staff)
            }

            // Update permissions
            staff.permissions = newPermissions
            await staff.save()

            // Determine added and removed permissions
            const added = newPermissions.filter(
                (p) => !oldPermissions.includes(p)
            )
            const removed = oldPermissions.filter(
                (p) => !newPermissions.includes(p)
            )

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.ROLE_CHANGED,
                entityType: "Staff",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated permissions for ${staff.name}`,
                changes: [
                    {
                        field: "permissions",
                        oldValue: oldPermissions,
                        newValue: newPermissions,
                        fieldLabel: "Permissions",
                    },
                ],
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    permissionsAdded: added,
                    permissionsRemoved: removed,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Permissions updated successfully",
                staff
            )
        } catch (error) {
            console.error("Error assigning permissions:", error)
            return errorResponseObject("Failed to assign permissions")
        }
    }

    /**
     * Upload profile image
     * PUT /api/staff/:id/profile-image
     */
    static async uploadProfileImage(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user
            const file = (req as any).file // Assuming multer middleware

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            if (!file) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "image", message: "Image file is required" },
                ])
            }

            // Find staff
            const staff = await Staff.findById(id)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Check permissions
            const isSelf = user._id === id
            const isHRAdmin =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isSelf && !isHRAdmin) {
                return errorResponseObject(
                    "Unauthorized. You can only update your own profile image"
                )
            }

            // Upload to Cloudinary
            const uploadResult = await uploadToCloudinary(
                file.buffer,
                `staff_${id}`,
                "staff-profiles"
            )

            // Delete old image if exists
            if (staff.profileImage?.publicId) {
                await deleteFromCloudinary(staff.profileImage.publicId)
            }

            // Update staff profile image
            staff.profileImage = {
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                filename: file.originalname,
                fileType: file.mimetype,
                uploadedAt: new Date(),
            }

            await staff.save()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.DOCUMENT_UPLOADED,
                entityType: "Staff",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Uploaded profile image for ${staff.name}`,
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    imageUrl: uploadResult.secure_url,
                    selfUpload: isSelf,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Profile image uploaded successfully",
                staff
            )
        } catch (error) {
            console.error("Error uploading profile image:", error)
            return errorResponseObject("Failed to upload profile image")
        }
    }

    /**
     * Update emergency contact
     * PUT /api/staff/:id/emergency-contact
     */
    static async updateEmergencyContact(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { name, phone, relation } = req.body
            const user = (req as any).user

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            // Validation
            const errors = []
            if (!name || !name.trim()) {
                errors.push({
                    field: "name",
                    message: "Emergency contact name is required",
                })
            }
            if (!phone || !phone.trim()) {
                errors.push({
                    field: "phone",
                    message: "Emergency contact phone is required",
                })
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Find staff
            const staff = await Staff.findById(id)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Check permissions
            const isSelf = user._id === id
            const isHRAdmin =
                user?.permissions?.includes("HR") ||
                user?.permissions?.includes("ADMIN")

            if (!isSelf && !isHRAdmin) {
                return errorResponseObject(
                    "Unauthorized. You can only update your own emergency contact"
                )
            }

            const oldContact = staff.emergencyContact
                ? { ...staff.emergencyContact }
                : null

            // Update emergency contact
            staff.emergencyContact = {
                name: name.trim(),
                phone: phone.trim(),
                relation: relation?.trim() || undefined,
            }

            await staff.save()

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_UPDATED,
                entityType: "Staff",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated emergency contact for ${staff.name}`,
                changes: [
                    {
                        field: "emergencyContact",
                        oldValue: oldContact,
                        newValue: staff.emergencyContact,
                        fieldLabel: "Emergency Contact",
                    },
                ],
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    selfUpdate: isSelf,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Emergency contact updated successfully",
                staff
            )
        } catch (error) {
            console.error("Error updating emergency contact:", error)
            return errorResponseObject("Failed to update emergency contact")
        }
    }

    /**
     * Get staff by department
     * GET /api/staff/department/:departmentId
     */
    static async getStaffByDepartment(
        req: Request,
        departmentId: string
    ): Promise<ResponseObject> {
        try {
            const { includeInactive = false } = req.query

            if (!departmentId) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "departmentId",
                        message: "Department ID is required",
                    },
                ])
            }

            // Verify department exists
            const department = await Department.findById(departmentId)
            if (!department) {
                return errorResponseObject("Department not found")
            }

            const query: any = { department: departmentId }
            if (!includeInactive || includeInactive === "false") {
                query.status = AccountStatus.ACTIVE
            }

            const staffList = await Staff.find(query)
                .populate("currentContract", "position startDate endDate")
                .select("name staffId email phone gender isOnLeave status")
                .sort({ name: 1 })
                .lean()

            const response = {
                department: {
                    id: department._id,
                    name: department.name,
                },
                totalStaff: staffList.length,
                activeStaff: staffList.filter(
                    (s) => s.status === AccountStatus.ACTIVE
                ).length,
                onLeave: staffList.filter((s) => s.isOnLeave).length,
                staff: staffList,
            }

            return successResponseObject(
                "Department staff retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching department staff:", error)
            return errorResponseObject("Failed to retrieve department staff")
        }
    }

    /**
     * Quick search staff
     * GET /api/staff/search
     */
    static async searchStaff(req: Request): Promise<ResponseObject> {
        try {
            const { q, limit = 10 } = req.query

            if (!q || typeof q !== "string" || !q.trim()) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "q", message: "Search query is required" },
                ])
            }

            const searchTerm = q.trim()
            const limitNum = Math.min(50, Math.max(1, Number(limit)))

            const staff = await Staff.find({
                status: AccountStatus.ACTIVE,
                $or: [
                    { name: { $regex: searchTerm, $options: "i" } },
                    { staffId: { $regex: searchTerm, $options: "i" } },
                    { phone: { $regex: searchTerm, $options: "i" } },
                ],
            })
                .select("name staffId email phone department")
                .populate("department", "name")
                .limit(limitNum)
                .lean()

            return successResponseObject("Search results retrieved", staff)
        } catch (error) {
            console.error("Error searching staff:", error)
            return errorResponseObject("Failed to search staff")
        }
    }

    /**
     * Delete staff member
     * DELETE /api/staff/:id
     */
    static async deleteStaff(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { forceDelete = false } = req.query
            const user = (req as any).user

            // Check Admin permission
            if (!user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only Admin can delete staff"
                )
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Staff ID is required" },
                ])
            }

            // Find staff
            const staff = await Staff.findById(id)
            if (!staff) {
                return errorResponseObject("Staff member not found")
            }

            // Check for dependencies
            const [contractCount, leaveRequestCount] = await Promise.all([
                StaffContract.countDocuments({ staff: id }),
                LeaveRequest.countDocuments({ staff: id }),
            ])

            if (
                (contractCount > 0 || leaveRequestCount > 0) &&
                forceDelete !== "true"
            ) {
                const dependencies = []
                if (contractCount > 0)
                    dependencies.push(`${contractCount} contracts`)
                if (leaveRequestCount > 0)
                    dependencies.push(`${leaveRequestCount} leave requests`)

                return errorResponseObject(
                    `Cannot delete staff with existing dependencies: ${dependencies.join(
                        ", "
                    )}. ` +
                        `Use forceDelete=true to override or deactivate instead.`
                )
            }

            let actionTaken = ""

            if (forceDelete === "true") {
                // Hard delete
                await Staff.findByIdAndDelete(id)
                actionTaken = "deleted"
            } else {
                // Soft delete (deactivate)
                staff.status = AccountStatus.INACTIVE
                staff.isOnLeave = false
                await staff.save()
                actionTaken = "deactivated"
            }

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_DELETED,
                entityType: "Staff",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `${
                    actionTaken === "deleted" ? "Deleted" : "Deactivated"
                } staff: ${staff.name} (${staff.staffId})`,
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    actionType: actionTaken,
                    forceDelete: forceDelete === "true",
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(`Staff ${actionTaken} successfully`, {
                id,
                name: staff.name,
                staffId: staff.staffId,
                action: actionTaken,
            })
        } catch (error) {
            console.error("Error deleting staff:", error)
            return errorResponseObject("Failed to delete staff")
        }
    }

    /**
     * Bulk import staff from CSV
     * POST /api/staff/bulk-import
     */
    static async bulkImportStaff(req: Request): Promise<ResponseObject> {
        try {
            const { data } = req.body // Assuming CSV is parsed to array of objects
            const user = (req as any).user

            // Check HR/Admin permission
            if (
                !user?.permissions?.includes("HR") &&
                !user?.permissions?.includes("ADMIN")
            ) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can import staff"
                )
            }

            if (!Array.isArray(data) || data.length === 0) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "data",
                        message: "Import data is required and must be an array",
                    },
                ])
            }

            const results = {
                successful: [] as any[],
                failed: [] as any[],
            }

            // Validate all records first
            for (let i = 0; i < data.length; i++) {
                const record = data[i]
                const row = i + 1
                const errors = []

                // Required field validation
                if (!record.name) errors.push(`Row ${row}: Name is required`)
                if (!record.phone) errors.push(`Row ${row}: Phone is required`)
                if (!record.staffId)
                    errors.push(`Row ${row}: Staff ID is required`)
                if (!record.department)
                    errors.push(`Row ${row}: Department is required`)
                if (
                    !record.gender ||
                    !Object.values(Gender).includes(record.gender)
                ) {
                    errors.push(
                        `Row ${row}: Valid gender is required (male/female)`
                    )
                }

                if (errors.length > 0) {
                    results.failed.push({ row, data: record, errors })
                    continue
                }

                // Check uniqueness
                const [existingPhone, existingEmail, existingStaffId] =
                    await Promise.all([
                        Staff.findOne({ phone: record.phone }),
                        record.email
                            ? Staff.findOne({ email: record.email })
                            : null,
                        Staff.findOne({ staffId: record.staffId }),
                    ])

                if (existingPhone)
                    errors.push(`Row ${row}: Phone number already exists`)
                if (existingEmail)
                    errors.push(`Row ${row}: Email already exists`)
                if (existingStaffId)
                    errors.push(`Row ${row}: Staff ID already exists`)

                // Verify department
                const department = await Department.findOne({
                    name: record.department,
                })
                if (!department) {
                    errors.push(
                        `Row ${row}: Department '${record.department}' not found`
                    )
                }

                if (errors.length > 0) {
                    results.failed.push({ row, data: record, errors })
                } else if (department) {
                    // Prepare for creation
                    results.successful.push({
                        row,
                        data: {
                            ...record,
                            department: department._id,
                        },
                    })
                }
            }

            // Create successful records
            const created: any[] = []
            for (const item of results.successful) {
                try {
                    const staffData = {
                        name: item.data.name.trim(),
                        phone: item.data.phone.trim(),
                        email: item.data.email?.trim().toLowerCase(),
                        staffId: item.data.staffId.trim(),
                        department: item.data.department,
                        gender: item.data.gender,
                        status: AccountStatus.ACTIVE,
                        createdBy: user._id,
                        permissions: [],
                    }

                    const newStaff = await Staff.create(staffData)
                    created.push({
                        row: item.row,
                        id: newStaff._id,
                        name: newStaff.name,
                        staffId: newStaff.staffId,
                    })
                } catch (error) {
                    results.failed.push({
                        row: item.row,
                        data: item.data,
                        errors: [
                            `Failed to create: ${(error as Error).message}`,
                        ],
                    })
                }
            }

            // Log bulk import
            await AuditLogController.createAuditLog({
                action: AuditAction.STAFF_CREATED,
                entityType: "Staff",
                entityId: "bulk-import",
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Bulk imported ${created.length} staff members`,
                metadata: {
                    totalRecords: data.length,
                    successful: created.length,
                    failed: results.failed.length,
                    createdStaffIds: created.map((c) => c.id),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            const response = {
                summary: {
                    total: data.length,
                    successful: created.length,
                    failed: results.failed.length,
                },
                created,
                failed: results.failed,
            }

            return successResponseObject(
                `Import completed: ${created.length} successful, ${results.failed.length} failed`,
                response
            )
        } catch (error) {
            console.error("Error in bulk import:", error)
            return errorResponseObject("Failed to import staff")
        }
    }
}

export default StaffController
