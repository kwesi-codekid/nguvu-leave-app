import mongoose, { Schema, Document, Model } from "mongoose"
import { HolidayInterface, HolidayTypes } from "../utils/types"

// Extend the interface for Mongoose document
export interface IHoliday extends HolidayInterface, Document {
    _id: string
    getDateForYear(year: number): Date | null
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
        // For varying holidays - specific date
        date: {
            type: Date,
            required: function () {
                return this.type === HolidayTypes.VARYING
            },
            validate: {
                validator: function (value: Date) {
                    // Only validate if type is VARYING
                    if (this.type === HolidayTypes.VARYING) {
                        return value instanceof Date && !isNaN(value.getTime())
                    }
                    return true
                },
                message: "Valid date is required for varying holidays",
            },
        },
        // For fixed holidays - month
        fixedMonth: {
            type: Number,
            min: 1,
            max: 12,
            required: function () {
                return this.type === HolidayTypes.FIXED
            },
            validate: {
                validator: function (value: number) {
                    // Only validate if type is FIXED
                    if (this.type === HolidayTypes.FIXED) {
                        return value >= 1 && value <= 12
                    }
                    return true
                },
                message: "Month must be between 1 and 12",
            },
        },
        // For fixed holidays - day
        fixedDay: {
            type: Number,
            min: 1,
            max: 31,
            required: function () {
                return this.type === HolidayTypes.FIXED
            },
            validate: {
                validator: function (value: number) {
                    // Only validate if type is FIXED
                    if (this.type === HolidayTypes.FIXED) {
                        return value >= 1 && value <= 31
                    }
                    return true
                },
                message: "Day must be between 1 and 31",
            },
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
HolidaySchema.index({ date: 1 })
HolidaySchema.index({ fixedMonth: 1, fixedDay: 1 })
HolidaySchema.index({ name: 1 })

// Pre-save validation to ensure correct fields based on type
HolidaySchema.pre("save", function (next) {
    if (this.type === HolidayTypes.VARYING) {
        // Clear fixed holiday fields
        this.fixedMonth = undefined
        this.fixedDay = undefined

        // Ensure date is provided
        if (!this.date) {
            return next(new Error("Date is required for varying holidays"))
        }
    } else if (this.type === HolidayTypes.FIXED) {
        // Clear varying holiday fields
        this.date = undefined

        // Ensure fixed fields are provided
        if (!this.fixedMonth || !this.fixedDay) {
            return next(new Error("Fixed month and day are required for fixed holidays"))
        }
    }

    next()
})

// Instance method to get the date for a specific year
HolidaySchema.methods.getDateForYear = function (year: number): Date | null {
    if (this.type === HolidayTypes.FIXED) {
        // Create date for the specified year
        try {
            return new Date(year, this.fixedMonth - 1, this.fixedDay)
        } catch (error) {
            return null
        }
    } else if (this.type === HolidayTypes.VARYING) {
        // For varying holidays, return the date if it's in the specified year
        if (this.date && this.date.getFullYear() === year) {
            return this.date
        }
    }
    return null
}

// Static method to get all holidays for a specific year
HolidaySchema.statics.getHolidaysForYear = async function (year: number): Promise<IHoliday[]> {
    const holidays: IHoliday[] = []

    // Get all fixed holidays
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED }).lean()
    holidays.push(...fixedHolidays)

    // Get varying holidays for the specific year
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    const varyingHolidays = await this.find({
        type: HolidayTypes.VARYING,
        date: {
            $gte: yearStart,
            $lte: yearEnd,
        },
    }).lean()

    holidays.push(...varyingHolidays)

    return holidays
}

// Static method to get holidays within a date range
HolidaySchema.statics.getHolidaysInRange = async function (
    startDate: Date,
    endDate: Date
): Promise<IHoliday[]> {
    const holidays: IHoliday[] = []

    // Get varying holidays in the range
    const varyingHolidays = await this.find({
        type: HolidayTypes.VARYING,
        date: {
            $gte: startDate,
            $lte: endDate,
        },
    }).lean()

    holidays.push(...varyingHolidays)

    // Get all fixed holidays and check if they fall in the range
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED }).lean()

    // Check each year in the range
    const startYear = startDate.getFullYear()
    const endYear = endDate.getFullYear()

    for (let year = startYear; year <= endYear; year++) {
        for (const holiday of fixedHolidays) {
            const holidayDate = new Date(year, holiday.fixedMonth - 1, holiday.fixedDay)

            if (holidayDate >= startDate && holidayDate <= endDate) {
                holidays.push(holiday)
            }
        }
    }

    return holidays
}

// Static method to check if a specific date is a holiday
HolidaySchema.statics.isHoliday = async function (date: Date): Promise<boolean> {
    // Normalize the date to remove time component
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    // Check varying holidays
    const startOfDay = new Date(checkDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(checkDate)
    endOfDay.setHours(23, 59, 59, 999)

    const varyingHoliday = await this.findOne({
        type: HolidayTypes.VARYING,
        date: {
            $gte: startOfDay,
            $lte: endOfDay,
        },
    })

    if (varyingHoliday) {
        return true
    }

    // Check fixed holidays
    const fixedHoliday = await this.findOne({
        type: HolidayTypes.FIXED,
        fixedMonth: checkDate.getMonth() + 1,
        fixedDay: checkDate.getDate(),
    })

    return !!fixedHoliday
}

// Static method to get upcoming holidays
HolidaySchema.statics.getUpcomingHolidays = async function (limit: number = 10): Promise<IHoliday[]> {
    const today = new Date()
    const holidays: Array<{ holiday: IHoliday; date: Date }> = []

    // Get varying holidays from today onwards
    const varyingHolidays = await this.find({
        type: HolidayTypes.VARYING,
        date: { $gte: today },
    })
        .sort({ date: 1 })
        .limit(limit)
        .lean()

    for (const holiday of varyingHolidays) {
        holidays.push({ holiday, date: holiday.date })
    }

    // Get fixed holidays and calculate their next occurrence
    const fixedHolidays = await this.find({ type: HolidayTypes.FIXED }).lean()
    const currentYear = today.getFullYear()

    for (const holiday of fixedHolidays) {
        // Check this year
        let holidayDate = new Date(currentYear, holiday.fixedMonth - 1, holiday.fixedDay)

        // If already passed this year, check next year
        if (holidayDate < today) {
            holidayDate = new Date(currentYear + 1, holiday.fixedMonth - 1, holiday.fixedDay)
        }

        holidays.push({ holiday, date: holidayDate })
    }

    // Sort all holidays by date and return the requested limit
    holidays.sort((a, b) => a.date.getTime() - b.date.getTime())

    return holidays.slice(0, limit).map((item) => item.holiday)
}

// Virtual for next occurrence
HolidaySchema.virtual("nextOccurrence").get(function () {
    const today = new Date()

    if (this.type === HolidayTypes.VARYING) {
        return this.date >= today ? this.date : null
    } else if (this.type === HolidayTypes.FIXED) {
        const currentYear = today.getFullYear()
        let nextDate = new Date(currentYear, this.fixedMonth - 1, this.fixedDay)

        if (nextDate < today) {
            nextDate = new Date(currentYear + 1, this.fixedMonth - 1, this.fixedDay)
        }

        return nextDate
    }

    return null
})

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
