import {
    Button,
    Card,
    CardBody,
    Spinner,
    Chip,
    Avatar,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
} from "@heroui/react"
import { useState, useMemo } from "react"
import { LoaderFunctionArgs, redirect } from "react-router"
import { useLoaderData } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Filter,
    Users,
    Star,
} from "lucide-react"
import { LeaveStatus, LeaveTypes } from "~/utils/types"

// Leave type colors matching the design
const LEAVE_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    [LeaveTypes.ANNUAL]: { bg: "bg-warning-500/20", text: "text-warning-400", dot: "bg-warning-500" },
    [LeaveTypes.SICK]: { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-500" },
    [LeaveTypes.MATERNITY]: { bg: "bg-purple-500/20", text: "text-purple-400", dot: "bg-purple-500" },
    [LeaveTypes.PATERNITY]: { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" },
    [LeaveTypes.BEREAVEMENT]: { bg: "bg-gray-500/20", text: "text-gray-400", dot: "bg-gray-400" },
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
    [LeaveTypes.ANNUAL]: "Annual Leave",
    [LeaveTypes.SICK]: "Sick Leave",
    [LeaveTypes.MATERNITY]: "Maternity Leave",
    [LeaveTypes.PATERNITY]: "Paternity Leave",
    [LeaveTypes.BEREAVEMENT]: "Bereavement Leave",
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    [LeaveStatus.APPROVED]: { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" },
    [LeaveStatus.PENDING]: { bg: "bg-yellow-500/20", text: "text-yellow-400", dot: "bg-yellow-500" },
    [LeaveStatus.ENDORSED]: { bg: "bg-blue-500/20", text: "text-blue-400", dot: "bg-blue-500" },
    [LeaveStatus.REJECTED]: { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-500" },
    [LeaveStatus.CANCELLED]: { bg: "bg-gray-500/20", text: "text-gray-400", dot: "bg-gray-400" },
}

// Helper to get initials from name
function getInitials(name: string): string {
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
}

export default function LeaveCalendar() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()

    // User permissions
    const isHrOrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")
    const canViewTeamCalendar = isHrOrAdmin || isManager

    // Calendar state
    const [currentMonth, setCurrentMonth] = useState(DateTime.now())
    const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
    const [selectedStatus, setSelectedStatus] = useState<string>("all")
    const [selectedDate, setSelectedDate] = useState<DateTime | null>(DateTime.now())

    // Calculate date range for API
    const startDate = currentMonth.startOf("month").toFormat("yyyy-MM-dd")
    const endDate = currentMonth.endOf("month").toFormat("yyyy-MM-dd")

    // API URL - always use team calendar for HR/Admin, otherwise personal
    const apiUrl = canViewTeamCalendar
        ? `${baseUrl}/leave-calendar?op=calendar-events&startDate=${startDate}&endDate=${endDate}${selectedDepartment !== "all" ? `&department=${selectedDepartment}` : ""}`
        : `${baseUrl}/leave-calendar?op=my-calendar&startDate=${startDate}&endDate=${endDate}`

    // Fetch calendar events
    const {
        data: eventsData,
        isLoading: eventsLoading,
        error: eventsError,
    } = useSWR(apiUrl, fetcher(sessionData.token as string))

    // Fetch departments for filter
    const { data: departmentsData } = useSWR(
        canViewTeamCalendar ? `${baseUrl}/departments` : null,
        fetcher(sessionData.token as string)
    )

    // Fetch holidays for the current month
    const { data: holidaysData } = useSWR(
        `${baseUrl}/holidays?op=range&startDate=${startDate}&endDate=${endDate}`,
        fetcher(sessionData.token as string)
    )

    const events = eventsData?.data?.events || []
    const departments =
        departmentsData?.data?.departments || departmentsData?.departments || []
    const holidays = holidaysData?.data?.holidays || holidaysData?.holidays || []


    // Filter events by status
    const filteredEvents = useMemo(() => {
        if (selectedStatus === "all") return events
        return events.filter(
            (event: any) => event.extendedProps?.status === selectedStatus
        )
    }, [events, selectedStatus])

    // Check if a date is a holiday
    const getHolidayForDate = (date: DateTime) => {
        const dateStr = date.toFormat("yyyy-MM-dd")
        return holidays.find((holiday: any) => {
            const holidayStart = DateTime.fromISO(holiday.startDate).toFormat("yyyy-MM-dd")
            const holidayEnd = DateTime.fromISO(holiday.endDate).toFormat("yyyy-MM-dd")
            return dateStr >= holidayStart && dateStr <= holidayEnd
        })
    }

    // Generate calendar days
    const generateCalendarDays = () => {
        const startOfMonth = currentMonth.startOf("month")
        const endOfMonth = currentMonth.endOf("month")

        // Calculate week boundaries with Sunday as start
        // In Luxon: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
        const startOfMonthWeekday = startOfMonth.weekday
        const daysFromSunday = startOfMonthWeekday === 7 ? 0 : startOfMonthWeekday
        const startOfWeek = startOfMonth.minus({ days: daysFromSunday })

        const endOfMonthWeekday = endOfMonth.weekday
        const daysToSaturday = endOfMonthWeekday === 7 ? 6 : 6 - endOfMonthWeekday
        const endOfWeek = endOfMonth.plus({ days: daysToSaturday })

        

        const days = []
        let current = startOfWeek

        while (current <= endOfWeek) {
            const holiday = getHolidayForDate(current)
            days.push({
                date: current,
                isCurrentMonth: current.month === currentMonth.month,
                isToday: current.hasSame(DateTime.now(), "day"),
                isSelected: selectedDate ? current.hasSame(selectedDate, "day") : false,
                isHoliday: !!holiday,
                holiday: holiday,
                events: holiday ? [] : filteredEvents.filter((event: any) => {
                    const eventDate = DateTime.fromISO(event.start).toFormat(
                        "yyyy-MM-dd"
                    )
                    return eventDate === current.toFormat("yyyy-MM-dd")
                }),
            })
            current = current.plus({ days: 1 })
        }

      

        return days
    }

    const calendarDays = generateCalendarDays()

    // Navigate months
    const navigateMonth = (direction: "prev" | "next") => {
        setCurrentMonth((prev) =>
            direction === "prev"
                ? prev.minus({ months: 1 })
                : prev.plus({ months: 1 })
        )
    }

    const goToToday = () => {
        setCurrentMonth(DateTime.now())
        setSelectedDate(DateTime.now())
    }

    // Get events for selected date
    const selectedDateEvents = useMemo(() => {
        if (!selectedDate) return []
        const holiday = getHolidayForDate(selectedDate)
        if (holiday) return [] // Don't show events on holidays
        return filteredEvents.filter((event: any) => {
            const eventDate = DateTime.fromISO(event.start).toFormat("yyyy-MM-dd")
            return eventDate === selectedDate.toFormat("yyyy-MM-dd")
        })
    }, [filteredEvents, selectedDate, holidays])

    // Get holiday for selected date
    const selectedDateHoliday = useMemo(() => {
        if (!selectedDate) return null
        return getHolidayForDate(selectedDate)
    }, [selectedDate, holidays])

    // Calculate monthly stats
    const monthlyStats = useMemo(() => {
        const stats = {
            total: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
        }

        // Count unique leave requests (not individual day events)
        const uniqueRequests = new Set()
        filteredEvents.forEach((event: any) => {
            if (!uniqueRequests.has(event.extendedProps?.requestId)) {
                uniqueRequests.add(event.extendedProps?.requestId)
                stats.total++
                if (event.extendedProps?.status === LeaveStatus.APPROVED) {
                    stats.approved++
                } else if (
                    event.extendedProps?.status === LeaveStatus.PENDING ||
                    event.extendedProps?.status === LeaveStatus.ENDORSED
                ) {
                    stats.pending++
                } else if (event.extendedProps?.status === LeaveStatus.REJECTED) {
                    stats.rejected++
                }
            }
        })

        return stats
    }, [filteredEvents])

    return (
        <AppLayout user={sessionData.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <CalendarDays className="w-7 h-7 text-warning/70" />
                            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                Team Calendar
                            </h1>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1 ml-10">
                            View team leave schedules and availability
                        </p>
                    </div>

                    {/* Month Navigation */}
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="flat"
                            onPress={goToToday}
                            className="font-medium"
                        >
                            Today
                        </Button>
                        <Button
                            size="sm"
                            variant="flat"
                            onPress={() => navigateMonth("prev")}
                            isIconOnly
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="flat"
                            onPress={() => navigateMonth("next")}
                            isIconOnly
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                        <span className="text-lg font-semibold text-zinc-900 dark:text-white min-w-[180px] text-right">
                            {currentMonth.toFormat("MMMM yyyy")}
                        </span>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 mb-6">
                    <Filter className="w-4 h-4 text-zinc-500" />

                    {/* Status Filter */}
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                variant="flat"
                                size="sm"
                                className="min-w-[120px]"
                            >
                                {selectedStatus === "all"
                                    ? "All Status"
                                    : selectedStatus}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Status filter"
                            selectionMode="single"
                            selectedKeys={new Set([selectedStatus])}
                            onSelectionChange={(keys) =>
                                setSelectedStatus(Array.from(keys)[0] as string)
                            }
                        >
                            <DropdownItem key="all">All Status</DropdownItem>
                            <DropdownItem key={LeaveStatus.APPROVED}>
                                Approved
                            </DropdownItem>
                            <DropdownItem key={LeaveStatus.PENDING}>
                                Pending Endorsement
                            </DropdownItem>
                            <DropdownItem key={LeaveStatus.ENDORSED}>
                                Endorsed
                            </DropdownItem>
                            <DropdownItem key={LeaveStatus.REJECTED}>
                                Rejected
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>

                    {/* Department Filter */}
                    {canViewTeamCalendar && (
                        <Dropdown>
                            <DropdownTrigger>
                                <Button
                                    variant="flat"
                                    size="sm"
                                    className="min-w-[150px]"
                                >
                                    {selectedDepartment === "all"
                                        ? "All Departments"
                                        : departments.find(
                                            (d: any) =>
                                                d._id === selectedDepartment
                                        )?.name || "All Departments"}
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                                aria-label="Department filter"
                                selectionMode="single"
                                selectedKeys={new Set([selectedDepartment])}
                                onSelectionChange={(keys) =>
                                    setSelectedDepartment(
                                        Array.from(keys)[0] as string
                                    )
                                }
                            >
                                <DropdownItem key="all">
                                    All Departments
                                </DropdownItem>
                                {departments.map((dept: any) => (
                                    <DropdownItem key={dept._id}>
                                        {dept.name}
                                    </DropdownItem>
                                ))}
                            </DropdownMenu>
                        </Dropdown>
                    )}
                </div>

                {/* Main Content - Calendar and Sidebar */}
                <div className="flex gap-6">
                    {/* Calendar */}
                    <div className="flex-1">
                        <Card className="bg-content1 dark:bg-zinc-900/50 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                            <CardBody className="p-4">
                                {eventsLoading ? (
                                    <div className="flex justify-center py-24">
                                        <Spinner size="lg" />
                                    </div>
                                ) : (
                                    <div>
                                        {/* Weekday headers */}
                                        <div className="grid grid-cols-7 gap-1 mb-2">
                                            {[
                                                "Sun",
                                                "Mon",
                                                "Tue",
                                                "Wed",
                                                "Thu",
                                                "Fri",
                                                "Sat",
                                            ].map((day) => (
                                                <div
                                                    key={day}
                                                    className="text-center text-sm font-medium text-zinc-500 dark:text-zinc-400 py-3"
                                                >
                                                    {day}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Calendar days */}
                                        <div className="grid grid-cols-7 gap-1">
                                            {calendarDays.map((day, index: number) => (
                                                <div
                                                    key={index}
                                                    onClick={() =>
                                                        day.isCurrentMonth &&
                                                        setSelectedDate(day.date)
                                                    }
                                                    className={`min-h-[90px] p-2 rounded-lg cursor-pointer transition-all ${day.isCurrentMonth
                                                            ? day.isHoliday
                                                                ? "bg-red-500/10 dark:bg-red-900/20 hover:bg-red-500/20 dark:hover:bg-red-900/30"
                                                                : "bg-zinc-100/50 dark:bg-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50"
                                                            : "bg-transparent opacity-40"
                                                        } ${day.isSelected
                                                            ? "ring-2 ring-primary"
                                                            : ""
                                                        } ${day.isToday
                                                            ? "ring-2 ring-warning-500"
                                                            : ""
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div
                                                            className={`text-sm font-medium ${day.isCurrentMonth
                                                                    ? day.isHoliday
                                                                        ? "text-red-600 dark:text-red-400"
                                                                        : "text-zinc-900 dark:text-zinc-100"
                                                                    : "text-zinc-400 dark:text-zinc-600"
                                                                }`}
                                                        >
                                                            {day.date.day}
                                                        </div>
                                                        {day.isHoliday && (
                                                            <Star className="w-3 h-3 text-red-500 fill-red-500" />
                                                        )}
                                                    </div>
                                                    {day.isHoliday && day.holiday && (
                                                        <div className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400 truncate mb-1" title={day.holiday.name}>
                                                            {day.holiday.name}
                                                        </div>
                                                    )}
                                                    {day.events.length > 0 && (
                                                        <div className="space-y-1">
                                                            {day.events
                                                                .slice(0, 2)
                                                                .map(
                                                                    (
                                                                        event: any,
                                                                        eventIndex: number
                                                                    ) => {
                                                                        const leaveType =
                                                                            event
                                                                                .extendedProps
                                                                                ?.leaveType as LeaveTypes
                                                                        const status =
                                                                            event
                                                                                .extendedProps
                                                                                ?.status as string
                                                                        const colors =
                                                                            STATUS_COLORS[
                                                                            status
                                                                            ] ||
                                                                            STATUS_COLORS[
                                                                            LeaveStatus
                                                                                .PENDING
                                                                            ]
                                                                        const staffName =
                                                                            event
                                                                                .extendedProps
                                                                                ?.staffName ||
                                                                            sessionData
                                                                                .user
                                                                                ?.name ||
                                                                            "You"
                                                                        const initials =
                                                                            getInitials(
                                                                                staffName
                                                                            )
                                                                        const leaveLabel =
                                                                            LEAVE_TYPE_LABELS[
                                                                                leaveType
                                                                            ]?.split(
                                                                                " "
                                                                            )[0] ||
                                                                            leaveType

                                                                        return (
                                                                            <div
                                                                                key={
                                                                                    eventIndex
                                                                                }
                                                                                className={`text-xs px-2 py-1 rounded ${colors.bg} ${colors.text} truncate`}
                                                                                title={`${staffName} - ${leaveType}`}
                                                                            >
                                                                                {initials}{" "}
                                                                                -{" "}
                                                                                {
                                                                                    leaveLabel
                                                                                }
                                                                            </div>
                                                                        )
                                                                    }
                                                                )}
                                                            {day.events.length >
                                                                2 && (
                                                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium pl-2">
                                                                        +
                                                                        {day.events
                                                                            .length -
                                                                            2}{" "}
                                                                        more
                                                                    </div>
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
                    </div>

                    {/* Sidebar */}
                    <div className="w-80 space-y-4">

                        {/* Selected Date Details */}
                        <Card className="bg-content1 dark:bg-zinc-900/50 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                            <CardBody className="p-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
                                    {selectedDate
                                        ? selectedDate.toFormat(
                                            "EEEE, MMMM d, yyyy"
                                        )
                                        : "Select a date"}
                                </h3>

                                {/* Show holiday banner if selected date is a holiday */}
                                {selectedDateHoliday && (
                                    <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <div className="flex items-center gap-2">
                                            <Star className="w-4 h-4 text-red-500 fill-red-500" />
                                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                                {selectedDateHoliday.name}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-1 ml-6">
                                            Public Holiday - No working day
                                        </p>
                                    </div>
                                )}

                                {selectedDateEvents.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedDateEvents.map(
                                            (event: any, index: number) => {
                                                const staffName =
                                                    event.extendedProps
                                                        ?.staffName ||
                                                    sessionData.user?.name ||
                                                    "You"
                                                const leaveType =
                                                    event.extendedProps
                                                        ?.leaveType
                                                const status =
                                                    event.extendedProps?.status

                                                return (
                                                    <div
                                                        key={index}
                                                        className="flex items-start gap-3"
                                                    >
                                                        <Avatar
                                                            name={staffName}
                                                            size="sm"
                                                            className="flex-shrink-0"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-zinc-900 dark:text-white text-sm">
                                                                {staffName}
                                                            </div>
                                                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                                                {event
                                                                    .extendedProps
                                                                    ?.staffId ||
                                                                    sessionData
                                                                        .user
                                                                        ?.staffId ||
                                                                    "staff"}
                                                            </div>
                                                            <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
                                                                <div>
                                                                    <span className="text-zinc-500">
                                                                        Leave
                                                                        Type:
                                                                    </span>{" "}
                                                                    {leaveType}
                                                                </div>
                                                                <div>
                                                                    <span className="text-zinc-500">
                                                                        Duration:
                                                                    </span>{" "}
                                                                    {DateTime.fromISO(
                                                                        event.start
                                                                    ).toFormat(
                                                                        "M/d/yyyy"
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <span className="text-zinc-500">
                                                                        Total
                                                                        Days:
                                                                    </span>{" "}
                                                                    1
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-zinc-500">
                                                                        Status:
                                                                    </span>
                                                                    <Chip
                                                                        size="sm"
                                                                        color={
                                                                            status ===
                                                                                LeaveStatus.APPROVED
                                                                                ? "success"
                                                                                : status ===
                                                                                    LeaveStatus.REJECTED
                                                                                    ? "danger"
                                                                                    : "warning"
                                                                        }
                                                                        variant="flat"
                                                                    >
                                                                        {status}
                                                                    </Chip>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                        No leave requests for this date
                                    </p>
                                )}
                            </CardBody>
                        </Card>
                        {/* Status Legend */}
                        <Card className="bg-content1 dark:bg-zinc-900/50 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                            <CardBody className="p-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
                                    Status
                                </h3>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-sm bg-green-500" />
                                        <span className="text-sm text-zinc-600 dark:text-zinc-300">
                                            Approved
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-sm bg-yellow-500" />
                                        <span className="text-sm text-zinc-600 dark:text-zinc-300">
                                            Pending Endorsement
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-sm bg-red-500" />
                                        <span className="text-sm text-zinc-600 dark:text-zinc-300">
                                            Rejected
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-sm bg-red-500/50 flex items-center justify-center">
                                            <Star className="w-2 h-2 text-red-500 fill-red-500" />
                                        </div>
                                        <span className="text-sm text-zinc-600 dark:text-zinc-300">
                                            Public Holiday
                                        </span>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>

                        {/* Holidays This Month */}
                        {holidays.length > 0 && (
                            <Card className="bg-content1 dark:bg-zinc-900/50 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                                <CardBody className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Star className="w-4 h-4 text-red-500 fill-red-500" />
                                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                                            Holidays This Month
                                        </h3>
                                    </div>
                                    <div className="space-y-2">
                                        {holidays.map((holiday: any, index: number) => (
                                            <div
                                                key={index}
                                                className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10"
                                            >
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                                        {holiday.name}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        {DateTime.fromISO(holiday.startDate).toFormat("MMM d")}
                                                        {holiday.startDate !== holiday.endDate &&
                                                            ` - ${DateTime.fromISO(holiday.endDate).toFormat("MMM d")}`
                                                        }
                                                    </p>
                                                </div>
                                                <Chip size="sm" variant="flat" color="danger">
                                                    {holiday.type}
                                                </Chip>
                                            </div>
                                        ))}
                                    </div>
                                </CardBody>
                            </Card>
                        )}



                        {/* This Month Summary */}
                        <Card className="bg-content1 dark:bg-zinc-900/50 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20">
                            <CardBody className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Users className="w-4 h-4 text-zinc-500" />
                                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                                        This Month
                                    </h3>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zinc-600 dark:text-zinc-400">
                                            Total Leaves:
                                        </span>
                                        <span className="font-medium text-zinc-900 dark:text-white">
                                            {monthlyStats.total}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zinc-600 dark:text-zinc-400">
                                            Approved:
                                        </span>
                                        <span className="font-medium text-green-500">
                                            {monthlyStats.approved}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zinc-600 dark:text-zinc-400">
                                            Pending Endorsement:
                                        </span>
                                        <span className="font-medium text-yellow-500">
                                            {monthlyStats.pending}
                                        </span>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
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
