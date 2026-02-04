import mongoose from "mongoose";
import { LeaveTypes } from "../app/utils/types";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/corporate-leave";

async function seedLeaveBalances() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error("Database connection not established");
        }

        // Get all active staff
        const staffCollection = db.collection("staff");
        const staff = await staffCollection.find({ status: "active" }).toArray();

        if (staff.length === 0) {
            console.log("No active staff found");
            await mongoose.disconnect();
            return;
        }

        console.log(`Found ${staff.length} active staff members`);

        // Get current year
        const currentYear = new Date().getFullYear();

        // Check if leave balances collection exists
        const leaveBalancesCollection = db.collection("leavebalances");

        for (const staffMember of staff) {
            console.log(`Processing staff: ${staffMember.name} (${staffMember.staffId})`);

            // Check if balances already exist for this staff member for current year
            const existingBalances = await leaveBalancesCollection.find({
                staff: staffMember._id,
                year: currentYear
            }).toArray();

            if (existingBalances.length > 0) {
                console.log(`  - Balances already exist for ${currentYear}, skipping`);
                continue;
            }

            // Create leave balances for each type
            const balances = [];

            // Annual Leave - 21 days allocated, prorated based on hire date
            const hireDate = new Date(staffMember.createdAt);
            const monthsWorked = Math.max(0, 12 - (12 - (new Date().getMonth() - hireDate.getMonth() + 12) % 12));
            const accruedAnnual = Math.round((21 / 12) * monthsWorked);
            
            balances.push({
                staff: staffMember._id,
                year: currentYear,
                leaveType: LeaveTypes.ANNUAL,
                allocated: 21,
                accrued: accruedAnnual,
                used: 0,
                adjustments: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                __v: 0
            });

            // Sick Leave - 10 days
            balances.push({
                staff: staffMember._id,
                year: currentYear,
                leaveType: LeaveTypes.SICK,
                allocated: 10,
                used: 0,
                adjustments: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                __v: 0
            });

            // Maternity Leave - only for female staff
            if (staffMember.gender === "female") {
                balances.push({
                    staff: staffMember._id,
                    year: currentYear,
                    leaveType: LeaveTypes.MATERNITY,
                    allocated: 90, // 3 months in days
                    used: 0,
                    adjustments: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    __v: 0
                });
            }

            // Paternity Leave - only for male staff
            if (staffMember.gender === "male") {
                balances.push({
                    staff: staffMember._id,
                    year: currentYear,
                    leaveType: LeaveTypes.PATERNITY,
                    allocated: 7, // 1 week
                    used: 0,
                    adjustments: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    __v: 0
                });
            }

            // Bereavement Leave - 5 days for all staff
            balances.push({
                staff: staffMember._id,
                year: currentYear,
                leaveType: LeaveTypes.BEREAVEMENT,
                allocated: 5,
                used: 0,
                adjustments: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                __v: 0
            });

            // Insert balances
            if (balances.length > 0) {
                const result = await leaveBalancesCollection.insertMany(balances);
                console.log(`  - Created ${result.insertedCount} leave balance records`);
            }
        }

        console.log("Leave balances seeded successfully!");
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

seedLeaveBalances();
