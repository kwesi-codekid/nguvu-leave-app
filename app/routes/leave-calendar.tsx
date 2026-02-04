import {
    Button,
    Card, 
    CardBody,
    CardHeader,
    Select,
    SelectItem,
    Spinner,
    Chip,
    Divider,
} from "@heroui/react"
import { useState, useEffect } from "react"
import React from "react"
import { LoaderFunctionArgs, redirect } from "react-router"
import { useLoaderData, useSearchParams } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import {
    CalendarDays,
    Users,
    ChevronLeft,
    ChevronRight,
    Eye,
} from "lucide-react"
import { LeaveStatus, LeaveTypes } from "~/utils/types"

// Leave type colors
const LEAVE_TYPE_COLORS = {
    [LeaveTypes.ANNUAL]: "bg-green-500",
    [LeaveTypes.SICK]: "bg-orange-500", 
    [LeaveTypes.MATERNITY]: "bg-pink-500",
    [LeaveTypes.PATERNITY]: "bg-blue-500",
    [LeaveTypes.BEREAVEMENT]: "bg-purple-500",
}

const LEAVE_TYPE_LABELS = {
    [LeaveTypes.ANNUAL]: "Annual",
    [LeaveTypes.SICK]: "Sick",
    [LeaveTypes.MATERNITY]: "Maternity", 
    [LeaveTypes.PATERNITY]: "Paternity",
    [LeaveTypes.BEREAVEMENT]: "Bereavement",
}

