/**
 * Migration Script: Calendar Year → Contract Anniversary Periods
 *
 * Migrates existing leave balances from calendar year-based periods
 * to contract anniversary-based periods.
 *
 * For each existing balance:
 * 1. Look up the staff's active (or most recent) contract
 * 2. Compute the contract period that contains the balance's year
 * 3. Set periodStart/periodEnd on the balance
 *
 * Run: npx tsx scripts/migrate-to-anniversary-periods.ts
 */

import mongoose from "mongoose"
import { ContractStatus, LeaveTypes, LEAVE_CAPS } from "../app/utils/types"
import {
    getContractPeriod,
    getTotalMonthsInPeriod,
} from "../app/utils/contract-period"

const MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://localhost:27017/corporate-leave"

interface MigrationStats {
    total: number
    migrated: number
    skippedAlreadyMigrated: number
    skippedNoContract: number
    errors: number
}

async function migrate() {
    const stats: MigrationStats = {
        total: 0,
        migrated: 0,
        skippedAlreadyMigrated: 0,
        skippedNoContract: 0,
        errors: 0,
    }

    try {
        await mongoose.connect(MONGODB_URI)
        console.log("Connected to MongoDB")

        const db = mongoose.connection.db
        if (!db) {
            throw new Error("Database connection not established")
        }

        const balancesCollection = db.collection("leavebalances")
        const contractsCollection = db.collection("staff_contracts")
        const staffCollection = db.collection("staff")

        // Get all leave balances
        const balances = await balancesCollection.find({}).toArray()
        stats.total = balances.length
        console.log(`Found ${balances.length} leave balance records to process`)

        // Build a cache of staff contracts (grouped by staff ID)
        const allContracts = await contractsCollection
            .find({})
            .sort({ startDate: -1 })
            .toArray()

        const contractsByStaff = new Map<string, any[]>()
        for (const contract of allContracts) {
            const staffId = contract.staff.toString()
            if (!contractsByStaff.has(staffId)) {
                contractsByStaff.set(staffId, [])
            }
            contractsByStaff.get(staffId)!.push(contract)
        }

        console.log(
            `Loaded contracts for ${contractsByStaff.size} staff members`
        )

        // Process each balance
        const bulkOps: any[] = []

        for (const balance of balances) {
            try {
                // Skip if already migrated (has periodStart)
                if (balance.periodStart) {
                    stats.skippedAlreadyMigrated++
                    continue
                }

                const staffId = balance.staff.toString()
                const balanceYear = balance.year

                // Find the best contract for this staff member
                const contracts = contractsByStaff.get(staffId) || []
                const contract = findBestContract(contracts, balanceYear)

                if (!contract) {
                    console.warn(
                        `  WARNING: No contract found for staff ${staffId}, year ${balanceYear}. Using calendar year fallback.`
                    )
                    stats.skippedNoContract++

                    // Fallback: use calendar year boundaries
                    const periodStart = new Date(balanceYear, 0, 1)
                    periodStart.setHours(0, 0, 0, 0)
                    const periodEnd = new Date(balanceYear, 11, 31)
                    periodEnd.setHours(23, 59, 59, 999)

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: balance._id },
                            update: {
                                $set: {
                                    periodStart,
                                    periodEnd,
                                    updatedAt: new Date(),
                                },
                            },
                        },
                    })
                    stats.migrated++
                    continue
                }

                // Compute the contract period for the balance's year
                // Use mid-year of the balance year as the reference date
                const referenceDate = new Date(balanceYear, 6, 1) // July 1 of balance year
                const period = getContractPeriod(
                    {
                        startDate: contract.startDate,
                        endDate: contract.endDate || null,
                    },
                    referenceDate
                )

                if (!period) {
                    // Reference date is outside contract bounds
                    // Try January 1 of the balance year instead
                    const altReference = new Date(balanceYear, 0, 15)
                    const altPeriod = getContractPeriod(
                        {
                            startDate: contract.startDate,
                            endDate: contract.endDate || null,
                        },
                        altReference
                    )

                    if (!altPeriod) {
                        console.warn(
                            `  WARNING: Could not compute period for staff ${staffId}, year ${balanceYear}, contract ${contract._id}. Using calendar year fallback.`
                        )

                        const periodStart = new Date(balanceYear, 0, 1)
                        periodStart.setHours(0, 0, 0, 0)
                        const periodEnd = new Date(balanceYear, 11, 31)
                        periodEnd.setHours(23, 59, 59, 999)

                        bulkOps.push({
                            updateOne: {
                                filter: { _id: balance._id },
                                update: {
                                    $set: {
                                        periodStart,
                                        periodEnd,
                                        updatedAt: new Date(),
                                    },
                                },
                            },
                        })
                        stats.migrated++
                        continue
                    }

                    // Use the alt period
                    const totalMonths = getTotalMonthsInPeriod(
                        altPeriod.periodStart,
                        altPeriod.periodEnd
                    )
                    const proRateFactor = totalMonths / 12
                    const allocated = Math.round(
                        (LEAVE_CAPS[balance.leaveType as LeaveTypes] || 0) *
                            proRateFactor
                    )

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: balance._id },
                            update: {
                                $set: {
                                    periodStart: altPeriod.periodStart,
                                    periodEnd: altPeriod.periodEnd,
                                    allocated:
                                        balance.leaveType === LeaveTypes.ANNUAL
                                            ? balance.allocated
                                            : allocated,
                                    updatedAt: new Date(),
                                },
                            },
                        },
                    })
                    stats.migrated++
                    continue
                }

                // Compute pro-rated allocation for the period
                const totalMonths = getTotalMonthsInPeriod(
                    period.periodStart,
                    period.periodEnd
                )
                const proRateFactor = totalMonths / 12
                const allocated = Math.round(
                    (LEAVE_CAPS[balance.leaveType as LeaveTypes] || 0) *
                        proRateFactor
                )

                bulkOps.push({
                    updateOne: {
                        filter: { _id: balance._id },
                        update: {
                            $set: {
                                periodStart: period.periodStart,
                                periodEnd: period.periodEnd,
                                // Only update allocated for non-annual leave types
                                // Annual leave accrual is managed separately
                                ...(balance.leaveType !== LeaveTypes.ANNUAL && {
                                    allocated,
                                }),
                                updatedAt: new Date(),
                            },
                        },
                    },
                })
                stats.migrated++
            } catch (error) {
                console.error(
                    `  ERROR processing balance ${balance._id}:`,
                    error instanceof Error ? error.message : error
                )
                stats.errors++
            }
        }

        // Execute bulk operations in batches
        if (bulkOps.length > 0) {
            const BATCH_SIZE = 500
            for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
                const batch = bulkOps.slice(i, i + BATCH_SIZE)
                const result = await balancesCollection.bulkWrite(batch)
                console.log(
                    `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Modified ${result.modifiedCount} records`
                )
            }
        }

        // Update the unique index
        console.log("\nUpdating indexes...")
        try {
            // Drop old index if it exists
            const existingIndexes = await balancesCollection.indexes()
            const oldIndex = existingIndexes.find(
                (idx: any) =>
                    idx.key &&
                    idx.key.staff === 1 &&
                    idx.key.year === 1 &&
                    idx.key.leaveType === 1 &&
                    idx.unique
            )

            if (oldIndex) {
                console.log(
                    `  Dropping old unique index: ${oldIndex.name}`
                )
                await balancesCollection.dropIndex(oldIndex.name)
            }

            // Create new unique index
            await balancesCollection.createIndex(
                { staff: 1, periodStart: 1, leaveType: 1 },
                { unique: true, name: "staff_periodStart_leaveType_unique" }
            )
            console.log(
                "  Created new unique index: staff_periodStart_leaveType_unique"
            )

            // Create period range index
            await balancesCollection.createIndex(
                { periodStart: 1, periodEnd: 1, leaveType: 1 },
                { name: "periodStart_periodEnd_leaveType" }
            )
            console.log(
                "  Created period range index: periodStart_periodEnd_leaveType"
            )
        } catch (indexError) {
            console.error(
                "  WARNING: Index update failed. You may need to update indexes manually.",
                indexError instanceof Error
                    ? indexError.message
                    : indexError
            )
        }

        // Print summary
        console.log("\n=== Migration Summary ===")
        console.log(`Total balances:           ${stats.total}`)
        console.log(`Migrated:                 ${stats.migrated}`)
        console.log(`Already migrated (skip):  ${stats.skippedAlreadyMigrated}`)
        console.log(`No contract (fallback):   ${stats.skippedNoContract}`)
        console.log(`Errors:                   ${stats.errors}`)
        console.log("========================\n")

        if (stats.errors > 0) {
            console.log(
                "WARNING: Some records had errors. Review the output above and fix manually if needed."
            )
        }

        if (stats.skippedNoContract > 0) {
            console.log(
                "NOTE: Some staff had no contracts. Calendar year fallback was used for these. " +
                    "Once contracts are created, re-run this script to update them."
            )
        }
    } catch (error) {
        console.error("Migration failed:", error)
        process.exit(1)
    } finally {
        await mongoose.disconnect()
        console.log("Disconnected from MongoDB")
    }
}

