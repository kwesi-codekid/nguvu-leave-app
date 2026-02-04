import mongoose, { Schema, Document, Model } from "mongoose"
import { HolidayInterface, HolidayTypes } from "../utils/types"

// Extend the interface for Mongoose document
export interface IHoliday extends HolidayInterface, Document {
    _id: string
    getDatesForYear(year: number): { start: Date; end: Date } | null
}

// Interface for static methods
interface IHolidayModel extends Model<IHoliday> {
    getHolidaysForYear(year: number): Promise<IHoliday[]>
    getHolidaysInRange(startDate: Date, endDate: Date): Promise<IHoliday[]>
    isHoliday(date: Date): Promise<boolean>
    getUpcomingHolidays(limit?: number): Promise<IHoliday[]>
}

// Define the Holiday schema
const HolidaySchema = new Schema<IHoliday>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: Object.values(HolidayTypes),
            required: true,
            index: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        description: {
            type: String,
            trim: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            index: true,
        },
    },
    {
        timestamps: true,
        collection: "holidays",
    }
)

// Create indexes
HolidaySchema.index({ startDate: 1 })
HolidaySchema.index({ endDate: 1 })
HolidaySchema.index({ name: 1 })

// Pre-save to ensure endDate >= startDate
HolidaySchema.pre("save", function () {
    if (!this.endDate) {
        this.endDate = this.startDate
    }

    if (this.endDate < this.startDate) {
        throw new Error("End date cannot be before start date")
    }
})

// Instance method to get dates for a specific year (for fixed holidays)
HolidaySchema.methods.getDatesForYear = function (year: number): { start: Date; end: Date } | null {
    if (this.type === HolidayTypes.FIXED) {
        // For fixed holidays, use the month/day from stored dates but apply to requested year
        const startMonth = this.startDate.getMonth()
        const startDay = this.startDate.getDate()
        const endMonth = this.endDate.getMonth()
        const endDay = this.endDate.getDate()

        let startYear = year
        let endYear = year

        // Handle year boundary (e.g., Dec 31 - Jan 2)
        if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) {
            endYear = year + 1
        }

        return {
            start: new Date(startYear, startMonth, startDay),
            end: new Date(endYear, endMonth, endDay),
        }
    } else if (this.type === HolidayTypes.VARYING) {
        // For varying holidays, return the stored dates if they're in the specified year
        if (this.startDate.getFullYear() === year) {
            return {
                start: this.startDate,
                end: this.endDate,
            }
        }
    }
    return null
}

// Static method to get all holidays for a specific year
HolidaySchema.statics.getHolidaysForYear = async function (year: number): Promise<IHoliday[]> {
    const holidays: IHoliday[] = []

    // Get all fixed holidays (they apply to every year)
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED }).lean()
    holidays.push(...fixedHolidays)

    // Get varying holidays for the specific year (use UTC boundaries)
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))

    const varyingHolidays = await this.find({
        type: HolidayTypes.VARYING,
        $or: [
            { startDate: { $gte: yearStart, $lte: yearEnd } },
            { endDate: { $gte: yearStart, $lte: yearEnd } },
            { startDate: { $lte: yearStart }, endDate: { $gte: yearEnd } },
        ],
    }).lean()

    holidays.push(...varyingHolidays)

    return holidays
}

// Static method to get holidays within a date range
HolidaySchema.statics.getHolidaysInRange = async function (
    rangeStart: Date,
    rangeEnd: Date
): Promise<IHoliday[]> {
    const holidays: IHoliday[] = []

    // Normalize range to UTC day boundaries
    const rangeStartUTC = new Date(Date.UTC(
        rangeStart.getFullYear(),
        rangeStart.getMonth(),
        rangeStart.getDate(),
        0, 0, 0, 0
    ))
    const rangeEndUTC = new Date(Date.UTC(
        rangeEnd.getFullYear(),
        rangeEnd.getMonth(),
        rangeEnd.getDate(),
        23, 59, 59, 999
    ))

    // Get varying holidays that overlap with the range
    const varyingHolidays = await this.find({
        type: HolidayTypes.VARYING,
        $or: [
            { startDate: { $gte: rangeStartUTC, $lte: rangeEndUTC } },
            { endDate: { $gte: rangeStartUTC, $lte: rangeEndUTC } },
            { startDate: { $lte: rangeStartUTC }, endDate: { $gte: rangeEndUTC } },
        ],
    }).lean()

    holidays.push(...varyingHolidays)

    // Get all fixed holidays and check if they fall in the range
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED }).lean()

    // Check each year in the range
    const startYear = rangeStart.getFullYear()
    const endYear = rangeEnd.getFullYear()

    for (let year = startYear; year <= endYear; year++) {
        for (const holiday of fixedHolidays) {
            // Use UTC methods for consistent date extraction
            const holidayStartDate = new Date(holiday.startDate)
            const startMonth = holidayStartDate.getUTCMonth()
            const startDay = holidayStartDate.getUTCDate()
            const holidayStart = new Date(Date.UTC(year, startMonth, startDay))

            if (holidayStart >= rangeStartUTC && holidayStart <= rangeEndUTC) {
                holidays.push(holiday)
            }
        }
    }

    return holidays
}