export default function LeaveCalendar() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()
    
    // User permissions
    const isHrOrAdmin = 
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")
    const canViewTeamCalendar = isHrOrAdmin || isManager
    
    // Auto-switch to personal view if user doesn't have team permissions
    const [viewMode, setViewMode] = useState<"personal" | "team">(
        canViewTeamCalendar ? "personal" : "personal"
    )
    
    // Calendar state
    const [currentMonth, setCurrentMonth] = useState(DateTime.now())
    const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
    
    // Calculate date range for API
    const startDate = currentMonth.startOf("month").toFormat("yyyy-MM-dd")
    const endDate = currentMonth.endOf("month").toFormat("yyyy-MM-dd")
    
    // API URL based on view mode
    const apiUrl = viewMode === "personal" 
        ? `${baseUrl}/leave-calendar?op=my-calendar&startDate=${startDate}&endDate=${endDate}`
        : `${baseUrl}/leave-calendar?op=calendar-events&startDate=${startDate}&endDate=${endDate}${selectedDepartment !== "all" ? `&department=${selectedDepartment}` : ""}`
    
    // Fetch calendar events
    const { data: eventsData, isLoading: eventsLoading, error: eventsError } = useSWR(
        canViewTeamCalendar || viewMode === "personal" ? apiUrl : null,
        fetcher(sessionData.token as string)
    )
    
    // Check for permission error
    const isPermissionError = eventsError?.response?.status === 403 || 
        eventsError?.response?.status === 401 ||
        (eventsData?.message && eventsData.message.toLowerCase().includes("unauthorized"))
    
    // Auto-switch to personal view on permission error
    React.useEffect(() => {
        if (isPermissionError && viewMode === "team") {
            setViewMode("personal")
        }
    }, [isPermissionError, viewMode])
    
    // Fetch departments for filter
    const { data: departmentsData } = useSWR(
        canViewTeamCalendar ? `${baseUrl}/departments` : null,
        fetcher(sessionData.token as string)
    )
    
    const events = eventsData?.data?.events || []
    const departments = departmentsData?.data?.departments || departmentsData?.departments || []
    
    // Generate calendar days
    const generateCalendarDays = () => {
        const startOfMonth = currentMonth.startOf("month")
        const endOfMonth = currentMonth.endOf("month")
        const startOfWeek = startOfMonth.startOf("week")
        const endOfWeek = endOfMonth.endOf("week")
        
        const days = []
        let current = startOfWeek
        
        while (current <= endOfWeek) {
            days.push({
                date: current,
                isCurrentMonth: current.month === currentMonth.month,
                events: events.filter((event: any) => {
                    const eventDate = DateTime.fromISO(event.start).toFormat("yyyy-MM-dd")
                    return eventDate === current.toFormat("yyyy-MM-dd")
                })
            })
            current = current.plus({ days: 1 })
        }
        
        return days
    }
    
    const calendarDays = generateCalendarDays()
    
    // Navigate months
    const navigateMonth = (direction: "prev" | "next") => {
        setCurrentMonth(prev => 
            direction === "prev" 
                ? prev.minus({ months: 1 })
                : prev.plus({ months: 1 })
        )
    }
    
    return (
        <AppLayout user={sessionData.user}>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <CalendarDays className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                Leave Calendar
                            </h1>
                        </div>
                        
                        {/* View Mode Toggle */}
                        {canViewTeamCalendar && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={viewMode === "personal" ? "solid" : "flat"}
                                    color="primary"
                                    onPress={() => setViewMode("personal")}
                                >
                                    <Eye className="w-4 h-4 mr-1" />
                                    My Calendar
                                </Button>
                                <Button
                                    size="sm"
                                    variant={viewMode === "team" ? "solid" : "flat"}
                                    color="primary"
                                    onPress={() => setViewMode("team")}
                                >
                                    <Users className="w-4 h-4 mr-1" />
                                    Team Calendar
                                </Button>
                            </div>
                        )}
                    </div>
                    
                    {/* Filters */}
                    <div className="flex items-center gap-4">
                        {/* Month Navigation */}
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="flat"
                                onPress={() => navigateMonth("prev")}
                                isIconOnly
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 min-w-[120px] text-center">
                                {currentMonth.toFormat("MMMM yyyy")}
                            </span>
                            <Button
                                size="sm"
                                variant="flat"
                                onPress={() => navigateMonth("next")}
                                isIconOnly
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                        
                        {/* Department Filter */}
                        {viewMode === "team" && canViewTeamCalendar && (
                            <Select
                                size="sm"
                                label="Department"
                                selectedKeys={selectedDepartment === "all" ? ["all"] : [selectedDepartment]}
                                onSelectionChange={(keys) => setSelectedDepartment(Array.from(keys)[0] as string)}
                                className="max-w-xs"
                            >
                                <SelectItem key="all">
                                    All Departments
                                </SelectItem>
                                {departments.map((dept: any) => (
                                    <SelectItem key={dept._id}>
                                        {dept.name}
                                    </SelectItem>
                                ))}
                            </Select>
                        )}
                    </div>
                </div>
                
                {/* Calendar */}
                <Card className="mb-6">
                    <CardBody className="p-6">
                        {eventsLoading ? (
                            <div className="flex justify-center py-12">
                                <Spinner size="lg" />
                            </div>
                        ) : isPermissionError && viewMode === "team" ? (
                            <div className="text-center py-12">
                                <div className="text-zinc-500 dark:text-zinc-400 mb-4">
                                    You don't have permission to view the team calendar.
                                </div>
                                <div className="text-sm text-zinc-400 dark:text-zinc-500">
                                    Team calendar requires HR, Admin, or Manager permissions.
                                </div>
                            </div>
                        ) : (
                            <div>
                                {/* Weekday headers */}
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                                        <div key={day} className="text-center text-xs font-medium text-zinc-600 dark:text-zinc-300 py-2">
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                
                                {/* Calendar days */}
                                <div className="grid grid-cols-7 gap-1">
                                    {calendarDays.map((day, index: number) => (
                                        <div
                                            key={index}
                                            className={`min-h-[80px] p-2 border rounded-lg transition-colors ${
                                                day.isCurrentMonth 
                                                    ? "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                                    : "bg-zinc-50 dark:bg-zinc-900 border-zinc-100 dark:border-zinc-700 opacity-50"
                                            }`}
                                        >
                                            <div className={`text-sm font-medium mb-1 ${
                                                day.isCurrentMonth 
                                                    ? "text-zinc-900 dark:text-zinc-100"
                                                    : "text-zinc-500 dark:text-zinc-500"
                                            }`}>
                                                {day.date.day}
                                            </div>
                                            {day.events.length > 0 && (
                                                <div className="space-y-1">
                                                    {day.events.slice(0, 2).map((event: any, eventIndex: number) => (
                                                        <div
                                                            key={eventIndex}
                                                            className={`h-1.5 rounded-full ${LEAVE_TYPE_COLORS[event.extendedProps.leaveType as LeaveTypes] || "bg-gray-500"} shadow-sm`}
                                                            title={viewMode === "personal" 
                                                                ? `${event.extendedProps.leaveType} - ${event.extendedProps.status}`
                                                                : `${event.extendedProps.staffName} - ${event.extendedProps.leaveType}`
                                                            }
                                                        />
                                                    ))}
                                                    {day.events.length > 2 && (
                                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">+{day.events.length - 2}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>
                
                {/* Legend */}
                <Card>
                    <CardHeader>
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                            Legend
                        </h3>
                    </CardHeader>
                    <CardBody>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {Object.entries(LEAVE_TYPE_LABELS).map(([type, label]) => (
                                <div key={type} className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full ${LEAVE_TYPE_COLORS[type as LeaveTypes]} shadow-sm`} />
                                    <span className="text-sm text-zinc-700 dark:text-zinc-200">{label}</span>
                                </div>
                            ))}
                        </div>
                        
                        {viewMode === "team" && (
                            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                                    <strong>Note:</strong> Only approved leave requests are shown in the team calendar.
                                </p>
                            </div>
                        )}
                    </CardBody>
                </Card>
                
                {/* Events List */}
                {events.length > 0 && (
                    <Card className="mt-6">
                        <CardHeader>
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                                {viewMode === "personal" ? "My Leave Requests" : "Team Leave Requests"}
                            </h3>
                        </CardHeader>
                        <CardBody>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {events.map((event: any) => (
                                    <div
                                        key={event.id}
                                        className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${LEAVE_TYPE_COLORS[event.extendedProps.leaveType as LeaveTypes]}`} />
                                            <div>
                                                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                                    {viewMode === "personal" 
                                                        ? `${event.extendedProps.leaveType} Leave`
                                                        : `${event.extendedProps.staffName} - ${event.extendedProps.leaveType} Leave`
                                                    }
                                                </div>
                                                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                                                    {DateTime.fromISO(event.start).toFormat("MMM dd, yyyy")}
                                                    {viewMode === "team" && (
                                                        <span className="ml-2 text-zinc-500 dark:text-zinc-500">
                                                            ({event.extendedProps.staffId})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <Chip
                                            size="sm"
                                            color={event.extendedProps.status === LeaveStatus.APPROVED ? "success" : "default"}
                                            variant="flat"
                                            className="dark:border-zinc-600"
                                        >
                                            {event.extendedProps.status}
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        </CardBody>
                    </Card>
                )}
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
