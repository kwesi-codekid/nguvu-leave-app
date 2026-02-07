import {
    Button,
    Card,
    CardBody,
    CardHeader,
    Chip,
    Divider,
    Progress,
    Spinner,
    Avatar,
    Skeleton,
} from "@heroui/react"
import { LoaderFunctionArgs, redirect, useLoaderData, Link } from "react-router"
import { useState, useEffect, ReactNode, Fragment } from "react"
import {
    isAuthenticated as checkAuthenticated,
    getSessionData,
} from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import {
    Users,
    Calendar,
    Clock,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    XCircle,
    CalendarDays,
    FileText,
    Activity,
    PieChart,
    BarChart3,
    Bell,
    ChevronRight,
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
    Area,
    AreaChart,
} from "recharts"
import { LeaveStatus } from "~/utils/types"

// Colors for charts
const LEAVE_TYPE_COLORS: Record<string, string> = {
    annual: "#F59E0BB3",
    sick: "#EF4444",
    maternity: "#A855F7",
    paternity: "#22C55E",
    bereavement: "#6B7280",
}

// Skeleton Loading Component
function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            {/* KPI Cards Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="bg-content1">
                        <CardBody className="p-4">
                            <Skeleton className="h-4 w-20 mb-2 rounded-lg" />
                            <Skeleton className="h-8 w-16 mb-2 rounded-lg" />
                            <Skeleton className="h-3 w-24 rounded-lg" />
                        </CardBody>
                    </Card>
                ))}
            </div>

            {/* Charts Row Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded-full" />
                            <Skeleton className="h-6 w-32 rounded-lg" />
                        </div>
                    </CardHeader>
                    <CardBody>
                        <Skeleton className="h-[250px] w-full rounded-lg" />
                    </CardBody>
                </Card>
                <Card className="bg-content1 lg:col-span-2">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded-full" />
                            <Skeleton className="h-6 w-40 rounded-lg" />
                        </div>
                    </CardHeader>
                    <CardBody>
                        <Skeleton className="h-[250px] w-full rounded-lg" />
                    </CardBody>
                </Card>
            </div>

            {/* Bottom Row Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                    <Card key={i} className="bg-content1">
                        <CardHeader className="pb-0">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded-full" />
                                <Skeleton className="h-6 w-32 rounded-lg" />
                            </div>
                        </CardHeader>
                        <CardBody className="space-y-4">
                            {[...Array(4)].map((_, j) => (
                                <div key={j} className="flex items-center justify-between">
                                    <Skeleton className="h-4 w-24 rounded-lg" />
                                    <Skeleton className="h-6 w-16 rounded-full" />
                                </div>
                            ))}
                        </CardBody>
                    </Card>
                ))}
            </div>

            {/* Quick Stats Row Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800">
                        <CardBody className="p-4">
                            <Skeleton className="h-4 w-24 mb-2 rounded-lg" />
                            <Skeleton className="h-10 w-12 mb-2 rounded-lg" />
                            <Skeleton className="h-3 w-32 rounded-lg" />
                        </CardBody>
                    </Card>
                ))}
            </div>
        </div>
    )
}

// KPI Card Component
function KPICard({
    className,
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    color = "default",
}: {
    className?: string
    title: string
    value: string | number
    subtitle?: string
    icon: any
    trend?: { value: number; label: string }
    color?: "default" | "primary" | "success" | "warning" | "danger"
}) {
    const colorClasses = {
        default: "bg-danger-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
        primary: "bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-400",
        success: "bg-success-100 dark:bg-success-800 text-success-600 dark:text-success-400",
        warning: "bg-warning-100 dark:bg-warning-800 text-warning-600 dark:text-warning-400",
        danger: "bg-danger-100 dark:bg-danger-800 text-danger-600 dark:text-danger-400",
    }
    const cardBgColors={
        default: "bg-danger-100 dark:bg-gradient-to-br from-zinc-700 to-zinc-800",
        primary: "bg-primary-100 dark:bg-gradient-to-br from-primary/70 to-primary/80",
        success: "bg-success-100 dark:bg-gradient-to-br from-success/70 to-success/80",
        warning: "bg-warning-100 dark:bg-gradient-to-br from-warning/70 to-warning/80",
        danger: "bg-danger-100 dark:bg-gradient-to-br from-danger/70 to-danger/80",
    }

    return (
        <Card  className={`${cardBgColors[color]} hover:scale-[1.01] transition-all duration-300 border border-black/10 dark:border-white/20 shadow-none`}>
            <CardBody className="p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <p className="text-sm text-zinc-500 dark:text-white mb-1">{title}</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
                        {subtitle && (
                            <p className="text-xs text-zinc-500 dark:text-white mt-1">{subtitle}</p>
                        )}
                        {trend && (
                            <div className="flex items-center gap-1 mt-2">
                                <TrendingUp className={`size-3 ${trend.value >= 0 ? "text-success-500" : "text-danger-500"}`} />
                                <span className={`text-xs ${trend.value >= 0 ? "text-success-500" : "text-danger-500"}`}>
                                    {trend.value >= 0 ? "+" : ""}{trend.value}%
                                </span>
                                <span className="text-xs text-zinc-400">{trend.label}</span>
                            </div>
                        )}
                    </div>
                    <div className={`size-12 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
                        <Icon className="size-6" />
                    </div>
                </div>
            </CardBody>
        </Card>
    )
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900 dark:bg-zinc-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                <p className="font-medium">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} style={{ color: entry.color }}>
                        {entry.name}: {entry.value}
                    </p>
                ))}
            </div>
        )
    }
    return null
}

// HR Dashboard Component
function HRDashboard({ data }: { data: any }) {
    const { kpis, leaveMix, monthlyTrend, lowBalanceAlerts, upcomingPeaks, callIns, systemHealth, quickStats } = data

    // Prepare pie chart data
    const pieData = leaveMix.map((item: any) => ({
        name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        value: item.count,
        days: item.totalDays,
        color: LEAVE_TYPE_COLORS[item.type] || "#6B7280",
    }))

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                    title="Total Staff"
                    value={kpis.totalStaff}
                    subtitle={`${kpis.activeStaff} active`}
                    icon={Users}
                    color="primary"
                />
                <KPICard
                    title="On Leave Today"
                    value={kpis.onLeaveToday}
                    subtitle="Staff members"
                    icon={CalendarDays}
                    color="warning"
                />
                <KPICard
                    title="Pending Actions"
                    value={kpis.pendingEndorsements + kpis.pendingApprovals}
                    subtitle={`${kpis.pendingEndorsements} endorsements, ${kpis.pendingApprovals} approvals`}
                    icon={Clock}
                    color={kpis.pendingEndorsements + kpis.pendingApprovals > 10 ? "danger" : "default"}
                />
                <KPICard
                    title="Approval Rate"
                    value={`${kpis.approvalRate}%`}
                    subtitle="Last 30 days"
                    icon={CheckCircle}
                    color="success"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Leave Mix Pie Chart */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20 shadow-none">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <PieChart className="size-5 text-primary" />
                            <h3 className="font-semibold">Leave Distribution</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        <div className="h-[250px] outline-none" style={{ outline: 'none !important' }}>
                            <ResponsiveContainer width="100%" height="100%" className="outline-none" style={{ outline: 'none !important' }}>
                                <RechartsPieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                        color="warning"
                                    >
                                        {pieData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip content={<CustomTooltip />} />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center mt-2">
                            {pieData.map((item: any, index: number) => (
                                <div key={index} className="flex items-center gap-1.5">
                                    <div className="size-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>

                {/* Monthly Trend Chart */}
                <Card className="bg-content1 lg:col-span-2 shadow-none border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="size-5 text-primary" />
                            <h3 className="font-semibold">Monthly Trend (YTD)</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyTrend}>
                                    <defs>
                                        <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorApprovals" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                    <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="requests"
                                        stroke="#3B82F6"
                                        fillOpacity={1}
                                        fill="url(#colorRequests)"
                                        name="Requests"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="approvals"
                                        stroke="#22C55E"
                                        fillOpacity={1}
                                        fill="url(#colorApprovals)"
                                        name="Approvals"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardBody>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* System Health */}
                <Card className="bg-content1 hover:scale-[1.01] shadow-none transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <Activity className="size-5 text-primary" />
                            <h3 className="font-semibold">System Health</h3>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">Pending Actions</span>
                            <Chip
                                size="sm"
                                color={systemHealth.pendingActions > 10 ? "warning" : "success"}
                                variant="flat"
                            >
                                {systemHealth.pendingActions}
                            </Chip>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">Processing Status</span>
                            <Chip
                                size="sm"
                                color={systemHealth.processingBacklog ? "danger" : "success"}
                                variant="flat"
                            >
                                {systemHealth.processingBacklog ? "Backlog" : "Normal"}
                            </Chip>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">Low Balance Staff</span>
                            <Chip
                                size="sm"
                                color={systemHealth.lowBalanceStaff > 5 ? "warning" : "default"}
                                variant="flat"
                            >
                                {systemHealth.lowBalanceStaff}
                            </Chip>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">Upcoming Holidays</span>
                            <Chip size="sm" variant="flat">{systemHealth.upcomingHolidays}</Chip>
                        </div>
                        <Divider />
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">Avg Approval Time</span>
                            <span className="text-sm font-medium">{kpis.avgApprovalTime}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">YTD Requests</span>
                            <span className="text-sm font-medium">{kpis.requestsYTD}</span>
                        </div>
                    </CardBody>
                </Card>

                {/* Upcoming Peaks */}
                <Card className="bg-content1 hover:scale-[1.01] shadow-none transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="size-5 text-warning" />
                            <h3 className="font-semibold">Upcoming Peaks</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {upcomingPeaks.next30Days?.length > 0 ? (
                            <div className="space-y-3">
                                {upcomingPeaks.next30Days.map((peak: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                        <div>
                                            <p className="text-sm font-medium">
                                                {DateTime.fromISO(peak.date).toFormat("EEE, MMM d")}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {DateTime.fromISO(peak.date).toRelative()}
                                            </p>
                                        </div>
                                        <Chip
                                            size="sm"
                                            color={peak.staffOut > 5 ? "danger" : peak.staffOut > 3 ? "warning" : "default"}
                                            variant="flat"
                                        >
                                            {peak.staffOut} staff out
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center py-4">No peak days in next 30 days</p>
                        )}
                    </CardBody>
                </Card>

                {/* Low Balance Alerts */}
                <Card className="bg-content1 hover:scale-[1.01] shadow-none transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="size-5 text-warning" />
                                <h3 className="font-semibold">Low Balance Alerts</h3>
                            </div>
                            <Chip size="sm" variant="flat" color="warning">{lowBalanceAlerts.length}</Chip>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {lowBalanceAlerts.length > 0 ? (
                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                {lowBalanceAlerts.map((alert: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-warning-50 dark:bg-warning-900/10">
                                        <div className="flex items-center gap-2">
                                            <Avatar name={alert.staff} size="sm" />
                                            <div>
                                                <p className="text-sm font-medium">{alert.staff}</p>
                                                <p className="text-xs text-zinc-500">{alert.staffId}</p>
                                            </div>
                                        </div>
                                        <Chip size="sm" color="warning" variant="flat">
                                            {alert.remaining} days
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center py-4">No low balance alerts</p>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-primary/70 dark:bg-primary/70 text-white hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Utilization Rate</p>
                        <p className="text-3xl font-bold">{quickStats.utilizationRate}%</p>
                        <Progress
                            value={quickStats.utilizationRate}
                            className="mt-2"
                            classNames={{
                                indicator: "bg-white",
                                track: "bg-white/30",
                            }}
                            size="sm"
                        />
                    </CardBody>
                </Card>
                <Card className="bg-success/70 dark:bg-success/70 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Avg Leave/Staff</p>
                        <p className="text-3xl font-bold">{quickStats.averageLeavePerStaff}</p>
                        <p className="text-xs opacity-80 mt-1">requests per staff YTD</p>
                    </CardBody>
                </Card>
                <Card className="bg-warning/70 dark:bg-warning/70 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Call-Ins (30 days)</p>
                        <p className="text-3xl font-bold">{callIns.count}</p>
                        <p className="text-xs opacity-80 mt-1">{callIns.daysRecovered} days recovered</p>
                    </CardBody>
                </Card>
                <Card className="bg-gradient-to-br from-zinc-700 to-zinc-800 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Active Staff</p>
                        <p className="text-3xl font-bold">{kpis.activeStaff}</p>
                        <p className="text-xs opacity-80 mt-1">of {kpis.totalStaff} total</p>
                    </CardBody>
                </Card>
            </div>
        </div>
    )
}

// Manager Dashboard Component
function ManagerDashboard({ data }: { data: any }) {
    const { department, kpis, coverageNext14Days, teamUtilization, alerts, recentCallIns, departmentStats, quickActions } = data

    // Safety check
    if (!department) {
        return (
            <div className="text-center py-10">
                <p className="text-zinc-500 dark:text-zinc-400">Department data not available</p>
            </div>
        )
    }

    // Prepare coverage chart data (next 14 days)
    const coverageData = coverageNext14Days?.filter((d: any) => !d.isWeekend).slice(0, 10) || []

    // Prepare team utilization data
    const utilizationData = teamUtilization?.slice(0, 8) || []

    return (
        <div className="space-y-6">
            {/* Department Header & KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <Card className="bg-warning/70 border border-black/20 dark:border-white/20 lg:col-span-2">
                    <CardBody className="p-6">
                        <p className="text-lg opacity-90">Department</p>
                        <p className="text-2xl font-bold">{department.name}</p>
                        <p className="text-sm opacity-80 mt-1">{kpis?.teamSize || 0} team members</p>
                        <div className="flex gap-4 mt-4">
                            <Link to="/leave-requests">
                                <Button size="sm" className="bg-white/20 text-white hover:bg-white/30">
                                    <FileText className="size-4 mr-1" />
                                    Review Requests
                                </Button>
                            </Link>
                            <Link to="/leave-calendar">
                                <Button size="sm" className="bg-white/20 text-white hover:bg-white/30">
                                    <Calendar className="size-4 mr-1" />
                                    Team Calendar
                                </Button>
                            </Link>
                        </div>
                    </CardBody>
                </Card>

                <KPICard
                    title="On Leave Today"
                    value={kpis?.onLeaveToday || 0}
                    subtitle="Team members"
                    icon={CalendarDays}
                    color="warning"
                />
                <KPICard
                    title="Pending Actions"
                    value={(kpis?.pendingEndorsements || 0) + (kpis?.pendingApprovals || 0)}
                    subtitle={`${kpis?.pendingEndorsements || 0} endorsements, ${kpis?.pendingApprovals || 0} approvals`}
                    icon={Clock}
                    color={(kpis?.pendingEndorsements || 0) + (kpis?.pendingApprovals || 0) > 5 ? "danger" : "default"}
                />
                <KPICard
                    title="Approval Rate"
                    value={`${kpis?.approvalRate || 0}%`}
                    subtitle="This year"
                    icon={CheckCircle}
                    color="success"
                />
            </div>

            {/* Alerts */}
            {alerts && alerts.length > 0 && (
                <Card className="border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/10">
                    <CardBody className="p-4">
                        <div className="flex items-start gap-3">
                            <Bell className="size-5 text-warning-600 flex-shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                {alerts.map((alert: any, index: number) => (
                                    <div key={index}>
                                        <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
                                            {alert.message}
                                        </p>
                                        {alert.type === "LOW_BALANCES" && alert.details && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {alert.details.slice(0, 3).map((d: any, i: number) => (
                                                    <Chip key={i} size="sm" variant="flat" color="warning">
                                                        {d.staff}: {d.remaining} days
                                                    </Chip>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Coverage Next 14 Days */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="size-5 text-primary" />
                            <h3 className="font-semibold">Team Coverage (Next 14 Days)</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {coverageData.length > 0 ? (
                            <div className="h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={coverageData}>
                                        <defs>
                                            <linearGradient id="colorStaffOut" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                        <XAxis dataKey="dayOfWeek" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                                        <YAxis tick={{ fontSize: 11 }} stroke="#9CA3AF" allowDecimals={false} />
                                        <RechartsTooltip
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload
                                                    return (
                                                        <div className="bg-zinc-900 dark:bg-zinc-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                                                            <p className="font-medium">{data.date}</p>
                                                            <p className="text-warning-400">{data.staffOut} staff out</p>
                                                        </div>
                                                    )
                                                }
                                                return null
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="staffOut"
                                            stroke="#F59E0B"
                                            fillOpacity={1}
                                            fill="url(#colorStaffOut)"
                                            name="Staff Out"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-[250px]">
                                <p className="text-zinc-500 dark:text-zinc-400">No coverage data</p>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Department Stats */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <PieChart className="size-5 text-primary" />
                            <h3 className="font-semibold">Request Status (YTD)</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {departmentStats ? (
                            <>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={[
                                                    { name: "Pending", value: departmentStats[LeaveStatus.PENDING] || 0, color: "#F59E0B" },
                                                    { name: "Endorsed", value: departmentStats[LeaveStatus.ENDORSED] || 0, color: "#3B82F6" },
                                                    { name: "Approved", value: departmentStats[LeaveStatus.APPROVED] || 0, color: "#22C55E" },
                                                    { name: "Rejected", value: departmentStats[LeaveStatus.REJECTED] || 0, color: "#EF4444" },
                                                ].filter(d => d.value > 0)}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={75}
                                                paddingAngle={3}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {[
                                                    { name: "Pending", value: departmentStats[LeaveStatus.PENDING] || 0, color: "#F59E0B" },
                                                    { name: "Endorsed", value: departmentStats[LeaveStatus.ENDORSED] || 0, color: "#3B82F6" },
                                                    { name: "Approved", value: departmentStats[LeaveStatus.APPROVED] || 0, color: "#22C55E" },
                                                    { name: "Rejected", value: departmentStats[LeaveStatus.REJECTED] || 0, color: "#EF4444" },
                                                ].filter(d => d.value > 0).map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip content={<CustomTooltip />} />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap gap-3 justify-center">
                                    <div className="flex items-center gap-1.5">
                                        <div className="size-3 rounded-full bg-warning-500" />
                                        <span className="text-xs text-zinc-500">Pending: {departmentStats[LeaveStatus.PENDING] || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="size-3 rounded-full bg-primary-500" />
                                        <span className="text-xs text-zinc-500">Endorsed: {departmentStats[LeaveStatus.ENDORSED] || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="size-3 rounded-full bg-success-500" />
                                        <span className="text-xs text-zinc-500">Approved: {departmentStats[LeaveStatus.APPROVED] || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="size-3 rounded-full bg-danger-500" />
                                        <span className="text-xs text-zinc-500">Rejected: {departmentStats[LeaveStatus.REJECTED] || 0}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-[200px]">
                                <p className="text-zinc-500 dark:text-zinc-400">No statistics data</p>
                            </div>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Team Utilization */}
                <Card className="bg-content1 lg:col-span-2 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Users className="size-5 text-primary" />
                                <h3 className="font-semibold">Team Leave Utilization</h3>
                            </div>
                            <Link to="/staff">
                                <Button size="sm" variant="light" endContent={<ChevronRight className="size-4" />}>
                                    View All
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {utilizationData.length > 0 ? (
                            <div className="space-y-3">
                                {utilizationData.map((member: any, index: number) => (
                                    <div key={index} className="flex items-center gap-4">
                                        <Avatar name={member.staff?.name || "Unknown"} size="sm" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-medium truncate">{member.staff?.name || "Unknown"}</p>
                                                <span className="text-xs text-zinc-500">
                                                    {member.used || 0}/{member.allocated || 0} days
                                                </span>
                                            </div>
                                            <Progress
                                                value={member.utilizationRate || 0}
                                                size="sm"
                                                color={member.utilizationRate > 80 ? "danger" : member.utilizationRate > 50 ? "warning" : "primary"}
                                                className="max-w-full"
                                            />
                                        </div>
                                        <Chip size="sm" variant="flat" color={member.utilizationRate > 80 ? "danger" : member.utilizationRate > 50 ? "warning" : "default"}>
                                            {member.utilizationRate || 0}%
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center py-6">No team utilization data</p>
                        )}
                    </CardBody>
                </Card>

                {/* Recent Call-Ins */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <Activity className="size-5 text-warning" />
                            <h3 className="font-semibold">Recent Call-Ins</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {recentCallIns && recentCallIns.length > 0 ? (
                            <div className="space-y-3">
                                {recentCallIns.map((callIn: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                        <div>
                                            <p className="text-sm font-medium">{callIn.staff}</p>
                                            <p className="text-xs text-zinc-500 capitalize">{callIn.leaveType} leave</p>
                                        </div>
                                        <Chip size="sm" color="success" variant="flat">
                                            +{callIn.daysRecovered}d
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center py-6">No recent call-ins</p>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-primary/70 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Team Size</p>
                        <p className="text-3xl font-bold">{kpis?.teamSize || 0}</p>
                        <p className="text-xs opacity-80 mt-1">active members</p>
                    </CardBody>
                </Card>
                <Card className="bg-warning/70 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Pending Actions</p>
                        <p className="text-3xl font-bold">{quickActions?.pendingActions || 0}</p>
                        <p className="text-xs opacity-80 mt-1">need your attention</p>
                    </CardBody>
                </Card>
                <Card className="bg-success/70 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Upcoming Leaves</p>
                        <p className="text-3xl font-bold">{quickActions?.upcomingLeaves || 0}</p>
                        <p className="text-xs opacity-80 mt-1">next 14 days</p>
                    </CardBody>
                </Card>
                <Card className="bg-gradient-to-br from-zinc-700 to-zinc-800 text-white border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <p className="text-sm opacity-80">Avg Approval Time</p>
                        <p className="text-3xl font-bold">{kpis?.avgApprovalTime || "N/A"}</p>
                        <p className="text-xs opacity-80 mt-1">last 30 days</p>
                    </CardBody>
                </Card>
            </div>
        </div>
    )
}

// Staff Dashboard Component
function StaffDashboard({ data }: { data: any }) {
    const { profile, myBalances, requestsSummary, upcomingLeaves, recentRequests, annualAccrualProgress, alerts } = data

    // Safety check for profile data
    if (!profile) {
        return (
            <div className="text-center py-10">
                <p className="text-zinc-500 dark:text-zinc-400">Profile data not available</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Welcome & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <Card className="bg-warning/70  border border-black/20 dark:border-white/20 lg:col-span-2">
                    <CardBody className="p-6">
                        <p className="text-lg opacity-90">Welcome back,</p>
                        <p className="text-2xl font-bold">{profile.name || 'User'}</p>
                        <p className="text-sm opacity-80 mt-1">{profile.staffId || 'N/A'} - {profile.department || 'N/A'}</p>
                        <div className="flex gap-4 mt-4">
                            <Link to="/leave-requests">
                                <Button size="sm" className="bg-white/20 text-white hover:bg-white/30">
                                    <FileText className="size-4 mr-1" />
                                    My Requests
                                </Button>
                            </Link>
                            <Link to="/leave-calendar">
                                <Button size="sm" className="bg-white/20 text-white hover:bg-white/30">
                                    <Calendar className="size-4 mr-1" />
                                    Calendar
                                </Button>
                            </Link>
                        </div>
                    </CardBody>
                </Card>

                <KPICard
                    title="Pending Requests"
                    value={(requestsSummary?.pending || 0) + (requestsSummary?.endorsed || 0)}
                    subtitle={`${requestsSummary?.pending || 0} pending, ${requestsSummary?.endorsed || 0} endorsed`}
                    icon={Clock}
                    color={(requestsSummary?.pending || 0) > 0 ? "warning" : "default"}
                />
                <KPICard
                    title="Approved This Year"
                    value={requestsSummary?.approved || 0}
                    subtitle={`${requestsSummary?.total || 0} total requests`}
                    icon={CheckCircle}
                    color="success"
                />
            </div>

            {/* Alerts */}
            {alerts && alerts.length > 0 && (
                <Card className="border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/10">
                    <CardBody className="p-4">
                        <div className="flex items-start gap-3">
                            <Bell className="size-5 text-warning-600 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                {alerts.map((alert: any, index: number) => (
                                    <p key={index} className="text-sm text-warning-700 dark:text-warning-400">
                                        {alert.message}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* Leave Balances - Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Donut Chart - Balance Distribution */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <PieChart className="size-5 text-primary" />
                                <h3 className="font-semibold">Leave Balance</h3>
                            </div>
                            <Chip size="sm" variant="flat">{DateTime.now().year}</Chip>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {myBalances && myBalances.length > 0 ? (
                            <>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={myBalances.filter((b: any) => (b.total || b.used + b.remaining) > 0).map((b: any) => ({
                                                    name: b.leaveType.charAt(0).toUpperCase() + b.leaveType.slice(1),
                                                    value: b.total || (b.used + b.remaining) || 1,
                                                    used: b.used || 0,
                                                    remaining: b.remaining || 0,
                                                }))}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={75}
                                                paddingAngle={3}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {myBalances.filter((b: any) => (b.total || b.used + b.remaining) > 0).map((b: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={LEAVE_TYPE_COLORS[b.leaveType] || "#6B7280"} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        const data = payload[0].payload
                                                        return (
                                                            <div className="bg-zinc-900 dark:bg-zinc-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                                                                <p className="font-medium">{data.name}</p>
                                                                <p className="text-zinc-300">Total: {data.value} days</p>
                                                                <p className="text-zinc-300">Used: {data.used} days</p>
                                                                <p className="text-zinc-300">Remaining: {data.remaining} days</p>
                                                            </div>
                                                        )
                                                    }
                                                    return null
                                                }}
                                            />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Legend */}
                                <div className="flex flex-wrap gap-2 justify-center mt-2">
                                    {myBalances.map((b: any, index: number) => (
                                        <div key={index} className="flex items-center gap-1.5">
                                            <div className="size-2.5 rounded-full" style={{ backgroundColor: LEAVE_TYPE_COLORS[b.leaveType] || "#6B7280" }} />
                                            <span className="text-xs text-zinc-500 capitalize">{b.leaveType}: {b.remaining || 0} left</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-[200px]">
                                <p className="text-zinc-500 dark:text-zinc-400">No balance data</p>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Bar Chart - Used vs Remaining */}
                <Card className="bg-content1 lg:col-span-2 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="size-5 text-primary" />
                            <h3 className="font-semibold">Usage Overview</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {myBalances && myBalances.length > 0 ? (
                            <>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart
                                            data={myBalances.map((b: any) => ({
                                                type: b.leaveType.charAt(0).toUpperCase() + b.leaveType.slice(1),
                                                used: b.used || 0,
                                                remaining: b.remaining || 0,
                                                total: b.total || (b.used + b.remaining) || 0,
                                            }))}
                                        >
                                            <defs>
                                                <linearGradient id="colorUsedStaff" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorRemainingStaff" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                            <XAxis dataKey="type" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                                            <YAxis tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                                            <RechartsTooltip content={<CustomTooltip />} />
                                            <Area
                                                type="monotone"
                                                dataKey="used"
                                                stroke="#F59E0B"
                                                fillOpacity={1}
                                                fill="url(#colorUsedStaff)"
                                                name="Used"
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="remaining"
                                                stroke="#22C55E"
                                                fillOpacity={1}
                                                fill="url(#colorRemainingStaff)"
                                                name="Remaining"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Quick Stats */}
                                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                                    <div className="text-center">
                                        <p className="text-xl font-bold text-warning-500">
                                            {myBalances.reduce((sum: number, b: any) => sum + (b.used || 0), 0)}
                                        </p>
                                        <p className="text-xs text-zinc-500">Days Used</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-bold text-success-500">
                                            {myBalances.reduce((sum: number, b: any) => sum + (b.remaining || 0), 0)}
                                        </p>
                                        <p className="text-xs text-zinc-500">Days Remaining</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-bold text-primary">
                                            {myBalances.reduce((sum: number, b: any) => sum + (b.total || b.used + b.remaining || 0), 0)}
                                        </p>
                                        <p className="text-xs text-zinc-500">Total Allocated</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-[200px]">
                                <p className="text-zinc-500 dark:text-zinc-400">No balance data</p>
                            </div>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* Annual Accrual Progress */}
            {annualAccrualProgress && (
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardBody className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="size-5 text-primary" />
                            <h3 className="font-semibold">Annual Leave Accrual Progress</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 text-center">
                                <p className="text-2xl font-bold text-primary">{annualAccrualProgress.totalAccrued || 0}</p>
                                <p className="text-xs text-zinc-500">Days Accrued</p>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
                                <p className="text-2xl font-bold">{annualAccrualProgress.monthlyRate || 0}</p>
                                <p className="text-xs text-zinc-500">Monthly Rate</p>
                            </div>
                            <div className="p-3 rounded-xl bg-success-50 dark:bg-success-900/20 text-center">
                                <p className="text-2xl font-bold text-success-600">{annualAccrualProgress.projectedYearEnd || 0}</p>
                                <p className="text-xs text-zinc-500">Year-End Projection</p>
                            </div>
                            <div className="p-3 rounded-xl bg-warning-50 dark:bg-warning-900/20 text-center">
                                <p className="text-2xl font-bold text-warning-600">{annualAccrualProgress.percentComplete || 0}%</p>
                                <p className="text-xs text-zinc-500">Year Complete</p>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* Recent & Upcoming */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upcoming Leaves */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Calendar className="size-5 text-success" />
                                <h3 className="font-semibold">Upcoming Leaves</h3>
                            </div>
                            <Link to="/leave-requests">
                                <Button size="sm" variant="light" endContent={<ChevronRight className="size-4" />}>
                                    View All
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardBody>
                    {upcomingLeaves && Array.isArray(upcomingLeaves) && upcomingLeaves.length > 0 ? (
                        <div className="space-y-3">
                            {upcomingLeaves.map((leave: any, index: number) => {
                                const isApproved = leave.status === LeaveStatus.APPROVED
                                const isPending = leave.status === LeaveStatus.PENDING
                                const isEndorsed = leave.status === LeaveStatus.ENDORSED
                                const bgColor = isApproved
                                    ? "bg-success-50 dark:bg-success-900/10"
                                    : isPending
                                    ? "bg-warning-50 dark:bg-warning-900/10"
                                    : "bg-primary-50 dark:bg-primary-900/10"
                                const statusColor = isApproved ? "success" : isPending ? "warning" : "primary"
                                const statusLabel = isApproved ? "Approved" : isPending ? "Pending" : "Endorsed"

                                return (
                                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${bgColor}`}>
                                        <div>
                                            <p className="font-medium capitalize">{leave.leaveType} Leave</p>
                                            <p className="text-sm text-zinc-500">
                                                {DateTime.fromISO(leave.startDate).toFormat("MMM d")} - {DateTime.fromISO(leave.endDate).toFormat("MMM d, yyyy")}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex gap-1.5 justify-end">
                                                <Chip size="sm" color={statusColor} variant="flat">{statusLabel}</Chip>
                                                <Chip size="sm" variant="bordered">{leave.workingDays}d</Chip>
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                {leave.daysUntilStart > 0 ? `In ${leave.daysUntilStart} days` : "Started"}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center py-6">No upcoming or pending leaves</p>
                        )}
                    </CardBody>
                </Card>

                {/* Recent Requests */}
                <Card className="bg-content1 hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <FileText className="size-5 text-primary" />
                                <h3 className="font-semibold">Recent Requests</h3>
                            </div>
                            <Link to="/leave-requests">
                                <Button size="sm" variant="light" endContent={<ChevronRight className="size-4" />}>
                                    View All
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {recentRequests && Array.isArray(recentRequests) && recentRequests.length > 0 ? (
                            <div className="space-y-3">
                                {recentRequests.map((request: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                        <div>
                                            <p className="font-medium capitalize">{request.leaveType} Leave</p>
                                            <p className="text-sm text-zinc-500">
                                                {DateTime.fromISO(request.startDate).toFormat("MMM d")} - {DateTime.fromISO(request.endDate).toFormat("MMM d")}
                                            </p>
                                        </div>
                                        <Chip
                                            size="sm"
                                            color={
                                                request.status === LeaveStatus.APPROVED ? "success" :
                                                request.status === LeaveStatus.REJECTED ? "danger" :
                                                request.status === LeaveStatus.PENDING ? "warning" :
                                                request.status === LeaveStatus.ENDORSED ? "primary" : "default"
                                            }
                                            variant="flat"
                                        >
                                            {request.status}
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 text-center py-6">No recent requests</p>
                        )}
                    </CardBody>
                </Card>
            </div>
        </div>
    )
}

// Main Dashboard Component
export default function Dashboard() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()

    // Add global styles to remove chart outlines
    useEffect(() => {
        const style = document.createElement('style')
        style.textContent = `
            .recharts-pie-sector:focus,
            .recharts-pie-sector:focus-visible,
            .recharts-pie-sector:active,
            .recharts-sector:focus,
            .recharts-sector:focus-visible,
            .recharts-sector:active {
                outline: none !important;
                border: none !important;
                box-shadow: none !important;
            }
            *:focus {
                outline: none !important;
            }
        `
        document.head.appendChild(style)
        return () => {
            document.head.removeChild(style)
        }
    }, [])

    // Determine user role
    const isHrOrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")

    // Determine which dashboard to fetch
    const dashboardOp = isHrOrAdmin ? "hr" : isManager ? "manager" : "staff"

    // Fetch dashboard data
    const { data: dashboardData, isLoading, error } = useSWR(
        `${baseUrl}/dashboard?op=${dashboardOp}`,
        fetcher(sessionData.token as string)
    )

    const data = dashboardData?.data

    return (
        <AppLayout user={sessionData.user} baseUrl={baseUrl} token={sessionData.token}>
            <div className="p-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {isHrOrAdmin ? "HR Dashboard" : isManager ? "Manager Dashboard" : "Dashboard"}
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400">
                        {isHrOrAdmin
                            ? "Organization-wide leave management overview"
                            : isManager
                            ? "Department leave management overview"
                            : "Your personal leave overview"}
                    </p>
                </div>

                {/* Loading State */}
                {isLoading && <DashboardSkeleton />}

                {/* Error State */}
                {error && (
                    <Card className="bg-danger-50 dark:bg-danger-900/10">
                        <CardBody className="p-6 text-center">
                            <XCircle className="size-12 mx-auto text-danger-500 mb-3" />
                            <p className="text-danger-600 dark:text-danger-400">
                                Failed to load dashboard data. Please try again.
                            </p>
                        </CardBody>
                    </Card>
                )}

                {/* Dashboard Content */}
                {data && !isLoading && (
                    isHrOrAdmin ? (
                        <HRDashboard data={data} />
                    ) : isManager ? (
                        <ManagerDashboard data={data} />
                    ) : (
                        <StaffDashboard data={data} />
                    )
                )}
            </div>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await checkAuthenticated(request)
    if (!authenticated) {
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
