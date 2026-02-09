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
import {
    LeaveRequestInterface,
    LeaveTypes,
    LeaveStatus,
    LEAVE_CAPS,
    LEAVE_TYPES_REQUIRING_DOCUMENTS,
    GENDER_RESTRICTED_LEAVES,
    Gender,
} from "~/utils/types"
import {
    CalendarDays,
    CalendarPlus,
    CheckCircle,
    ChevronRight,
    Clock,
    Eye,
    FileText,
    ThumbsDown,
    ThumbsUp,
    Undo2,
    User,
    XCircle,
    Building2,
    Briefcase,
    Calendar,
    AlertCircle,
    Paperclip,
    Download,
} from "lucide-react"
import { MobileList } from "~/ui/components/lists"
import { LeaveStatusChip, LeaveTypeChip } from "~/ui/components/chips"

// Leave type options
const LEAVE_TYPE_OPTIONS = [
    { value: LeaveTypes.ANNUAL, label: "Annual Leave", description: "Regular vacation time" },
    { value: LeaveTypes.SICK, label: "Sick Leave", description: "Medical absence" },
    { value: LeaveTypes.MATERNITY, label: "Maternity Leave", description: "For expecting mothers" },
    { value: LeaveTypes.PATERNITY, label: "Paternity Leave", description: "For new fathers" },
    { value: LeaveTypes.BEREAVEMENT, label: "Bereavement Leave", description: "Family loss" },
]

