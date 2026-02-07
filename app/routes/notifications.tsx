import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import {
    Card,
    CardBody,
    Button,
    Chip,
    Spinner,
    Divider,
    Tabs,
    Tab,
    addToast,
    Pagination,
} from "@heroui/react"
import {
    Bell,
    Check,
    CheckCheck,
    Trash2,
    X,
    Calendar,
    FileText,
    PhoneCall,
    AlertCircle,
    Info,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Megaphone,
    Filter,
} from "lucide-react"
import { DateTime } from "luxon"
import useSWR from "swr"
import axios from "axios"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { fetcher } from "~/ui/lib/fetcher"

// Notification type icons and colors
const notificationConfig: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
    leave_submitted: { icon: FileText, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-900/30", label: "Leave Submitted" },
    leave_endorsed: { icon: CheckCircle, color: "text-indigo-500", bgColor: "bg-indigo-100 dark:bg-indigo-900/30", label: "Leave Endorsed" },
    leave_approved: { icon: CheckCircle, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30", label: "Leave Approved" },
    leave_rejected: { icon: XCircle, color: "text-danger", bgColor: "bg-danger-100 dark:bg-danger-900/30", label: "Leave Rejected" },
    leave_cancelled: { icon: X, color: "text-zinc-500", bgColor: "bg-zinc-100 dark:bg-zinc-800", label: "Leave Cancelled" },
    leave_reminder: { icon: Calendar, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30", label: "Leave Reminder" },
    callin_created: { icon: PhoneCall, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30", label: "Call-In" },
    callin_cancelled: { icon: PhoneCall, color: "text-zinc-500", bgColor: "bg-zinc-100 dark:bg-zinc-800", label: "Call-In Cancelled" },
    balance_low: { icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30", label: "Low Balance" },
    balance_credited: { icon: CheckCircle, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30", label: "Balance Credit" },
    balance_debited: { icon: AlertCircle, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30", label: "Balance Debit" },
    system_announcement: { icon: Megaphone, color: "text-primary", bgColor: "bg-primary-100 dark:bg-primary-900/30", label: "Announcement" },
    profile_updated: { icon: Check, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30", label: "Profile Updated" },
    info: { icon: Info, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-900/30", label: "Info" },
    warning: { icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30", label: "Warning" },
    success: { icon: CheckCircle, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30", label: "Success" },
    error: { icon: XCircle, color: "text-danger", bgColor: "bg-danger-100 dark:bg-danger-900/30", label: "Error" },
}

export default function Notifications() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [selectedTab, setSelectedTab] = useState<string>("all")
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
    const [isClearingRead, setIsClearingRead] = useState(false)

    const page = Number(searchParams.get("page")) || 1
    const limit = 20

    // Build query based on tab
    const unreadOnly = selectedTab === "unread" ? "&unreadOnly=true" : ""

    // Fetch notifications
    const { data, isLoading, mutate } = useSWR(
        `${baseUrl}/notifications?page=${page}&limit=${limit}${unreadOnly}`,
        fetcher(sessionData.token as string)
    )

    const notifications = data?.data?.notifications || []
    const pagination = data?.data?.pagination || { page: 1, totalPages: 1, total: 0 }
    const unreadCount = data?.data?.unreadCount || 0

    // Format date
    const formatDate = (date: string) => {
        const dt = DateTime.fromISO(date)
        const now = DateTime.now()
        const diff = now.diff(dt, ["days", "hours", "minutes"])

        if (diff.days < 1) {
            if (diff.hours >= 1) {
                return `${Math.floor(diff.hours)} hour${Math.floor(diff.hours) > 1 ? "s" : ""} ago`
            } else if (diff.minutes >= 1) {
                return `${Math.floor(diff.minutes)} minute${Math.floor(diff.minutes) > 1 ? "s" : ""} ago`
            }
            return "Just now"
        } else if (diff.days < 7) {
            return dt.toFormat("cccc 'at' h:mm a")
        }
        return dt.toFormat("LLL d, yyyy 'at' h:mm a")
    }

    // Get notification config
    const getConfig = (type: string) => {
        return notificationConfig[type] || notificationConfig.info
    }

    // Mark single notification as read
    const handleMarkAsRead = async (notificationId: string, link?: string) => {
        try {
            await axios.patch(
                `${baseUrl}/notifications/${notificationId}`,
                {},
                { headers: { Authorization: `Bearer ${sessionData?.token}` } }
            )
            mutate()

            // Navigate if there's a link
            if (link) {
                navigate(link)
            }
        } catch (error) {
            console.error("Error marking notification as read:", error)
        }
    }

    // Mark all as read
    const handleMarkAllAsRead = async () => {
        setIsMarkingAllRead(true)
        try {
            await axios.patch(
                `${baseUrl}/notifications?op=mark-all-read`,
                {},
                { headers: { Authorization: `Bearer ${sessionData?.token}` } }
            )
            mutate()
            addToast({
                title: "Success",
                description: "All notifications marked as read",
                color: "success",
            })
        } catch (error) {
            console.error("Error marking all as read:", error)
            addToast({
                title: "Error",
                description: "Failed to mark notifications as read",
                color: "danger",
            })
        } finally {
            setIsMarkingAllRead(false)
        }
    }

    // Clear read notifications
    const handleClearRead = async () => {
        setIsClearingRead(true)
        try {
            await axios.delete(
                `${baseUrl}/notifications?op=clear-read`,
                { headers: { Authorization: `Bearer ${sessionData?.token}` } }
            )
            mutate()
            addToast({
                title: "Success",
                description: "Read notifications cleared",
                color: "success",
            })
        } catch (error) {
            console.error("Error clearing read notifications:", error)
            addToast({
                title: "Error",
                description: "Failed to clear notifications",
                color: "danger",
            })
        } finally {
            setIsClearingRead(false)
        }
    }

    // Delete single notification
    const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation()
        try {
            await axios.delete(
                `${baseUrl}/notifications/${notificationId}`,
                { headers: { Authorization: `Bearer ${sessionData?.token}` } }
            )
            mutate()
        } catch (error) {
            console.error("Error deleting notification:", error)
        }
    }

    return (
        <AppLayout user={sessionData?.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className="flex flex-col gap-6 pb-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Bell className="size-6" />
                            Notifications
                        </h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            Stay updated with your leave requests and system announcements
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                            <Button
                                size="sm"
                                variant="flat"
                                startContent={<CheckCheck className="size-4" />}
                                onPress={handleMarkAllAsRead}
                                isLoading={isMarkingAllRead}
                            >
                                Mark All Read
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            startContent={<Trash2 className="size-4" />}
                            onPress={handleClearRead}
                            isLoading={isClearingRead}
                        >
                            Clear Read
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs
                    selectedKey={selectedTab}
                    onSelectionChange={(key) => {
                        setSelectedTab(key as string)
                        setSearchParams({ page: "1" })
                    }}
                    variant="underlined"
                    color="warning"
                >
                    <Tab
                        key="all"
                        title={
                            <div className="flex items-center gap-2">
                                <span>All</span>
                                <Chip size="sm" variant="flat">{pagination.total}</Chip>
                            </div>
                        }
                    />
                    <Tab
                        key="unread"
                        title={
                            <div className="flex items-center gap-2">
                                <span>Unread</span>
                                {unreadCount > 0 && (
                                    <Chip size="sm" color="danger" variant="flat">{unreadCount}</Chip>
                                )}
                            </div>
                        }
                    />
                </Tabs>

                {/* Notifications List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Spinner size="lg" />
                    </div>
                ) : notifications.length === 0 ? (
                    <Card className="bg-content1">
                        <CardBody className="flex flex-col items-center justify-center py-16">
                            <Bell className="size-16 text-zinc-300 dark:text-zinc-700 mb-4" />
                            <h3 className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
                                No notifications
                            </h3>
                            <p className="text-sm text-zinc-500 mt-1">
                                {selectedTab === "unread"
                                    ? "You're all caught up! No unread notifications."
                                    : "You don't have any notifications yet."}
                            </p>
                        </CardBody>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((notification: any) => {
                            const config = getConfig(notification.type)
                            const Icon = config.icon

                            return (
                                <Card
                                    key={notification._id}
                                    className={`bg-content1 cursor-pointer transition-all hover:shadow-md ${
                                        !notification.isRead
                                            ? "border-l-4 border-l-primary"
                                            : ""
                                    }`}
                                    isPressable
                                    onPress={() => handleMarkAsRead(notification._id, notification.link)}
                                >
                                    <CardBody className="p-4">
                                        <div className="flex gap-4">
                                            <div className={`flex-shrink-0 size-12 rounded-full ${config.bgColor} flex items-center justify-center`}>
                                                <Icon className={`size-6 ${config.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className={`font-semibold ${!notification.isRead ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
                                                            {notification.title}
                                                        </h3>
                                                        <Chip size="sm" variant="flat" className="capitalize">
                                                            {config.label}
                                                        </Chip>
                                                        {!notification.isRead && (
                                                            <span className="size-2 rounded-full bg-primary" />
                                                        )}
                                                    </div>
                                                    <Button
                                                        isIconOnly
                                                        size="sm"
                                                        variant="light"
                                                        onPress={(e: any) => handleDelete(e, notification._id)}
                                                    >
                                                        <X className="size-4" />
                                                    </Button>
                                                </div>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                                    {notification.message}
                                                </p>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="text-xs text-zinc-400">
                                                        {formatDate(notification.createdAt)}
                                                    </span>
                                                    {notification.link && (
                                                        <span className="text-xs text-primary">
                                                            Click to view details
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardBody>
                                </Card>
                            )
                        })}
                    </div>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="flex justify-center mt-4">
                        <Pagination
                            total={pagination.totalPages}
                            page={page}
                            onChange={(newPage) => setSearchParams({ page: newPage.toString() })}
                            color="warning"
                            showControls
                        />
                    </div>
                )}
            </div>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
