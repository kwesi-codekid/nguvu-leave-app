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
            const { name, type, date, fixedMonth, fixedDay, description } =
                req.body
            const user = (req as any).user // Assuming auth middleware adds user

            // Check if user has HR permission
            if (!user?.permissions?.includes("HR")) {
                return errorResponseObject(
                    "Unauthorized. Only HR can create holidays"
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
                    message:
                        "Valid holiday type is required (fixed or varying)",
                })
            }

            if (type === HolidayTypes.VARYING) {
                if (!date) {
                    errors.push({
                        field: "date",
                        message: "Date is required for varying holidays",
                    })
                } else {
                    const parsedDate = new Date(date)
                    if (isNaN(parsedDate.getTime())) {
                        errors.push({
                            field: "date",
                            message: "Invalid date format",
                        })
                    }
                }
            } else if (type === HolidayTypes.FIXED) {
                if (!fixedMonth || fixedMonth < 1 || fixedMonth > 12) {
                    errors.push({
                        field: "fixedMonth",
                        message:
                            "Valid month (1-12) is required for fixed holidays",
                    })
                }
                if (!fixedDay || fixedDay < 1 || fixedDay > 31) {
                    errors.push({
                        field: "fixedDay",
                        message:
                            "Valid day (1-31) is required for fixed holidays",
                    })
                }

                // Validate day is valid for the month
                if (fixedMonth && fixedDay) {
                    const testDate = new Date(2024, fixedMonth - 1, fixedDay)
                    if (testDate.getMonth() !== fixedMonth - 1) {
                        errors.push({
                            field: "fixedDay",
                            message: `Day ${fixedDay} is not valid for month ${fixedMonth}`,
                        })
                    }
                }
            }

            if (errors.length > 0) {
                return validationErrorResponseObject(
                    "Validation failed",
                    errors
                )
            }

            // Check for duplicate holidays
            const existingQuery: any = {
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
            }
            if (type === HolidayTypes.FIXED) {
                existingQuery.type = HolidayTypes.FIXED
                existingQuery.fixedMonth = fixedMonth
                existingQuery.fixedDay = fixedDay
            } else if (type === HolidayTypes.VARYING) {
                // For varying holidays, check if same name exists for the same year
                const holidayDate = new Date(date)
                const yearStart = new Date(holidayDate.getFullYear(), 0, 1)
                const yearEnd = new Date(
                    holidayDate.getFullYear(),
                    11,
                    31,
                    23,
                    59,
                    59
                )
                existingQuery.type = HolidayTypes.VARYING
                existingQuery.date = { $gte: yearStart, $lte: yearEnd }
            }

            const existing = await Holiday.findOne(existingQuery)
            if (existing) {
                return errorResponseObject(
                    "A holiday with similar details already exists"
                )
            }

            // Create holiday
            const holidayData: any = {
                name: name.trim(),
                type,
                description: description?.trim(),
                createdBy: user._id,
            }

            if (type === HolidayTypes.VARYING) {
                holidayData.date = new Date(date)
            } else {
                holidayData.fixedMonth = fixedMonth
                holidayData.fixedDay = fixedDay
            }

            const holiday = await Holiday.create(holidayData)

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
                    ...(type === HolidayTypes.VARYING
                        ? { date }
                        : { fixedMonth, fixedDay }),
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            })

            return successResponseObject(
                "Holiday created successfully",
                holiday
            )
        } catch (error) {
            console.error("Error creating holiday:", error)
            return errorResponseObject("Failed to create holiday")
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
                month,
                sortBy = "name",
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
            if (
                type &&
                Object.values(HolidayTypes).includes(type as HolidayTypes)
            ) {
                query.type = type
            }

            // Filter by year
            if (year) {
                const yearNum = Number(year)
                if (!isNaN(yearNum)) {
                    const yearStart = new Date(yearNum, 0, 1)
                    const yearEnd = new Date(yearNum, 11, 31, 23, 59, 59)

                    if (query.type === HolidayTypes.VARYING) {
                        // For varying holidays, filter by date
                        query.date = { $gte: yearStart, $lte: yearEnd }
                    } else if (!query.type) {
                        // If no type specified, get both fixed and varying for the year
                        const baseQuery = { ...query }
                        delete baseQuery.$or // Preserve search if exists

                        const orConditions = [
                            { ...baseQuery, type: HolidayTypes.FIXED },
                            {
                                ...baseQuery,
                                type: HolidayTypes.VARYING,
                                date: { $gte: yearStart, $lte: yearEnd },
                            },
                        ]

                        // Merge with existing $or if search is present
                        if (query.$or) {
                            query.$and = [
                                { $or: query.$or },
                                { $or: orConditions },
                            ]
                            delete query.$or
                        } else {
                            query.$or = orConditions
                        }
                    }
                }
            }

            // Filter by month
            if (month) {
                const monthNum = Number(month)
                if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
                    if (query.type === HolidayTypes.FIXED) {
                        query.fixedMonth = monthNum
                    } else if (query.type === HolidayTypes.VARYING) {
                        // For varying holidays, check if the date falls in this month
                        const yearNum = year
                            ? Number(year)
                            : new Date().getFullYear()
                        const monthStart = new Date(yearNum, monthNum - 1, 1)
                        const monthEnd = new Date(
                            yearNum,
                            monthNum,
                            0,
                            23,
                            59,
                            59
                        )

                        if (query.date) {
                            // Merge with year filter if exists
                            query.date.$gte = new Date(
                                Math.max(
                                    query.date.$gte?.getTime() || 0,
                                    monthStart.getTime()
                                )
                            )
                            query.date.$lte = new Date(
                                Math.min(
                                    query.date.$lte?.getTime() || Infinity,
                                    monthEnd.getTime()
                                )
                            )
                        } else {
                            query.date = { $gte: monthStart, $lte: monthEnd }
                        }
                    }
                }
            }

            // Sorting
            const sortOptions: any = {}
            const validSortFields = [
                "name",
                "type",
                "date",
                "createdAt",
                "fixedMonth",
                "fixedDay",
            ]
            const sortField = validSortFields.includes(sortBy as string)
                ? sortBy
                : "name"
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

            // Add next occurrence to each holiday
            const today = new Date()
            const holidaysWithOccurrence = holidays.map((holiday) => {
                let nextOccurrence = null

                if (holiday.type === HolidayTypes.VARYING) {
                    if (holiday.date && new Date(holiday.date) >= today) {
                        nextOccurrence = holiday.date
                    }
                } else if (holiday.type === HolidayTypes.FIXED) {
                    const currentYear = today.getFullYear()
                    let nextDate = new Date(
                        currentYear,
                        (holiday.fixedMonth || 1) - 1,
                        holiday.fixedDay
                    )

                    if (nextDate < today) {
                        nextDate = new Date(
                            currentYear + 1,
                            (holiday.fixedMonth || 1) - 1,
                            holiday.fixedDay
                        )
                    }
                    nextOccurrence = nextDate
                }

                return { ...holiday, nextOccurrence }
            })

            // Response with pagination metadata
            const response = {
                holidays: holidaysWithOccurrence,
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
                    month: month ? Number(month) : null,
                },
            }

            return successResponseObject(
                "Holidays retrieved successfully",
                response
            )
        } catch (error) {
            console.error("Error fetching holidays:", error)
            return errorResponseObject("Failed to retrieve holidays")
        }
    }

    /**
     * Get specific holiday by ID
     * GET /api/holidays/:id
     */
    static async getHolidayById(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
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

            // Add next occurrence
            const today = new Date()
            let nextOccurrence = null

            if (holiday.type === HolidayTypes.VARYING) {
                if (holiday.date && new Date(holiday.date) >= today) {
                    nextOccurrence = holiday.date
                }
            } else if (holiday.type === HolidayTypes.FIXED) {
                const currentYear = today.getFullYear()
                let nextDate = new Date(
                    currentYear,
                    (holiday.fixedMonth || 1) - 1,
                    holiday.fixedDay
                )

                if (nextDate < today) {
                    nextDate = new Date(
                        currentYear + 1,
                        (holiday.fixedMonth || 1) - 1,
                        holiday.fixedDay
                    )
                }
                nextOccurrence = nextDate
            }

            const holidayWithOccurrence = { ...holiday, nextOccurrence }

            return successResponseObject(
                "Holiday retrieved successfully",
                holidayWithOccurrence
            )
        } catch (error) {
            console.error("Error fetching holiday:", error)
            return errorResponseObject("Failed to retrieve holiday")
        }
    }

    /**
     * Update a holiday
     * PUT /api/holidays/:id
     */
    static async updateHoliday(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const { name, date, fixedMonth, fixedDay, description } = req.body
            const user = (req as any).user

            // Check HR permission
            if (!user?.permissions?.includes("HR")) {
                return errorResponseObject(
                    "Unauthorized. Only HR can update holidays"
                )
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

            // Update basic fields
            if (name && name.trim() && name.trim() !== holiday.name) {
                changes.push({
                    field: "name",
                    oldValue: holiday.name,
                    newValue: name.trim(),
                    fieldLabel: "Holiday Name",
                })
                updates.name = name.trim()
            }

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

            // Handle type-specific updates
            if (holiday.type === HolidayTypes.VARYING && date) {
                const newDate = new Date(date)
                if (!isNaN(newDate.getTime())) {
                    const oldDateStr = holiday.date?.toISOString()
                    const newDateStr = newDate.toISOString()

                    if (oldDateStr !== newDateStr) {
                        changes.push({
                            field: "date",
                            oldValue: holiday.date,
                            newValue: newDate,
                            fieldLabel: "Holiday Date",
                        })
                        updates.date = newDate
                    }
                }
            } else if (holiday.type === HolidayTypes.FIXED) {
                if (
                    fixedMonth &&
                    fixedMonth >= 1 &&
                    fixedMonth <= 12 &&
                    fixedMonth !== holiday.fixedMonth
                ) {
                    changes.push({
                        field: "fixedMonth",
                        oldValue: holiday.fixedMonth,
                        newValue: fixedMonth,
                        fieldLabel: "Month",
                    })
                    updates.fixedMonth = fixedMonth
                }

                if (
                    fixedDay &&
                    fixedDay >= 1 &&
                    fixedDay <= 31 &&
                    fixedDay !== holiday.fixedDay
                ) {
                    changes.push({
                        field: "fixedDay",
                        oldValue: holiday.fixedDay,
                        newValue: fixedDay,
                        fieldLabel: "Day",
                    })
                    updates.fixedDay = fixedDay
                }

                // Validate the new date combination if both are being updated
                const testMonth = updates.fixedMonth || holiday.fixedMonth
                const testDay = updates.fixedDay || holiday.fixedDay
                if (testMonth && testDay) {
                    const testDate = new Date(2024, testMonth - 1, testDay)
                    if (testDate.getMonth() !== testMonth - 1) {
                        return validationErrorResponseObject(
                            "Validation failed",
                            [
                                {
                                    field: "fixedDay",
                                    message: `Day ${testDay} is not valid for month ${testMonth}`,
                                },
                            ]
                        )
                    }
                }
            }

            if (Object.keys(updates).length === 0) {
                return successResponseObject("No changes to update", holiday)
            }

            // Update holiday
            const updatedHoliday = await Holiday.findByIdAndUpdate(
                id,
                updates,
                { new: true, runValidators: true }
            ).populate("createdBy", "name email")

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

            return successResponseObject(
                "Holiday updated successfully",
                updatedHoliday
            )
        } catch (error) {
            console.error("Error updating holiday:", error)
            return errorResponseObject("Failed to update holiday")
        }
    }

    /**
     * Delete a holiday
     * DELETE /api/holidays/:id
     */
    static async deleteHoliday(
        req: Request,
        id: string
    ): Promise<ResponseObject> {
        try {
            const user = (req as any).user

            // Check HR permission
            if (!user?.permissions?.includes("HR")) {
                return errorResponseObject(
                    "Unauthorized. Only HR can delete holidays"
                )
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
                    ...(holiday.type === HolidayTypes.VARYING
                        ? { date: holiday.date }
                        : {
                              fixedMonth: holiday.fixedMonth,
                              fixedDay: holiday.fixedDay,
                          }),
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

            return successResponseObject(
                "Upcoming holidays retrieved successfully",
                populatedHolidays
            )
        } catch (error) {
            console.error("Error fetching upcoming holidays:", error)
            return errorResponseObject("Failed to retrieve upcoming holidays")
        }
    }

    /**
     * Get holidays for a specific year
     * GET /api/holidays/year/:year
     */
    static async getHolidaysForYear(
        req: Request,
        year: string
    ): Promise<ResponseObject> {
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

            // Sort holidays by date/month for better presentation
            const sortedHolidays = populatedHolidays.sort((a, b) => {
                if (
                    a.type === HolidayTypes.VARYING &&
                    b.type === HolidayTypes.VARYING
                ) {
                    return (
                        new Date(a.date as any).getTime() -
                        new Date(b.date as any).getTime()
                    )
                }
                if (
                    a.type === HolidayTypes.FIXED &&
                    b.type === HolidayTypes.FIXED
                ) {
                    if ((a.fixedMonth || 1) !== (b.fixedMonth || 1)) {
                        return (a.fixedMonth || 1) - (b.fixedMonth || 1)
                    }
                    return (a.fixedDay || 1) - (b.fixedDay || 1)
                }
                // Put fixed holidays before varying
                return a.type === HolidayTypes.FIXED ? -1 : 1
            })

            return successResponseObject(
                `Holidays for year ${yearNum} retrieved successfully`,
                {
                    year: yearNum,
                    totalHolidays: sortedHolidays.length,
                    holidays: sortedHolidays,
                }
            )
        } catch (error) {
            console.error("Error fetching holidays for year:", error)
            return errorResponseObject(
                "Failed to retrieve holidays for the specified year"
            )
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

                // Check varying holidays
                holidayDetails = await Holiday.findOne({
                    $or: [
                        {
                            type: HolidayTypes.VARYING,
                            date: { $gte: startOfDay, $lte: endOfDay },
                        },
                        {
                            type: HolidayTypes.FIXED,
                            fixedMonth: checkDate.getMonth() + 1,
                            fixedDay: checkDate.getDate(),
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
