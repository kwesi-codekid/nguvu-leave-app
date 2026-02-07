/**
 * Contract Period Utilities
 *
 * Computes leave balance periods based on contract start/end dates
 * instead of calendar years. Periods run from contract start anniversary
 * to anniversary each year.
 */

export interface ContractDates {
    startDate: Date
    endDate?: Date | null
}

export interface ContractPeriod {
    periodStart: Date
    periodEnd: Date
}

/**
 * Get the contract period (anniversary-based) that contains a given date.
 *
 * For permanent contracts (no endDate): periods are full 12-month anniversaries.
 * For fixed-term contracts: the last period is capped at endDate.
 *
 * @param contract - The contract with startDate and optional endDate
 * @param asOfDate - The date to find the period for (defaults to now)
 * @returns The period containing asOfDate, or null if outside contract bounds
 */
export function getContractPeriod(
    contract: ContractDates,
    asOfDate?: Date
): ContractPeriod | null {
    const now = asOfDate || new Date()
    const contractStart = new Date(contract.startDate)
    contractStart.setHours(0, 0, 0, 0)

    const contractEnd = contract.endDate ? new Date(contract.endDate) : null
    if (contractEnd) contractEnd.setHours(23, 59, 59, 999)

    const nowNorm = new Date(now)
    nowNorm.setHours(12, 0, 0, 0)

    // If asOfDate is before contract start, return null
    if (nowNorm < contractStart) return null

    // If contract has ended and asOfDate is after end, return null
    if (contractEnd) {
        const endCheck = new Date(contractEnd)
        endCheck.setHours(23, 59, 59, 999)
        if (nowNorm > endCheck) return null
    }

    // Calculate which anniversary year we're in
    const yearsElapsed = getAnniversaryYearsElapsed(contractStart, nowNorm)

    // Period start = contractStart + yearsElapsed years
    const periodStart = new Date(contractStart)
    periodStart.setFullYear(periodStart.getFullYear() + yearsElapsed)
    periodStart.setHours(0, 0, 0, 0)

    // Period end = next anniversary - 1 day
    const periodEnd = new Date(contractStart)
    periodEnd.setFullYear(periodEnd.getFullYear() + yearsElapsed + 1)
    periodEnd.setDate(periodEnd.getDate() - 1)
    periodEnd.setHours(23, 59, 59, 999)

    // Cap period end at contract end date if applicable
    if (contractEnd && periodEnd > contractEnd) {
        periodEnd.setTime(contractEnd.getTime())
        periodEnd.setHours(23, 59, 59, 999)
    }

    return { periodStart, periodEnd }
}

/**
 * Calculate how many full anniversary years have elapsed since contract start.
 */
function getAnniversaryYearsElapsed(contractStart: Date, asOfDate: Date): number {
    let years = asOfDate.getFullYear() - contractStart.getFullYear()

    // Check if we haven't reached the anniversary yet this year
    const anniversaryThisYear = new Date(contractStart)
    anniversaryThisYear.setFullYear(asOfDate.getFullYear())

    if (asOfDate < anniversaryThisYear) {
        years--
    }

    return Math.max(0, years)
}

/**
 * Get number of months elapsed in the current period (for accrual calculation).
 *
 * @param periodStart - Start of the current period
 * @param asOfDate - The date to calculate up to (defaults to now)
 * @returns Number of months elapsed (minimum 1 if within the period)
 */
export function getMonthsInPeriod(periodStart: Date, asOfDate?: Date): number {
    const now = asOfDate || new Date()
    const start = new Date(periodStart)

    const yearDiff = now.getFullYear() - start.getFullYear()
    const monthDiff = now.getMonth() - start.getMonth()
    const months = yearDiff * 12 + monthDiff

    // Include current month (+1)
    return Math.max(1, months + 1)
}

/**
 * Get the total number of months in a period (for pro-rating partial periods).
 *
 * @param periodStart - Start of the period
 * @param periodEnd - End of the period
 * @returns Total months in the period (12 for full periods, less for partial)
 */
export function getTotalMonthsInPeriod(periodStart: Date, periodEnd: Date): number {
    const start = new Date(periodStart)
    const end = new Date(periodEnd)

    const yearDiff = end.getFullYear() - start.getFullYear()
    const monthDiff = end.getMonth() - start.getMonth()
    const totalMonths = yearDiff * 12 + monthDiff

    // Add 1 to include both start and end months, but cap fractional logic
    // A full anniversary period = 12 months (from day X to day X-1 next year)
    // We check if the period end is roughly a full year
    const dayDiff = end.getDate() - start.getDate()
    if (totalMonths === 11 && dayDiff >= -1) {
        // Full 12-month period (e.g., Mar 15 - Mar 14 = 11 months + ~30 days = 12 months)
        return 12
    }

    return Math.max(1, totalMonths + 1)
}

/**
 * Format a period for display.
 *
 * @param periodStart - Start of the period
 * @param periodEnd - End of the period
 * @returns Formatted string like "Mar 15, 2025 - Mar 14, 2026"
 */
export function formatPeriod(periodStart: Date, periodEnd: Date): string {
    const opts: Intl.DateTimeFormatOptions = {
        month: "short",
        day: "numeric",
        year: "numeric",
    }
    const start = new Date(periodStart).toLocaleDateString("en-US", opts)
    const end = new Date(periodEnd).toLocaleDateString("en-US", opts)
    return `${start} - ${end}`
}

/**
 * Get all contract periods for the full duration of a contract.
 * Useful for reports and history views.
 *
 * @param contract - The contract with startDate and optional endDate
 * @returns Array of all periods for the contract
 */
export function getAllContractPeriods(contract: ContractDates): ContractPeriod[] {
    const periods: ContractPeriod[] = []
    const contractStart = new Date(contract.startDate)
    contractStart.setHours(0, 0, 0, 0)

    const contractEnd = contract.endDate ? new Date(contract.endDate) : null
    if (contractEnd) contractEnd.setHours(23, 59, 59, 999)

    // For permanent contracts, only generate up to the current period + 1
    const maxDate = contractEnd || new Date()

    let periodIndex = 0
    while (true) {
        const periodStart = new Date(contractStart)
        periodStart.setFullYear(periodStart.getFullYear() + periodIndex)
        periodStart.setHours(0, 0, 0, 0)

        // If period start is past max date, stop
        if (periodStart > maxDate) break

        const periodEnd = new Date(contractStart)
        periodEnd.setFullYear(periodEnd.getFullYear() + periodIndex + 1)
        periodEnd.setDate(periodEnd.getDate() - 1)
        periodEnd.setHours(23, 59, 59, 999)

        // Cap at contract end
        if (contractEnd && periodEnd > contractEnd) {
            periodEnd.setTime(contractEnd.getTime())
            periodEnd.setHours(23, 59, 59, 999)
        }

        periods.push({ periodStart, periodEnd })
        periodIndex++

        // Safety: if this is the last capped period, stop
        if (contractEnd && periodEnd >= contractEnd) break
    }

    return periods
}
