import {
    addToast,
    Button,
    Card,
    CardBody,
    Chip,
    Divider,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Spinner,
    TableCell,
    TableRow,
    Textarea,
    Tooltip,
    useDisclosure,
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@heroui/react"
import { useState, useEffect } from "react"
import axios from "axios"
import { LoaderFunctionArgs, redirect } from "react-router"
import { useLoaderData, useSearchParams } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import { SearchInput } from "~/ui/components/inputs"
import { DataTable } from "~/ui/components/data-table"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import { exportData, formatters, ExportFormat } from "~/ui/lib/export-utils"
import { LeaveStatus } from "~/utils/types"
import {
    CalendarDays,
    Eye,
    Phone,
    PhoneCall,
    User,
    Calendar,
    ArrowLeftFromLine,
    Clock,
    FileText,
    Trash2,
    AlertTriangle,
    Download,
} from "lucide-react"
import { MobileList } from "~/ui/components/lists"
import { LeaveTypeChip, LeaveStatusChip } from "~/ui/components/chips"

export default function CallIns() {
    const { sessionData, baseUrl, isApprover } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()

    // Check permissions
    const isHrOrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")
    const canCreateCallIn = isHrOrAdmin || isManager || isApprover

    // Fetch call-ins
    const {
        data: callInsData,
        isLoading,
        mutate,
        error: callInsError,
    } = useSWR(
        `${baseUrl}/call-ins`,
        fetcher(sessionData.token as string)
    )

    // Debug: Log call-ins data
    console.log("[CallIns] Full response:", callInsData)
    console.log("[CallIns] Data object:", callInsData?.data)
    console.log("[CallIns] CallIns array:", callInsData?.data?.callIns)
    console.log("[CallIns] Error:", callInsError)
    console.log("[CallIns] Is loading:", isLoading)

    // Fetch approved leaves on leave (for creating call-ins)
    const { data: onLeaveData, isLoading: onLeaveLoading } = useSWR(
        canCreateCallIn ? `${baseUrl}/call-ins?op=on-leave` : null,
        fetcher(sessionData.token as string)
    )

    // Disclosures
    const createDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()

    // Selected call-in for view
    const [selectedCallIn, setSelectedCallIn] = useState<any>(null)
    const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("csv")

    // Form state for create
    const [formData, setFormData] = useState({
        leaveRequestId: "",
        callInStartDate: "",
        callInEndDate: "",
        reason: "",
    })

    // Selected leave request for preview
    const [selectedLeave, setSelectedLeave] = useState<any>(null)

    // Calculated data
    const [calculatedDays, setCalculatedDays] = useState<number | null>(null)
    const [isCalculating, setIsCalculating] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Calculate recovered days when dates change
    useEffect(() => {
        const calculateDays = async () => {
            if (!formData.leaveRequestId || !formData.callInStartDate) {
                setCalculatedDays(null)
                return
            }

            setIsCalculating(true)
            try {
                const response = await axios.post(
                    `${baseUrl}/call-ins?op=calculate`,
                    {
                        leaveRequestId: formData.leaveRequestId,
                        callInStartDate: formData.callInStartDate,
                        callInEndDate: formData.callInEndDate || formData.callInStartDate,
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${sessionData?.token}`,
                        },
                    }
                )

                if (response.data?.data) {
                    setCalculatedDays(response.data.data.workingDaysRecovered)
                }
            } catch (error) {
                console.error("Error calculating days:", error)
                setCalculatedDays(null)
            } finally {
                setIsCalculating(false)
            }
        }

        const debounce = setTimeout(calculateDays, 300)
        return () => clearTimeout(debounce)
    }, [formData.leaveRequestId, formData.callInStartDate, formData.callInEndDate, baseUrl, sessionData?.token])

    // Handle leave selection
    const handleLeaveSelect = (leaveId: string) => {
        const leave = onLeaveData?.data?.staffOnLeave?.find(
            (l: any) => l.leaveRequest._id === leaveId
        )
        setSelectedLeave(leave)
        setFormData({
            ...formData,
            leaveRequestId: leaveId,
            callInStartDate: "",
            callInEndDate: "",
        })
    }

    // Format date range
    const formatDateRange = (startDate: string, endDate: string) => {
        const start = DateTime.fromISO(startDate)
        const end = DateTime.fromISO(endDate)

        if (start.hasSame(end, "day")) {
            return start.toFormat("ccc, LLL d yyyy")
        }
        return `${start.toFormat("LLL d")} - ${end.toFormat("LLL d, yyyy")}`
    }

    // Handle create call-in
    const handleCreateCallIn = async (onClose: () => void) => {
        if (!formData.leaveRequestId || !formData.callInStartDate || !formData.reason.trim()) {
            return
        }

        const payload = {
            leaveRequestId: formData.leaveRequestId,
            callInStartDate: formData.callInStartDate,
            callInEndDate: formData.callInEndDate || formData.callInStartDate,
            reason: formData.reason,
        }
        console.log("Creating call-in with payload:", payload)

        setIsSubmitting(true)
        try {
            await axios.post(
                `${baseUrl}/call-ins`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            // Reset form
            setFormData({
                leaveRequestId: "",
                callInStartDate: "",
                callInEndDate: "",
                reason: "",
            })
            setSelectedLeave(null)
            setCalculatedDays(null)

            await mutate()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Call-in created successfully. Staff has been notified.",
            })
        } catch (error: any) {
            console.error("Error creating call-in:", error)
            console.error("Error response:", error.response?.data)

            // Get detailed error message
            let errorMessage = "Failed to create call-in"
            if (error.response?.data?.errors?.length > 0) {
                // Show first validation error
                errorMessage = error.response.data.errors[0].message
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message
            }

            addToast({
                color: "danger",
                title: "Error",
                description: errorMessage,
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view call-in
    const handleViewCallIn = (callIn: any) => {
        setSelectedCallIn(callIn)
        viewDisclosure.onOpen()
    }

    // Handle delete call-in
    const handleDeleteCallIn = async (onClose: () => void) => {
        if (!selectedCallIn) return

        setIsDeleting(true)
        try {
            await axios.delete(
                `${baseUrl}/call-ins/${selectedCallIn._id}`,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            await mutate()
            setShowDeleteConfirm(false)
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Call-in cancelled successfully. Balance has been adjusted.",
            })
        } catch (error: any) {
            console.error("Error deleting call-in:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to cancel call-in",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    // Check if call-in can be deleted (within 48 hours)
    const canDeleteCallIn = (callIn: any) => {
        if (!callIn) return false

        // Check if user is creator, HR or Admin
        const isCreator = callIn.requestedBy?._id === sessionData?.user?._id
        if (!isCreator && !isHrOrAdmin) return false

        // Check if within 48 hours
        const createdAt = new Date(callIn.createdAt)
        const now = new Date()
        const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

        return hoursSinceCreation <= 48
    }

    // Handle export call-ins data
    const handleExportCallIns = () => {
        if (!callInsData?.data?.callIns || callInsData.data.callIns.length === 0) {
            addToast({
                color: "warning",
                title: "No Data",
                description: "No call-in data available to export",
            })
            return
        }

        const exportColumns = [
            { key: "staff.name", label: "Staff Name", formatter: formatters.staffName },
            { key: "staff.staffId", label: "Staff ID" },
            { key: "leaveRequest.leaveType", label: "Original Leave Type" },
            { key: "leaveRequest.startDate", label: "Original Leave Start", formatter: formatters.date },
            { key: "leaveRequest.endDate", label: "Original Leave End", formatter: formatters.date },
            { key: "callInStartDate", label: "Call-In Start", formatter: formatters.date },
            { key: "callInEndDate", label: "Call-In End", formatter: formatters.date },
            { key: "workingDaysRecovered", label: "Days Recovered" },
            { key: "reason", label: "Reason" },
            { key: "createdAt", label: "Created At", formatter: formatters.dateTime },
        ]

        exportData(
            callInsData.data.callIns,
            exportColumns,
            selectedExportFormat,
            `call-ins-export-${DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")}`
        )

        addToast({
            color: "success",
            title: "Export Complete",
            description: `Call-ins data exported successfully as ${selectedExportFormat.toUpperCase()}`,
        })
    }

    return (
        <AppLayout user={sessionData?.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className='flex flex-col gap-6 pb-8'>
                {/* Header */}
                <div className='flex justify-between items-start'>
                    <div>
                        <h1 className='text-2xl font-bold'>Call-Ins</h1>
                        <p className='text-sm text-zinc-500'>
                            Recall staff from approved leave when needed
                        </p>
                    </div>
                    <div className='flex items-center gap-2'>
                        {canCreateCallIn && (
                            <Button
                                color='warning'
                                size='sm'
                                startContent={<PhoneCall className='size-4' />}
                                onPress={createDisclosure.onOpen}
                            >
                                New Call-In
                            </Button>
                        )}
                        <Select
                            size='sm'
                            radius='sm'
                            variant='bordered'
                            className='w-24'
                            selectedKeys={[selectedExportFormat]}
                            aria-label='Export Format'
                            onSelectionChange={(keys) => setSelectedExportFormat(Array.from(keys)[0] as ExportFormat)}
                        >
                            <SelectItem key='csv'>CSV</SelectItem>
                            <SelectItem key='excel'>Excel</SelectItem>
                            <SelectItem key='pdf'>PDF</SelectItem>
                        </Select>
                        <Button
                            size='sm'
                            color='primary'
                            variant='flat'
                            startContent={<Download className='size-4' />}
                            onPress={handleExportCallIns}
                            isDisabled={isLoading || !callInsData?.data?.callIns?.length}
                        >
                            Export
                        </Button>
                    </div>
                </div>

                {/* Staff Currently on Leave Summary */}
                {canCreateCallIn && onLeaveData?.data?.staffOnLeave?.length > 0 && (
                    <Card className='border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/10'>
                        <CardBody className='p-4'>
                            <div className='flex items-center gap-3'>
                                <div className='size-10 rounded-lg bg-warning-500/20 flex items-center justify-center'>
                                    <User className='size-5 text-warning-600' />
                                </div>
                                <div>
                                    <p className='font-semibold'>
                                        {onLeaveData.data.staffOnLeave.length} Staff Currently on Leave
                                    </p>
                                    <p className='text-sm text-zinc-500'>
                                        Click "New Call-In" to recall a staff member
                                    </p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                )}

                {/* Call-Ins List */}
                <div className='flex flex-col gap-4'>
                    <div className='flex items-center justify-between'>
                        <SearchInput />
                    </div>

                    {/* Error State */}
                    {callInsError && (
                        <Card className='border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/10'>
                            <CardBody className='p-4'>
                                <p className='text-danger-600 dark:text-danger-400'>
                                    Error loading call-ins: {callInsError.message || 'Unknown error'}
                                </p>
                            </CardBody>
                        </Card>
                    )}

                    {/* Desktop Table */}
                    <DataTable
                        isLoading={isLoading}
                        columns={[
                            "Staff",
                            "Original Leave",
                            "Call-In Period",
                            "Days Recovered",
                            "Reason",
                            "Actions",
                        ]}
                    >
                        {callInsData?.data?.callIns?.map((callIn: any) => (
                            <TableRow key={callIn._id}>
                                <TableCell>
                                    <div className='flex flex-col'>
                                        <span className='font-medium'>
                                            {callIn.staff?.name}
                                        </span>
                                        <span className='text-xs text-zinc-500'>
                                            {callIn.staff?.staffId}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className='flex flex-col gap-1'>
                                        <LeaveTypeChip
                                            type={callIn.leaveRequest?.leaveType}
                                        />
                                        <span className='text-xs text-zinc-500'>
                                            {formatDateRange(
                                                callIn.leaveRequest?.startDate,
                                                callIn.leaveRequest?.endDate
                                            )}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className='text-sm'>
                                    {formatDateRange(
                                        callIn.callInStartDate,
                                        callIn.callInEndDate
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size='sm'
                                        color='success'
                                        variant='flat'
                                    >
                                        +{callIn.workingDaysRecovered} days
                                    </Chip>
                                </TableCell>
                                <TableCell className='text-sm text-zinc-600 dark:text-zinc-400 max-w-xs truncate'>
                                    {callIn.reason}
                                </TableCell>
                                <TableCell>
                                    <Tooltip content='View details'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            isIconOnly
                                            onPress={() => handleViewCallIn(callIn)}
                                        >
                                            <Eye className='size-4' />
                                        </Button>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </DataTable>

                    {/* Mobile List */}
                    <MobileList
                        isLoading={isLoading}
                        isEmpty={!callInsData?.data?.callIns?.length}
                        emptyContent='No call-ins found'
                        listContent={callInsData?.data?.callIns?.map((callIn: any) => ({
                            startIcon: (
                                <PhoneCall className='size-5 text-warning' />
                            ),
                            content: (
                                <div
                                    onClick={() => handleViewCallIn(callIn)}
                                    className='cursor-pointer'
                                >
                                    <div className='flex items-center justify-between'>
                                        <span className='font-medium'>
                                            {callIn.staff?.name}
                                        </span>
                                        <Chip size='sm' color='success' variant='flat'>
                                            +{callIn.workingDaysRecovered} days
                                        </Chip>
                                    </div>
                                    <p className='text-sm mt-1'>
                                        {formatDateRange(
                                            callIn.callInStartDate,
                                            callIn.callInEndDate
                                        )}
                                    </p>
                                    <p className='text-xs text-zinc-500 truncate'>
                                        {callIn.reason}
                                    </p>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </div>

            {/* Create Call-In Drawer */}
            <Drawer
                isOpen={createDisclosure.isOpen}
                onOpenChange={createDisclosure.onOpenChange}
                size='md'
                backdrop='blur'
                scrollBehavior='inside'
            >
                <DrawerContent>
                    {(onClose) => (
                        <>
                            <DrawerHeader>New Call-In</DrawerHeader>
                            <Divider />
                            <DrawerBody className='flex flex-col gap-6 pt-6'>
                                {onLeaveLoading ? (
                                    <div className='flex justify-center py-8'>
                                        <Spinner />
                                    </div>
                                ) : onLeaveData?.data?.staffOnLeave?.length === 0 ? (
                                    <Card className='bg-zinc-50 dark:bg-zinc-900'>
                                        <CardBody className='p-6 text-center'>
                                            <User className='size-12 mx-auto text-zinc-400 mb-3' />
                                            <p className='text-zinc-600 dark:text-zinc-400'>
                                                No staff currently on approved leave
                                            </p>
                                        </CardBody>
                                    </Card>
                                ) : (
                                    <>
                                        <Select
                                            label='Staff on Leave'
                                            variant='bordered'
                                            labelPlacement='outside'
                                            placeholder='Select staff to recall'
                                            isRequired
                                            selectedKeys={formData.leaveRequestId ? [formData.leaveRequestId] : []}
                                            onSelectionChange={(keys) => {
                                                const id = Array.from(keys)[0] as string
                                                handleLeaveSelect(id)
                                            }}
                                            classNames={{
                                                trigger: "border-zinc-200 dark:border-zinc-800",
                                            }}
                                        >
                                            {onLeaveData?.data?.staffOnLeave?.map((item: any) => (
                                                <SelectItem
                                                    key={item.leaveRequest._id}
                                                    textValue={item.staff.name}
                                                >
                                                    <div className='flex justify-between items-center'>
                                                        <div>
                                                            <p className='font-medium'>
                                                                {item.staff.name}
                                                            </p>
                                                            <p className='text-xs text-zinc-500'>
                                                                {item.leaveRequest.leaveType} -{" "}
                                                                {formatDateRange(
                                                                    item.leaveRequest.startDate,
                                                                    item.leaveRequest.endDate
                                                                )}
                                                            </p>
                                                        </div>
                                                        <Chip size='sm' variant='flat'>
                                                            {item.leaveRequest.workingDays} days
                                                        </Chip>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </Select>

                                        {/* Selected Leave Preview */}
                                        {selectedLeave && (
                                            <Card className='border border-zinc-200 dark:border-zinc-800'>
                                                <CardBody className='p-4 space-y-3'>
                                                    <div className='flex items-center justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Leave Period
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {formatDateRange(
                                                                selectedLeave.leaveRequest.startDate,
                                                                selectedLeave.leaveRequest.endDate
                                                            )}
                                                        </span>
                                                    </div>
                                                    <Divider />
                                                    <div className='flex items-center justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Leave Type
                                                        </span>
                                                        <LeaveTypeChip
                                                            type={selectedLeave.leaveRequest.leaveType}
                                                        />
                                                    </div>
                                                    <div className='flex items-center justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Days Remaining
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {selectedLeave.daysRemaining} days
                                                        </span>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        )}

                                        <div className='grid grid-cols-2 gap-4'>
                                            <Input
                                                label='Call-In Start Date'
                                                variant='bordered'
                                                labelPlacement='outside'
                                                type='date'
                                                isRequired
                                                min={
                                                    selectedLeave
                                                        ? DateTime.fromISO(
                                                              selectedLeave.leaveRequest.startDate
                                                          ).toFormat("yyyy-MM-dd")
                                                        : undefined
                                                }
                                                max={
                                                    selectedLeave
                                                        ? DateTime.fromISO(
                                                              selectedLeave.leaveRequest.endDate
                                                          ).toFormat("yyyy-MM-dd")
                                                        : undefined
                                                }
                                                value={formData.callInStartDate}
                                                onValueChange={(value) =>
                                                    setFormData({
                                                        ...formData,
                                                        callInStartDate: value,
                                                        callInEndDate:
                                                            !formData.callInEndDate ||
                                                            formData.callInEndDate < value
                                                                ? value
                                                                : formData.callInEndDate,
                                                    })
                                                }
                                                isDisabled={!selectedLeave}
                                                classNames={{
                                                    inputWrapper:
                                                        "border-zinc-200 dark:border-zinc-800",
                                                }}
                                            />

                                            <Input
                                                label='Call-In End Date'
                                                variant='bordered'
                                                labelPlacement='outside'
                                                type='date'
                                                min={formData.callInStartDate}
                                                max={
                                                    selectedLeave
                                                        ? DateTime.fromISO(
                                                              selectedLeave.leaveRequest.endDate
                                                          ).toFormat("yyyy-MM-dd")
                                                        : undefined
                                                }
                                                value={formData.callInEndDate}
                                                onValueChange={(value) =>
                                                    setFormData({
                                                        ...formData,
                                                        callInEndDate: value,
                                                    })
                                                }
                                                isDisabled={!selectedLeave}
                                                description='Leave empty for single day'
                                                classNames={{
                                                    inputWrapper:
                                                        "border-zinc-200 dark:border-zinc-800",
                                                }}
                                            />
                                        </div>

                                        {/* Calculated Days */}
                                        {(isCalculating || calculatedDays !== null) && (
                                            <Card className='bg-success-50 dark:bg-success-900/10 border border-success-200 dark:border-success-800'>
                                                <CardBody className='p-4'>
                                                    {isCalculating ? (
                                                        <div className='flex items-center gap-2'>
                                                            <Spinner size='sm' />
                                                            <span className='text-sm'>
                                                                Calculating...
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className='flex items-center justify-between'>
                                                            <span className='text-sm text-success-700 dark:text-success-400'>
                                                                Days to be recovered
                                                            </span>
                                                            <span className='text-xl font-bold text-success-600'>
                                                                +{calculatedDays} days
                                                            </span>
                                                        </div>
                                                    )}
                                                </CardBody>
                                            </Card>
                                        )}

                                        <Textarea
                                            label='Reason for Call-In'
                                            variant='bordered'
                                            labelPlacement='outside'
                                            placeholder='Explain why the staff needs to return early (minimum 10 characters)'
                                            isRequired
                                            minLength={10}
                                            value={formData.reason}
                                            onValueChange={(value) =>
                                                setFormData({ ...formData, reason: value })
                                            }
                                            description={`${formData.reason.length}/10 characters minimum`}
                                            isInvalid={formData.reason.length > 0 && formData.reason.length < 10}
                                            errorMessage={formData.reason.length > 0 && formData.reason.length < 10 ? "Reason must be at least 10 characters" : ""}
                                            classNames={{
                                                inputWrapper:
                                                    "border-zinc-200 dark:border-zinc-800",
                                            }}
                                        />
                                    </>
                                )}
                            </DrawerBody>
                            <DrawerFooter>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='warning'
                                    onPress={() => handleCreateCallIn(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !formData.leaveRequestId ||
                                        !formData.callInStartDate ||
                                        !formData.reason.trim() ||
                                        formData.reason.trim().length < 10 ||
                                        calculatedDays === null ||
                                        calculatedDays === 0
                                    }
                                >
                                    Create Call-In
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Call-In Drawer */}
            <Drawer
                isOpen={viewDisclosure.isOpen}
                onOpenChange={viewDisclosure.onOpenChange}
                size='md'
                backdrop='blur'
                scrollBehavior='inside'
            >
                <DrawerContent>
                    {(onClose) => (
                        <>
                            <DrawerHeader className='flex flex-col gap-1 pb-0'>
                                <span className='text-sm text-zinc-500'>
                                    Call-In Details
                                </span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedCallIn && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900/10 dark:to-warning-800/20 border-none shadow-sm'>
                                            <CardBody className='py-5'>
                                                <div className='flex items-center gap-4'>
                                                    <div className='size-14 rounded-xl bg-warning-500/20 flex items-center justify-center'>
                                                        <PhoneCall className='size-7 text-warning-600 dark:text-warning-400' />
                                                    </div>
                                                    <div>
                                                        <h3 className='text-xl font-semibold'>
                                                            {selectedCallIn.staff?.name}
                                                        </h3>
                                                        <p className='text-sm text-zinc-500'>
                                                            {selectedCallIn.staff?.staffId}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className='mt-4'>
                                                    <Chip
                                                        size='lg'
                                                        color='success'
                                                        variant='flat'
                                                    >
                                                        +{selectedCallIn.workingDaysRecovered} Days Recovered
                                                    </Chip>
                                                </div>
                                            </CardBody>
                                        </Card>

                                        {/* Original Leave Info */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Calendar className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Original Leave
                                                </span>
                                            </div>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='p-4 space-y-2'>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Leave Type
                                                        </span>
                                                        <LeaveTypeChip
                                                            type={selectedCallIn.leaveRequest?.leaveType}
                                                        />
                                                    </div>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Period
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {formatDateRange(
                                                                selectedCallIn.leaveRequest?.startDate,
                                                                selectedCallIn.leaveRequest?.endDate
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Original Days
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {selectedCallIn.leaveRequest?.workingDays} days
                                                        </span>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        </div>

                                        {/* Call-In Period */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <ArrowLeftFromLine className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Call-In Period
                                                </span>
                                            </div>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='p-4 space-y-2'>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Return Date
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {formatDateRange(
                                                                selectedCallIn.callInStartDate,
                                                                selectedCallIn.callInEndDate
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Days Recovered
                                                        </span>
                                                        <Chip size='sm' color='success' variant='flat'>
                                                            +{selectedCallIn.workingDaysRecovered} days
                                                        </Chip>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        </div>

                                        {/* Reason */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <FileText className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Reason
                                                </span>
                                            </div>
                                            <p className='text-sm text-zinc-600 dark:text-zinc-400 pl-6'>
                                                {selectedCallIn.reason}
                                            </p>
                                        </div>

                                        <Divider />

                                        {/* Meta Info */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Clock className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Created
                                                </span>
                                            </div>
                                            <div className='pl-6 space-y-1'>
                                                <p className='text-sm'>
                                                    {DateTime.fromISO(
                                                        selectedCallIn.createdAt
                                                    ).toFormat("LLL d, yyyy 'at' h:mm a")}
                                                </p>
                                                <p className='text-xs text-zinc-500'>
                                                    By {selectedCallIn.requestedBy?.name}
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </DrawerBody>
                            <DrawerFooter className='border-t border-zinc-200 dark:border-zinc-800 justify-between'>
                                <div>
                                    {canDeleteCallIn(selectedCallIn) && (
                                        <Popover
                                            isOpen={showDeleteConfirm}
                                            onOpenChange={setShowDeleteConfirm}
                                            placement='top'
                                        >
                                            <PopoverTrigger>
                                                <Button
                                                    color='danger'
                                                    variant='flat'
                                                    startContent={<Trash2 className='size-4' />}
                                                    isLoading={isDeleting}
                                                >
                                                    Cancel Call-In
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className='p-4 max-w-xs'>
                                                <div className='flex flex-col gap-3'>
                                                    <div className='flex items-center gap-2 text-warning-600'>
                                                        <AlertTriangle className='size-5' />
                                                        <span className='font-semibold'>Confirm Cancellation</span>
                                                    </div>
                                                    <p className='text-sm text-zinc-600 dark:text-zinc-400'>
                                                        This will cancel the call-in and debit{" "}
                                                        <strong>{selectedCallIn?.workingDaysRecovered} days</strong> back from the staff's leave balance.
                                                    </p>
                                                    <div className='flex gap-2 justify-end'>
                                                        <Button
                                                            size='sm'
                                                            variant='flat'
                                                            onPress={() => setShowDeleteConfirm(false)}
                                                        >
                                                            No, Keep It
                                                        </Button>
                                                        <Button
                                                            size='sm'
                                                            color='danger'
                                                            isLoading={isDeleting}
                                                            onPress={() => handleDeleteCallIn(onClose)}
                                                        >
                                                            Yes, Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                </div>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                >
                                    Close
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>
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

    // Check if user is an approver (their position is set as approverPosition on any job position)
    let isApprover = false
    try {
        const { connectDB } = await import("~/database/connect")
        const StaffContract = (await import("~/models/staff-contract.model")).default
        const JobPosition = (await import("~/models/job-position.model")).default
        await connectDB()

        const userContract = await StaffContract.findOne({
            staff: sessionData?.user?._id,
            status: "active",
        })
        if (userContract?.position) {
            const approverMatch = await JobPosition.findOne({
                approverPosition: userContract.position,
            })
            isApprover = !!approverMatch
        }
    } catch (err) {
        console.error("[CallIns] Error checking approver status:", err)
    }

    return { sessionData, baseUrl, isApprover }
}
