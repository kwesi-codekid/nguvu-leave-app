import {
    addToast,
    Button,
    Card,
    CardBody,
    CardHeader,
    Chip,
    Input,
    Select,
    SelectItem,
    Spinner,
    Tab,
    Tabs,
    Progress,
    Skeleton,
} from "@heroui/react"
import { useState } from "react"
import axios from "axios"
import { LoaderFunctionArgs, redirect } from "react-router"
import { useLoaderData, useSearchParams } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import { LeaveTypes, LeaveStatus } from "~/utils/types"
import {
    BarChart3,
    Calendar,
    Download,
    FileText,
    PieChart,
    TrendingUp,
    Users,
    Building2,
    Clock,
    AlertTriangle,
    RefreshCw,
    Filter,
    ChevronDown,
} from "lucide-react"
import {
    PieChart as RechartsPieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
    AreaChart,
    Area,
    Legend,
} from "recharts"

// Colors for charts - matching dashboard style
const LEAVE_TYPE_COLORS: Record<string, string> = {
    annual: "#F59E0B",
    sick: "#EF4444",
    maternity: "#A855F7",
    paternity: "#22C55E",
    bereavement: "#6B7280",
}

const STATUS_COLORS: Record<string, string> = {
    approved: "#22C55E",
    pending_endorsement: "#F59E0B",
    endorsed: "#3B82F6",
    rejected: "#EF4444",
    cancelled: "#6B7280",
}

// Custom tooltip matching dashboard style
function CustomTooltip({ active, payload, label }: any) {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900 dark:bg-zinc-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm border border-zinc-700">
                <p className="font-medium mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} className="text-zinc-300">
                        <span style={{ color: entry.color }}>{entry.name}:</span> {entry.value}
                    </p>
                ))}
            </div>
        )
    }
    return null
}

// Skeleton loader
function ReportsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                        <CardBody className="p-4">
                            <Skeleton className="h-4 w-20 mb-2 rounded-lg" />
                            <Skeleton className="h-8 w-16 mb-2 rounded-lg" />
                            <Skeleton className="h-3 w-24 rounded-lg" />
                        </CardBody>
                    </Card>
                ))}
            </div>
            <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                <CardBody className="p-6">
                    <Skeleton className="h-[300px] w-full rounded-lg" />
                </CardBody>
            </Card>
        </div>
    )
}

