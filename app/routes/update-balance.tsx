import { useState, useMemo, useEffect } from "react"
import { useLoaderData, useFetcher } from "react-router"
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router"
import { redirect } from "react-router"
import {
    Button,
    Input,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Chip,
    addToast,
    Spinner,
} from "@heroui/react"
import { Save, Search } from "lucide-react"
import connectDB from "~/database/connect"
import Staff from "~/models/staff.model"
import StaffContract from "~/models/staff-contract.model"
import LeaveBalance from "~/models/leave-balance.model"
import { LeaveTypes, Gender, LEAVE_CAPS, AuditAction } from "~/utils/types"
import {
    getContractPeriod,
    getTotalMonthsInPeriod,
    formatPeriod,
} from "~/utils/contract-period"
import { isAuthenticated, getSessionData } from "~/auth-session"
import AuditLogController from "~/controllers/audit-log.controller"

interface StaffRow {
    _id: string
    staffId: string
    name: string
    departmentName: string
    gender: string
    hasContract: boolean
    periodLabel?: string
    currentAccrued?: number
    allocated?: number
    used?: number
    remaining?: number
}

export async function loader({ request }: LoaderFunctionArgs) {
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/login-email?redirectTo=/update-balance")
    }

    const sessionData = await getSessionData(request)
    const isHROrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")

    if (!isHROrAdmin) {
        return redirect("/dashboard")
    }

    await connectDB()

    // Batch fetch: all staff, all active contracts, then relevant balances
    const allStaff = await Staff.find()
        .select("name staffId department gender")
        .populate("department", "name")
        .lean()
        .exec()

    const activeContracts = await StaffContract.find({ status: "active" })
        .lean()
        .exec()

    // Map: staffId string -> contract
    const contractMap = new Map<string, any>()
    for (const contract of activeContracts) {
        contractMap.set(contract.staff.toString(), contract)
    }

    // Compute periods for staff with active contracts
    const periodMap = new Map<
        string,
        { periodStart: Date; periodEnd: Date; normalizedStart: Date }
    >()
    const staffIdsWithContracts: string[] = []

    for (const staff of allStaff) {
        const staffIdStr = staff._id.toString()
        const contract = contractMap.get(staffIdStr)
        if (!contract) continue

        const period = getContractPeriod(
            { startDate: contract.startDate, endDate: contract.endDate },
            new Date()
        )
        if (!period) continue

        const normalizedStart = new Date(period.periodStart)
        normalizedStart.setHours(0, 0, 0, 0)

        periodMap.set(staffIdStr, {
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            normalizedStart,
        })
        staffIdsWithContracts.push(staffIdStr)
    }

    // Batch fetch annual leave balances for all staff with contracts
    const existingBalances =
        staffIdsWithContracts.length > 0
            ? await LeaveBalance.find({
                  staff: { $in: staffIdsWithContracts },
                  leaveType: LeaveTypes.ANNUAL,
              })
                  .lean()
                  .exec()
            : []

    // Map: staffId string -> balance (matching current period)
    // Use a date-range check instead of exact timestamp match to handle
    // timezone and storage differences in periodStart values
    const balanceMap = new Map<string, any>()
    for (const balance of existingBalances) {
        const staffIdStr = balance.staff.toString()
        const period = periodMap.get(staffIdStr)
        if (!period) continue

        const balanceStart = new Date(balance.periodStart)
        balanceStart.setHours(0, 0, 0, 0)
        const periodNorm = new Date(period.normalizedStart)
        periodNorm.setHours(0, 0, 0, 0)

        // Match if same calendar day (within 24 hours tolerance)
        const diffMs = Math.abs(balanceStart.getTime() - periodNorm.getTime())
        if (diffMs < 86400000) {
            balanceMap.set(staffIdStr, balance)
        }
    }

    // Build response
    const staffRows: StaffRow[] = allStaff
        .map((staff) => {
            const staffIdStr = staff._id.toString()
            const period = periodMap.get(staffIdStr)

            const row: StaffRow = {
                _id: staffIdStr,
                staffId: staff.staffId,
                name: staff.name,
                departmentName: (staff.department as any)?.name || "N/A",
                gender: staff.gender,
                hasContract: !!period,
            }

            if (period) {
                row.periodLabel = formatPeriod(
                    period.periodStart,
                    period.periodEnd
                )
                const totalMonths = getTotalMonthsInPeriod(
                    period.periodStart,
                    period.periodEnd
                )
                row.allocated = totalMonths * 2.5

                const balance = balanceMap.get(staffIdStr)
                if (balance) {
                    // Editable value = accrued (formula) + adjustments (carry-over).
                    // This is the staff's total entitlement for the period before
                    // subtracting used days, so re-saving the shown number is a no-op.
                    row.currentAccrued = (balance.accrued || 0) + (balance.adjustments || 0)
                    row.used = balance.used || 0
                    row.remaining = (balance.accrued || 0) + (balance.adjustments || 0) - (balance.used || 0)
                }
            }

            return row
        })
        .sort((a, b) => a.staffId.localeCompare(b.staffId))

    return { staffRows }
}

