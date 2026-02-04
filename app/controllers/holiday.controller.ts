import { Request } from "express"
import Holiday from "../models/holiday.model"
import AuditLogController from "./audit-log.controller"
import {
    successResponseObject,
    errorResponseObject,
    validationErrorResponseObject,
} from "../utils/api-utils"
import { HolidayTypes, AuditAction, ResponseObject } from "../utils/types"

export class HolidayController {
    /**
     * Create a new holiday
     * POST /api/holidays
     */
    static async createHoliday(req: Request): Promise<ResponseObject> {
        try {
            const { name, type, startDate, endDate, description } = req.body
            const user = (req as any).user

            console.log("Holiday creation request:", { name, type, startDate, endDate, description, user: user?.name, permissions: user?.permissions })

            // Check if user has HR permission
            if (!user?.permissions?.includes("HR") && !user?.permissions?.includes("ADMIN")) {
                return errorResponseObject(
                    "Unauthorized. Only HR/Admin can create holidays"
                )
            }

            // Validation
            const errors = []
            if (!name) {
                errors.push({
                    field: "name",
                    message: "Holiday name is required",
                })
            }
            if (!type || !Object.values(HolidayTypes).includes(type)) {
                errors.push({
                    field: "type",
                    message: "Valid holiday type is required (fixed or varying)",
                })
            }
            if (!startDate) {
                errors.push({
                    field: "startDate",
                    message: "Start date is required",
                })
            } else {
                const parsedStartDate = new Date(startDate)
                if (isNaN(parsedStartDate.getTime())) {
                    errors.push({
                        field: "startDate",
                        message: "Invalid start date format",
                    })
                }
            }

            console.log("Validation errors:", errors)

            if (errors.length > 0) {
                return validationErrorResponseObject("Validation failed", errors)
            }

            // End date validation (optional, defaults to startDate)
            let finalEndDate = endDate || startDate
            if (endDate) {
                const parsedEndDate = new Date(endDate)
                if (isNaN(parsedEndDate.getTime())) {
                    errors.push({
                        field: "endDate",
                        message: "Invalid end date format",
                    })
                } else if (new Date(endDate) < new Date(startDate)) {
                    errors.push({
                        field: "endDate",
                        message: "End date cannot be before start date",
                    })
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject("Validation failed", errors)
            }

            // Check for duplicate holidays
            console.log("Checking for duplicate holidays...")
            const existingQuery: any = {
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
            }

            const existing = await Holiday.findOne(existingQuery)
            if (existing) {
                return errorResponseObject(
                    "A holiday with this name already exists"
                )
            }

            console.log("No duplicate found, creating holiday...")

            // Create holiday
            const holidayData: any = {
                name: name.trim(),
                type,
                startDate: new Date(startDate),
                endDate: new Date(finalEndDate),
                description: description?.trim(),
                createdBy: user._id,
            }

            console.log("Holiday data to create:", holidayData)

            const holiday = await Holiday.create(holidayData)
            console.log("Holiday created:", holiday._id)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.HOLIDAY_CREATED,
                entityType: "Holiday",
                entityId: holiday._id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Created ${type} holiday: ${name}`,
                metadata: {
                    holidayType: type,
                    holidayName: name,
                    startDate,
                    endDate: finalEndDate,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Holiday created successfully", holiday)
        } catch (error: any) {
            console.error("Error creating holiday:", error)
            console.error("Error stack:", error?.stack)
            console.error("Error message:", error?.message)
            return errorResponseObject(`Failed to create holiday: ${error?.message || 'Unknown error'}`)
        }
    }

    /**
     * Get holidays with search, pagination and filters
     * GET /api/holidays
     */
    static async getHolidays(req: Request): Promise<ResponseObject> {
        try {
            const {
                page = 1,
                limit = 20,
                search = "",
                type,
                year,
                sortBy = "startDate",
                sortOrder = "asc",
            } = req.query

            // Validate pagination
            const pageNum = Math.max(1, Number(page))
            const limitNum = Math.min(100, Math.max(1, Number(limit)))
            const skip = (pageNum - 1) * limitNum

            // Build query
            const query: any = {}

            // Free text search on name and description
            if (search && typeof search === "string" && search.trim()) {
                const searchTerm = search.trim()
                query.$or = [
                    { name: { $regex: searchTerm, $options: "i" } },
                    { description: { $regex: searchTerm, $options: "i" } },
                ]
            }

            // Filter by type
            if (type && Object.values(HolidayTypes).includes(type as HolidayTypes)) {
                query.type = type
            }

            // Filter by year (for varying holidays)
            if (year && !isNaN(Number(year))) {
                const yearNum = Number(year)
                const yearStart = new Date(yearNum, 0, 1)
                const yearEnd = new Date(yearNum, 11, 31, 23, 59, 59)

                if (query.type === HolidayTypes.VARYING) {
                    query.startDate = { $gte: yearStart, $lte: yearEnd }
                }
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = ["name", "type", "startDate", "endDate", "createdAt"]
            const sortField = validSortFields.includes(sortBy as string) ? sortBy : "startDate"
            sortOptions[sortField as string] = sortOrder === "desc" ? -1 : 1

            // Execute queries
            const [holidays, totalCount] = await Promise.all([
                Holiday.find(query)
                    .populate("createdBy", "name email")
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                Holiday.countDocuments(query),
            ])

            // Response with pagination metadata
            const response = {
                holidays,
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
                    type: type || null,
                    year: year ? Number(year) : null,
                },
            }

            return successResponseObject("Holidays retrieved successfully", response)
        } catch (error) {
            console.error("Error fetching holidays:", error)
            return errorResponseObject("Failed to retrieve holidays")
        }
    }

    /**
     * Get specific holiday by ID
     * GET /api/holidays/:id
     */
    static async getHolidayById(req: Request, id: string): Promise<ResponseObject> {
        try {
            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Holiday ID is required" },
                ])
            }

            const holiday = await Holiday.findById(id)
                .populate("createdBy", "name email")
                .lean()

            if (!holiday) {
                return errorResponseObject("Holiday not found")
            }

            return successResponseObject("Holiday retrieved successfully", holiday)
        } catch (error) {
            console.error("Error fetching holiday:", error)
            return errorResponseObject("Failed to retrieve holiday")
        }
    }

    /**
     * Update a holiday
     * PUT /api/holidays/:id
     */
    static async updateHoliday(req: Request, id: string): Promise<ResponseObject> {
        try {
            const { name, startDate, endDate, description } = req.body
            const user = (req as any).user

            // Check HR permission
            if (!user?.permissions?.includes("HR") && !user?.permissions?.includes("ADMIN")) {
                return errorResponseObject("Unauthorized. Only HR/Admin can update holidays")
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Holiday ID is required" },
                ])
            }

            // Find existing holiday
            const holiday = await Holiday.findById(id)
            if (!holiday) {
                return errorResponseObject("Holiday not found")
            }

            // Track changes for audit log
            const changes = []
            const updates: any = {}

            // Update name
            if (name && name.trim() && name.trim() !== holiday.name) {
                changes.push({
                    field: "name",
                    oldValue: holiday.name,
                    newValue: name.trim(),
                    fieldLabel: "Holiday Name",
                })
                updates.name = name.trim()
            }

            // Update description
            if (description !== undefined) {
                const newDesc = description?.trim() || ""
                if (newDesc !== (holiday.description || "")) {
                    changes.push({
                        field: "description",
                        oldValue: holiday.description || "",
                        newValue: newDesc,
                        fieldLabel: "Description",
                    })
                    updates.description = newDesc
                }
            }

            // Update startDate
            if (startDate) {
                const newStartDate = new Date(startDate)
                if (!isNaN(newStartDate.getTime())) {
                    const oldStartStr = holiday.startDate?.toISOString()
                    const newStartStr = newStartDate.toISOString()

                    if (oldStartStr !== newStartStr) {
                        changes.push({
                            field: "startDate",
                            oldValue: holiday.startDate,
                            newValue: newStartDate,
                            fieldLabel: "Start Date",
                        })
                        updates.startDate = newStartDate
                    }
                }
            }

            // Update endDate
            if (endDate) {
                const newEndDate = new Date(endDate)
                if (!isNaN(newEndDate.getTime())) {
                    const oldEndStr = holiday.endDate?.toISOString()
                    const newEndStr = newEndDate.toISOString()

                    if (oldEndStr !== newEndStr) {
                        changes.push({
                            field: "endDate",
                            oldValue: holiday.endDate,
                            newValue: newEndDate,
                            fieldLabel: "End Date",
                        })
                        updates.endDate = newEndDate
                    }
                }
            }

            // Validate date range
            const finalStartDate = updates.startDate || holiday.startDate
            const finalEndDate = updates.endDate || holiday.endDate
            if (finalEndDate < finalStartDate) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "endDate", message: "End date cannot be before start date" },
                ])
            }

            if (Object.keys(updates).length === 0) {
                return successResponseObject("No changes to update", holiday)
            }

            // Update holiday
            const updatedHoliday = await Holiday.findByIdAndUpdate(id, updates, {
                new: true,
                runValidators: true,
            }).populate("createdBy", "name email")

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.HOLIDAY_UPDATED,
                entityType: "Holiday",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Updated holiday: ${updatedHoliday?.name}`,
                changes,
                metadata: {
                    holidayType: holiday.type,
                    holidayName: updatedHoliday?.name,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Holiday updated successfully", updatedHoliday)
        } catch (error) {
            console.error("Error updating holiday:", error)
            return errorResponseObject("Failed to update holiday")
        }
    }

    /**
     * Delete a holiday
     * DELETE /api/holidays/:id
     */
    static async deleteHoliday(req: Request, id: string): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check HR permission
            if (!user?.permissions?.includes("HR") && !user?.permissions?.includes("ADMIN")) {
                return errorResponseObject("Unauthorized. Only HR/Admin can delete holidays")
            }

            if (!id) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "id", message: "Holiday ID is required" },
                ])
            }

            // Find and delete holiday
            const holiday = await Holiday.findById(id)
            if (!holiday) {
                return errorResponseObject("Holiday not found")
            }

            await Holiday.findByIdAndDelete(id)

            // Log to audit
            await AuditLogController.createAuditLog({
                action: AuditAction.HOLIDAY_DELETED,
                entityType: "Holiday",
                entityId: id,
                performedBy: user._id,
                performedByName: user.name,
                performedByEmail: user.email,
                description: `Deleted holiday: ${holiday.name}`,
                metadata: {
                    holidayType: holiday.type,
                    holidayName: holiday.name,
                    startDate: holiday.startDate,
                    endDate: holiday.endDate,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject("Holiday deleted successfully", { id })
        } catch (error) {
            console.error("Error deleting holiday:", error)
            return errorResponseObject("Failed to delete holiday")
        }
    }

    /**
     * Get upcoming holidays
     * GET /api/holidays/upcoming
     */
    static async getUpcomingHolidays(req: Request): Promise<ResponseObject> {
        try {
            const { limit = 10 } = req.query
            const limitNum = Math.min(50, Math.max(1, Number(limit)))

            const holidays = await Holiday.getUpcomingHolidays(limitNum)

            // Populate creator details
            const populatedHolidays = await Holiday.populate(holidays, {
                path: "createdBy",
                select: "name email",
            })

            return successResponseObject("Upcoming holidays retrieved successfully", populatedHolidays)
        } catch (error) {
            console.error("Error fetching upcoming holidays:", error)
            return errorResponseObject("Failed to retrieve upcoming holidays")
        }
    }

    /**
     * Get holidays for a specific year
     * GET /api/holidays/year/:year
     */
    static async getHolidaysForYear(req: Request, year: string): Promise<ResponseObject> {
        try {
            const yearNum = Number(year)
            if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
                return validationErrorResponseObject("Validation failed", [
                    {
                        field: "year",
                        message: "Valid year is required (1900-2100)",
                    },
                ])
            }

            const holidays = await Holiday.getHolidaysForYear(yearNum)

            // Populate creator details
            const populatedHolidays = await Holiday.populate(holidays, {
                path: "createdBy",
                select: "name email",
            })

            // Sort holidays by start date
            const sortedHolidays = populatedHolidays.sort((a, b) => {
                const aMonth = new Date(a.startDate as any).getMonth()
                const aDay = new Date(a.startDate as any).getDate()
                const bMonth = new Date(b.startDate as any).getMonth()
                const bDay = new Date(b.startDate as any).getDate()

                if (aMonth !== bMonth) return aMonth - bMonth
                return aDay - bDay
            })

            return successResponseObject(`Holidays for year ${yearNum} retrieved successfully`, {
                year: yearNum,
                totalHolidays: sortedHolidays.length,
                holidays: sortedHolidays,
            })
        } catch (error) {
            console.error("Error fetching holidays for year:", error)
            return errorResponseObject("Failed to retrieve holidays for the specified year")
        }
    }

    /**
     * Check if a specific date is a holiday
     * GET /api/holidays/check-date
     */
    static async checkDateIsHoliday(req: Request): Promise<ResponseObject> {
        try {
            const { date } = req.query

            if (!date) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "date", message: "Date is required" },
                ])
            }

            const checkDate = new Date(date as string)
            if (isNaN(checkDate.getTime())) {
                return validationErrorResponseObject("Validation failed", [
                    { field: "date", message: "Invalid date format" },
                ])
            }

            const isHoliday = await Holiday.isHoliday(checkDate)

            let holidayDetails = null
            if (isHoliday) {
                // Get the holiday details
                const startOfDay = new Date(checkDate)
                startOfDay.setHours(0, 0, 0, 0)
                const endOfDay = new Date(checkDate)
                endOfDay.setHours(23, 59, 59, 999)

                holidayDetails = await Holiday.findOne({
                    $or: [
                        {
                            type: HolidayTypes.VARYING,
                            startDate: { $lte: endOfDay },
                            endDate: { $gte: startOfDay },
                        },
                        {
                            type: HolidayTypes.FIXED,
                        },
                    ],
                }).lean()
            }

            return successResponseObject("Date check completed", {
                date: checkDate.toISOString().split("T")[0],
                isHoliday,
                holiday: holidayDetails,
            })
        } catch (error) {
            console.error("Error checking date:", error)
            return errorResponseObject("Failed to check if date is a holiday")
        }
    }
}

export default HolidayController
