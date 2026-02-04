import {
    addToast,
    Button,
    Card,
    CardBody,
    Chip,
    Divider,
    Input,
    Select,
    SelectItem,
    Spinner,
    Tab,
    Tabs,
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
    FileBarChart,
    FileText,
    PieChart,
    TrendingUp,
    Users,
    Building2,
    Clock,
    AlertTriangle,
} from "lucide-react"
import { LeaveTypeChip } from "~/ui/components/chips"

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

    // Fetch departments for filter
    const { data: departmentsData } = useSWR(
        `${baseUrl}/departments`,
        fetcher(sessionData.token as string)
    )

    // Fetch leave requests report
    const { data: leaveRequestsReport, isLoading: leaveRequestsLoading } = useSWR(
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
    const { data: balancesReport, isLoading: balancesLoading } = useSWR(
        currentTab === "balances"
            ? `${baseUrl}/reports?op=leave-balances&year=${filters.year}${
                  filters.departmentId ? `&departmentId=${filters.departmentId}` : ""
              }${filters.leaveType ? `&leaveType=${filters.leaveType}` : ""}`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch utilization report
    const { data: utilizationReport, isLoading: utilizationLoading } = useSWR(
        currentTab === "utilization"
            ? `${baseUrl}/reports?op=utilization&year=${filters.year}${
                  filters.departmentId ? `&departmentId=${filters.departmentId}` : ""
              }`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch department summary report
    const { data: deptSummaryReport, isLoading: deptSummaryLoading } = useSWR(
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

    // Handle export
    const handleExport = async (reportType: string, format: "csv" | "json" = "csv") => {
        setIsExporting(true)
        try {
            const params = new URLSearchParams({
                op: reportType,
                format,
                startDate: filters.startDate,
                endDate: filters.endDate,
                year: filters.year,
            })

            if (filters.departmentId) params.append("departmentId", filters.departmentId)
            if (filters.leaveType) params.append("leaveType", filters.leaveType)
            if (filters.status) params.append("status", filters.status)

            const response = await axios.get(`${baseUrl}/reports?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${sessionData?.token}`,
                },
            })

            if (response.data?.data?.csv) {
                // Download CSV
                const blob = new Blob([response.data.data.csv], { type: "text/csv" })
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = response.data.data.filename || `report-${reportType}.csv`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)

                addToast({
                    color: "success",
                    title: "Export Complete",
                    description: "Report downloaded successfully",
                })
            }
        } catch (error: any) {
            console.error("Export error:", error)
            addToast({
                color: "danger",
                title: "Export Failed",
                description: error.response?.data?.message || "Failed to export report",
            })
        } finally {
            setIsExporting(false)
        }
    }

    // Stats card component
    const StatCard = ({
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
        color?: "default" | "success" | "warning" | "danger" | "primary"
    }) => (
        <Card className='border border-zinc-200 dark:border-zinc-800'>
            <CardBody className='p-4'>
                <div className='flex items-start justify-between'>
                    <div>
                        <p className='text-xs text-zinc-500 uppercase tracking-wider'>
                            {title}
                        </p>
                        <p className='text-2xl font-bold mt-1'>{value}</p>
                        {subtitle && (
                            <p className='text-xs text-zinc-500 mt-1'>{subtitle}</p>
                        )}
                    </div>
                    <div
                        className={`size-10 rounded-lg flex items-center justify-center ${
                            color === "success"
                                ? "bg-success-100 dark:bg-success-900/20"
                                : color === "warning"
                                ? "bg-warning-100 dark:bg-warning-900/20"
                                : color === "danger"
                                ? "bg-danger-100 dark:bg-danger-900/20"
                                : color === "primary"
                                ? "bg-primary-100 dark:bg-primary-900/20"
                                : "bg-zinc-100 dark:bg-zinc-800"
                        }`}
                    >
                        <Icon
                            className={`size-5 ${
                                color === "success"
                                    ? "text-success-600"
                                    : color === "warning"
                                    ? "text-warning-600"
                                    : color === "danger"
                                    ? "text-danger-600"
                                    : color === "primary"
                                    ? "text-primary-600"
                                    : "text-zinc-600"
                            }`}
                        />
                    </div>
                </div>
            </CardBody>
        </Card>
    )

    if (!canViewReports) {
        return (
            <AppLayout user={sessionData?.user}>
                <div className='flex flex-col items-center justify-center py-20'>
                    <AlertTriangle className='size-12 text-warning-500 mb-4' />
                    <h2 className='text-xl font-semibold'>Access Denied</h2>
                    <p className='text-zinc-500 mt-2'>
                        You don't have permission to view reports.
                    </p>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout user={sessionData?.user}>
            <div className='flex flex-col gap-6 pb-8'>
                {/* Header */}
                <div>
                    <h1 className='text-2xl font-bold'>Reports</h1>
                    <p className='text-sm text-zinc-500'>
                        View and export leave reports and analytics
                    </p>
                </div>

                {/* Tabs */}
                <Tabs
                    selectedKey={currentTab}
                    onSelectionChange={handleTabChange}
                    color='warning'
                    variant='underlined'
                    classNames={{
                        tabList: "gap-6 flex-wrap",
                    }}
                >
                    {/* Leave Requests Report */}
                    <Tab
                        key='leave-requests'
                        title={
                            <div className='flex items-center gap-2'>
                                <FileText className='size-4' />
                                <span>Leave Requests</span>
                            </div>
                        }
                    >
                        <div className='mt-6 space-y-6'>
                            {/* Filters */}
                            <Card className='border border-zinc-200 dark:border-zinc-800'>
                                <CardBody className='p-4'>
                                    <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4'>
                                        <Input
                                            label='Start Date'
                                            type='date'
                                            size='sm'
                                            variant='bordered'
                                            value={filters.startDate}
                                            onValueChange={(v) =>
                                                setFilters({ ...filters, startDate: v })
                                            }
                                        />
                                        <Input
                                            label='End Date'
                                            type='date'
                                            size='sm'
                                            variant='bordered'
                                            value={filters.endDate}
                                            onValueChange={(v) =>
                                                setFilters({ ...filters, endDate: v })
                                            }
                                        />
                                        <Select
                                            label='Department'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.departmentId
                                                    ? [filters.departmentId]
                                                    : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    departmentId:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {departmentsData?.data?.departments?.map(
                                                (d: any) => (
                                                    <SelectItem key={d._id}>
                                                        {d.name}
                                                    </SelectItem>
                                                )
                                            ) || []}
                                        </Select>
                                        <Select
                                            label='Leave Type'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.leaveType ? [filters.leaveType] : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    leaveType:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {Object.values(LeaveTypes).map((type) => (
                                                <SelectItem key={type}>
                                                    {type.charAt(0).toUpperCase() +
                                                        type.slice(1)}
                                                </SelectItem>
                                            ))}
                                        </Select>
                                        <Select
                                            label='Status'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.status ? [filters.status] : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    status:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {Object.values(LeaveStatus).map((status) => (
                                                <SelectItem key={status}>
                                                    {status.replace("_", " ").toUpperCase()}
                                                </SelectItem>
                                            ))}
                                        </Select>
                                        <div className='flex items-end'>
                                            <Button
                                                color='warning'
                                                size='sm'
                                                startContent={<Download className='size-4' />}
                                                onPress={() =>
                                                    handleExport("leave-requests", "csv")
                                                }
                                                isLoading={isExporting}
                                            >
                                                Export CSV
                                            </Button>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>

                            {/* Stats */}
                            {leaveRequestsLoading ? (
                                <div className='flex justify-center py-8'>
                                    <Spinner />
                                </div>
                            ) : leaveRequestsReport?.data?.statistics ? (
                                <>
                                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                        <StatCard
                                            title='Total Requests'
                                            value={
                                                leaveRequestsReport.data.statistics.total
                                            }
                                            icon={FileText}
                                            color='primary'
                                        />
                                        <StatCard
                                            title='Total Working Days'
                                            value={
                                                leaveRequestsReport.data.statistics
                                                    .totalWorkingDays
                                            }
                                            icon={Calendar}
                                            color='warning'
                                        />
                                        <StatCard
                                            title='Approved'
                                            value={
                                                leaveRequestsReport.data.statistics
                                                    .byStatus?.approved || 0
                                            }
                                            icon={TrendingUp}
                                            color='success'
                                        />
                                        <StatCard
                                            title='Pending'
                                            value={
                                                (leaveRequestsReport.data.statistics
                                                    .byStatus?.pending || 0) +
                                                (leaveRequestsReport.data.statistics
                                                    .byStatus?.endorsed || 0)
                                            }
                                            icon={Clock}
                                            color='warning'
                                        />
                                    </div>

                                    {/* By Leave Type */}
                                    <Card className='border border-zinc-200 dark:border-zinc-800'>
                                        <CardBody className='p-4'>
                                            <h3 className='font-semibold mb-4'>
                                                By Leave Type
                                            </h3>
                                            <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
                                                {Object.entries(
                                                    leaveRequestsReport.data.statistics
                                                        .byLeaveType || {}
                                                ).map(([type, data]: [string, any]) => (
                                                    <div
                                                        key={type}
                                                        className='p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg'
                                                    >
                                                        <LeaveTypeChip
                                                            type={type as LeaveTypes}
                                                        />
                                                        <p className='text-xl font-bold mt-2'>
                                                            {data.count}
                                                        </p>
                                                        <p className='text-xs text-zinc-500'>
                                                            {data.days} days
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardBody>
                                    </Card>

                                    {/* Top Staff */}
                                    {leaveRequestsReport.data.statistics.topStaff
                                        ?.length > 0 && (
                                        <Card className='border border-zinc-200 dark:border-zinc-800'>
                                            <CardBody className='p-4'>
                                                <h3 className='font-semibold mb-4'>
                                                    Top Leave Takers
                                                </h3>
                                                <div className='space-y-2'>
                                                    {leaveRequestsReport.data.statistics.topStaff
                                                        .slice(0, 5)
                                                        .map((staff: any, i: number) => (
                                                            <div
                                                                key={i}
                                                                className='flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg'
                                                            >
                                                                <div className='flex items-center gap-3'>
                                                                    <span className='text-sm font-medium text-zinc-400'>
                                                                        #{i + 1}
                                                                    </span>
                                                                    <div>
                                                                        <p className='font-medium'>
                                                                            {staff.name}
                                                                        </p>
                                                                        <p className='text-xs text-zinc-500'>
                                                                            {staff.staffId}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <Chip
                                                                    size='sm'
                                                                    color='warning'
                                                                    variant='flat'
                                                                >
                                                                    {staff.totalDays} days
                                                                </Chip>
                                                            </div>
                                                        ))}
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}
                                </>
                            ) : (
                                <Card className='border border-zinc-200 dark:border-zinc-800'>
                                    <CardBody className='p-8 text-center'>
                                        <FileBarChart className='size-12 mx-auto text-zinc-400 mb-3' />
                                        <p className='text-zinc-500'>
                                            No data available for the selected period
                                        </p>
                                    </CardBody>
                                </Card>
                            )}
                        </div>
                    </Tab>

                    {/* Leave Balances Report */}
                    <Tab
                        key='balances'
                        title={
                            <div className='flex items-center gap-2'>
                                <PieChart className='size-4' />
                                <span>Balances</span>
                            </div>
                        }
                    >
                        <div className='mt-6 space-y-6'>
                            {/* Filters */}
                            <Card className='border border-zinc-200 dark:border-zinc-800'>
                                <CardBody className='p-4'>
                                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                        <Select
                                            label='Year'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={[filters.year]}
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    year: Array.from(keys)[0] as string,
                                                })
                                            }
                                        >
                                            {[currentYear - 1, currentYear, currentYear + 1].map(
                                                (y) => (
                                                    <SelectItem key={y.toString()}>
                                                        {y}
                                                    </SelectItem>
                                                )
                                            )}
                                        </Select>
                                        <Select
                                            label='Department'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.departmentId
                                                    ? [filters.departmentId]
                                                    : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    departmentId:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {departmentsData?.data?.departments?.map(
                                                (d: any) => (
                                                    <SelectItem key={d._id}>
                                                        {d.name}
                                                    </SelectItem>
                                                )
                                            ) || []}
                                        </Select>
                                        <Select
                                            label='Leave Type'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.leaveType ? [filters.leaveType] : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    leaveType:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {Object.values(LeaveTypes).map((type) => (
                                                <SelectItem key={type}>
                                                    {type.charAt(0).toUpperCase() +
                                                        type.slice(1)}
                                                </SelectItem>
                                            ))}
                                        </Select>
                                        <div className='flex items-end'>
                                            <Button
                                                color='warning'
                                                size='sm'
                                                startContent={<Download className='size-4' />}
                                                onPress={() =>
                                                    handleExport("leave-balances", "csv")
                                                }
                                                isLoading={isExporting}
                                            >
                                                Export CSV
                                            </Button>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>

                            {/* Stats */}
                            {balancesLoading ? (
                                <div className='flex justify-center py-8'>
                                    <Spinner />
                                </div>
                            ) : balancesReport?.data?.statistics ? (
                                <>
                                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                        <StatCard
                                            title='Total Allocated'
                                            value={
                                                balancesReport.data.statistics.totals
                                                    .totalAllocated
                                            }
                                            subtitle='days'
                                            icon={Calendar}
                                            color='primary'
                                        />
                                        <StatCard
                                            title='Total Used'
                                            value={
                                                balancesReport.data.statistics.totals
                                                    .totalUsed
                                            }
                                            subtitle='days'
                                            icon={TrendingUp}
                                            color='warning'
                                        />
                                        <StatCard
                                            title='Total Remaining'
                                            value={
                                                balancesReport.data.statistics.totals
                                                    .totalRemaining
                                            }
                                            subtitle='days'
                                            icon={PieChart}
                                            color='success'
                                        />
                                        <StatCard
                                            title='Utilization Rate'
                                            value={`${balancesReport.data.statistics.averages.utilizationPercent}%`}
                                            icon={BarChart3}
                                            color={
                                                balancesReport.data.statistics.averages
                                                    .utilizationPercent > 80
                                                    ? "danger"
                                                    : balancesReport.data.statistics.averages
                                                          .utilizationPercent > 50
                                                    ? "warning"
                                                    : "success"
                                            }
                                        />
                                    </div>

                                    {/* Low Balance Alerts */}
                                    {balancesReport.data.statistics.lowBalance?.length >
                                        0 && (
                                        <Card className='border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/10'>
                                            <CardBody className='p-4'>
                                                <div className='flex items-center gap-2 mb-4'>
                                                    <AlertTriangle className='size-5 text-danger-600' />
                                                    <h3 className='font-semibold text-danger-700 dark:text-danger-400'>
                                                        Low Balance Alerts (
                                                        {
                                                            balancesReport.data.statistics
                                                                .lowBalance.length
                                                        }
                                                        )
                                                    </h3>
                                                </div>
                                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2'>
                                                    {balancesReport.data.statistics.lowBalance
                                                        .slice(0, 9)
                                                        .map((item: any, i: number) => (
                                                            <div
                                                                key={i}
                                                                className='flex items-center justify-between p-2 bg-white dark:bg-zinc-900 rounded-lg'
                                                            >
                                                                <div>
                                                                    <p className='text-sm font-medium'>
                                                                        {item.staff.name}
                                                                    </p>
                                                                    <p className='text-xs text-zinc-500'>
                                                                        {item.leaveType}
                                                                    </p>
                                                                </div>
                                                                <Chip
                                                                    size='sm'
                                                                    color='danger'
                                                                    variant='flat'
                                                                >
                                                                    {item.remaining} days left
                                                                </Chip>
                                                            </div>
                                                        ))}
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}

                                    {/* By Leave Type */}
                                    <Card className='border border-zinc-200 dark:border-zinc-800'>
                                        <CardBody className='p-4'>
                                            <h3 className='font-semibold mb-4'>
                                                Balances by Leave Type
                                            </h3>
                                            <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
                                                {Object.entries(
                                                    balancesReport.data.statistics
                                                        .byLeaveType || {}
                                                ).map(([type, data]: [string, any]) => (
                                                    <div
                                                        key={type}
                                                        className='p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg'
                                                    >
                                                        <LeaveTypeChip
                                                            type={type as LeaveTypes}
                                                        />
                                                        <div className='mt-2 space-y-1'>
                                                            <div className='flex justify-between text-xs'>
                                                                <span className='text-zinc-500'>
                                                                    Allocated
                                                                </span>
                                                                <span>
                                                                    {data.totalAllocated}
                                                                </span>
                                                            </div>
                                                            <div className='flex justify-between text-xs'>
                                                                <span className='text-zinc-500'>
                                                                    Used
                                                                </span>
                                                                <span>{data.totalUsed}</span>
                                                            </div>
                                                            <div className='flex justify-between text-xs font-medium'>
                                                                <span className='text-zinc-500'>
                                                                    Utilization
                                                                </span>
                                                                <span>
                                                                    {data.avgUtilization}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardBody>
                                    </Card>
                                </>
                            ) : (
                                <Card className='border border-zinc-200 dark:border-zinc-800'>
                                    <CardBody className='p-8 text-center'>
                                        <PieChart className='size-12 mx-auto text-zinc-400 mb-3' />
                                        <p className='text-zinc-500'>
                                            No balance data available
                                        </p>
                                    </CardBody>
                                </Card>
                            )}
                        </div>
                    </Tab>

                    {/* Utilization Report */}
                    <Tab
                        key='utilization'
                        title={
                            <div className='flex items-center gap-2'>
                                <BarChart3 className='size-4' />
                                <span>Utilization</span>
                            </div>
                        }
                    >
                        <div className='mt-6 space-y-6'>
                            {/* Filters */}
                            <Card className='border border-zinc-200 dark:border-zinc-800'>
                                <CardBody className='p-4'>
                                    <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                                        <Select
                                            label='Year'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={[filters.year]}
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    year: Array.from(keys)[0] as string,
                                                })
                                            }
                                        >
                                            {[currentYear - 1, currentYear, currentYear + 1].map(
                                                (y) => (
                                                    <SelectItem key={y.toString()}>
                                                        {y}
                                                    </SelectItem>
                                                )
                                            )}
                                        </Select>
                                        <Select
                                            label='Department'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.departmentId
                                                    ? [filters.departmentId]
                                                    : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    departmentId:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {departmentsData?.data?.departments?.map(
                                                (d: any) => (
                                                    <SelectItem key={d._id}>
                                                        {d.name}
                                                    </SelectItem>
                                                )
                                            ) || []}
                                        </Select>
                                    </div>
                                </CardBody>
                            </Card>

                            {/* Stats */}
                            {utilizationLoading ? (
                                <div className='flex justify-center py-8'>
                                    <Spinner />
                                </div>
                            ) : utilizationReport?.data?.utilization ? (
                                <>
                                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                        <StatCard
                                            title='Overall Utilization'
                                            value={`${utilizationReport.data.utilization.overall.utilizationRate}%`}
                                            icon={BarChart3}
                                            color={
                                                utilizationReport.data.utilization.overall
                                                    .utilizationRate > 80
                                                    ? "danger"
                                                    : utilizationReport.data.utilization
                                                          .overall.utilizationRate > 50
                                                    ? "warning"
                                                    : "success"
                                            }
                                        />
                                        <StatCard
                                            title='Total Allocated'
                                            value={
                                                utilizationReport.data.utilization.overall
                                                    .totalAllocated
                                            }
                                            subtitle='days'
                                            icon={Calendar}
                                            color='primary'
                                        />
                                        <StatCard
                                            title='Total Used'
                                            value={
                                                utilizationReport.data.utilization.overall
                                                    .totalUsed
                                            }
                                            subtitle='days'
                                            icon={TrendingUp}
                                            color='warning'
                                        />
                                        <StatCard
                                            title='Total Remaining'
                                            value={
                                                utilizationReport.data.utilization.overall
                                                    .totalRemaining
                                            }
                                            subtitle='days'
                                            icon={PieChart}
                                            color='success'
                                        />
                                    </div>

                                    {/* Recommendations */}
                                    {utilizationReport.data.utilization.recommendations
                                        ?.length > 0 && (
                                        <Card className='border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/10'>
                                            <CardBody className='p-4'>
                                                <h3 className='font-semibold text-warning-700 dark:text-warning-400 mb-3'>
                                                    Recommendations
                                                </h3>
                                                <ul className='space-y-2'>
                                                    {utilizationReport.data.utilization.recommendations.map(
                                                        (rec: any, i: number) => (
                                                            <li
                                                                key={i}
                                                                className='text-sm text-warning-700 dark:text-warning-400'
                                                            >
                                                                {rec.message}
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            </CardBody>
                                        </Card>
                                    )}

                                    {/* Top Consumers */}
                                    {utilizationReport.data.utilization.topConsumers
                                        ?.length > 0 && (
                                        <Card className='border border-zinc-200 dark:border-zinc-800'>
                                            <CardBody className='p-4'>
                                                <h3 className='font-semibold mb-4'>
                                                    Top Leave Consumers
                                                </h3>
                                                <div className='space-y-2'>
                                                    {utilizationReport.data.utilization.topConsumers.map(
                                                        (item: any, i: number) => (
                                                            <div
                                                                key={i}
                                                                className='flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg'
                                                            >
                                                                <div>
                                                                    <p className='font-medium'>
                                                                        {item.staff.name}
                                                                    </p>
                                                                    <p className='text-xs text-zinc-500'>
                                                                        {item.staff.department}
                                                                    </p>
                                                                </div>
                                                                <div className='text-right'>
                                                                    <Chip
                                                                        size='sm'
                                                                        color={
                                                                            item.utilizationRate >
                                                                            80
                                                                                ? "danger"
                                                                                : item.utilizationRate >
                                                                                  50
                                                                                ? "warning"
                                                                                : "success"
                                                                        }
                                                                        variant='flat'
                                                                    >
                                                                        {item.utilizationRate}%
                                                                    </Chip>
                                                                    <p className='text-xs text-zinc-500 mt-1'>
                                                                        {item.daysUsed} /{" "}
                                                                        {item.daysAllocated} days
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}

                                    {/* Department Comparisons */}
                                    {Object.keys(
                                        utilizationReport.data.utilization
                                            .departmentComparisons || {}
                                    ).length > 0 && (
                                        <Card className='border border-zinc-200 dark:border-zinc-800'>
                                            <CardBody className='p-4'>
                                                <h3 className='font-semibold mb-4'>
                                                    Department Comparisons
                                                </h3>
                                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                                                    {Object.entries(
                                                        utilizationReport.data.utilization
                                                            .departmentComparisons
                                                    ).map(
                                                        ([dept, data]: [string, any]) => (
                                                            <div
                                                                key={dept}
                                                                className='p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg'
                                                            >
                                                                <div className='flex items-center justify-between mb-2'>
                                                                    <span className='font-medium'>
                                                                        {dept}
                                                                    </span>
                                                                    <Chip
                                                                        size='sm'
                                                                        color={
                                                                            data.utilizationRate >
                                                                            80
                                                                                ? "danger"
                                                                                : data.utilizationRate >
                                                                                  50
                                                                                ? "warning"
                                                                                : "success"
                                                                        }
                                                                        variant='flat'
                                                                    >
                                                                        {data.utilizationRate}%
                                                                    </Chip>
                                                                </div>
                                                                <div className='space-y-1 text-xs'>
                                                                    <div className='flex justify-between'>
                                                                        <span className='text-zinc-500'>
                                                                            Staff
                                                                        </span>
                                                                        <span>
                                                                            {data.staffCount}
                                                                        </span>
                                                                    </div>
                                                                    <div className='flex justify-between'>
                                                                        <span className='text-zinc-500'>
                                                                            Used/Allocated
                                                                        </span>
                                                                        <span>
                                                                            {data.used}/
                                                                            {data.allocated}
                                                                        </span>
                                                                    </div>
                                                                    <div className='flex justify-between'>
                                                                        <span className='text-zinc-500'>
                                                                            Avg/Staff
                                                                        </span>
                                                                        <span>
                                                                            {data.avgPerStaff}{" "}
                                                                            days
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}
                                </>
                            ) : (
                                <Card className='border border-zinc-200 dark:border-zinc-800'>
                                    <CardBody className='p-8 text-center'>
                                        <BarChart3 className='size-12 mx-auto text-zinc-400 mb-3' />
                                        <p className='text-zinc-500'>
                                            No utilization data available
                                        </p>
                                    </CardBody>
                                </Card>
                            )}
                        </div>
                    </Tab>

                    {/* Department Summary */}
                    <Tab
                        key='department-summary'
                        title={
                            <div className='flex items-center gap-2'>
                                <Building2 className='size-4' />
                                <span>By Department</span>
                            </div>
                        }
                    >
                        <div className='mt-6 space-y-6'>
                            {/* Filters */}
                            <Card className='border border-zinc-200 dark:border-zinc-800'>
                                <CardBody className='p-4'>
                                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                        <Input
                                            label='Start Date'
                                            type='date'
                                            size='sm'
                                            variant='bordered'
                                            value={filters.startDate}
                                            onValueChange={(v) =>
                                                setFilters({ ...filters, startDate: v })
                                            }
                                        />
                                        <Input
                                            label='End Date'
                                            type='date'
                                            size='sm'
                                            variant='bordered'
                                            value={filters.endDate}
                                            onValueChange={(v) =>
                                                setFilters({ ...filters, endDate: v })
                                            }
                                        />
                                        <Select
                                            label='Department'
                                            size='sm'
                                            variant='bordered'
                                            selectedKeys={
                                                filters.departmentId
                                                    ? [filters.departmentId]
                                                    : []
                                            }
                                            onSelectionChange={(keys) =>
                                                setFilters({
                                                    ...filters,
                                                    departmentId:
                                                        (Array.from(keys)[0] as string) || "",
                                                })
                                            }
                                        >
                                            {departmentsData?.data?.departments?.map(
                                                (d: any) => (
                                                    <SelectItem key={d._id}>
                                                        {d.name}
                                                    </SelectItem>
                                                )
                                            ) || []}
                                        </Select>
                                    </div>
                                </CardBody>
                            </Card>

                            {/* Stats */}
                            {deptSummaryLoading ? (
                                <div className='flex justify-center py-8'>
                                    <Spinner />
                                </div>
                            ) : deptSummaryReport?.data?.departments?.length > 0 ? (
                                <>
                                    {/* Overall Stats */}
                                    {deptSummaryReport.data.overall && (
                                        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                            <StatCard
                                                title='Total Departments'
                                                value={
                                                    deptSummaryReport.data.overall
                                                        .totalDepartments
                                                }
                                                icon={Building2}
                                                color='primary'
                                            />
                                            <StatCard
                                                title='Total Requests'
                                                value={
                                                    deptSummaryReport.data.overall
                                                        .totalRequests
                                                }
                                                icon={FileText}
                                                color='warning'
                                            />
                                            <StatCard
                                                title='Total Staff Days'
                                                value={
                                                    deptSummaryReport.data.overall
                                                        .totalStaffDays
                                                }
                                                icon={Calendar}
                                                color='success'
                                            />
                                            <StatCard
                                                title='Avg Requests/Dept'
                                                value={
                                                    deptSummaryReport.data.overall
                                                        .avgRequestsPerDept
                                                }
                                                icon={BarChart3}
                                            />
                                        </div>
                                    )}

                                    {/* Department Cards */}
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                        {deptSummaryReport.data.departments.map(
                                            (dept: any) => (
                                                <Card
                                                    key={dept.department.id}
                                                    className='border border-zinc-200 dark:border-zinc-800'
                                                >
                                                    <CardBody className='p-4'>
                                                        <div className='flex items-center justify-between mb-4'>
                                                            <div>
                                                                <h3 className='font-semibold'>
                                                                    {dept.department.name}
                                                                </h3>
                                                                <p className='text-xs text-zinc-500'>
                                                                    {dept.staffCount} staff
                                                                </p>
                                                            </div>
                                                            <Chip
                                                                size='sm'
                                                                color='warning'
                                                                variant='flat'
                                                            >
                                                                {dept.requests.total} requests
                                                            </Chip>
                                                        </div>

                                                        <Divider className='my-3' />

                                                        <div className='grid grid-cols-2 gap-4 text-sm'>
                                                            <div>
                                                                <p className='text-zinc-500 text-xs'>
                                                                    Total Days
                                                                </p>
                                                                <p className='font-semibold'>
                                                                    {dept.totalStaffDays}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className='text-zinc-500 text-xs'>
                                                                    Avg/Staff
                                                                </p>
                                                                <p className='font-semibold'>
                                                                    {
                                                                        dept.coverage
                                                                            .averageDaysPerStaff
                                                                    }
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className='text-zinc-500 text-xs'>
                                                                    Approval Rate
                                                                </p>
                                                                <p className='font-semibold text-success-600'>
                                                                    {
                                                                        dept.approvalMetrics
                                                                            .approvalRate
                                                                    }
                                                                    %
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className='text-zinc-500 text-xs'>
                                                                    Avg Processing
                                                                </p>
                                                                <p className='font-semibold'>
                                                                    {
                                                                        dept.approvalMetrics
                                                                            .avgProcessingTime
                                                                    }
                                                                    h
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Leave Type Breakdown */}
                                                        {Object.keys(dept.requests.byType)
                                                            .length > 0 && (
                                                            <>
                                                                <Divider className='my-3' />
                                                                <div className='flex flex-wrap gap-2'>
                                                                    {Object.entries(
                                                                        dept.requests.byType
                                                                    ).map(
                                                                        ([
                                                                            type,
                                                                            data,
                                                                        ]: [
                                                                            string,
                                                                            any
                                                                        ]) => (
                                                                            <Chip
                                                                                key={type}
                                                                                size='sm'
                                                                                variant='flat'
                                                                            >
                                                                                {type}:{" "}
                                                                                {data.count}
                                                                            </Chip>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </CardBody>
                                                </Card>
                                            )
                                        )}
                                    </div>
                                </>
                            ) : (
                                <Card className='border border-zinc-200 dark:border-zinc-800'>
                                    <CardBody className='p-8 text-center'>
                                        <Building2 className='size-12 mx-auto text-zinc-400 mb-3' />
                                        <p className='text-zinc-500'>
                                            No department data available
                                        </p>
                                    </CardBody>
                                </Card>
                            )}
                        </div>
                    </Tab>
                </Tabs>
            </div>
        </AppLayout>
    )
}

export async function loader({ request }: LoaderFunctionArgs) {
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/login-email")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
