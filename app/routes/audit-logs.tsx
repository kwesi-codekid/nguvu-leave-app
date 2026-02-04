import {
    Button,
    Card,
    CardBody,
    CardHeader,
    Chip,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Input,
    Select,
    SelectItem,
    Pagination,
    Spinner,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    Divider,
    Badge,
} from "@heroui/react"
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { useState, useMemo } from "react"
import { getSession, getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import {
    Search,
    Filter,
    Calendar,
    User,
    Activity,
    Eye,
    Download,
    RefreshCw,
    AlertCircle,
    CheckCircle,
    XCircle,
} from "lucide-react"
import { AuditAction } from "~/utils/types"

// Action type labels and colors
const ACTION_LABELS: Record<string, string> = {
    [AuditAction.USER_LOGIN]: "User Login",
    [AuditAction.USER_LOGOUT]: "User Logout",
    [AuditAction.PASSWORD_CHANGE]: "Password Change",
    [AuditAction.PASSWORD_RESET]: "Password Reset",
    [AuditAction.LEAVE_REQUESTED]: "Leave Requested",
    [AuditAction.LEAVE_CREATED]: "Leave Created",
    [AuditAction.LEAVE_UPDATED]: "Leave Updated",
    [AuditAction.LEAVE_ENDORSED]: "Leave Endorsed",
    [AuditAction.LEAVE_APPROVED]: "Leave Approved",
    [AuditAction.LEAVE_REJECTED]: "Leave Rejected",
    [AuditAction.LEAVE_CANCELLED]: "Leave Cancelled",
    [AuditAction.LEAVE_DELETED]: "Leave Deleted",
    [AuditAction.CALLIN_CREATED]: "Call-In Created",
    [AuditAction.STAFF_CREATED]: "Staff Created",
    [AuditAction.STAFF_UPDATED]: "Staff Updated",
    [AuditAction.STAFF_VIEWED]: "Staff Viewed",
    [AuditAction.STAFF_DEACTIVATED]: "Staff Deactivated",
    [AuditAction.STAFF_ACTIVATED]: "Staff Activated",
    [AuditAction.STAFF_DELETED]: "Staff Deleted",
    [AuditAction.ROLE_CHANGED]: "Role Changed",
    [AuditAction.BALANCE_CREDITED]: "Balance Credited",
    [AuditAction.BALANCE_DEBITED]: "Balance Debited",
    [AuditAction.BALANCE_ADJUSTED]: "Balance Adjusted",
    [AuditAction.BALANCE_RESET]: "Balance Reset",
    [AuditAction.BALANCE_CARRIED_FORWARD]: "Balance Carried Forward",
    [AuditAction.HOLIDAY_CREATED]: "Holiday Created",
    [AuditAction.HOLIDAY_UPDATED]: "Holiday Updated",
    [AuditAction.HOLIDAY_DELETED]: "Holiday Deleted",
    [AuditAction.DEPARTMENT_CREATED]: "Department Created",
    [AuditAction.DEPARTMENT_UPDATED]: "Department Updated",
    [AuditAction.DEPARTMENT_DELETED]: "Department Deleted",
    [AuditAction.DOCUMENT_UPLOADED]: "Document Uploaded",
    [AuditAction.DOCUMENT_DELETED]: "Document Deleted",
    [AuditAction.SYSTEM_BACKUP]: "System Backup",
}

const ACTION_COLORS: Record<string, "success" | "warning" | "danger" | "default" | "primary"> = {
    [AuditAction.USER_LOGIN]: "success",
    [AuditAction.USER_LOGOUT]: "default",
    [AuditAction.PASSWORD_CHANGE]: "warning",
    [AuditAction.PASSWORD_RESET]: "warning",
    [AuditAction.LEAVE_REQUESTED]: "primary",
    [AuditAction.LEAVE_CREATED]: "primary",
    [AuditAction.LEAVE_UPDATED]: "warning",
    [AuditAction.LEAVE_ENDORSED]: "warning",
    [AuditAction.LEAVE_APPROVED]: "success",
    [AuditAction.LEAVE_REJECTED]: "danger",
    [AuditAction.LEAVE_CANCELLED]: "default",
    [AuditAction.LEAVE_DELETED]: "danger",
    [AuditAction.CALLIN_CREATED]: "primary",
    [AuditAction.STAFF_CREATED]: "success",
    [AuditAction.STAFF_UPDATED]: "warning",
    [AuditAction.STAFF_VIEWED]: "default",
    [AuditAction.STAFF_DEACTIVATED]: "danger",
    [AuditAction.STAFF_ACTIVATED]: "success",
    [AuditAction.STAFF_DELETED]: "danger",
    [AuditAction.ROLE_CHANGED]: "warning",
    [AuditAction.BALANCE_CREDITED]: "success",
    [AuditAction.BALANCE_DEBITED]: "warning",
    [AuditAction.BALANCE_ADJUSTED]: "warning",
    [AuditAction.BALANCE_RESET]: "danger",
    [AuditAction.BALANCE_CARRIED_FORWARD]: "success",
    [AuditAction.HOLIDAY_CREATED]: "success",
    [AuditAction.HOLIDAY_UPDATED]: "warning",
    [AuditAction.HOLIDAY_DELETED]: "danger",
    [AuditAction.DEPARTMENT_CREATED]: "success",
    [AuditAction.DEPARTMENT_UPDATED]: "warning",
    [AuditAction.DEPARTMENT_DELETED]: "danger",
    [AuditAction.DOCUMENT_UPLOADED]: "success",
    [AuditAction.DOCUMENT_DELETED]: "danger",
    [AuditAction.SYSTEM_BACKUP]: "default",
}

export default function AuditLogs() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [filters, setFilters] = useState({
        page: 1,
        limit: 20,
        action: "",
        entityType: "",
        performedBy: "",
        startDate: "",
        endDate: "",
        search: "",
    })
    const [selectedLog, setSelectedLog] = useState<any>(null)
    const [detailsModalOpen, setDetailsModalOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    // Build API URL with filters
    const apiUrl = useMemo(() => {
        const params = new URLSearchParams()
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, value.toString())
        })
        return `${baseUrl}/audit-logs?${params.toString()}`
    }, [baseUrl, filters])

    // Fetch audit logs
    const { data: auditData, isLoading, error, mutate } = useSWR(
        apiUrl,
        fetcher(sessionData.token as string)
    )

    const auditLogs = auditData?.data?.auditLogs || []
    const pagination = auditData?.data?.pagination || {}

    // Handle filter changes
    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
    }

    // Handle page change
    const handlePageChange = (page: number) => {
        setFilters(prev => ({ ...prev, page }))
    }

    // View log details
    const viewLogDetails = (log: any) => {
        setSelectedLog(log)
        setDetailsModalOpen(true)
    }

    // Refresh data
    const refreshData = () => {
        mutate()
    }

    // Export functionality
    const exportData = async () => {
        setIsExporting(true)
        try {
            // Build export URL with current filters
            const exportParams = new URLSearchParams()
            Object.entries(filters).forEach(([key, value]) => {
                if (value && key !== 'page' && key !== 'limit') {
                    exportParams.append(key, value.toString())
                }
            })
            exportParams.append('export', 'true')
            exportParams.append('limit', '1000') // Export up to 1000 records

            const exportUrl = `${baseUrl}/audit-logs?${exportParams.toString()}`
            
            // Fetch the data for export
            const response = await fetch(exportUrl, {
                headers: {
                    'Authorization': `Bearer ${sessionData.token}`,
                    'Content-Type': 'application/json',
                },
            })

            if (!response.ok) {
                throw new Error('Failed to export data')
            }

            const result = await response.json()
            const logs = result.data?.auditLogs || []

            if (logs.length === 0) {
                alert('No data to export')
                return
            }

            // Convert to CSV
            const csvHeaders = [
                'Date',
                'Time',
                'Action',
                'Entity Type',
                'Entity ID',
                'Performed By',
                'Performed By Email',
                'Status',
                'Description',
                'IP Address',
                'User Agent'
            ]

            const csvRows = logs.map((log: any) => [
                DateTime.fromISO(log.createdAt).toFormat("MMM dd, yyyy"),
                DateTime.fromISO(log.createdAt).toFormat("HH:mm:ss"),
                `"${ACTION_LABELS[log.action] || log.action}"`,
                `"${log.entityType}"`,
                `"${log.entityId}"`,
                `"${log.performedByName || 'Unknown'}"`,
                `"${log.performedByEmail || ''}"`,
                `"${log.status}"`,
                `"${log.description || ''}"`,
                `"${log.ipAddress || ''}"`,
                `"${log.userAgent || ''}"`
            ])

            const csvContent = [
                csvHeaders.join(','),
                ...csvRows.map(row => row.join(','))
            ].join('\n')

            // Create and download the file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            const link = document.createElement('a')
            const url = URL.createObjectURL(blob)
            
            const timestamp = DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")
            link.setAttribute('href', url)
            link.setAttribute('download', `audit-logs-${timestamp}.csv`)
            link.style.visibility = 'hidden'
            
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

        } catch (error) {
            console.error('Export failed:', error)
            alert('Failed to export audit logs. Please try again.')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <AppLayout user={sessionData.user}>
            <div className="p-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                Audit Logs
                            </h1>
                            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                                Track and monitor system activities and changes
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="flat"
                                startContent={isLoading ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
                                onPress={refreshData}
                                isDisabled={isLoading}
                            >
                                {isLoading ? 'Refreshing...' : 'Refresh'}
                            </Button>
                            <Button
                                size="sm"
                                variant="flat"
                                startContent={isExporting ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
                                onPress={exportData}
                                isDisabled={isExporting || isLoading || auditLogs.length === 0}
                            >
                                {isExporting ? 'Exporting...' : 'Export'}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <Card className="mb-6">
                    <CardBody>
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-zinc-500" />
                            <span className="font-medium">Filters</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Input
                                placeholder="Search logs..."
                                startContent={<Search className="w-4 h-4 text-zinc-400" />}
                                value={filters.search}
                                onChange={(e) => handleFilterChange("search", e.target.value)}
                            />
                            <Select
                                placeholder="Action Type"
                                selectedKeys={filters.action ? [filters.action] : []}
                                onSelectionChange={(keys) => handleFilterChange("action", Array.from(keys)[0] as string)}
                            >
                                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </Select>
                            <Input
                                placeholder="Entity Type"
                                value={filters.entityType}
                                onChange={(e) => handleFilterChange("entityType", e.target.value)}
                            />
                            <Input
                                placeholder="Performed By (Staff ID)"
                                value={filters.performedBy}
                                onChange={(e) => handleFilterChange("performedBy", e.target.value)}
                            />
                            <Input
                                type="date"
                                label="Start Date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange("startDate", e.target.value)}
                            />
                            <Input
                                type="date"
                                label="End Date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange("endDate", e.target.value)}
                            />
                            <Select
                                placeholder="Records per page"
                                selectedKeys={[filters.limit.toString()]}
                                onSelectionChange={(keys) => handleFilterChange("limit", Array.from(keys)[0] as string)}
                                className="md:col-span-2"
                            >
                                <SelectItem key="10" value="10">10 records</SelectItem>
                                <SelectItem key="20" value="20">20 records</SelectItem>
                                <SelectItem key="50" value="50">50 records</SelectItem>
                                <SelectItem key="100" value="100">100 records</SelectItem>
                            </Select>
                        </div>
                    </CardBody>
                </Card>

                {/* Error State */}
                {error && (
                    <Card className="mb-6 bg-danger-50 dark:bg-danger-900/10">
                        <CardBody className="p-6 text-center">
                            <XCircle className="size-12 mx-auto text-danger-500 mb-3" />
                            <p className="text-danger-600 dark:text-danger-400">
                                Failed to load audit logs. Please try again.
                            </p>
                        </CardBody>
                    </Card>
                )}

                {/* Audit Logs Table */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Activity className="w-5 text-primary" />
                                <h3 className="font-semibold">System Activities</h3>
                            </div>
                            <Badge color="primary" variant="flat">
                                {pagination.totalRecords || 0} total records
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {isLoading ? (
                            <div className="flex justify-center py-20">
                                <Spinner size="lg" />
                            </div>
                        ) : auditLogs.length === 0 ? (
                            <div className="text-center py-20">
                                <AlertCircle className="size-12 mx-auto text-zinc-400 mb-3" />
                                <p className="text-zinc-500 dark:text-zinc-400">
                                    No audit logs found matching your criteria
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Table aria-label="Audit logs table" removeWrapper>
                                    <TableHeader>
                                        <TableColumn>DATE & TIME</TableColumn>
                                        <TableColumn>ACTION</TableColumn>
                                        <TableColumn>ENTITY</TableColumn>
                                        <TableColumn>PERFORMED BY</TableColumn>
                                        <TableColumn>STATUS</TableColumn>
                                        <TableColumn>ACTIONS</TableColumn>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.map((log: any) => (
                                            <TableRow key={log._id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">
                                                            {DateTime.fromISO(log.createdAt).toFormat("MMM dd, yyyy")}
                                                        </div>
                                                        <div className="text-sm text-zinc-500">
                                                            {DateTime.fromISO(log.createdAt).toFormat("HH:mm:ss")}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size="sm"
                                                        color={ACTION_COLORS[log.action] || "default"}
                                                        variant="flat"
                                                    >
                                                        {ACTION_LABELS[log.action] || log.action}
                                                    </Chip>
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium capitalize">
                                                            {log.entityType}
                                                        </div>
                                                        <div className="text-sm text-zinc-500">
                                                            ID: {log.entityId.slice(-8)}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">
                                                            {log.performedByName || "Unknown"}
                                                        </div>
                                                        <div className="text-sm text-zinc-500">
                                                            {log.performedByEmail || log.performedBy}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {log.status === "success" ? (
                                                            <CheckCircle className="w-4 h-4 text-success" />
                                                        ) : (
                                                            <XCircle className="w-4 h-4 text-danger" />
                                                        )}
                                                        <span className="text-sm capitalize">
                                                            {log.status}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="sm"
                                                        variant="light"
                                                        startContent={<Eye className="w-4 h-4" />}
                                                        onPress={() => viewLogDetails(log)}
                                                    >
                                                        View
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                {/* Pagination */}
                                {pagination.totalPages > 1 && (
                                    <div className="flex justify-center mt-6">
                                        <Pagination
                                            total={pagination.totalPages}
                                            page={pagination.currentPage}
                                            onChange={handlePageChange}
                                            showControls
                                            showShadow
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Details Modal */}
                <Modal
                    isOpen={detailsModalOpen}
                    onClose={() => setDetailsModalOpen(false)}
                    size="2xl"
                    scrollBehavior="inside"
                >
                    <ModalContent>
                        <ModalHeader>
                            <div className="flex items-center gap-2">
                                <Activity className="w-5 text-primary" />
                                <span>Audit Log Details</span>
                            </div>
                        </ModalHeader>
                        <ModalBody>
                            {selectedLog && (
                                <div className="space-y-4">
                                    {/* Basic Information */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Date & Time
                                            </label>
                                            <p className="text-sm">
                                                {DateTime.fromISO(selectedLog.createdAt).toFormat("MMM dd, yyyy HH:mm:ss")}
                                            </p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Action
                                            </label>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Chip
                                                    size="sm"
                                                    color={ACTION_COLORS[selectedLog.action] || "default"}
                                                    variant="flat"
                                                >
                                                    {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                                                </Chip>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Entity Type
                                            </label>
                                            <p className="text-sm capitalize">{selectedLog.entityType}</p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Entity ID
                                            </label>
                                            <p className="text-sm font-mono">{selectedLog.entityId}</p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Performed By
                                            </label>
                                            <p className="text-sm">{selectedLog.performedByName || "Unknown"}</p>
                                            <p className="text-xs text-zinc-500">{selectedLog.performedByEmail}</p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Status
                                            </label>
                                            <div className="flex items-center gap-2 mt-1">
                                                {selectedLog.status === "success" ? (
                                                    <CheckCircle className="w-4 h-4 text-success" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-danger" />
                                                )}
                                                <span className="text-sm capitalize">{selectedLog.status}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <Divider />

                                    {/* Description */}
                                    {selectedLog.description && (
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Description
                                            </label>
                                            <p className="text-sm mt-1">{selectedLog.description}</p>
                                        </div>
                                    )}

                                    {/* IP Address and User Agent */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                IP Address
                                            </label>
                                            <p className="text-sm font-mono">{selectedLog.ipAddress || "N/A"}</p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                User Agent
                                            </label>
                                            <p className="text-sm truncate" title={selectedLog.userAgent}>
                                                {selectedLog.userAgent || "N/A"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Changes */}
                                    {selectedLog.changes && selectedLog.changes.length > 0 && (
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Changes Made
                                            </label>
                                            <div className="mt-2 space-y-2">
                                                {selectedLog.changes.map((change: any, index: number) => (
                                                    <div key={index} className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                                        <div className="font-medium text-sm">
                                                            {change.fieldLabel || change.field}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                                                            <div>
                                                                <span className="text-zinc-500">From:</span>
                                                                <span className="ml-1 text-red-600">
                                                                    {change.oldValue || "empty"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-zinc-500">To:</span>
                                                                <span className="ml-1 text-green-600">
                                                                    {change.newValue || "empty"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Metadata */}
                                    {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Additional Metadata
                                            </label>
                                            <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                                <pre className="text-xs overflow-x-auto">
                                                    {JSON.stringify(selectedLog.metadata, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}

                                    {/* Error Message */}
                                    {selectedLog.errorMessage && (
                                        <div>
                                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                                Error Message
                                            </label>
                                            <div className="mt-1 p-3 bg-danger-50 dark:bg-danger-900/10 rounded-lg">
                                                <p className="text-sm text-danger-600 dark:text-danger-400">
                                                    {selectedLog.errorMessage}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </ModalBody>
                    </ModalContent>
                </Modal>
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