/**
 * Find the best contract for a staff member for a given year.
 *
 * Priority:
 * 1. Active contract whose period covers the year
 * 2. Any contract (active, expired, renewed) whose date range covers the year
 * 3. Most recent active contract (if permanent / no end date)
 * 4. Most recent contract of any status
 */
function findBestContract(contracts: any[], year: number): any | null {
    if (contracts.length === 0) return null

    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31)

    // 1. Active contract covering the year
    const activeOverlapping = contracts.find(
        (c) =>
            c.status === ContractStatus.ACTIVE &&
            new Date(c.startDate) <= yearEnd &&
            (!c.endDate || new Date(c.endDate) >= yearStart)
    )
    if (activeOverlapping) return activeOverlapping

    // 2. Any contract covering the year
    const anyOverlapping = contracts.find(
        (c) =>
            new Date(c.startDate) <= yearEnd &&
            (!c.endDate || new Date(c.endDate) >= yearStart)
    )
    if (anyOverlapping) return anyOverlapping

    // 3. Most recent active contract (permanent)
    const activeRecent = contracts.find(
        (c) => c.status === ContractStatus.ACTIVE && !c.endDate
    )
    if (activeRecent) return activeRecent

    // 4. Most recent contract (contracts are sorted by startDate desc)
    return contracts[0]
}

migrate()