// Static method to check if a specific date is a holiday
HolidaySchema.statics.isHoliday = async function (date: Date): Promise<boolean> {
    // Extract date components in local time
    const checkYear = date.getFullYear()
    const checkMonth = date.getMonth()
    const checkDay = date.getDate()

    // Create start and end of day in UTC for database comparison
    const dayStart = new Date(Date.UTC(checkYear, checkMonth, checkDay, 0, 0, 0, 0))
    const dayEnd = new Date(Date.UTC(checkYear, checkMonth, checkDay, 23, 59, 59, 999))

    // Check varying holidays - use date range overlap
    const varyingHoliday = await this.findOne({
        type: HolidayTypes.VARYING,
        startDate: { $lte: dayEnd },
        endDate: { $gte: dayStart },
    })

    if (varyingHoliday) {
        return true
    }

    // Check fixed holidays (compare month and day only)
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED })

    for (const holiday of fixedHolidays) {
        // Use UTC methods to get consistent date parts regardless of timezone
        const holidayStartDate = new Date(holiday.startDate)
        const holidayEndDate = new Date(holiday.endDate)

        const startMonth = holidayStartDate.getUTCMonth()
        const startDay = holidayStartDate.getUTCDate()
        const endMonth = holidayEndDate.getUTCMonth()
        const endDay = holidayEndDate.getUTCDate()

        // Simple check for single day or same month range
        if (startMonth === endMonth) {
            if (checkMonth === startMonth && checkDay >= startDay && checkDay <= endDay) {
                return true
            }
        } else {
            // Multi-month range (e.g., Dec 31 - Jan 2)
            if (
                (checkMonth === startMonth && checkDay >= startDay) ||
                (checkMonth === endMonth && checkDay <= endDay) ||
                (checkMonth > startMonth && checkMonth < endMonth)
            ) {
                return true
            }
        }
    }

    return false
}

// Static method to get upcoming holidays
HolidaySchema.statics.getUpcomingHolidays = async function (limit: number = 10): Promise<IHoliday[]> {
    const today = new Date()
    const holidays: Array<{ holiday: IHoliday; date: Date }> = []

    // Get varying holidays from today onwards
    const varyingHolidays = await this.find({
        type: HolidayTypes.VARYING,
        endDate: { $gte: today },
    })
        .sort({ startDate: 1 })
        .limit(limit)
        .lean()

    for (const holiday of varyingHolidays) {
        holidays.push({ holiday, date: holiday.startDate })
    }

    // Get fixed holidays and calculate their next occurrence
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED }).lean()
    const currentYear = today.getFullYear()

    for (const holiday of fixedHolidays) {
        const startMonth = new Date(holiday.startDate).getMonth()
        const startDay = new Date(holiday.startDate).getDate()

        // Check this year
        let holidayDate = new Date(currentYear, startMonth, startDay)

        // If already passed this year, check next year
        if (holidayDate < today) {
            holidayDate = new Date(currentYear + 1, startMonth, startDay)
        }

        holidays.push({ holiday, date: holidayDate })
    }

    // Sort all holidays by date and return the requested limit
    holidays.sort((a, b) => a.date.getTime() - b.date.getTime())

    return holidays.slice(0, limit).map((item) => item.holiday)
}

// Ensure virtual fields are included in JSON output
HolidaySchema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.__v
        return ret
    },
})

// Create and export the model
const Holiday = (mongoose.models.Holiday as mongoose.Model<IHoliday, IHolidayModel>) || mongoose.model<IHoliday, IHolidayModel>("Holiday", HolidaySchema)

export default Holiday
