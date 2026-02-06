import cron from "node-cron"
import Staff from "../models/staff.model"
import StaffContract from "../models/staff-contract.model"
import LeaveBalance from "../models/leave-balance.model"
import { AccountStatus, ContractStatus } from "../utils/types"

/**
 * CronService handles all scheduled jobs for the leave management system
 */
export class CronService {
    /**
     * Initialize all cron jobs
     */
    static init(): void {
        console.log("Initializing cron jobs...")
        this.scheduleLeaveAccumulation()
        this.scheduleContractAnniversaryCheck()
    }

    /**
     * Schedule the job to accumulate annual leave for active users
     * This runs on the first day of each month and adds 2.5 days to each active user's annual leave balance
     */
    private static scheduleLeaveAccumulation(): void {
        // Schedule job to run on the first day of each month
        cron.schedule("0 0 1 * *", async () => {
            try {
                // Find all active staff with active contracts
                const activeStaff = await Staff.find({
                    status: AccountStatus.ACTIVE,
                })

                let updatedCount = 0
                let errorCount = 0
                let skippedCount = 0

                // Process each staff member
                for (const staff of activeStaff) {
                    try {
                        // Check if staff has an active contract
                        const activeContract = await StaffContract.findOne({
                            staff: staff._id,
                            status: ContractStatus.ACTIVE
                        })

                        if (!activeContract) {
                            console.log(
                                `[Cron] Skipping staff ${staff._id} (${staff.name}) - no active contract`
                            )
                            skippedCount++
                            continue
                        }

                        // Find the staff's annual leave balance for current period
                        const now = new Date()
                        const leaveBalance = await LeaveBalance.findOne({
                            staff: staff._id,
                            leaveType: "annual",
                            periodStart: { $lte: now },
                            periodEnd: { $gte: now },
                        })

                        if (!leaveBalance) {
                            console.error(
                                `[Cron] No annual leave balance found for staff: ${staff._id} (${staff.name}) in current period`
                            )
                            errorCount++
                            continue
                        }

                        // Update annual leave accrual (period-based)
                        await leaveBalance.updateAccrual()
                        updatedCount++
                    } catch (error) {
                        console.error(
                            `[Cron] Error updating leave balance for staff ${staff._id}:`,
                            error
                        )
                        errorCount++
                    }
                }

                console.log(
                    `[Cron] Leave accumulation complete. Updated: ${updatedCount}, Skipped (no contract): ${skippedCount}, Errors: ${errorCount}`
                );
            } catch (error) {
                console.error("[Cron] Error in leave accumulation job:", error)
            }
        })

        console.log(
            "Annual leave accumulation job scheduled to run on the first day of each month"
        )
    }

    /**
     * Schedule the daily job to check for contract anniversaries
     * Replaces the Jan 1st year-end reset with a daily check that creates
     * new period balances when a staff member's contract anniversary arrives
     */
    private static scheduleContractAnniversaryCheck(): void {
        // Schedule job to run daily at midnight
        cron.schedule("0 0 * * *", async () => {
            try {
                // Use the model's createNewPeriodBalances which:
                // 1. Gets all active contracts
                // 2. Computes current period for each
                // 3. Creates balances if they don't exist for the new period
                const newPeriodCount = await LeaveBalance.createNewPeriodBalances()

                if (newPeriodCount > 0) {
                    console.log(
                        `[Cron] Contract anniversary check complete. New period balances created for ${newPeriodCount} staff`
                    )
                }
            } catch (error) {
                console.error(
                    "[Cron] Error in contract anniversary check job:",
                    error
                )
            }
        })

        console.log(
            "Contract anniversary check job scheduled to run daily at midnight"
        )
    }
}