export async function action({ request }: ActionFunctionArgs) {
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return { status: "error", message: "Unauthorized" }
    }

    const sessionData = await getSessionData(request)
    const isHROrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")

    if (!isHROrAdmin) {
        return { status: "error", message: "Insufficient permissions" }
    }

    await connectDB()

    const body = await request.json()
    const updates: Array<{ staffObjectId: string; accrued: number }> =
        body.updates

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return { status: "error", message: "No updates provided" }
    }

    const results: Array<{
        staffId: string
        status: string
        message: string
    }> = []

    for (const update of updates) {
        try {
            const { staffObjectId, accrued } = update

            if (isNaN(accrued) || accrued < 0) {
                results.push({
                    staffId: staffObjectId,
                    status: "error",
                    message: "Invalid accrued value",
                })
                continue
            }

            const staff = await Staff.findById(staffObjectId).exec()
            if (!staff) {
                results.push({
                    staffId: staffObjectId,
                    status: "error",
                    message: "Staff not found",
                })
                continue
            }

            const contract = await StaffContract.findOne({
                staff: staffObjectId,
                status: "active",
            })
                .lean()
                .exec()

            if (!contract) {
                results.push({
                    staffId: staff.staffId,
                    status: "error",
                    message: "No active contract",
                })
                continue
            }

            const period = getContractPeriod(
                { startDate: contract.startDate, endDate: contract.endDate },
                new Date()
            )

            if (!period) {
                results.push({
                    staffId: staff.staffId,
                    status: "error",
                    message: "No active period",
                })
                continue
            }

            const normalizedStart = new Date(period.periodStart)
            normalizedStart.setHours(0, 0, 0, 0)

            const totalMonths = getTotalMonthsInPeriod(
                period.periodStart,
                period.periodEnd
            )
            const allocated = totalMonths * 2.5

            // Create or update annual leave balance
            let annualBalance = await LeaveBalance.findOne({
                staff: staffObjectId,
                periodStart: normalizedStart,
                leaveType: LeaveTypes.ANNUAL,
            })

            // Ensure the balance record exists for this period
            if (!annualBalance) {
                annualBalance = new LeaveBalance({
                    staff: staffObjectId,
                    periodStart: normalizedStart,
                    periodEnd: new Date(period.periodEnd),
                    leaveType: LeaveTypes.ANNUAL,
                    allocated,
                    accrued: 0,
                    used: 0,
                    adjustments: 0,
                })
                await annualBalance.save()
            }

            const oldTotal =
                (annualBalance.accrued || 0) + (annualBalance.adjustments || 0)

            // Keep accrued driven by the monthly formula (do NOT freeze), so the
            // staff continues to accrue 2.5/month via the cron. Bring accrued up
            // to date first, then record the difference between the entered total
            // and the formula value as an adjustment (e.g. carried-over days).
            // The adjustment rides on top of accrual and self-clears next period.
            annualBalance.allocated = allocated
            annualBalance.manuallySet = false
            await annualBalance.updateAccrual()

            const formulaAccrued = annualBalance.accrued || 0
            annualBalance.adjustments = +(accrued - formulaAccrued).toFixed(2)
            await annualBalance.save()

            // Audit log for the balance update
            await AuditLogController.createAuditLog({
                action: AuditAction.BALANCE_ADJUSTED,
                entityType: "LeaveBalance",
                entityId: annualBalance._id,
                performedBy: sessionData.user!._id,
                performedByName: sessionData.user!.name,
                performedByEmail: sessionData.user!.email,
                description: `Set annual leave balance for ${staff.name} (${staff.staffId}) to ${accrued} days via Update Balance page (formula ${formulaAccrued} + carry-over/adjustment ${annualBalance.adjustments}; accrual continues)`,
                changes: [{
                    field: "balance",
                    oldValue: oldTotal,
                    newValue: accrued,
                    fieldLabel: "Annual Leave Balance",
                }],
                metadata: {
                    staffName: staff.name,
                    staffId: staff.staffId,
                    period: formatPeriod(period.periodStart, period.periodEnd),
                    allocated,
                    enteredTotal: accrued,
                    formulaAccrued,
                    adjustment: annualBalance.adjustments,
                    oldTotal,
                },
            })

            // Create other leave type balances if they don't exist
            const otherLeaveTypes = Object.values(LeaveTypes).filter(
                (lt) => lt !== LeaveTypes.ANNUAL
            )

            for (const leaveType of otherLeaveTypes) {
                if (
                    leaveType === LeaveTypes.MATERNITY &&
                    staff.gender !== Gender.FEMALE
                )
                    continue
                if (
                    leaveType === LeaveTypes.PATERNITY &&
                    staff.gender !== Gender.MALE
                )
                    continue

                const existing = await LeaveBalance.findOne({
                    staff: staffObjectId,
                    periodStart: normalizedStart,
                    leaveType,
                })

                if (!existing) {
                    const cap = LEAVE_CAPS[leaveType] || 0
                    const newBalance = new LeaveBalance({
                        staff: staffObjectId,
                        periodStart: normalizedStart,
                        periodEnd: new Date(period.periodEnd),
                        leaveType,
                        allocated: cap,
                        accrued: cap,
                        used: 0,
                        adjustments: 0,
                    })
                    await newBalance.save()
                }
            }

            results.push({
                staffId: staff.staffId,
                status: "success",
                message: "Updated",
            })
        } catch (error: any) {
            results.push({
                staffId: update.staffObjectId,
                status: "error",
                message: error.message,
            })
        }
    }

    const successCount = results.filter((r) => r.status === "success").length
    const errorCount = results.filter((r) => r.status === "error").length

    return {
        status: errorCount === 0 ? "success" : "partial",
        message: `${successCount} updated, ${errorCount} failed`,
        results,
    }
}

