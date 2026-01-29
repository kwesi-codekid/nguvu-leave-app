import cron from "node-cron"
import Staff from "../models/staff.model"
import StaffContract from "../models/staff-contract.model"
import LeaveBalance from "../models/leave-balance.model"
import { AccountStatus, ContractStatus } from "../utils/types"
// import { EmailQueueService } from "./email-queue.service"

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
        this.scheduleYearEndReset()
        // this.scheduleEmailQueueProcessing()
    }

    /**
     * Schedule the job to accumulate annual leave for active users
     * This runs on the first day of each month and adds 2.5 days to each active user's annual leave balance
     */
    private static scheduleLeaveAccumulation(): void {
        // Schedule job to run on the first day of each month
        // Cron format: minute hour day month day-of-week
        // '0 0 1 * *' means run at midnight on the first day of each month
        cron.schedule("0 0 1 * *", async () => {
            try {
                // console.log(
                //   "[Cron]] Running leave accumulation job on first day of month:",
                //   new Date().toISOString()
                // );

                // Find all active staff with active contracts
                const activeStaff = await Staff.find({
                    status: AccountStatus.ACTIVE,
                })

                // console.log(
                //   `[Cron]] Processing leave accumulation for ${activeStaff.length} active staff`
                // );

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

                        // Find the staff's annual leave balance for current year
                        const currentYear = new Date().getFullYear()
                        const leaveBalance = await LeaveBalance.findOne({
                            staff: staff._id,
                            year: currentYear,
                            leaveType: "annual",
                        })

                        if (!leaveBalance) {
                            console.error(
                                `[Cron]] No annual leave balance found for staff: ${staff._id} (${staff.name})`
                            )
                            errorCount++
                            continue
                        }

                        // Update annual leave accrual (will now consider contract start date)
                        await leaveBalance.updateAccrual()
                        updatedCount++
                    } catch (error) {
                        console.error(
                            `[Cron]] Error updating leave balance for staff ${staff._id}:`,
                            error
                        )
                        errorCount++
                    }
                }

                console.log(
                    `[Cron] Leave accumulation complete. Updated: ${updatedCount}, Skipped (no contract): ${skippedCount}, Errors: ${errorCount}`
                );
            } catch (error) {
                console.error("[Cron]] Error in leave accumulation job:", error)
            }
        })

        console.log(
            "Annual leave accumulation job scheduled to run on the first day of each month"
        )
    }

    /**
     * Schedule the job to reset yearly leave balances
     * This runs on January 1st of each year to reset leave balances and handle accrual
     */
    private static scheduleYearEndReset(): void {
        // Schedule job to run at midnight on January 1st
        // Cron format: minute hour day month day-of-week
        cron.schedule("0 0 1 1 *", async () => {
            try {
                // console.log(
                //   "[Cron]] Running year-end leave balance reset:",
                //   new Date().toISOString()
                // );

                // Reset all leave balances for the new year
                const nextYear = new Date().getFullYear()
                const resetCount = await LeaveBalance.resetAllForNewYear(
                    nextYear
                )

                console.log(
                    `[Cron]] Year-end leave balance reset complete. Reset count: ${resetCount}`
                )
            } catch (error) {
                console.error(
                    "[Cron]] Error in year-end leave reset job:",
                    error
                )
            }
        })

        console.log(
            "Year-end leave balance reset job scheduled to run on January 1st"
        )
    }

    /**
     * Schedule the job to process the email queue
     * This runs every 2 minutes to send pending emails
     */
    // private static scheduleEmailQueueProcessing(): void {
    //     // Schedule job to run every 2 minutes
    //     // Cron format: minute hour day month day-of-week
    //     cron.schedule("*/2 * * * *", async () => {
    //         try {
    //             const timestamp = new Date().toISOString()
    //             // console.log(
    //             //   `[Cron]] [${timestamp}] Starting email queue processing job`
    //             // );

    //             // Check for pending emails before processing
    //             const pendingCount =
    //                 await EmailQueueService.getPendingEmailCount()
    //             // console.log(
    //             //   `[Cron]] Found ${pendingCount} pending emails in queue before processing`
    //             // );

    //             if (pendingCount === 0) {
    //                 console.log(
    //                     "[Cron]] No pending emails to process, skipping processing"
    //                 )
    //                 return
    //             }

    //             // Call the email queue service to process pending emails
    //             // console.log("[Cron]] Calling EmailQueueService.processEmailQueue()...");
    //             const result = await EmailQueueService.processEmailQueue()

    //             // console.log(
    //             //   `[Cron]] Email queue processing complete. Sent: ${result.sent}, Failed: ${result.failed}, Pending: ${result.pending}`
    //             // );
    //         } catch (error) {
    //             console.error("[Cron]] Error processing email queue:", error)
    //         }
    //     })

    //     console.log(
    //         "Email queue processing job scheduled to run every 2 minutes"
    //     )
    // }
}
