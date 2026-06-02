import mongoose from "mongoose"
import { CronService } from "../services/cron.service"
import { logger } from "../utils/logger"

// Import all models to ensure they're registered
import "../models/staff.model"
import "../models/department.model"
import "../models/job-position.model"
import "../models/staff-contract.model"
import "../models/leave-balance.model"
import "../models/leave-request.model"
import "../models/holiday.model"
import "../models/call-in.model"
import "../models/audit-log.model"

// Create a simple, reliable MongoDB connection function
const MONGODB_URI = process.env.MONGODB_URI as string
// "mongodb://root:wxWQOv0j8a35ufoAHKwEbI5er9C6ejCdnblRV7IVU8aFRqenK6SL0tdF5qEiE1EC@206.189.29.230:3311/nguvu-leave?directConnection=true&authSource=admin";

let isConnected = false
let cronStarted = false

export const connectDB = async () => {
    // If already connected, return
    if (isConnected) {
        return Promise.resolve()
    }

    try {
        const options = {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            connectTimeoutMS: 10000,
        }

        await mongoose.connect(MONGODB_URI, options)

        isConnected = true

        // Start scheduled jobs once, after the first successful DB connection.
        // The server is a long-lived process (react-router-serve), so node-cron
        // schedules persist for the lifetime of the process.
        if (!cronStarted) {
            cronStarted = true
            CronService.init()
        }

        return Promise.resolve()
    } catch (error) {
        logger.error("MongoDB connection error:", error)
        return Promise.reject(error)
    }
}

export default connectDB