// KPI Card Component - matching dashboard style
function KPICard({
    title,
    value,
    subtitle,
    icon: Icon,
    color = "default",
}: {
    title: string
    value: string | number
    subtitle?: string
    icon: any
    color?: "default" | "primary" | "success" | "warning" | "danger"
}) {
    const colorClasses = {
        default: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
        primary: "bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400",
        success: "bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400",
        warning: "bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400",
        danger: "bg-danger-100 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400",
    }

    return (
        <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-zinc-200 dark:border-zinc-800">
            <CardBody className="p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{title}</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
                        {subtitle && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
                        )}
                    </div>
                    <div className={`size-10 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
                        <Icon className="size-5" />
                    </div>
                </div>
            </CardBody>
        </Card>
    )
}

export default function Reports() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()

    // Check permissions
    const isHrOrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")
    const canViewReports = isHrOrAdmin || isManager

    // Current tab
    const currentTab = searchParams.get("tab") || "leave-requests"

    // Filter state
    const currentYear = new Date().getFullYear()
    const [filters, setFilters] = useState({
        startDate: DateTime.now().startOf("year").toFormat("yyyy-MM-dd"),
        endDate: DateTime.now().toFormat("yyyy-MM-dd"),
        year: currentYear.toString(),
        departmentId: "",
        leaveType: "",
        status: "",
    })

    const [isExporting, setIsExporting] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [showFilters, setShowFilters] = useState(false)

    // Fetch departments for filter
    const { data: departmentsData } = useSWR(
        `${baseUrl}/departments`,
        fetcher(sessionData.token as string)
    )

    // Fetch leave requests report
    const { data: leaveRequestsReport, isLoading: leaveRequestsLoading, mutate: mutateLeaveRequests } = useSWR(
        currentTab === "leave-requests"
            ? `${baseUrl}/reports?op=leave-requests&startDate=${filters.startDate}&endDate=${filters.endDate}${
                  filters.departmentId ? `&departmentId=${filters.departmentId}` : ""
              }${filters.leaveType ? `&leaveType=${filters.leaveType}` : ""}${
                  filters.status ? `&status=${filters.status}` : ""
              }`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch leave balances report
    const { data: balancesReport, isLoading: balancesLoading, mutate: mutateBalances } = useSWR(
        currentTab === "balances"
            ? `${baseUrl}/reports?op=leave-balances&year=${filters.year}${
                  filters.departmentId ? `&departmentId=${filters.departmentId}` : ""
              }${filters.leaveType ? `&leaveType=${filters.leaveType}` : ""}`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch utilization report
    const { data: utilizationReport, isLoading: utilizationLoading, mutate: mutateUtilization } = useSWR(
        currentTab === "utilization"
            ? `${baseUrl}/reports?op=utilization&year=${filters.year}${
                  filters.departmentId ? `&departmentId=${filters.departmentId}` : ""
              }`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch department summary report
    const { data: deptSummaryReport, isLoading: deptSummaryLoading, mutate: mutateDeptSummary } = useSWR(
        currentTab === "department-summary"
            ? `${baseUrl}/reports?op=department-summary&startDate=${filters.startDate}&endDate=${filters.endDate}${
                  filters.departmentId ? `&departmentId=${filters.departmentId}` : ""
              }`
            : null,
        fetcher(sessionData.token as string)
    )

    // Handle tab change
    const handleTabChange = (key: React.Key) => {
        setSearchParams({ tab: key as string })
    }

    // Refresh current report
    const refreshReport = async () => {
        setIsRefreshing(true)
        try {
            if (currentTab === "leave-requests") await mutateLeaveRequests()
            else if (currentTab === "balances") await mutateBalances()
            else if (currentTab === "utilization") await mutateUtilization()
            else if (currentTab === "department-summary") await mutateDeptSummary()

            addToast({ color: "success", title: "Refreshed", description: "Report data updated" })
        } finally {
            setIsRefreshing(false)
        }
    }

    // Handle export
    const handleExport = async (reportType: string) => {
        setIsExporting(true)
        try {
            const params = new URLSearchParams({
                op: reportType,
                format: "csv",
                startDate: filters.startDate,
                endDate: filters.endDate,
                year: filters.year,
            })

            if (filters.departmentId) params.append("departmentId", filters.departmentId)
            if (filters.leaveType) params.append("leaveType", filters.leaveType)
            if (filters.status) params.append("status", filters.status)

            const response = await axios.get(`${baseUrl}/reports?${params.toString()}`, {
                headers: { Authorization: `Bearer ${sessionData?.token}` },
            })

            if (response.data?.data?.csv) {
                const blob = new Blob([response.data.data.csv], { type: "text/csv" })
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = response.data.data.filename || `report-${reportType}.csv`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)

                addToast({ color: "success", title: "Export Complete", description: "Report downloaded successfully" })
            }
        } catch (error: any) {
            addToast({ color: "danger", title: "Export Failed", description: error.response?.data?.message || "Failed to export report" })
        } finally {
            setIsExporting(false)
        }
    }

    if (!canViewReports) {
        return (
            <AppLayout user={sessionData?.user} baseUrl={baseUrl} token={sessionData?.token}>
                <div className="flex flex-col items-center justify-center py-20">
                    <AlertTriangle className="size-12 text-warning-500 mb-4" />
                    <h2 className="text-xl font-semibold">Access Denied</h2>
                    <p className="text-zinc-500 mt-2">You don't have permission to view reports.</p>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout user={sessionData?.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Reports & Analytics</h1>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Comprehensive leave management insights
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="flat"
                            startContent={<Filter className="size-4" />}
                            endContent={<ChevronDown className={`size-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />}
                            onPress={() => setShowFilters(!showFilters)}
                        >
                            Filters
                        </Button>
                        <Button
                            size="sm"
                            variant="flat"
                            startContent={isRefreshing ? <Spinner size="sm" /> : <RefreshCw className="size-4" />}
                            onPress={refreshReport}
                            isDisabled={isRefreshing}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Collapsible Filters */}
                {showFilters && (
                    <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                        <CardBody className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                <Input
                                    label="Start Date"
                                    type="date"
                                    size="sm"
                                    variant="bordered"
                                    value={filters.startDate}
                                    onValueChange={(v) => setFilters({ ...filters, startDate: v })}
                                />
                                <Input
                                    label="End Date"
                                    type="date"
                                    size="sm"
                                    variant="bordered"
                                    value={filters.endDate}
                                    onValueChange={(v) => setFilters({ ...filters, endDate: v })}
                                />
                                <Select
                                    label="Year"
                                    size="sm"
                                    variant="bordered"
                                    selectedKeys={[filters.year]}
                                    onSelectionChange={(keys) => setFilters({ ...filters, year: Array.from(keys)[0] as string })}
                                >
                                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                                        <SelectItem key={y.toString()}>{y}</SelectItem>
                                    ))}
                                </Select>
                                <Select
                                    label="Department"
                                    size="sm"
                                    variant="bordered"
                                    selectedKeys={filters.departmentId ? [filters.departmentId] : []}
                                    onSelectionChange={(keys) => setFilters({ ...filters, departmentId: (Array.from(keys)[0] as string) || "" })}
                                >
                                    {departmentsData?.data?.departments?.map((d: any) => (
                                        <SelectItem key={d._id}>{d.name}</SelectItem>
                                    )) || []}
                                </Select>
                                <Select
                                    label="Leave Type"
                                    size="sm"
                                    variant="bordered"
                                    selectedKeys={filters.leaveType ? [filters.leaveType] : []}
                                    onSelectionChange={(keys) => setFilters({ ...filters, leaveType: (Array.from(keys)[0] as string) || "" })}
                                >
                                    {Object.values(LeaveTypes).map((type) => (
                                        <SelectItem key={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
                                    ))}
                                </Select>
                                <Select
                                    label="Status"
                                    size="sm"
                                    variant="bordered"
                                    selectedKeys={filters.status ? [filters.status] : []}
                                    onSelectionChange={(keys) => setFilters({ ...filters, status: (Array.from(keys)[0] as string) || "" })}
                                >
                                    {Object.values(LeaveStatus).map((status) => (
                                        <SelectItem key={status}>{status.replace("_", " ").toUpperCase()}</SelectItem>
                                    ))}
                                </Select>
                            </div>
                        </CardBody>
                    </Card>
                )}

                {/* Tabs */}
                <Tabs
                    selectedKey={currentTab}
                    onSelectionChange={handleTabChange}
                    color="primary"
                    variant="underlined"
                    classNames={{
                        tabList: "gap-6 w-full relative rounded-none p-0 border-b border-zinc-200 dark:border-zinc-700",
                        tab: "max-w-fit px-0 h-12 font-medium",
                        tabContent: "group-data-[selected=true]:text-primary",
                        cursor: "w-full bg-primary",
                        panel: "pt-6",
                    }}
                >
                    {/* Leave Requests Report */}
                    <Tab
                        key="leave-requests"
                        title={
                            <div className="flex items-center gap-2">
                                <FileText className="size-4" />
                                <span>Leave Requests</span>
                            </div>
                        }
                    >
                        {leaveRequestsLoading ? (
                            <ReportsSkeleton />
                        ) : leaveRequestsReport?.data?.statistics ? (
                            <div className="space-y-6">
                                {/* KPI Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <KPICard
                                        title="Total Requests"
                                        value={leaveRequestsReport.data.statistics.total}
                                        icon={FileText}
                                        color="primary"
                                    />
                                    <KPICard
                                        title="Approval Rate"
                                        value={`${Math.round(((leaveRequestsReport.data.statistics.byStatus?.[LeaveStatus.APPROVED] || 0) / Math.max(leaveRequestsReport.data.statistics.total, 1)) * 100)}%`}
                                        icon={TrendingUp}
                                        color="success"
                                    />
                                    <KPICard
                                        title="Pending"
                                        value={(leaveRequestsReport.data.statistics.byStatus?.[LeaveStatus.PENDING] || 0) + (leaveRequestsReport.data.statistics.byStatus?.[LeaveStatus.ENDORSED] || 0)}
                                        subtitle="Awaiting action"
                                        icon={Clock}
                                        color="warning"
                                    />
                                    <KPICard
                                        title="Total Days"
                                        value={leaveRequestsReport.data.statistics.totalWorkingDays}
                                        subtitle="Working days used"
                                        icon={Calendar}
                                        color="default"
                                    />
                                </div>

                                {/* Charts Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Donut Chart - Leave Distribution */}
                                    <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <PieChart className="size-5 text-primary" />
                                                    <h3 className="font-semibold">Leave Distribution</h3>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardBody>
                                            <div className="h-[280px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RechartsPieChart>
                                                        <Pie
                                                            data={Object.entries(leaveRequestsReport.data.statistics.byLeaveType || {}).map(([type, data]: [string, any]) => ({
                                                                name: type.charAt(0).toUpperCase() + type.slice(1),
                                                                value: data.count || 0,
                                                                days: data.days || 0,
                                                            }))}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={60}
                                                            outerRadius={90}
                                                            paddingAngle={3}
                                                            dataKey="value"
                                                            stroke="none"
                                                        >
                                                            {Object.entries(leaveRequestsReport.data.statistics.byLeaveType || {}).map(([type], index: number) => (
                                                                <Cell key={`cell-${index}`} fill={LEAVE_TYPE_COLORS[type] || "#6B7280"} />
                                                            ))}
                                                        </Pie>
                                                        <RechartsTooltip content={<CustomTooltip />} />
                                                    </RechartsPieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            {/* Legend */}
                                            <div className="flex flex-wrap gap-3 justify-center">
                                                {Object.entries(leaveRequestsReport.data.statistics.byLeaveType || {}).map(([type, data]: [string, any]) => (
                                                    <div key={type} className="flex items-center gap-1.5">
                                                        <div className="size-3 rounded-full" style={{ backgroundColor: LEAVE_TYPE_COLORS[type] || "#6B7280" }} />
                                                        <span className="text-xs text-zinc-600 dark:text-zinc-400 capitalize">{type}</span>
                                                        <span className="text-xs font-medium">({data.count})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardBody>
                                    </Card>

                                    {/* Bar Chart - Days by Leave Type */}
                                    <Card className="bg-content1 lg:col-span-2 border border-zinc-200 dark:border-zinc-800">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <BarChart3 className="size-5 text-primary" />
                                                    <h3 className="font-semibold">Days by Leave Type</h3>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    color="warning"
                                                    variant="flat"
                                                    startContent={<Download className="size-4" />}
                                                    onPress={() => handleExport("leave-requests")}
                                                    isLoading={isExporting}
                                                >
                                                    Export
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardBody>
                                            <div className="h-[280px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart
                                                        data={Object.entries(leaveRequestsReport.data.statistics.byLeaveType || {}).map(([type, data]: [string, any]) => ({
                                                            type: type.charAt(0).toUpperCase() + type.slice(1),
                                                            days: data.days || 0,
                                                            requests: data.count || 0,
                                                        }))}
                                                        margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                                        <XAxis dataKey="type" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                        <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                        <RechartsTooltip content={<CustomTooltip />} />
                                                        <Bar dataKey="days" name="Days" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                                        <Bar dataKey="requests" name="Requests" fill="#22C55E" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </div>

                                {/* Top Staff Section */}
                                {leaveRequestsReport.data.statistics.topStaff?.length > 0 && (
                                    <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-center gap-2">
                                                <Users className="size-5 text-warning" />
                                                <h3 className="font-semibold">Top Leave Takers</h3>
                                            </div>
                                        </CardHeader>
                                        <CardBody>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                                                {leaveRequestsReport.data.statistics.topStaff.slice(0, 5).map((staff: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700"
                                                    >
                                                        <div className="flex items-center justify-center size-8 rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-600 font-semibold text-sm">
                                                            #{i + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-sm truncate">{staff.name}</p>
                                                            <p className="text-xs text-zinc-500">{staff.staffId}</p>
                                                        </div>
                                                        <Chip size="sm" color="warning" variant="flat">{staff.totalDays}d</Chip>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardBody>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <EmptyState icon={FileText} message="No leave request data available" />
                        )}
                    </Tab>

                    {/* Leave Balances Report */}
                    <Tab
                        key="balances"
                        title={
                            <div className="flex items-center gap-2">
                                <PieChart className="size-4" />
                                <span>Balances</span>
                            </div>
                        }
                    >
                        {balancesLoading ? (
                            <ReportsSkeleton />
                        ) : balancesReport?.data?.statistics ? (
                            <div className="space-y-6">
                                {/* KPI Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <KPICard
                                        title="Total Allocated"
                                        value={balancesReport.data.statistics.totals.totalAllocated}
                                        subtitle="days"
                                        icon={Calendar}
                                        color="primary"
                                    />
                                    <KPICard
                                        title="Total Used"
                                        value={balancesReport.data.statistics.totals.totalUsed}
                                        subtitle="days"
                                        icon={TrendingUp}
                                        color="warning"
                                    />
                                    <KPICard
                                        title="Remaining"
                                        value={balancesReport.data.statistics.totals.totalRemaining}
                                        subtitle="days available"
                                        icon={PieChart}
                                        color="success"
                                    />
                                    <KPICard
                                        title="Utilization"
                                        value={`${balancesReport.data.statistics.averages.utilizationPercent}%`}
                                        icon={BarChart3}
                                        color={balancesReport.data.statistics.averages.utilizationPercent > 80 ? "danger" : balancesReport.data.statistics.averages.utilizationPercent > 50 ? "warning" : "success"}
                                    />
                                </div>

                                {/* Charts Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Area Chart - Balance Overview */}
                                    <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <BarChart3 className="size-5 text-primary" />
                                                    <h3 className="font-semibold">Balance Overview</h3>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    color="warning"
                                                    variant="flat"
                                                    startContent={<Download className="size-4" />}
                                                    onPress={() => handleExport("leave-balances")}
                                                    isLoading={isExporting}
                                                >
                                                    Export
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardBody>
                                            <div className="h-[300px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart
                                                        data={Object.entries(balancesReport.data.statistics.byLeaveType || {}).map(([type, data]: [string, any]) => ({
                                                            type: type.charAt(0).toUpperCase() + type.slice(1),
                                                            allocated: data.totalAllocated || 0,
                                                            used: data.totalUsed || 0,
                                                            remaining: data.totalRemaining || 0,
                                                        }))}
                                                    >
                                                        <defs>
                                                            <linearGradient id="colorAllocated" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                                            </linearGradient>
                                                            <linearGradient id="colorUsed" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                                        <XAxis dataKey="type" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                        <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                        <RechartsTooltip content={<CustomTooltip />} />
                                                        <Area type="monotone" dataKey="allocated" name="Allocated" stroke="#3B82F6" fillOpacity={1} fill="url(#colorAllocated)" />
                                                        <Area type="monotone" dataKey="used" name="Used" stroke="#F59E0B" fillOpacity={1} fill="url(#colorUsed)" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </CardBody>
                                    </Card>

                                    {/* Utilization by Type */}
                                    <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="size-5 text-success" />
                                                <h3 className="font-semibold">Utilization by Type</h3>
                                            </div>
                                        </CardHeader>
                                        <CardBody>
                                            <div className="space-y-4">
                                                {Object.entries(balancesReport.data.statistics.byLeaveType || {}).map(([type, data]: [string, any]) => (
                                                    <div key={type} className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="size-3 rounded-full" style={{ backgroundColor: LEAVE_TYPE_COLORS[type] || "#6B7280" }} />
                                                                <span className="text-sm font-medium capitalize">{type}</span>
                                                            </div>
                                                            <span className="text-sm font-semibold">{data.avgUtilization || 0}%</span>
                                                        </div>
                                                        <Progress
                                                            value={data.avgUtilization || 0}
                                                            size="sm"
                                                            color={data.avgUtilization > 80 ? "danger" : data.avgUtilization > 50 ? "warning" : "primary"}
                                                            classNames={{ track: "bg-zinc-200 dark:bg-zinc-700" }}
                                                        />
                                                        <div className="flex justify-between text-xs text-zinc-500">
                                                            <span>Used: {data.totalUsed || 0}</span>
                                                            <span>Allocated: {data.totalAllocated || 0}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardBody>
                                    </Card>
                                </div>

                                {/* Low Balance Alerts */}
                                {balancesReport.data.statistics.lowBalance?.length > 0 && (
                                    <Card className="border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/10">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="size-5 text-warning-600" />
                                                <h3 className="font-semibold text-warning-700 dark:text-warning-400">
                                                    Low Balance Alerts ({balancesReport.data.statistics.lowBalance.length})
                                                </h3>
                                            </div>
                                        </CardHeader>
                                        <CardBody>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                                {balancesReport.data.statistics.lowBalance.slice(0, 8).map((item: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 rounded-lg">
                                                        <div>
                                                            <p className="text-sm font-medium">{item.staff.name}</p>
                                                            <p className="text-xs text-zinc-500 capitalize">{item.leaveType}</p>
                                                        </div>
                                                        <Chip size="sm" color="danger" variant="flat">{item.remaining} left</Chip>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardBody>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <EmptyState icon={PieChart} message="No balance data available" />
                        )}
                    </Tab>

                    {/* Utilization Report */}
                    <Tab
                        key="utilization"
                        title={
                            <div className="flex items-center gap-2">
                                <BarChart3 className="size-4" />
                                <span>Utilization</span>
                            </div>
                        }
                    >
                        {utilizationLoading ? (
                            <ReportsSkeleton />
                        ) : utilizationReport?.data?.utilization ? (
                            <div className="space-y-6">
                                {/* KPI Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <KPICard
                                        title="Overall Utilization"
                                        value={`${utilizationReport.data.utilization.overall.utilizationRate}%`}
                                        icon={BarChart3}
                                        color={utilizationReport.data.utilization.overall.utilizationRate > 80 ? "danger" : utilizationReport.data.utilization.overall.utilizationRate > 50 ? "warning" : "success"}
                                    />
                                    <KPICard
                                        title="Total Allocated"
                                        value={utilizationReport.data.utilization.overall.totalAllocated}
                                        subtitle="days"
                                        icon={Calendar}
                                        color="primary"
                                    />
                                    <KPICard
                                        title="Total Used"
                                        value={utilizationReport.data.utilization.overall.totalUsed}
                                        subtitle="days"
                                        icon={TrendingUp}
                                        color="warning"
                                    />
                                    <KPICard
                                        title="Remaining"
                                        value={utilizationReport.data.utilization.overall.totalRemaining}
                                        subtitle="days"
                                        icon={PieChart}
                                        color="success"
                                    />
                                </div>

                                {/* Charts Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Department Comparison Chart */}
                                    {Object.keys(utilizationReport.data.utilization.departmentComparisons || {}).length > 0 && (
                                        <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                                            <CardHeader className="pb-0">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="size-5 text-primary" />
                                                    <h3 className="font-semibold">Department Comparison</h3>
                                                </div>
                                            </CardHeader>
                                            <CardBody>
                                                <div className="h-[300px]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart
                                                            data={Object.entries(utilizationReport.data.utilization.departmentComparisons || {}).map(([dept, data]: [string, any]) => ({
                                                                department: dept.length > 12 ? dept.substring(0, 12) + "..." : dept,
                                                                utilization: data.utilizationRate || 0,
                                                                used: data.used || 0,
                                                                allocated: data.allocated || 0,
                                                            }))}
                                                            margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                                            <XAxis dataKey="department" tick={{ fontSize: 10 }} stroke="#9CA3AF" angle={-45} textAnchor="end" />
                                                            <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                            <RechartsTooltip content={<CustomTooltip />} />
                                                            <Bar dataKey="utilization" name="Utilization %" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}

                                    {/* Top Consumers */}
                                    {utilizationReport.data.utilization.topConsumers?.length > 0 && (
                                        <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
                                            <CardHeader className="pb-0">
                                                <div className="flex items-center gap-2">
                                                    <Users className="size-5 text-warning" />
                                                    <h3 className="font-semibold">Top Leave Consumers</h3>
                                                </div>
                                            </CardHeader>
                                            <CardBody>
                                                <div className="h-[300px]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart
                                                            data={utilizationReport.data.utilization.topConsumers.slice(0, 10).map((item: any, index: number) => ({
                                                                rank: `#${index + 1}`,
                                                                name: item.staff.name,
                                                                utilization: item.utilizationRate || 0,
                                                                daysUsed: item.daysUsed || 0,
                                                            }))}
                                                        >
                                                            <defs>
                                                                <linearGradient id="colorUtil" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                                                                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                                            <XAxis dataKey="rank" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                            <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                                            <RechartsTooltip content={<CustomTooltip />} />
                                                            <Area type="monotone" dataKey="utilization" name="Utilization %" stroke="#F59E0B" fillOpacity={1} fill="url(#colorUtil)" />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}
                                </div>

                                {/* Recommendations */}
                                {utilizationReport.data.utilization.recommendations?.length > 0 && (
                                    <Card className="border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/10">
                                        <CardBody className="p-4">
                                            <div className="flex items-start gap-3">
                                                <TrendingUp className="size-5 text-primary-600 flex-shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <h4 className="font-semibold text-primary-700 dark:text-primary-400">Recommendations</h4>
                                                    {utilizationReport.data.utilization.recommendations.map((rec: any, i: number) => (
                                                        <p key={i} className="text-sm text-primary-600 dark:text-primary-300">{rec.message}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <EmptyState icon={BarChart3} message="No utilization data available" />
                        )}
                    </Tab>

                    {/* Department Summary */}
                    <Tab
                        key="department-summary"
                        title={
                            <div className="flex items-center gap-2">
                                <Building2 className="size-4" />
                                <span>By Department</span>
                            </div>
                        }
                    >
                        {deptSummaryLoading ? (
                            <ReportsSkeleton />
                        ) : deptSummaryReport?.data?.departments?.length > 0 ? (
                            <div className="space-y-6">
                                {/* KPI Cards */}
                                {deptSummaryReport.data.overall && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <KPICard
                                            title="Departments"
                                            value={deptSummaryReport.data.overall.totalDepartments}
                                            icon={Building2}
                                            color="primary"
                                        />
                                        <KPICard
                                            title="Total Requests"
                                            value={deptSummaryReport.data.overall.totalRequests}
                                            icon={FileText}
                                            color="warning"
                                        />
                                        <KPICard
                                            title="Staff Days"
                                            value={deptSummaryReport.data.overall.totalStaffDays}
                                            icon={Calendar}
                                            color="success"
                                        />
                                        <KPICard
                                            title="Avg/Department"
                                            value={deptSummaryReport.data.overall.avgRequestsPerDept}
                                            subtitle="requests"
                                            icon={BarChart3}
                                            color="default"
                                        />
                                    </div>
                                )}

                                {/* Department Cards Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {deptSummaryReport.data.departments.map((dept: any) => (
                                        <Card key={dept.department.id} className="bg-content1 border border-zinc-200 dark:border-zinc-800 hover:scale-[1.01] transition-all">
                                            <CardBody className="p-4">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div>
                                                        <h3 className="font-semibold">{dept.department.name}</h3>
                                                        <p className="text-xs text-zinc-500">{dept.staffCount} staff members</p>
                                                    </div>
                                                    <Chip size="sm" color="primary" variant="flat">{dept.requests.total} requests</Chip>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                                        <p className="text-xs text-zinc-500">Total Days</p>
                                                        <p className="font-semibold">{dept.totalStaffDays}</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                                        <p className="text-xs text-zinc-500">Avg/Staff</p>
                                                        <p className="font-semibold">{dept.coverage.averageDaysPerStaff}</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-success-50 dark:bg-success-900/20">
                                                        <p className="text-xs text-zinc-500">Approval Rate</p>
                                                        <p className="font-semibold text-success-600">{dept.approvalMetrics.approvalRate}%</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                                        <p className="text-xs text-zinc-500">Avg Processing</p>
                                                        <p className="font-semibold">{dept.approvalMetrics.avgProcessingTime}h</p>
                                                    </div>
                                                </div>

                                                {Object.keys(dept.requests.byType).length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                                        {Object.entries(dept.requests.byType).map(([type, data]: [string, any]) => (
                                                            <Chip
                                                                key={type}
                                                                size="sm"
                                                                variant="flat"
                                                                style={{ backgroundColor: `${LEAVE_TYPE_COLORS[type]}20`, color: LEAVE_TYPE_COLORS[type] }}
                                                            >
                                                                {type}: {data.count}
                                                            </Chip>
                                                        ))}
                                                    </div>
                                                )}
                                            </CardBody>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <EmptyState icon={Building2} message="No department data available" />
                        )}
                    </Tab>
                </Tabs>
            </div>
        </AppLayout>
    )
}

// Empty State Component
function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
    return (
        <Card className="bg-content1 border border-zinc-200 dark:border-zinc-800">
            <CardBody className="p-12 text-center">
                <Icon className="size-12 mx-auto text-zinc-400 mb-4" />
                <p className="text-zinc-500">{message}</p>
            </CardBody>
        </Card>
    )
}

export async function loader({ request }: LoaderFunctionArgs) {
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
