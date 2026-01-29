import mongoose from "mongoose"

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
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/corporate-leave"

let isConnected = false

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
        console.log("MongoDB connected successfully")

        return Promise.resolve()
    } catch (error) {
        console.error("MongoDB connection error:", error)
        return Promise.reject(error)
    }
}

export default connectDB
