import {
    addToast,
    Autocomplete,
    AutocompleteItem,
    Button,
    Card,
    CardBody,
    Chip,
    DatePicker,
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
    RadioGroup,
    Radio,
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
import * as XLSX from 'xlsx'
import {
    LeaveRequestInterface,
    LeaveTypes,
    LeaveStatus,
    LEAVE_CAPS,
    LEAVE_TYPES_REQUIRING_DOCUMENTS,
    GENDER_RESTRICTED_LEAVES,
    Gender,
    StaffInterface,
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
    Users,
    XCircle,
    Building2,
    Briefcase,
    Calendar,
    AlertCircle,
    Paperclip,
    Download,
    Pencil,
    Trash2,
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
    const canDelegate = sessionData?.user?.permissions?.includes("DELEGATE")

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

    // Fetch my endorsed requests
    const {
        data: myEndorsedData,
        isLoading: myEndorsedLoading,
        mutate: mutateMyEndorsed,
    } = useSWR(
        currentTab === "my-endorsed" && canEndorse
            ? `${baseUrl}/leave-requests?op=my-endorsed`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch my approved requests
    const {
        data: myApprovedData,
        isLoading: myApprovedLoading,
        mutate: mutateMyApproved,
    } = useSWR(
        currentTab === "my-approved" && canApprove
            ? `${baseUrl}/leave-requests?op=my-approved`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch delegated requests
    const {
        data: delegatedRequestsData,
        isLoading: delegatedRequestsLoading,
        mutate: mutateDelegatedRequests,
    } = useSWR(
        currentTab === "delegated-requests"
            ? `${baseUrl}/leave-requests?op=delegated-requests`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch my leave balances
    const { data: balancesData, isLoading: balancesLoading } = useSWR(
        `${baseUrl}/leave-balances?op=by-staff&staffId=${sessionData?.user?._id}`,
        fetcher(sessionData.token as string)
    )

    // Delegation state
    const [requestMode, setRequestMode] = useState<"self" | "delegated">("self")
    const [delegateForStaff, setDelegateForStaff] = useState<string | null>(null)

    // Fetch staff for delegation (server-side search, all active staff)
    const [delegateStaffSearch, setDelegateStaffSearch] = useState("")
    const { data: deptStaffData } = useSWR(
        canDelegate && requestMode === "delegated"
            ? `${baseUrl}/staff?search=${encodeURIComponent(delegateStaffSearch)}`
            : null,
        fetcher(sessionData.token as string)
    )

    // Fetch delegate target's leave balances (when delegating for someone)
    const { data: delegateBalancesData } = useSWR(
        requestMode === "delegated" && delegateForStaff
            ? `${baseUrl}/leave-balances?op=by-staff&staffId=${delegateForStaff}`
            : null,
        fetcher(sessionData.token as string)
    )

    // Get staff list excluding self (supports both search and by-department response shapes)
    const departmentStaff = (deptStaffData?.data?.staff || deptStaffData?.data || []).filter(
        (s: StaffInterface) => s._id !== sessionData?.user?._id
    )

    // Disclosures
    const createDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const endorseDisclosure = useDisclosure()
    const approveDisclosure = useDisclosure()
    const rejectDisclosure = useDisclosure()
    const withdrawDisclosure = useDisclosure()
    const editDisclosure = useDisclosure()
    const deleteDisclosure = useDisclosure()

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

    // Get available leave types based on gender (uses delegate's gender when in delegated mode)
    const getAvailableLeaveTypes = () => {
        let gender = sessionData?.user?.gender
        if (requestMode === "delegated" && delegateForStaff) {
            const targetStaff = departmentStaff.find((s: StaffInterface) => s._id === delegateForStaff)
            if (targetStaff) {
                gender = targetStaff.gender
            }
        }
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

    // Get balance for a leave type (uses delegate's balances when in delegated mode)
    const getBalance = (leaveType: LeaveTypes) => {
        const sourceData = (requestMode === "delegated" && delegateForStaff)
            ? delegateBalancesData
            : balancesData
        const balance = sourceData?.data?.balances?.find(
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

    // Export utility functions
    const exportToCSV = (data: any[], filename: string, headers: string[], dataMapper: (item: any) => string[]) => {
        const csvContent = [
            headers.join(','),
            ...data.map(dataMapper).map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `${filename}_${DateTime.now().toFormat('yyyy-MM-dd')}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const exportToExcel = (data: any[], filename: string, headers: string[], dataMapper: (item: any) => any[], sheetName?: string) => {
        // Prepare data for Excel
        const worksheetData = [headers, ...data.map(dataMapper)]
        
        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(worksheetData)
        
        // Create workbook
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1')
        
        // Auto-size columns
        const colWidths = headers.map(header => ({ wch: Math.max(header.length, 15) }))
        ws['!cols'] = colWidths
        
        // Generate Excel file and download
        XLSX.writeFile(wb, `${filename}_${DateTime.now().toFormat('yyyy-MM-dd')}.xlsx`)
    }

    const exportMyRequests = () => {
        if (!myRequestsData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Status", "Created At"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.status || '',
            DateTime.fromISO(request.createdAt).toFormat('yyyy-MM-dd HH:mm')
        ]
        
        exportToCSV(myRequestsData.data.requests, 'my_requests', headers, dataMapper)
    }

    const exportMyRequestsExcel = () => {
        if (!myRequestsData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Status", "Created At"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.status || '',
            DateTime.fromISO(request.createdAt).toFormat('yyyy-MM-dd HH:mm')
        ]
        
        exportToExcel(myRequestsData.data.requests, 'my_requests', headers, dataMapper, 'My Leave Requests')
    }

    const exportPendingEndorsements = () => {
        if (!endorsementsData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Created At", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            DateTime.fromISO(request.createdAt).toFormat('yyyy-MM-dd HH:mm'),
            request.department?.name || ''
        ]
        
        exportToCSV(endorsementsData.data.requests, 'pending_endorsements', headers, dataMapper)
    }

    const exportPendingEndorsementsExcel = () => {
        if (!endorsementsData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Created At", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            DateTime.fromISO(request.createdAt).toFormat('yyyy-MM-dd HH:mm'),
            request.department?.name || ''
        ]
        
        exportToExcel(endorsementsData.data.requests, 'pending_endorsements', headers, dataMapper, 'Pending Endorsements')
    }

    const exportPendingApprovals = () => {
        if (!approvalsData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Endorsed By", "Endorsed At", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.endorsement?.byStaff?.name || '',
            request.endorsement?.at ? DateTime.fromISO(request.endorsement.at).toFormat('yyyy-MM-dd HH:mm') : '',
            request.department?.name || ''
        ]
        
        exportToCSV(approvalsData.data.requests, 'pending_approvals', headers, dataMapper)
    }

    const exportPendingApprovalsExcel = () => {
        if (!approvalsData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Endorsed By", "Endorsed At", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.endorsement?.byStaff?.name || '',
            request.endorsement?.at ? DateTime.fromISO(request.endorsement.at).toFormat('yyyy-MM-dd HH:mm') : '',
            request.department?.name || ''
        ]
        
        exportToExcel(approvalsData.data.requests, 'pending_approvals', headers, dataMapper, 'Pending Approvals')
    }

    const exportDelegatedRequests = () => {
        if (!delegatedRequestsData?.data?.requests?.length) return
        
        const headers = ["Requested For", "Requested For ID", "Leave Type", "Start Date", "End Date", "Working Days", "Requested By", "Status", "Created At"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.delegatedBy?.name || '',
            request.status || '',
            DateTime.fromISO(request.createdAt).toFormat('yyyy-MM-dd HH:mm')
        ]
        
        exportToCSV(delegatedRequestsData.data.requests, 'delegated_requests', headers, dataMapper)
    }

    const exportDelegatedRequestsExcel = () => {
        if (!delegatedRequestsData?.data?.requests?.length) return
        
        const headers = ["Requested For", "Requested For ID", "Leave Type", "Start Date", "End Date", "Working Days", "Requested By", "Status", "Created At"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.delegatedBy?.name || '',
            request.status || '',
            DateTime.fromISO(request.createdAt).toFormat('yyyy-MM-dd HH:mm')
        ]
        
        exportToExcel(delegatedRequestsData.data.requests, 'delegated_requests', headers, dataMapper, 'Delegated Requests')
    }

    const exportMyEndorsed = () => {
        if (!myEndorsedData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Endorsed At", "Current Status", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.endorsedAt || request.endorsement?.at ? DateTime.fromISO(request.endorsedAt || request.endorsement.at).toFormat('yyyy-MM-dd HH:mm') : '',
            request.status || '',
            request.department?.name || ''
        ]
        
        exportToCSV(myEndorsedData.data.requests, 'my_endorsed_requests', headers, dataMapper)
    }

    const exportMyEndorsedExcel = () => {
        if (!myEndorsedData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Endorsed At", "Current Status", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.endorsedAt || request.endorsement?.at ? DateTime.fromISO(request.endorsedAt || request.endorsement.at).toFormat('yyyy-MM-dd HH:mm') : '',
            request.status || '',
            request.department?.name || ''
        ]
        
        exportToExcel(myEndorsedData.data.requests, 'my_endorsed_requests', headers, dataMapper, 'My Endorsed Requests')
    }

    const exportMyApproved = () => {
        if (!myApprovedData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Approved At", "Current Status", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.approvedAt || request.approval?.at ? DateTime.fromISO(request.approvedAt || request.approval.at).toFormat('yyyy-MM-dd HH:mm') : '',
            request.status || '',
            request.department?.name || ''
        ]
        
        exportToCSV(myApprovedData.data.requests, 'my_approved_requests', headers, dataMapper)
    }

    const exportMyApprovedExcel = () => {
        if (!myApprovedData?.data?.requests?.length) return
        
        const headers = ["Staff Name", "Staff ID", "Leave Type", "Start Date", "End Date", "Working Days", "Approved At", "Current Status", "Department"]
        const dataMapper = (request: any) => [
            request.staff?.name || '',
            request.staff?.staffId || '',
            request.leaveType || '',
            DateTime.fromISO(request.startDate).toFormat('yyyy-MM-dd'),
            DateTime.fromISO(request.endDate).toFormat('yyyy-MM-dd'),
            request.workingDays || 0,
            request.approvedAt || request.approval?.at ? DateTime.fromISO(request.approvedAt || request.approval.at).toFormat('yyyy-MM-dd HH:mm') : '',
            request.status || '',
            request.department?.name || ''
        ]
        
        exportToExcel(myApprovedData.data.requests, 'my_approved_requests', headers, dataMapper, 'My Approved Requests')
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

            const payload: any = {
                leaveType: formData.leaveType,
                startDate: formData.startDate,
                endDate: formData.endDate,
                reason: formData.reason || undefined,
                attachments: uploadedAttachments,
            }

            // Add delegation data if in delegated mode
            if (requestMode === "delegated" && delegateForStaff) {
                payload.delegateForStaffId = delegateForStaff
            }

            const response = await axios.post(
                `${baseUrl}/leave-requests`,
                payload,
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
            setRequestMode("self")
            setDelegateForStaff(null)

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
                { reason: actionComment },
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
        // Handle all possible staff data structures from API
        let staffId = null
        
        if (request.staff?._id) {
            staffId = request.staff._id
        } else if (request.staff?.id) {
            staffId = request.staff.id
        } else if (typeof request.staff === 'string') {
            staffId = request.staff
        } else if (request.staffId) {
            staffId = request.staffId
        } else if (request.staff_id) {
            staffId = request.staff_id
        }
        
        const isOwner = staffId === sessionData?.user?.id
        const status = request.status?.toLowerCase()
        
        // Allow withdrawal for various pending/early statuses
        const withdrawableStatuses = [
            LeaveStatus.PENDING, // "pending_endorsement"
            LeaveStatus.ENDORSED, // "endorsed"
            "pending", // in case API returns just "pending"
            "pending_approval", // in case API returns this
            "awaiting_endorsement", // alternative
        ]
        
        return isOwner && withdrawableStatuses.includes(status)
    }

    // Can withdraw delegated request check
    const canWithdrawDelegated = (request: any) => {
        // Check if the current user is the person the request was made for
        let staffId = null
        
        if (request.staff?._id) {
            staffId = request.staff._id
        } else if (request.staff?.id) {
            staffId = request.staff.id
        } else if (typeof request.staff === 'string') {
            staffId = request.staff
        } else if (request.staffId) {
            staffId = request.staffId
        } else if (request.staff_id) {
            staffId = request.staff_id
        }
        
        const isRequestedForUser = staffId === sessionData?.user?._id || staffId === sessionData?.user?.id
        const status = request.status?.toLowerCase()
        
        // Allow withdrawal for various pending/early statuses
        const withdrawableStatuses = [
            LeaveStatus.PENDING,
            LeaveStatus.ENDORSED,
            "pending",
            "pending_approval",
            "awaiting_endorsement",
        ]
        
        return isRequestedForUser && withdrawableStatuses.includes(status)
    }

    // Can edit/delete check - owner, creator, or delegator can edit/delete pending requests
    const canEditOrDelete = (request: any) => {
        let staffId = null
        if (request.staff?._id) {
            staffId = request.staff._id
        } else if (request.staff?.id) {
            staffId = request.staff.id
        } else if (typeof request.staff === 'string') {
            staffId = request.staff
        } else if (request.staffId) {
            staffId = request.staffId
        }

        const userId = sessionData?.user?._id || sessionData?.user?.id
        const isOwner = staffId === userId
        const isCreator = request.createdBy === userId || request.createdBy?._id === userId
        const isDelegator = request.delegatedBy === userId || request.delegatedBy?._id === userId
        const status = request.status?.toLowerCase()

        return (isOwner || isCreator || isDelegator) && status === LeaveStatus.PENDING
    }

    // Handle delete request
    const handleDeleteRequest = async (onClose: () => void) => {
        if (!selectedRequest) return

        setIsActioning(true)
        try {
            await axios.delete(
                `${baseUrl}/leave-requests/${selectedRequest._id}`,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            await mutateMyRequests()
            await mutateDelegatedRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request deleted",
            })
        } catch (error: any) {
            console.error("Error deleting request:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to delete request",
            })
        } finally {
            setIsActioning(false)
        }
    }

    // Handle edit request - opens create drawer prefilled with selected request data
    const handleEditRequest = (request: any) => {
        setSelectedRequest(request)
        setFormData({
            leaveType: request.leaveType,
            startDate: request.startDate ? DateTime.fromISO(request.startDate).toFormat("yyyy-MM-dd") : "",
            endDate: request.endDate ? DateTime.fromISO(request.endDate).toFormat("yyyy-MM-dd") : "",
            reason: request.reason || "",
        })
        editDisclosure.onOpen()
    }

    // Handle edit submit
    const handleEditSubmit = async (onClose: () => void) => {
        if (!selectedRequest) return

        setIsSubmitting(true)
        try {
            await axios.put(
                `${baseUrl}/leave-requests/${selectedRequest._id}`,
                {
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    reason: formData.reason,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            setFormData({
                leaveType: LeaveTypes.ANNUAL,
                startDate: "",
                endDate: "",
                reason: "",
            })
            setSelectedRequest(null)
            await mutateMyRequests()
            await mutateDelegatedRequests()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Leave request updated successfully",
            })
        } catch (error: any) {
            console.error("Error updating request:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to update request",
            })
        } finally {
            setIsSubmitting(false)
        }
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
                    {canEditOrDelete(request) ? (
                        <>
                            <Tooltip content='Edit request'>
                                <Button
                                    size='sm'
                                    color='primary'
                                    variant='flat'
                                    isIconOnly
                                    onPress={() => handleEditRequest(request)}
                                >
                                    <Pencil className='size-4' />
                                </Button>
                            </Tooltip>
                            <Tooltip content='Delete request'>
                                <Button
                                    size='sm'
                                    color='danger'
                                    variant='flat'
                                    isIconOnly
                                    onPress={() => {
                                        setSelectedRequest(request)
                                        deleteDisclosure.onOpen()
                                    }}
                                >
                                    <Trash2 className='size-4' />
                                </Button>
                            </Tooltip>
                        </>
                    ) : null}
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

    // Render delegated request row for table
    const renderDelegatedRequestRow = (request: any) => (
        <TableRow key={request._id}>
            <TableCell>
                <div className='flex flex-col'>
                    <span className='font-medium'>{request.staff?.name}</span>
                    <span className='text-xs text-zinc-500'>
                        {request.staff?.staffId}
                    </span>
                    <span className='text-xs text-primary'>
                        Requested by: {request.delegatedBy?.name}
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
                    {canEditOrDelete(request) ? (
                        <>
                            <Tooltip content='Edit request'>
                                <Button
                                    size='sm'
                                    color='primary'
                                    variant='flat'
                                    isIconOnly
                                    onPress={() => handleEditRequest(request)}
                                >
                                    <Pencil className='size-4' />
                                </Button>
                            </Tooltip>
                            <Tooltip content='Delete request'>
                                <Button
                                    size='sm'
                                    color='danger'
                                    variant='flat'
                                    isIconOnly
                                    onPress={() => {
                                        setSelectedRequest(request)
                                        deleteDisclosure.onOpen()
                                    }}
                                >
                                    <Trash2 className='size-4' />
                                </Button>
                            </Tooltip>
                        </>
                    ) : null}
                    {canWithdrawDelegated(request) ? (
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

    // Render endorsed request row for table
    const renderEndorsedRequestRow = (request: any) => (
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
                {request.endorsedAt || request.endorsement?.at ? 
                    DateTime.fromISO(request.endorsedAt || request.endorsement?.at).toRelative() : 
                    '-'
                }
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
                </div>
            </TableCell>
        </TableRow>
    )

    // Render approved request row for table
    const renderApprovedRequestRow = (request: any) => (
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
                {request.approvedAt || request.approval?.at ? 
                    DateTime.fromISO(request.approvedAt || request.approval?.at).toRelative() : 
                    '-'
                }
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
                        {canEndorse && (
                            <button
                                onClick={() => handleTabChange("my-endorsed")}
                                className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                                    currentTab === "my-endorsed"
                                        ? "border-warning text-warning"
                                        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                }`}
                            >
                                <ThumbsUp className='size-4' />
                                <span>My Endorsed</span>
                                {myEndorsedData?.data?.requests?.length > 0 && (
                                    <Chip size='sm' color='warning' variant='flat'>
                                        {myEndorsedData.data.requests.length}
                                    </Chip>
                                )}
                            </button>
                        )}
                        {canApprove && (
                            <button
                                onClick={() => handleTabChange("my-approved")}
                                className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                                    currentTab === "my-approved"
                                        ? "border-success text-success"
                                        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                }`}
                            >
                                <CheckCircle className='size-4' />
                                <span>My Approved</span>
                                {myApprovedData?.data?.requests?.length > 0 && (
                                    <Chip size='sm' color='success' variant='flat'>
                                        {myApprovedData.data.requests.length}
                                    </Chip>
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => handleTabChange("delegated-requests")}
                            className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                                currentTab === "delegated-requests"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                        >
                            <Users className='size-4' />
                            <span>Delegated Requests</span>
                            {delegatedRequestsData?.data?.requests?.length > 0 && (
                                <Chip size='sm' color='primary' variant='flat'>
                                    {delegatedRequestsData.data.requests.length}
                                </Chip>
                            )}
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className='mt-4'>
                        {currentTab === "my-requests" && (
                            <>
                                <div className='flex justify-between items-center mb-4'>
                                    <h3 className='text-lg font-semibold'>My Leave Requests</h3>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportMyRequests}
                                            isDisabled={!myRequestsData?.data?.requests?.length}
                                        >
                                            Export CSV
                                        </Button>
                                        <Button
                                            size='sm'
                                            color='success'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportMyRequestsExcel}
                                            isDisabled={!myRequestsData?.data?.requests?.length}
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
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
                                                {canEditOrDelete(request) && (
                                                    <div className='mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 flex gap-2'>
                                                        <Button
                                                            size='sm'
                                                            color='primary'
                                                            variant='flat'
                                                            startContent={<Pencil className='size-4' />}
                                                            onPress={() => handleEditRequest(request)}
                                                            className='flex-1'
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size='sm'
                                                            color='danger'
                                                            variant='flat'
                                                            startContent={<Trash2 className='size-4' />}
                                                            onPress={() => {
                                                                setSelectedRequest(request)
                                                                deleteDisclosure.onOpen()
                                                            }}
                                                            className='flex-1'
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                )}
                                                {canWithdraw(request) && (
                                                    <div className='mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700'>
                                                        <Button
                                                            size='sm'
                                                            color='warning'
                                                            variant='flat'
                                                            startContent={<Undo2 className='size-4' />}
                                                            onPress={() => {
                                                                setSelectedRequest(request)
                                                                withdrawDisclosure.onOpen()
                                                            }}
                                                            className='w-full'
                                                        >
                                                            Withdraw Request
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    }))}
                                />
                            </>
                        )}
                        {currentTab === "pending-endorsements" && canEndorse && (
                            <>
                                <div className='flex justify-between items-center mb-4'>
                                    <h3 className='text-lg font-semibold'>Pending Endorsements</h3>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportPendingEndorsements}
                                            isDisabled={!endorsementsData?.data?.requests?.length}
                                        >
                                            Export CSV
                                        </Button>
                                        <Button
                                            size='sm'
                                            color='success'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportPendingEndorsementsExcel}
                                            isDisabled={!endorsementsData?.data?.requests?.length}
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
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
                                <div className='flex justify-between items-center mb-4'>
                                    <h3 className='text-lg font-semibold'>Pending Approvals</h3>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportPendingApprovals}
                                            isDisabled={!approvalsData?.data?.requests?.length}
                                        >
                                            Export CSV
                                        </Button>
                                        <Button
                                            size='sm'
                                            color='success'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportPendingApprovalsExcel}
                                            isDisabled={!approvalsData?.data?.requests?.length}
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
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
                        {currentTab === "delegated-requests" && (
                            <>
                                <div className='flex justify-between items-center mb-4'>
                                    <h3 className='text-lg font-semibold'>Delegated Requests</h3>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportDelegatedRequests}
                                            isDisabled={!delegatedRequestsData?.data?.requests?.length}
                                        >
                                            Export CSV
                                        </Button>
                                        <Button
                                            size='sm'
                                            color='success'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportDelegatedRequestsExcel}
                                            isDisabled={!delegatedRequestsData?.data?.requests?.length}
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
                                <DataTable
                                    isLoading={delegatedRequestsLoading}
                                    columns={["Requested For", "Leave Type", "Date Range", "Days", "Status", "Actions"]}
                                >
                                    {delegatedRequestsData?.data?.requests?.map((request: any) => renderDelegatedRequestRow(request))}
                                </DataTable>
                                <MobileList
                                    isLoading={delegatedRequestsLoading}
                                    isEmpty={!delegatedRequestsData?.data?.requests?.length}
                                    emptyContent='No delegated requests found'
                                    listContent={delegatedRequestsData?.data?.requests?.map((request: any) => ({
                                        startIcon: <Users className='size-5 text-primary' />,
                                        content: (
                                            <div onClick={() => handleViewRequest(request)} className='cursor-pointer'>
                                                <div className='flex items-center justify-between'>
                                                    <div className='flex flex-col'>
                                                        <span className='font-medium'>{request.staff?.name}</span>
                                                        <span className='text-xs text-zinc-500'>Requested by: {request.delegatedBy?.name}</span>
                                                    </div>
                                                    <LeaveTypeChip type={request.leaveType} />
                                                </div>
                                                <p className='text-sm mt-1'>{formatDateRange(request.startDate, request.endDate)}</p>
                                                <p className='text-xs text-zinc-500'>{request.workingDays} days</p>
                                                {canWithdrawDelegated(request) && (
                                                    <div className='mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700'>
                                                        <Button
                                                            size='sm'
                                                            color='warning'
                                                            variant='flat'
                                                            startContent={<Undo2 className='size-4' />}
                                                            onPress={() => {
                                                                setSelectedRequest(request)
                                                                withdrawDisclosure.onOpen()
                                                            }}
                                                            className='w-full'
                                                        >
                                                            Withdraw Request
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    }))}
                                />
                            </>
                        )}
                        {currentTab === "my-endorsed" && canEndorse && (
                            <>
                                <div className='flex justify-between items-center mb-4'>
                                    <h3 className='text-lg font-semibold'>My Endorsed Requests</h3>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportMyEndorsed}
                                            isDisabled={!myEndorsedData?.data?.requests?.length}
                                        >
                                            Export CSV
                                        </Button>
                                        <Button
                                            size='sm'
                                            color='success'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportMyEndorsedExcel}
                                            isDisabled={!myEndorsedData?.data?.requests?.length}
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
                                <DataTable
                                    isLoading={myEndorsedLoading}
                                    columns={["Staff", "Leave Type", "Date Range", "Days", "Endorsed At", "Status", "Actions"]}
                                >
                                    {myEndorsedData?.data?.requests?.map((request: any) => renderEndorsedRequestRow(request))}
                                </DataTable>
                                <MobileList
                                    isLoading={myEndorsedLoading}
                                    isEmpty={!myEndorsedData?.data?.requests?.length}
                                    emptyContent='No endorsed requests found'
                                    listContent={myEndorsedData?.data?.requests?.map((request: any) => ({
                                        startIcon: <ThumbsUp className='size-5 text-warning' />,
                                        content: (
                                            <div onClick={() => handleViewRequest(request)} className='cursor-pointer'>
                                                <div className='flex items-center justify-between'>
                                                    <span className='font-medium'>{request.staff?.name}</span>
                                                    <LeaveTypeChip type={request.leaveType} />
                                                </div>
                                                <p className='text-sm mt-1'>{formatDateRange(request.startDate, request.endDate)}</p>
                                                <p className='text-xs text-zinc-500'>{request.workingDays} days - Endorsed {DateTime.fromISO(request.endorsedAt || request.endorsement?.at).toRelative()}</p>
                                            </div>
                                        ),
                                    }))}
                                />
                            </>
                        )}
                        {currentTab === "my-approved" && canApprove && (
                            <>
                                <div className='flex justify-between items-center mb-4'>
                                    <h3 className='text-lg font-semibold'>My Approved Requests</h3>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            color='primary'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportMyApproved}
                                            isDisabled={!myApprovedData?.data?.requests?.length}
                                        >
                                            Export CSV
                                        </Button>
                                        <Button
                                            size='sm'
                                            color='success'
                                            variant='flat'
                                            startContent={<Download className='size-4' />}
                                            onPress={exportMyApprovedExcel}
                                            isDisabled={!myApprovedData?.data?.requests?.length}
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
                                <DataTable
                                    isLoading={myApprovedLoading}
                                    columns={["Staff", "Leave Type", "Date Range", "Days", "Approved At", "Status", "Actions"]}
                                >
                                    {myApprovedData?.data?.requests?.map((request: any) => renderApprovedRequestRow(request))}
                                </DataTable>
                                <MobileList
                                    isLoading={myApprovedLoading}
                                    isEmpty={!myApprovedData?.data?.requests?.length}
                                    emptyContent='No approved requests found'
                                    listContent={myApprovedData?.data?.requests?.map((request: any) => ({
                                        startIcon: <CheckCircle className='size-5 text-success' />,
                                        content: (
                                            <div onClick={() => handleViewRequest(request)} className='cursor-pointer'>
                                                <div className='flex items-center justify-between'>
                                                    <span className='font-medium'>{request.staff?.name}</span>
                                                    <LeaveTypeChip type={request.leaveType} />
                                                </div>
                                                <p className='text-sm mt-1'>{formatDateRange(request.startDate, request.endDate)}</p>
                                                <p className='text-xs text-zinc-500'>{request.workingDays} days - Approved {DateTime.fromISO(request.approvedAt || request.approval?.at).toRelative()}</p>
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

                                {/* Delegation Section - only visible to users with DELEGATE permission */}
                                {canDelegate && (
                                    <div className='space-y-3'>
                                        <div>
                                            <p className='text-sm font-medium mb-2'>Request Type</p>
                                            <RadioGroup
                                                orientation='horizontal'
                                                value={requestMode}
                                                onValueChange={(value) => {
                                                    setRequestMode(value as "self" | "delegated")
                                                    if (value === "self") {
                                                        setDelegateForStaff(null)
                                                    }
                                                }}
                                                size='sm'
                                            >
                                                <Radio value='self'>Self Request</Radio>
                                                <Radio value='delegated'>Delegated Request</Radio>
                                            </RadioGroup>
                                        </div>

                                        {requestMode === "delegated" && (
                                            <>
                                                <Autocomplete
                                                    label='Request on behalf of'
                                                    variant='bordered'
                                                    labelPlacement='outside'
                                                    placeholder='Search for a staff member'
                                                    isRequired
                                                    selectedKey={delegateForStaff}
                                                    onSelectionChange={(key) =>
                                                        setDelegateForStaff(key as string)
                                                    }
                                                    onInputChange={(value) => setDelegateStaffSearch(value)}
                                                    startContent={<Users className='size-4 text-zinc-400' />}
                                                    classNames={{
                                                        base: "w-full",
                                                    }}
                                                >
                                                    {departmentStaff.map((staff: StaffInterface) => (
                                                        <AutocompleteItem
                                                            key={staff._id!}
                                                            textValue={staff.name}
                                                        >
                                                            <div className='flex items-center gap-2'>
                                                                <User className='size-4 text-zinc-400' />
                                                                <div>
                                                                    <p className='text-sm'>{staff.name}</p>
                                                                    <p className='text-xs text-zinc-500'>{staff.staffId}</p>
                                                                </div>
                                                            </div>
                                                        </AutocompleteItem>
                                                    ))}
                                                </Autocomplete>

                                                {delegateForStaff && (
                                                    <div className='p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg border border-warning-200 dark:border-warning-800'>
                                                        <div className='flex items-center gap-2 mb-1'>
                                                            <AlertCircle className='size-4 text-warning-600' />
                                                            <span className='text-sm font-medium text-warning-800 dark:text-warning-200'>
                                                                Delegated Request
                                                            </span>
                                                        </div>
                                                        <p className='text-xs text-warning-700 dark:text-warning-300'>
                                                            This leave request will be created on behalf of{' '}
                                                            <strong>{departmentStaff.find((s: StaffInterface) => s._id === delegateForStaff)?.name}</strong>.
                                                            The balance shown above reflects their available leave.
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                <Divider />

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
                                        (LEAVE_TYPES_REQUIRING_DOCUMENTS.includes(formData.leaveType as any) && attachments.length === 0) ||
                                        (requestMode === "delegated" && !delegateForStaff)
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
                                {selectedRequest && canEditOrDelete(selectedRequest) && (
                                    <>
                                        <Button
                                            color='primary'
                                            variant='flat'
                                            startContent={<Pencil className='size-4' />}
                                            onPress={() => {
                                                onClose()
                                                handleEditRequest(selectedRequest)
                                            }}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            color='danger'
                                            variant='flat'
                                            startContent={<Trash2 className='size-4' />}
                                            onPress={() => {
                                                onClose()
                                                deleteDisclosure.onOpen()
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    </>
                                )}
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

            {/* Edit Request Modal */}
            <Modal
                isOpen={editDisclosure.isOpen}
                onOpenChange={editDisclosure.onOpenChange}
                size='lg'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Edit Leave Request</ModalHeader>
                            <ModalBody>
                                <div className='flex flex-col gap-4'>
                                    <Input
                                        label='Start Date'
                                        type='date'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        value={formData.startDate}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, startDate: value })
                                        }
                                    />
                                    <Input
                                        label='End Date'
                                        type='date'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        value={formData.endDate}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, endDate: value })
                                        }
                                    />
                                    <Textarea
                                        label='Reason'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        placeholder='Update your reason...'
                                        value={formData.reason}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, reason: value })
                                        }
                                    />
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color='default'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='primary'
                                    onPress={() => handleEditSubmit(onClose)}
                                    isLoading={isSubmitting}
                                >
                                    Save Changes
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Delete Request Confirmation Modal */}
            <Modal
                isOpen={deleteDisclosure.isOpen}
                onOpenChange={deleteDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Delete Leave Request</ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to delete this leave request? This action cannot be undone.
                                </p>
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
                                    onPress={() => handleDeleteRequest(onClose)}
                                    isLoading={isActioning}
                                >
                                    Delete
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