export default function UpdateBalance() {
    const { staffRows } = useLoaderData<typeof loader>()
    const fetcher = useFetcher()
    const [search, setSearch] = useState("")
    const [balances, setBalances] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {}
        for (const row of staffRows) {
            if (row.currentAccrued !== undefined) {
                initial[row._id] = row.currentAccrued.toString()
            }
        }
        return initial
    })

    const saving = fetcher.state === "submitting"

    useEffect(() => {
        if (fetcher.data) {
            const result = fetcher.data as any
            if (result.status === "success") {
                addToast({
                    title: "Success",
                    description: result.message,
                    color: "success",
                })
            } else if (result.status === "partial") {
                addToast({
                    title: "Partial Success",
                    description: result.message,
                    color: "warning",
                })
            } else {
                addToast({
                    title: "Error",
                    description: result.message,
                    color: "danger",
                })
            }
        }
    }, [fetcher.data])

    // Re-sync balances when loader data refreshes (after save revalidation)
    useEffect(() => {
        const updated: Record<string, string> = {}
        for (const row of staffRows) {
            if (row.currentAccrued !== undefined) {
                updated[row._id] = row.currentAccrued.toString()
            }
        }
        setBalances(updated)
    }, [staffRows])

    const filteredStaff = useMemo(() => {
        if (!search.trim()) return staffRows
        const term = search.toLowerCase()
        return staffRows.filter(
            (s) =>
                s.name.toLowerCase().includes(term) ||
                s.staffId.toLowerCase().includes(term) ||
                s.departmentName.toLowerCase().includes(term)
        )
    }, [search, staffRows])

    const handleSave = () => {
        const updates = Object.entries(balances)
            .filter(([id, value]) => {
                if (value === "" || isNaN(parseFloat(value))) return false
                const row = staffRows.find((r) => r._id === id)
                return row?.hasContract
            })
            .map(([staffObjectId, value]) => ({
                staffObjectId,
                accrued: parseFloat(value),
            }))

        if (updates.length === 0) {
            addToast({
                title: "No changes",
                description: "No balance values to save",
                color: "warning",
            })
            return
        }

        fetcher.submit(
            { updates },
            { method: "POST", encType: "application/json" }
        )
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold mb-1">
                    Update Leave Balances
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
                    Set each staff member's total annual leave balance for the
                    current period (e.g. to add carried-over days from a previous
                    year). Monthly accrual of 2.5 days keeps running on top — the
                    balance is not frozen. Other leave type balances are
                    auto-created if missing.
                </p>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                    <Input
                        variant="bordered"
                        className="max-w-xs"
                        classNames={{
                            inputWrapper:
                                "border-zinc-200 dark:border-zinc-800",
                            input: "focus-visible:outline-none",
                        }}
                        placeholder="Search by name, ID or department..."
                        value={search}
                        onValueChange={setSearch}
                        startContent={
                            <Search className="size-4 text-zinc-400" />
                        }
                    />
                    <Button
                        color="primary"
                        startContent={
                            saving ? (
                                <Spinner size="sm" color="white" />
                            ) : (
                                <Save className="size-4" />
                            )
                        }
                        onPress={handleSave}
                        isDisabled={saving}
                    >
                        {saving ? "Saving..." : "Save All"}
                    </Button>
                </div>

                <div className="border-2 border-zinc-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
                    <Table
                        aria-label="Staff leave balances"
                        classNames={{
                            wrapper: "bg-transparent shadow-none",
                            td: "text-sm",
                            th: "dark:bg-zinc-900 bg-zinc-100",
                        }}
                    >
                        <TableHeader>
                            <TableColumn>STAFF ID</TableColumn>
                            <TableColumn>NAME</TableColumn>
                            <TableColumn>DEPARTMENT</TableColumn>
                            <TableColumn>PERIOD</TableColumn>
                            <TableColumn>ANNUAL LEAVE (TOTAL)</TableColumn>
                            <TableColumn>REMAINING</TableColumn>
                        </TableHeader>
                        <TableBody emptyContent="No staff found">
                            {filteredStaff.map((row) => (
                                <TableRow key={row._id}>
                                    <TableCell>{row.staffId}</TableCell>
                                    <TableCell>{row.name}</TableCell>
                                    <TableCell>{row.departmentName}</TableCell>
                                    <TableCell>
                                        {row.hasContract ? (
                                            <span className="text-xs">
                                                {row.periodLabel}
                                            </span>
                                        ) : (
                                            <Chip
                                                size="sm"
                                                color="danger"
                                                variant="flat"
                                            >
                                                No contract
                                            </Chip>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.hasContract ? (
                                            <Input
                                                type="number"
                                                size="sm"
                                                variant="bordered"
                                                className="max-w-[120px]"
                                                classNames={{
                                                    input: "focus-visible:outline-none",
                                                    inputWrapper:
                                                        "border-zinc-300 dark:border-zinc-700",
                                                }}
                                                min={0}
                                                step={0.5}
                                                placeholder="0"
                                                value={
                                                    balances[row._id] ?? ""
                                                }
                                                onValueChange={(val) =>
                                                    setBalances((prev) => ({
                                                        ...prev,
                                                        [row._id]: val,
                                                    }))
                                                }
                                            />
                                        ) : (
                                            <span className="text-zinc-400 text-xs">
                                                N/A
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.hasContract ? (
                                            <span className={`font-semibold ${(row.remaining ?? 0) < 0 ? 'text-danger-500' : (row.remaining ?? 0) <= 2 ? 'text-warning-500' : ''}`}>
                                                {row.remaining ?? 0}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-400 text-xs">
                                                N/A
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <p className="text-xs text-zinc-400 mt-4">
                    {filteredStaff.length} staff shown &bull;{" "}
                    {staffRows.filter((s) => s.hasContract).length} with active
                    contracts
                </p>
            </div>
        </div>
    )
}