export default function LeaveRequests() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()

    // Current tab
    const currentTab = searchParams.get("tab") || "my-requests"

    // User permissions check
    const isHrOrAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")
    const canEndorse = isHrOrAdmin || isManager
    const canApprove = isHrOrAdmin

    // Fetch my requests
    const {
        data: myRequestsData,
        isLoading: myRequestsLoading,
        mutate: mutateMyRequests,
    } = useSWR(
        currentTab === "my-requests"
            ? `${baseUrl}/leave-requests?op=my-requests`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch pending endorsements
    const {
        data: endorsementsData,
        isLoading: endorsementsLoading,
        mutate: mutateEndorsements,
    } = useSWR(
        currentTab === "pending-endorsements" && canEndorse
            ? `${baseUrl}/leave-requests?op=pending-endorsements`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch pending approvals
    const {
        data: approvalsData,
        isLoading: approvalsLoading,
        mutate: mutateApprovals,
    } = useSWR(
        currentTab === "pending-approvals" && canApprove
            ? `${baseUrl}/leave-requests?op=pending-approvals`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch my leave balances
    const { data: balancesData, isLoading: balancesLoading } = useSWR(
        `${baseUrl}/leave-balances?op=by-staff&staffId=${sessionData?.user?._id}`,
        fetcher(sessionData.token as string)
    )

    // Disclosures
    const createDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const endorseDisclosure = useDisclosure()
    const approveDisclosure = useDisclosure()
    const rejectDisclosure = useDisclosure()
    const withdrawDisclosure = useDisclosure()

    // Selected request for view/actions
    const [selectedRequest, setSelectedRequest] = useState<any>(null)
    const [actionComment, setActionComment] = useState("")

    // Form state for create
    const [formData, setFormData] = useState({
        leaveType: LeaveTypes.ANNUAL as LeaveTypes,
        startDate: "",
        endDate: "",
        reason: "",
    })

    // File attachments state
    const [attachments, setAttachments] = useState<File[]>([])

    // Calculated period data
    const [periodData, setPeriodData] = useState<{
        workingDays: number
        resumptionDate: string
        holidays: string[]
        holidayDatesSkipped: string[]
        totalHolidaysExcluded: number
    } | null>(null)

    const [isCalculating, setIsCalculating] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isActioning, setIsActioning] = useState(false)

    // Calculate period when dates change
    useEffect(() => {
        const calculatePeriod = async () => {
            if (!formData.startDate || !formData.endDate) {
                setPeriodData(null)
                return
            }

            console.log("Calculating period for dates:", {
                startDate: formData.startDate,
                endDate: formData.endDate
            })

            setIsCalculating(true)
            try {
                const response = await axios.post(
                    `${baseUrl}/leave-requests?op=calculate-period`,
                    {
                        startDate: formData.startDate,
                        endDate: formData.endDate,
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${sessionData?.token}`,
                        },
                    }
                )

                console.log("Period calculation response:", response.data)

                if (response.data?.data) {
                    setPeriodData({
                        workingDays: response.data.data.workingDays,
                        resumptionDate: response.data.data.resumptionDate,
                        holidays: response.data.data.holidaysInPeriod || [],
                        holidayDatesSkipped: response.data.data.holidayDatesSkipped || [],
                        totalHolidaysExcluded: response.data.data.totalHolidaysExcluded || 0,
                    })
                } else {
                    console.error("Invalid period calculation response:", response.data)
                }
            } catch (error) {
                console.error("Error calculating period:", error)
                setPeriodData(null)
            } finally {
                setIsCalculating(false)
            }
        }

        const debounce = setTimeout(calculatePeriod, 300)
        return () => clearTimeout(debounce)
    }, [formData.startDate, formData.endDate, baseUrl, sessionData?.token])

    // Get available leave types based on gender
    const getAvailableLeaveTypes = () => {
        const gender = sessionData?.user?.gender
        return LEAVE_TYPE_OPTIONS.filter((option) => {
            if (option.value === LeaveTypes.MATERNITY && gender !== Gender.FEMALE) {
                return false
            }
            if (option.value === LeaveTypes.PATERNITY && gender !== Gender.MALE) {
                return false
            }
            return true
        })
    }

    // Get balance for a leave type
    const getBalance = (leaveType: LeaveTypes) => {
        const balance = balancesData?.data?.balances?.find(
            (b: any) => b.leaveType === leaveType
        )
        if (!balance) return null

        return {
            available: balance.remaining ?? 0,
            canRequest: balance.availableForRequest || 0,
            accrued: balance.accrued || 0,
            monthlyRate: balance.monthlyRate || 0,
            allocated: balance.allocated || 0,
            used: balance.used || 0,
        }
    }

    // Format date range display
    const formatDateRange = (startDate: string, endDate: string) => {
        const start = DateTime.fromISO(startDate)
        const end = DateTime.fromISO(endDate)

        if (start.hasSame(end, "day")) {
            return start.toFormat("ccc, LLL d yyyy")
        }
        if (start.hasSame(end, "month")) {
            return `${start.toFormat("LLL d")} - ${end.toFormat("d, yyyy")}`
        }
        return `${start.toFormat("LLL d")} - ${end.toFormat("LLL d, yyyy")}`
    }

    // Handle tab change
    const handleTabChange = (tab: string) => {
        setSearchParams({ tab })
    }

    // Handle file selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        setAttachments(files)
    }

    // Remove attachment
    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    // Handle create leave request
    const handleCreateRequest = async (onClose: () => void) => {
        if (!formData.startDate || !formData.endDate) {
            console.error("Missing dates:", { startDate: formData.startDate, endDate: formData.endDate })
            addToast({
                color: "danger",
                title: "Validation Error",
                description: "Please select both start and end dates",
            })
            return
        }

        if (!periodData || periodData.workingDays === 0) {
            console.error("Invalid period data:", periodData)
            addToast({
                color: "danger", 
                title: "Validation Error",
                description: "Selected dates contain no working days. Please check your date selection.",
            })
            return
        }

        // Check if documents are required for this leave type
        console.log("Checking document requirements:", {
            leaveType: formData.leaveType,
            requiresDocument: LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(formData.leaveType as any),
            attachmentsLength: attachments.length,
            attachments: attachments.map(a => a.name)
        })
        if (LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(formData.leaveType as any) && attachments.length === 0) {
            addToast({
                color: "danger",
                title: "Validation Error",
                description: `${formData.leaveType} leave requires supporting documents`,
            })
            return
        }

        setIsSubmitting(true)
        try {
            console.log("Submitting request:", {
                leaveType: formData.leaveType,
                startDate: formData.startDate,
                endDate: formData.endDate,
                reason: formData.reason,
                workingDays: periodData.workingDays,
                attachmentsCount: attachments.length
            })

            // Upload files first if any
            let uploadedAttachments: any[] = []
            if (attachments.length > 0) {
                console.log("Starting file upload:", {
                    attachmentsCount: attachments.length,
                    attachmentNames: attachments.map(a => a.name),
                    attachmentSizes: attachments.map(a => a.size)
                })
                
                const formData = new FormData()
                attachments.forEach((file, index) => {
                    formData.append(`files`, file)
                })

                try {
                    const uploadResponse = await axios.post(
                        `${baseUrl}/upload`,
                        formData,
                        {
                            headers: {
                                Authorization: `Bearer ${sessionData?.token}`,
                                'Content-Type': 'multipart/form-data',
                            },
                        }
                    )
                    console.log("Upload response:", uploadResponse.data)
                    console.log("Upload response data structure:", JSON.stringify(uploadResponse.data, null, 2))
                    uploadedAttachments = uploadResponse.data.data?.files || []
                    console.log("Uploaded attachments:", uploadedAttachments)
                } catch (uploadError: any) {
                    console.error("Upload failed:", uploadError.response?.data || uploadError.message)
                    addToast({
                        color: "danger",
                        title: "Upload Failed",
                        description: "Failed to upload supporting documents. Please try again.",
                    })
                    return
                }
            }

            const response = await axios.post(
                `${baseUrl}/leave-requests`,
                {
                    leaveType: formData.leaveType,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    reason: formData.reason || undefined,
                    attachments: uploadedAttachments,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            console.log("Request successful:", response.data)

            // Reset form
            setFormData({
                leaveType: LeaveTypes.ANNUAL,
                startDate: "",
                endDate: "",
                reason: "",
            })
            setPeriodData(null)
            setAttachments([])

            await mutateMyRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request submitted successfully",
            })
        } catch (error: any) {
            console.error("Error creating request:", error)
            console.error("Error response:", error.response?.data)
            console.error("Error status:", error.response?.status)
            console.error("Error headers:", error.response?.headers)
            
            // Handle validation errors specifically
            if (error.response?.status === 422 && error.response?.data) {
                const errorData = error.response.data
                console.error("422 Error data:", errorData)
                
                if (errorData.errors && Array.isArray(errorData.errors)) {
                    const validationErrors = errorData.errors
                    const errorMessages = validationErrors.map((err: any) => 
                        `${err.field}: ${err.message}`
                    ).join('; ')
                    
                    addToast({
                        color: "danger",
                        title: "Validation Error",
                        description: errorMessages,
                    })
                } else if (errorData.message) {
                    addToast({
                        color: "danger",
                        title: "Validation Error", 
                        description: errorData.message,
                    })
                } else {
                    addToast({
                        color: "danger",
                        title: "Validation Error",
                        description: JSON.stringify(errorData),
                    })
                }
            } else if (error.response?.status === 400 && error.response?.data?.errors) {
                const validationErrors = error.response.data.errors
                const errorMessages = validationErrors.map((err: any) => 
                    `${err.field}: ${err.message}`
                ).join('; ')
                
                addToast({
                    color: "danger",
                    title: "Validation Error",
                    description: errorMessages,
                })
            } else {
                addToast({
                    color: "danger",
                    title: "Error",
                    description:
                        error.response?.data?.message || "Failed to submit leave request",
                })
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view request
    const handleViewRequest = (request: any) => {
        setSelectedRequest(request)
        viewDisclosure.onOpen()
    }

    // Handle endorse
    const handleEndorse = async (onClose: () => void) => {
        if (!selectedRequest) return

        setIsActioning(true)
        try {
            await axios.patch(
                `${baseUrl}/leave-requests/${selectedRequest._id}?op=endorse`,
                { comment: actionComment || undefined },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            setActionComment("")
            await mutateEndorsements()
            await mutateMyRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request endorsed successfully",
            })
        } catch (error: any) {
            console.error("Error endorsing request:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to endorse request",
            })
        } finally {
            setIsActioning(false)
        }
    }

    // Handle approve
    const handleApprove = async (onClose: () => void) => {
        if (!selectedRequest) return

        setIsActioning(true)
        try {
            await axios.patch(
                `${baseUrl}/leave-requests/${selectedRequest._id}?op=approve`,
                { comment: actionComment || undefined },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            setActionComment("")
            await mutateApprovals()
            await mutateMyRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request approved successfully",
            })
        } catch (error: any) {
            console.error("Error approving request:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to approve request",
            })
        } finally {
            setIsActioning(false)
        }
    }

    // Handle reject
    const handleReject = async (onClose: () => void, level: "endorsement" | "approval") => {
        if (!selectedRequest || !actionComment.trim()) return

        setIsActioning(true)
        try {
            const op = level === "endorsement" ? "reject-endorsement" : "reject-approval"
            await axios.patch(
                `${baseUrl}/leave-requests/${selectedRequest._id}?op=${op}`,
                { comment: actionComment },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            setActionComment("")
            if (level === "endorsement") {
                await mutateEndorsements()
            } else {
                await mutateApprovals()
            }
            await mutateMyRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request rejected",
            })
        } catch (error: any) {
            console.error("Error rejecting request:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to reject request",
            })
        } finally {
            setIsActioning(false)
        }
    }

    // Handle withdraw
    const handleWithdraw = async (onClose: () => void) => {
        if (!selectedRequest) return

        setIsActioning(true)
        try {
            await axios.patch(
                `${baseUrl}/leave-requests/${selectedRequest._id}?op=withdraw`,
                { reason: actionComment || undefined },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            setActionComment("")
            await mutateMyRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request withdrawn",
            })
        } catch (error: any) {
            console.error("Error withdrawing request:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to withdraw request",
            })
        } finally {
            setIsActioning(false)
        }
    }

    // Can withdraw check
    const canWithdraw = (request: any) => {
        return (
            request.staff?._id === sessionData?.user?.id &&
            (request.status === LeaveStatus.PENDING ||
                request.status === LeaveStatus.ENDORSED)
        )
    }

    // Render request row for table
    const renderRequestRow = (request: any) => (
        <TableRow key={request._id}>
            <TableCell>
                <LeaveTypeChip type={request.leaveType} />
            </TableCell>
            <TableCell className='text-sm'>
                {formatDateRange(request.startDate, request.endDate)}
            </TableCell>
            <TableCell className='text-sm font-medium'>
                {request.workingDays} day{request.workingDays !== 1 ? "s" : ""}
            </TableCell>
            <TableCell>
                <LeaveStatusChip status={request.status} />
            </TableCell>
            <TableCell>
                <div className='flex items-center gap-2'>
                    <Tooltip content='View details'>
                        <Button
                            size='sm'
                            color='primary'
                            variant='flat'
                            isIconOnly
                            onPress={() => handleViewRequest(request)}
                        >
                            <Eye className='size-4' />
                        </Button>
                    </Tooltip>
                    {canWithdraw(request) ? (
                        <Tooltip content='Withdraw request'>
                            <Button
                                size='sm'
                                color='warning'
                                variant='flat'
                                isIconOnly
                                onPress={() => {
                                    setSelectedRequest(request)
                                    withdrawDisclosure.onOpen()
                                }}
                            >
                                <Undo2 className='size-4' />
                            </Button>
                        </Tooltip>
                    ) : null}
                </div>
            </TableCell>
        </TableRow>
    )

    // Render endorsement/approval row
    const renderActionRow = (request: any, actionType: "endorse" | "approve") => (
        <TableRow key={request._id}>
            <TableCell>
                <div className='flex flex-col'>
                    <span className='font-medium'>{request.staff?.name}</span>
                    <span className='text-xs text-zinc-500'>
                        {request.staff?.staffId}
                    </span>
                </div>
            </TableCell>
            <TableCell>
                <LeaveTypeChip type={request.leaveType} />
            </TableCell>
            <TableCell className='text-sm'>
                {formatDateRange(request.startDate, request.endDate)}
            </TableCell>
            <TableCell className='text-sm font-medium'>
                {request.workingDays} day{request.workingDays !== 1 ? "s" : ""}
            </TableCell>
            <TableCell className='text-sm text-zinc-500'>
                {DateTime.fromISO(request.createdAt).toRelative()}
            </TableCell>
            <TableCell>
                <div className='flex items-center gap-2'>
                    <Tooltip content='View details'>
                        <Button
                            size='sm'
                            color='primary'
                            variant='flat'
                            isIconOnly
                            onPress={() => handleViewRequest(request)}
                        >
                            <Eye className='size-4' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={actionType === "endorse" ? "Endorse" : "Approve"}>
                        <Button
                            size='sm'
                            color='success'
                            variant='flat'
                            isIconOnly
                            onPress={() => {
                                setSelectedRequest(request)
                                if (actionType === "endorse") {
                                    endorseDisclosure.onOpen()
                                } else {
                                    approveDisclosure.onOpen()
                                }
                            }}
                        >
                            <ThumbsUp className='size-4' />
                        </Button>
                    </Tooltip>
                    <Tooltip content='Reject'>
                        <Button
                            size='sm'
                            color='danger'
                            variant='flat'
                            isIconOnly
                            onPress={() => {
                                setSelectedRequest(request)
                                rejectDisclosure.onOpen()
                            }}
                        >
                            <ThumbsDown className='size-4' />
                        </Button>
                    </Tooltip>
                </div>
            </TableCell>
        </TableRow>
    )

    return (
        <AppLayout user={sessionData?.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className='flex flex-col gap-6 pb-8'>
                {/* Header */}
                <div className='flex justify-between items-start'>
                    <div>
                        <h1 className='text-2xl font-bold'>Leave Requests</h1>
                        <p className='text-sm text-zinc-500'>
                            Submit and track your leave requests
                        </p>
                    </div>
                    <Button
                        color='warning'
                        size='sm'
                        startContent={<CalendarPlus className='size-4' />}
                        onPress={createDisclosure.onOpen}
                        className='bg-warning/70 dark:bg-warning/70 text-white hover:shadow-lg hover:scale-[1.01] transition-all duration-300'
                    >
                        New Request
                    </Button>
                </div>

                {/* Leave Balances Summary */}
                <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3'>
                    {balancesLoading ? (
                        <div className='col-span-full flex justify-center py-4'>
                            <Spinner size='sm' />
                        </div>
                    ) : (
                        balancesData?.data?.balances?.map((balance: any) => (
                            <Card
                                key={balance.leaveType}
                                className='bg-zinc-50 dark:bg-zinc-900 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'
                            >
                                <CardBody className='p-3'>
                                    <div className='flex items-center justify-between mb-2'>
                                        <LeaveTypeChip type={balance.leaveType} />
                                    </div>
                                    <div className='flex items-baseline gap-1'>
                                        <span className={`text-2xl font-bold ${
                                            balance.remaining < 0
                                                ? 'text-danger-500'
                                                : 'text-zinc-900 dark:text-zinc-100'
                                        }`}>
                                            {balance.remaining}
                                        </span>
                                        <span className='text-xs text-zinc-500 dark:text-zinc-400'>
                                            / {balance.allocated} days
                                        </span>
                                    </div>
                                    <p className='text-xs text-zinc-500 dark:text-zinc-400 mt-1'>
                                        Used: {balance.used} days
                                    </p>
                                    {balance.leaveType === 'annual' && (
                                        <p className='text-xs text-zinc-500 dark:text-zinc-400'>
                                            Accrued: {balance.accrued || 0} days ({balance.monthlyRate || 0}/month)
                                        </p>
                                    )}
                                    {balance.remaining < 0 && balance.leaveType === 'annual' && (
                                        <p className='text-xs text-danger-500 font-medium'>
                                            Owing: {Math.abs(balance.remaining)} days from next month
                                        </p>
                                    )}
                                    {(balance.availableForRequest ?? Math.max(0, balance.allocated - balance.used)) > 0 && (
                                        <p className='text-xs text-primary-500'>
                                            Can request up to: {balance.availableForRequest ?? Math.max(0, balance.allocated - balance.used)} days
                                        </p>
                                    )}
                                </CardBody>
                            </Card>
                        ))
                    )}
                </div>

                {/* Tabs - Tab content rendered based on selected tab */}
                <div>
                    {/* Tab Headers */}
                    <div className='flex gap-6 border-b border-zinc-200 dark:border-zinc-800'>
                        <button
                            onClick={() => handleTabChange("my-requests")}
                            className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                                currentTab === "my-requests"
                                    ? "border-warning text-warning"
                                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                        >
                            <FileText className='size-4' />
                            <span>My Requests</span>
                        </button>
                        {canEndorse && (
                            <button
                                onClick={() => handleTabChange("pending-endorsements")}
                                className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                                    currentTab === "pending-endorsements"
                                        ? "border-warning text-warning"
                                        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                }`}
                            >
                                <ThumbsUp className='size-4' />
                                <span>Pending Endorsements</span>
                                {endorsementsData?.data?.requests?.length > 0 && (
                                    <Chip size='sm' color='warning' variant='flat'>
                                        {endorsementsData.data.requests.length}
                                    </Chip>
                                )}
                            </button>
                        )}
                        {canApprove && (
                            <button
                                onClick={() => handleTabChange("pending-approvals")}
                                className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                                    currentTab === "pending-approvals"
                                        ? "border-success text-success"
                                        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                }`}
                            >
                                <CheckCircle className='size-4' />
                                <span>Pending Approvals</span>
                                {approvalsData?.data?.requests?.length > 0 && (
                                    <Chip size='sm' color='success' variant='flat'>
                                        {approvalsData.data.requests.length}
                                    </Chip>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Tab Content */}
                    <div className='mt-4'>
                        {currentTab === "my-requests" && (
                            <>
                                <DataTable
                                    isLoading={myRequestsLoading}
                                    columns={["Leave Type", "Date Range", "Days", "Status", "Actions"]}
                                >
                                    {myRequestsData?.data?.requests?.map((request: any) => renderRequestRow(request))}
                                </DataTable>
                                <MobileList
                                    isLoading={myRequestsLoading}
                                    isEmpty={!myRequestsData?.data?.requests?.length}
                                    emptyContent='No leave requests found'
                                    listContent={myRequestsData?.data?.requests?.map((request: any) => ({
                                        startIcon: <CalendarDays className='size-5 text-warning' />,
                                        content: (
                                            <div onClick={() => handleViewRequest(request)} className='cursor-pointer'>
                                                <div className='flex items-center justify-between'>
                                                    <LeaveTypeChip type={request.leaveType} />
                                                    <LeaveStatusChip status={request.status} />
                                                </div>
                                                <p className='text-sm mt-2'>{formatDateRange(request.startDate, request.endDate)}</p>
                                                <p className='text-xs text-zinc-500'>{request.workingDays} working day{request.workingDays !== 1 ? "s" : ""}</p>
                                            </div>
                                        ),
                                    }))}
                                />
                            </>
                        )}
                        {currentTab === "pending-endorsements" && canEndorse && (
                            <>
                                <DataTable
                                    isLoading={endorsementsLoading}
                                    columns={["Staff", "Leave Type", "Date Range", "Days", "Submitted", "Actions"]}
                                >
                                    {endorsementsData?.data?.requests?.map((request: any) => renderActionRow(request, "endorse"))}
                                </DataTable>
                                <MobileList
                                    isLoading={endorsementsLoading}
                                    isEmpty={!endorsementsData?.data?.requests?.length}
                                    emptyContent='No pending endorsements'
                                    listContent={endorsementsData?.data?.requests?.map((request: any) => ({
                                        startIcon: <Clock className='size-5 text-warning' />,
                                        content: (
                                            <div onClick={() => handleViewRequest(request)} className='cursor-pointer'>
                                                <div className='flex items-center justify-between'>
                                                    <span className='font-medium'>{request.staff?.name}</span>
                                                    <LeaveTypeChip type={request.leaveType} />
                                                </div>
                                                <p className='text-sm mt-1'>{formatDateRange(request.startDate, request.endDate)}</p>
                                                <p className='text-xs text-zinc-500'>{request.workingDays} days - {DateTime.fromISO(request.createdAt).toRelative()}</p>
                                            </div>
                                        ),
                                    }))}
                                />
                            </>
                        )}
                        {currentTab === "pending-approvals" && canApprove && (
                            <>
                                <DataTable
                                    isLoading={approvalsLoading}
                                    columns={["Staff", "Leave Type", "Date Range", "Days", "Endorsed", "Actions"]}
                                >
                                    {approvalsData?.data?.requests?.map((request: any) => renderActionRow(request, "approve"))}
                                </DataTable>
                                <MobileList
                                    isLoading={approvalsLoading}
                                    isEmpty={!approvalsData?.data?.requests?.length}
                                    emptyContent='No pending approvals'
                                    listContent={approvalsData?.data?.requests?.map((request: any) => ({
                                        startIcon: <ThumbsUp className='size-5 text-success' />,
                                        content: (
                                            <div onClick={() => handleViewRequest(request)} className='cursor-pointer'>
                                                <div className='flex items-center justify-between'>
                                                    <span className='font-medium'>{request.staff?.name}</span>
                                                    <LeaveTypeChip type={request.leaveType} />
                                                </div>
                                                <p className='text-sm mt-1'>{formatDateRange(request.startDate, request.endDate)}</p>
                                                <p className='text-xs text-zinc-500'>{request.workingDays} days - Endorsed {DateTime.fromISO(request.endorsement?.at).toRelative()}</p>
                                            </div>
                                        ),
                                    }))}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Leave Request Drawer */}
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
                            <DrawerHeader>New Leave Request</DrawerHeader>
                            <Divider />
                            <DrawerBody className='flex flex-col gap-6 pt-6'>
                                <Select
                                    label='Leave Type'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select leave type'
                                    isRequired
                                    selectedKeys={[formData.leaveType]}
                                    onSelectionChange={(keys) => {
                                        const selected = Array.from(keys)[0] as LeaveTypes
                                        setFormData({ ...formData, leaveType: selected })
                                    }}
                                    classNames={{
                                        trigger: "border-zinc-200 dark:border-zinc-800",
                                    }}
                                >
                                    {getAvailableLeaveTypes().map((option) => {
                                        const balance = getBalance(option.value)
                                        return (
                                            <SelectItem
                                                key={option.value}
                                                textValue={option.label}
                                            >
                                                <div className='flex justify-between items-center'>
                                                    <div>
                                                        <p className='text-sm'>
                                                            {option.label}
                                                        </p>
                                                        <p className='text-xs text-zinc-500'>
                                                            {option.description}
                                                        </p>
                                                    </div>
                                                    {balance && (
                                                        <Chip
                                                            size='sm'
                                                            variant='flat'
                                                            color={
                                                                balance.available > 5
                                                                    ? "success"
                                                                    : balance.available > 0
                                                                    ? "warning"
                                                                    : "danger"
                                                            }
                                                        >
                                                            {balance.available} days
                                                        </Chip>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        )
                                    })}
                                </Select>

                                {/* Balance info for selected type */}
                                {formData.leaveType && (
                                    <Card className='bg-zinc-50 dark:bg-zinc-900 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                        <CardBody className='p-3'>
                                            <div className='flex items-center justify-between'>
                                                <span className='text-sm text-zinc-600 dark:text-zinc-400'>
                                                    Current Balance
                                                </span>
                                                <span className={`text-lg font-bold ${
                                                    (getBalance(formData.leaveType)?.available ?? 0) < 0
                                                        ? 'text-danger-500'
                                                        : ''
                                                }`}>
                                                    {getBalance(formData.leaveType)
                                                        ?.available ?? 0}{" "}
                                                    days
                                                </span>
                                            </div>
                                            {formData.leaveType === 'annual' && (
                                                <p className='text-xs text-zinc-500 dark:text-zinc-400 mt-1'>
                                                    Accrued: {getBalance(formData.leaveType)?.accrued || 0} days ({getBalance(formData.leaveType)?.monthlyRate || 0}/month)
                                                </p>
                                            )}
                                            <p className='text-xs text-primary-500'>
                                                Can request up to: {getBalance(formData.leaveType)?.canRequest || 0} days
                                            </p>
                                            {LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(
                                                formData.leaveType as any
                                            ) && (
                                                <div className='flex items-center gap-2 mt-2 text-warning-600'>
                                                    <AlertCircle className='size-4' />
                                                    <span className='text-xs'>
                                                        Supporting documents required
                                                    </span>
                                                </div>
                                            )}
                                        </CardBody>
                                    </Card>
                                )}

                                <div className='grid grid-cols-2 gap-4'>
                                    <Input
                                        label='Start Date'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        type='date'
                                        isRequired
                                        min={DateTime.now().toFormat("yyyy-MM-dd")}
                                        value={formData.startDate}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                startDate: value,
                                                endDate:
                                                    !formData.endDate ||
                                                    formData.endDate < value
                                                        ? value
                                                        : formData.endDate,
                                            })
                                        }
                                        classNames={{
                                            inputWrapper:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    />

                                    <Input
                                        label='End Date'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        type='date'
                                        isRequired
                                        min={formData.startDate || DateTime.now().toFormat("yyyy-MM-dd")}
                                        value={formData.endDate}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                endDate: value,
                                            })
                                        }
                                        classNames={{
                                            inputWrapper:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    />
                                </div>

                                {/* Period calculation result */}
                                {(isCalculating || periodData) && (
                                    <Card className='shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                        <CardBody className='p-4'>
                                            {isCalculating ? (
                                                <div className='flex items-center gap-2'>
                                                    <Spinner size='sm' />
                                                    <span className='text-sm text-zinc-500'>
                                                        Calculating...
                                                    </span>
                                                </div>
                                            ) : periodData ? (
                                                <div className='space-y-3'>
                                                    <div className='flex items-center justify-between'>
                                                        <span className='text-sm text-zinc-600 dark:text-zinc-400'>
                                                            Working Days
                                                        </span>
                                                        <span className='text-xl font-bold text-warning-600'>
                                                            {periodData.workingDays} day
                                                            {periodData.workingDays !== 1
                                                                ? "s"
                                                                : ""}
                                                        </span>
                                                    </div>
                                                    <Divider />
                                                    <div className='flex items-center justify-between'>
                                                        <span className='text-sm text-zinc-600 dark:text-zinc-400'>
                                                            Resumption Date
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {DateTime.fromISO(
                                                                periodData.resumptionDate
                                                            ).toFormat("ccc, LLL d yyyy")}
                                                        </span>
                                                    </div>
                                                    {(periodData.holidays.length > 0 || periodData.totalHolidaysExcluded > 0) && (
                                                        <>
                                                            <Divider />
                                                            <div>
                                                                <div className='flex items-center justify-between mb-1'>
                                                                    <span className='text-xs text-zinc-500'>
                                                                        Holidays excluded:
                                                                    </span>
                                                                    <span className='text-xs font-medium text-success-600'>
                                                                        {periodData.totalHolidaysExcluded} day{periodData.totalHolidaysExcluded !== 1 ? 's' : ''} not counted
                                                                    </span>
                                                                </div>
                                                                {periodData.holidays.length > 0 && (
                                                                    <div className='flex flex-wrap gap-1 mt-1'>
                                                                        {periodData.holidays.map(
                                                                            (h, i) => (
                                                                                <Chip
                                                                                    key={i}
                                                                                    size='sm'
                                                                                    variant='flat'
                                                                                    color='success'
                                                                                >
                                                                                    {h}
                                                                                </Chip>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ) : null}
                                        </CardBody>
                                    </Card>
                                )}

                                <Textarea
                                    label='Reason (Optional)'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Provide a reason for your leave request'
                                    value={formData.reason}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, reason: value })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />

                                {/* File Upload Section */}
                                {LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(formData.leaveType as any) && (
                                    <div className='space-y-3'>
                                        <div className='flex items-center gap-2 mb-2 text-warning-600'>
                                            <AlertCircle className='size-4' />
                                            <span className='text-sm font-medium'>
                                                Supporting Documents Required
                                            </span>
                                        </div>
                                        
                                        <div className='space-y-2'>
                                            <input
                                                type='file'
                                                multiple
                                                accept='.pdf,.doc,.docx,.jpg,.jpeg,.png'
                                                onChange={handleFileChange}
                                                className='block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-50 file:text-zinc-700 hover:file:bg-zinc-100 dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:hover:file:bg-zinc-700'
                                            />
                                            
                                            {attachments.length > 0 && (
                                                <div className='space-y-2'>
                                                    <p className='text-xs text-zinc-500'>Selected files:</p>
                                                    {attachments.map((file, index) => (
                                                        <div key={index} className='flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800'>
                                                            <div className='flex items-center gap-2'>
                                                                <FileText className='size-4 text-zinc-400' />
                                                                <span className='text-sm truncate max-w-[200px]'>{file.name}</span>
                                                                <span className='text-xs text-zinc-500'>({(file.size / 1024).toFixed(1)} KB)</span>
                                                            </div>
                                                            <Button
                                                                size='sm'
                                                                color='danger'
                                                                variant='flat'
                                                                isIconOnly
                                                                onPress={() => removeAttachment(index)}
                                                            >
                                                                <XCircle className='size-4' />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
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
                                    onPress={() => handleCreateRequest(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !formData.startDate ||
                                        !formData.endDate ||
                                        !periodData ||
                                        periodData.workingDays === 0 ||
                                        (LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(formData.leaveType as any) && attachments.length === 0)
                                    }
                                >
                                    Submit Request
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Request Drawer */}
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
                                    Leave Request Details
                                </span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedRequest && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900/10 dark:to-warning-800/20 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                            <CardBody className='py-5'>
                                                <div className='flex items-center justify-between mb-3'>
                                                    <LeaveTypeChip
                                                        type={selectedRequest.leaveType}
                                                    />
                                                    <LeaveStatusChip
                                                        status={selectedRequest.status}
                                                    />
                                                </div>
                                                <h3 className='text-2xl font-bold'>
                                                    {selectedRequest.workingDays} Working Day
                                                    {selectedRequest.workingDays !== 1
                                                        ? "s"
                                                        : ""}
                                                </h3>
                                                <p className='text-sm text-zinc-600 dark:text-zinc-400 mt-1'>
                                                    {formatDateRange(
                                                        selectedRequest.startDate,
                                                        selectedRequest.endDate
                                                    )}
                                                </p>
                                            </CardBody>
                                        </Card>

                                        {/* Staff Info */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <User className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Staff Information
                                                </span>
                                            </div>
                                            <Card className='shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                                <CardBody className='p-4 space-y-2'>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Name
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {selectedRequest.staff?.name}
                                                        </span>
                                                    </div>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Staff ID
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {selectedRequest.staff?.staffId}
                                                        </span>
                                                    </div>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Department
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {selectedRequest.departmentNameSnapshot ||
                                                                selectedRequest.department
                                                                    ?.name}
                                                        </span>
                                                    </div>
                                                    <div className='flex justify-between'>
                                                        <span className='text-sm text-zinc-500'>
                                                            Position
                                                        </span>
                                                        <span className='text-sm font-medium'>
                                                            {selectedRequest.positionTitleSnapshot ||
                                                                selectedRequest.position
                                                                    ?.title}
                                                        </span>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        </div>

                                        {/* Reason */}
                                        {selectedRequest.reason && (
                                            <div className='px-1'>
                                                <div className='flex items-center gap-2 mb-3'>
                                                    <FileText className='size-4 text-zinc-400' />
                                                    <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                        Reason
                                                    </span>
                                                </div>
                                                <p className='text-sm text-zinc-600 dark:text-zinc-400 pl-6'>
                                                    {selectedRequest.reason}
                                                </p>
                                            </div>
                                        )}

                                        {/* Attachments */}
                                        {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                                            <div className='px-1'>
                                                <div className='flex items-center gap-2 mb-3'>
                                                    <Paperclip className='size-4 text-zinc-400' />
                                                    <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                        Supporting Documents
                                                    </span>
                                                </div>
                                                <div className='space-y-2 pl-6'>
                                                    {selectedRequest.attachments.map((attachment: any, index: number) => (
                                                        <div key={index} className='flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800'>
                                                            <div className='flex items-center gap-3'>
                                                                <div className='size-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center'>
                                                                    <FileText className='size-4 text-zinc-500' />
                                                                </div>
                                                                <div>
                                                                    <p className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>
                                                                        {attachment.filename}
                                                                    </p>
                                                                    <p className='text-xs text-zinc-500'>
                                                                        {(attachment.size / 1024).toFixed(1)} KB • {attachment.fileType}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <Button
                                                                size='sm'
                                                                color='primary'
                                                                variant='flat'
                                                                startContent={<Download className='size-4' />}
                                                                onPress={() => {
                                                                    // Open the file in a new tab
                                                                    window.open(attachment.url, '_blank')
                                                                }}
                                                            >
                                                                View
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Workflow Status */}
                                        <Divider />
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <ChevronRight className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Workflow
                                                </span>
                                            </div>
                                            <div className='space-y-3 pl-6'>
                                                {/* Submitted */}
                                                <div className='flex items-start gap-3'>
                                                    <div className='size-6 rounded-full bg-success-100 dark:bg-success-900/20 flex items-center justify-center flex-shrink-0'>
                                                        <CheckCircle className='size-3 text-success-600' />
                                                    </div>
                                                    <div>
                                                        <p className='text-sm font-medium'>
                                                            Submitted
                                                        </p>
                                                        <p className='text-xs text-zinc-500'>
                                                            {DateTime.fromISO(
                                                                selectedRequest.createdAt
                                                            ).toFormat(
                                                                "LLL d, yyyy 'at' h:mm a"
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Endorsement */}
                                                {selectedRequest.endorsement && (
                                                    <div className='flex items-start gap-3'>
                                                        <div
                                                            className={`size-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                                selectedRequest.endorsement
                                                                    .at
                                                                    ? "bg-success-100 dark:bg-success-900/20"
                                                                    : "bg-zinc-100 dark:bg-zinc-800"
                                                            }`}
                                                        >
                                                            {selectedRequest.endorsement
                                                                .at ? (
                                                                <ThumbsUp className='size-3 text-success-600' />
                                                            ) : (
                                                                <Clock className='size-3 text-zinc-400' />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className='text-sm font-medium'>
                                                                {selectedRequest.endorsement
                                                                    .at
                                                                    ? "Endorsed"
                                                                    : "Pending Endorsement"}
                                                            </p>
                                                            {selectedRequest.endorsement
                                                                .at && (
                                                                <p className='text-xs text-zinc-500'>
                                                                    {DateTime.fromISO(
                                                                        selectedRequest
                                                                            .endorsement.at
                                                                    ).toFormat(
                                                                        "LLL d, yyyy 'at' h:mm a"
                                                                    )}
                                                                </p>
                                                            )}
                                                            {selectedRequest.endorsement
                                                                .comment && (
                                                                <p className='text-xs text-zinc-600 dark:text-zinc-400 mt-1 italic'>
                                                                    "
                                                                    {
                                                                        selectedRequest
                                                                            .endorsement
                                                                            .comment
                                                                    }
                                                                    "
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Approval */}
                                                {selectedRequest.approval && (
                                                    <div className='flex items-start gap-3'>
                                                        <div
                                                            className={`size-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                                selectedRequest.approval
                                                                    .decision === "approved"
                                                                    ? "bg-success-100 dark:bg-success-900/20"
                                                                    : selectedRequest.approval
                                                                          .decision ===
                                                                      "rejected"
                                                                    ? "bg-danger-100 dark:bg-danger-900/20"
                                                                    : "bg-zinc-100 dark:bg-zinc-800"
                                                            }`}
                                                        >
                                                            {selectedRequest.approval
                                                                .decision === "approved" ? (
                                                                <CheckCircle className='size-3 text-success-600' />
                                                            ) : selectedRequest.approval
                                                                  .decision ===
                                                              "rejected" ? (
                                                                <XCircle className='size-3 text-danger-600' />
                                                            ) : (
                                                                <Clock className='size-3 text-zinc-400' />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className='text-sm font-medium'>
                                                                {selectedRequest.approval
                                                                    .decision === "approved"
                                                                    ? "Approved"
                                                                    : selectedRequest
                                                                          .approval
                                                                          .decision ===
                                                                      "rejected"
                                                                    ? "Rejected"
                                                                    : "Pending Approval"}
                                                            </p>
                                                            {selectedRequest.approval
                                                                .at && (
                                                                <p className='text-xs text-zinc-500'>
                                                                    {DateTime.fromISO(
                                                                        selectedRequest
                                                                            .approval.at
                                                                    ).toFormat(
                                                                        "LLL d, yyyy 'at' h:mm a"
                                                                    )}
                                                                </p>
                                                            )}
                                                            {selectedRequest.approval
                                                                .comment && (
                                                                <p className='text-xs text-zinc-600 dark:text-zinc-400 mt-1 italic'>
                                                                    "
                                                                    {
                                                                        selectedRequest
                                                                            .approval
                                                                            .comment
                                                                    }
                                                                    "
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Cancellation */}
                                                {selectedRequest.cancellation && (
                                                    <div className='flex items-start gap-3'>
                                                        <div className='size-6 rounded-full bg-danger-100 dark:bg-danger-900/20 flex items-center justify-center flex-shrink-0'>
                                                            <XCircle className='size-3 text-danger-600' />
                                                        </div>
                                                        <div>
                                                            <p className='text-sm font-medium'>
                                                                Cancelled
                                                            </p>
                                                            <p className='text-xs text-zinc-500'>
                                                                {DateTime.fromISO(
                                                                    selectedRequest
                                                                        .cancellation.at
                                                                ).toFormat(
                                                                    "LLL d, yyyy 'at' h:mm a"
                                                                )}
                                                            </p>
                                                            {selectedRequest.cancellation
                                                                .reason && (
                                                                <p className='text-xs text-zinc-600 dark:text-zinc-400 mt-1 italic'>
                                                                    "
                                                                    {
                                                                        selectedRequest
                                                                            .cancellation
                                                                            .reason
                                                                    }
                                                                    "
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </DrawerBody>
                            <DrawerFooter className='border-t border-zinc-200 dark:border-zinc-800'>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                >
                                    Close
                                </Button>
                                {selectedRequest && canWithdraw(selectedRequest) && (
                                    <Button
                                        color='warning'
                                        startContent={<Undo2 className='size-4' />}
                                        onPress={() => {
                                            onClose()
                                            withdrawDisclosure.onOpen()
                                        }}
                                    >
                                        Withdraw
                                    </Button>
                                )}
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Endorse Modal */}
            <Modal
                isOpen={endorseDisclosure.isOpen}
                onOpenChange={endorseDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Endorse Leave Request</ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    You are about to endorse the leave request for{" "}
                                    <span className='font-semibold'>
                                        {selectedRequest?.staff?.name}
                                    </span>
                                    .
                                </p>
                                <Textarea
                                    label='Comment (Optional)'
                                    placeholder='Add a comment...'
                                    variant='bordered'
                                    value={actionComment}
                                    onValueChange={setActionComment}
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isActioning}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='success'
                                    onPress={() => handleEndorse(onClose)}
                                    isLoading={isActioning}
                                >
                                    Endorse
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Approve Modal */}
            <Modal
                isOpen={approveDisclosure.isOpen}
                onOpenChange={approveDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Approve Leave Request</ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    You are about to approve the leave request for{" "}
                                    <span className='font-semibold'>
                                        {selectedRequest?.staff?.name}
                                    </span>
                                    . This will deduct{" "}
                                    <span className='font-semibold'>
                                        {selectedRequest?.workingDays} day
                                        {selectedRequest?.workingDays !== 1 ? "s" : ""}
                                    </span>{" "}
                                    from their leave balance.
                                </p>
                                <Textarea
                                    label='Comment (Optional)'
                                    placeholder='Add a comment...'
                                    variant='bordered'
                                    value={actionComment}
                                    onValueChange={setActionComment}
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isActioning}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='success'
                                    onPress={() => handleApprove(onClose)}
                                    isLoading={isActioning}
                                >
                                    Approve
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Reject Modal */}
            <Modal
                isOpen={rejectDisclosure.isOpen}
                onOpenChange={rejectDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Reject Leave Request</ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    You are about to reject the leave request for{" "}
                                    <span className='font-semibold'>
                                        {selectedRequest?.staff?.name}
                                    </span>
                                    .
                                </p>
                                <Textarea
                                    label='Reason'
                                    placeholder='Provide a reason for rejection...'
                                    variant='bordered'
                                    isRequired
                                    value={actionComment}
                                    onValueChange={setActionComment}
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isActioning}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='danger'
                                    onPress={() =>
                                        handleReject(
                                            onClose,
                                            selectedRequest?.status === LeaveStatus.PENDING
                                                ? "endorsement"
                                                : "approval"
                                        )
                                    }
                                    isLoading={isActioning}
                                    isDisabled={!actionComment.trim()}
                                >
                                    Reject
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Withdraw Modal */}
            <Modal
                isOpen={withdrawDisclosure.isOpen}
                onOpenChange={withdrawDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Withdraw Leave Request</ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to withdraw this leave request?
                                </p>
                                <Textarea
                                    label='Reason (Optional)'
                                    placeholder='Provide a reason...'
                                    variant='bordered'
                                    value={actionComment}
                                    onValueChange={setActionComment}
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isActioning}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='warning'
                                    onPress={() => handleWithdraw(onClose)}
                                    isLoading={isActioning}
                                >
                                    Withdraw
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
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
