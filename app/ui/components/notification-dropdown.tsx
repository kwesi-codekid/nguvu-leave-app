import { useState, useEffect } from "react"
import {
    Badge,
    Button,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Spinner,
    Divider,
    ScrollShadow,
    addToast,
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
} from "lucide-react"
import { DateTime } from "luxon"
import useSWR from "swr"
import axios from "axios"
import { useNavigate } from "react-router"

// Notification type icons and colors
const notificationConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
    leave_submitted: { icon: FileText, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    leave_endorsed: { icon: CheckCircle, color: "text-indigo-500", bgColor: "bg-indigo-100 dark:bg-indigo-900/30" },
    leave_approved: { icon: CheckCircle, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30" },
    leave_rejected: { icon: XCircle, color: "text-danger", bgColor: "bg-danger-100 dark:bg-danger-900/30" },
    leave_cancelled: { icon: X, color: "text-zinc-500", bgColor: "bg-zinc-100 dark:bg-zinc-800" },
    leave_reminder: { icon: Calendar, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30" },
    callin_created: { icon: PhoneCall, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30" },
    callin_cancelled: { icon: PhoneCall, color: "text-zinc-500", bgColor: "bg-zinc-100 dark:bg-zinc-800" },
    balance_low: { icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30" },
    balance_credited: { icon: CheckCircle, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30" },
    balance_debited: { icon: AlertCircle, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30" },
    system_announcement: { icon: Megaphone, color: "text-primary", bgColor: "bg-primary-100 dark:bg-primary-900/30" },
    profile_updated: { icon: Check, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30" },
    info: { icon: Info, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    warning: { icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning-100 dark:bg-warning-900/30" },
    success: { icon: CheckCircle, color: "text-success", bgColor: "bg-success-100 dark:bg-success-900/30" },
    error: { icon: XCircle, color: "text-danger", bgColor: "bg-danger-100 dark:bg-danger-900/30" },
}

interface NotificationDropdownProps {
    baseUrl: string
    token: string
}

export function NotificationDropdown({ baseUrl, token }: NotificationDropdownProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
    const [isClearingRead, setIsClearingRead] = useState(false)
    const navigate = useNavigate()

    // Fetcher with auth
    const fetcher = async (url: string) => {
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
        })
        return response.data
    }

    // Fetch notifications
    const { data, isLoading, mutate } = useSWR(
        isOpen ? `${baseUrl}/notifications?limit=10` : null,
        fetcher,
        {
            refreshInterval: isOpen ? 30000 : 0, // Refresh every 30s when open
        }
    )

    // Fetch unread count (always)
    const { data: countData, mutate: mutateCount } = useSWR(
        `${baseUrl}/notifications?op=count`,
        fetcher,
        {
            refreshInterval: 60000, // Refresh every minute
        }
    )

    const notifications = data?.data?.notifications || []
    const unreadCount = countData?.data?.unreadCount || 0

    // Format relative time
    const formatTime = (date: string) => {
        const dt = DateTime.fromISO(date)
        const diff = DateTime.now().diff(dt, ["days", "hours", "minutes"])

        if (diff.days >= 1) {
            return dt.toFormat("LLL d")
        } else if (diff.hours >= 1) {
            return `${Math.floor(diff.hours)}h ago`
        } else if (diff.minutes >= 1) {
            return `${Math.floor(diff.minutes)}m ago`
        }
        return "Just now"
    }

    // Mark single notification as read
    const handleMarkAsRead = async (notificationId: string, link?: string) => {
        try {
            await axios.patch(
                `${baseUrl}/notifications/${notificationId}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            )
            mutate()
            mutateCount()

            // Navigate if there's a link
            if (link) {
                setIsOpen(false)
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
                { headers: { Authorization: `Bearer ${token}` } }
            )
            mutate()
            mutateCount()
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
                { headers: { Authorization: `Bearer ${token}` } }
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
                { headers: { Authorization: `Bearer ${token}` } }
            )
            mutate()
            mutateCount()
        } catch (error) {
            console.error("Error deleting notification:", error)
        }
    }

    // Get notification config
    const getConfig = (type: string) => {
        return notificationConfig[type] || notificationConfig.info
    }

    return (
        <Popover
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            placement="bottom-end"
            offset={10}
        >
            <PopoverTrigger>
                <Button
                    isIconOnly
                    variant="flat"
                    size="sm"
                    className="relative"
                    aria-label="Notifications"
                >
                    <Bell className="size-5" />
                    {unreadCount > 0 && (
                        <Badge
                            content={unreadCount > 99 ? "99+" : unreadCount}
                            color="danger"
                            size="sm"
                            className="absolute -top-1 -right-1"
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 sm:w-96 p-0">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                        <Bell className="size-5" />
                        <h3 className="font-semibold">Notifications</h3>
                        {unreadCount > 0 && (
                            <Badge content={unreadCount} color="danger" size="sm" />
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                            <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                onPress={handleMarkAllAsRead}
                                isLoading={isMarkingAllRead}
                                title="Mark all as read"
                            >
                                <CheckCheck className="size-4" />
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            onPress={handleClearRead}
                            isLoading={isClearingRead}
                            title="Clear read notifications"
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                </div>

                {/* Notifications List */}
                <ScrollShadow className="max-h-96">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Spinner size="sm" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                            <Bell className="size-12 mb-2 opacity-50" />
                            <p className="text-sm">No notifications</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {notifications.map((notification: any) => {
                                const config = getConfig(notification.type)
                                const Icon = config.icon

                                return (
                                    <div
                                        key={notification._id}
                                        className={`p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors ${
                                            !notification.isRead ? "bg-primary-50/50 dark:bg-primary-900/10" : ""
                                        }`}
                                        onClick={() => handleMarkAsRead(notification._id, notification.link)}
                                    >
                                        <div className="flex gap-3">
                                            <div className={`flex-shrink-0 size-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
                                                <Icon className={`size-5 ${config.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className={`text-sm font-medium line-clamp-1 ${!notification.isRead ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
                                                        {notification.title}
                                                    </p>
                                                    <button
                                                        onClick={(e) => handleDelete(e, notification._id)}
                                                        className="flex-shrink-0 text-zinc-400 hover:text-danger transition-colors"
                                                    >
                                                        <X className="size-4" />
                                                    </button>
                                                </div>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                                                    {notification.message}
                                                </p>
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-xs text-zinc-400">
                                                        {formatTime(notification.createdAt)}
                                                    </span>
                                                    {!notification.isRead && (
                                                        <span className="size-2 rounded-full bg-primary" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </ScrollShadow>

                {/* Footer */}
                {notifications.length > 0 && (
                    <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
                        <Button
                            variant="light"
                            size="sm"
                            className="w-full"
                            onPress={() => {
                                setIsOpen(false)
                                navigate("/notifications")
                            }}
                        >
                            View All Notifications
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}

export default NotificationDropdown
