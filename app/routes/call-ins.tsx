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
    Select,
    SelectItem,
    TableCell,
    TableRow,
    Tooltip,
    useDisclosure,
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@heroui/react"
import { useState } from "react"
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
import {
    Eye,
    PhoneCall,
    Calendar,
    ArrowLeftFromLine,
    Clock,
    FileText,
    Trash2,
    AlertTriangle,
    Download,
} from "lucide-react"
import { MobileList } from "~/ui/components/lists"
import { LeaveTypeChip } from "~/ui/components/chips"

export default function CallIns() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()

    // Check permissions
    const isHrOrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")

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

    // Disclosures
    const viewDisclosure = useDisclosure()

    // Selected call-in for view
    const [selectedCallIn, setSelectedCallIn] = useState<any>(null)
    const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("csv")

    // Delete state
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Format date range
    const formatDateRange = (startDate: string, endDate: string) => {
        const start = DateTime.fromISO(startDate)
        const end = DateTime.fromISO(endDate)

        if (start.hasSame(end, "day")) {
            return start.toFormat("ccc, LLL d yyyy")
        }
        return `${start.toFormat("LLL d")} - ${end.toFormat("LLL d, yyyy")}`
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
                            View staff call-ins from approved leave
                        </p>
                    </div>
                    <div className='flex items-center gap-2'>
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

    return { sessionData, baseUrl }
}
