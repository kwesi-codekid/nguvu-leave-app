import {
    addToast,
    Autocomplete,
    AutocompleteItem,
    Avatar,
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
    TableCell,
    TableRow,
    Tooltip,
    useDisclosure,
} from "@heroui/react"
import { useState } from "react"
import axios from "axios"
import { LoaderFunctionArgs, redirect } from "react-router"
import { useLoaderData, useNavigate, useSearchParams } from "react-router"
import {
    Ban,
    Banknote,
    BriefcaseBusiness,
    Building2,
    Calendar,
    CheckCircle2,
    Clock,
    Clock3,
    Eye,
    Handshake,
    Pencil,
    Play,
    Trash2,
    User,
    Users,
    XCircle,
    Download,
} from "lucide-react"
import useSWR from "swr"
import { isAuthenticated, getSessionData } from "~/auth-session"
import { StaffAvatar } from "~/ui/components/avatars"
import { DataTable } from "~/ui/components/data-table"
import { SearchInput } from "~/ui/components/inputs"
import AppLayout from "~/ui/layouts/app-layout"
import { fetcher } from "~/ui/lib/fetcher"
import { DateTime } from "luxon"
import { exportData, formatters, ExportFormat } from "~/ui/lib/export-utils"
import { DepartmentStatsCard } from "~/ui/components/cards"
import { MobileList } from "~/ui/components/lists"
import {
    ContractStatus,
    JobPositionInterface,
    StaffContractInterface,
    StaffInterface,
} from "~/utils/types"

// Contract status options
const CONTRACT_STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "terminated", label: "Terminated" },
    { value: "expired", label: "Expired" },
    { value: "cancelled", label: "Cancelled" },
    { value: "renewed", label: "Renewed" },
]

// Currency options
const CURRENCY_OPTIONS = [
    { value: "GHS", label: "GHS - Ghana Cedis" },
    { value: "USD", label: "USD - US Dollar" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "GBP", label: "GBP - British Pound" },
]

export default function StaffContracts() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const search = searchParams.get("search") || ""
    const limit = searchParams.get("limit") || "10"
    const page = searchParams.get("page") || "1"
    const op = searchParams.get("op") || "all"

    const { data, isLoading, error, mutate } = useSWR(
        `${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`,
        fetcher(sessionData?.token as string),
        {
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            refreshInterval: 0
        }
    )
    const departmentsStats = useSWR(
        `${baseUrl}/departments?op=statistics`,
        fetcher(sessionData?.token as string)
    )

    // Fetch staff for dropdown (server-side search)
    const [staffSearch, setStaffSearch] = useState("")
    const { data: staffData } = useSWR(
        `${baseUrl}/staff?search=${staffSearch}`,
        fetcher(sessionData?.token as string)
    )

    // Fetch job positions for dropdown
    const { data: positionsData } = useSWR(
        `${baseUrl}/job-positions`,
        fetcher(sessionData?.token as string)
    )

    const createDisclosure = useDisclosure()
    const editDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const deleteDisclosure = useDisclosure()
    const terminateDisclosure = useDisclosure()

    // Selected contract for view/edit/delete
    const [selectedContract, setSelectedContract] = useState<StaffContractInterface | null>(null)
    const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("csv")

    // Form state for create
    const [formData, setFormData] = useState({
        staff: "",
        position: "",
        startDate: "",
        endDate: "",
        salary: "",
        currency: "GHS",
    })

    // Form state for edit
    const [editFormData, setEditFormData] = useState({
        staff: "",
        position: "",
        startDate: "",
        endDate: "",
        salary: "",
        currency: "GHS",
        status: "active",
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isActivating, setIsActivating] = useState(false)
    const [isTerminating, setIsTerminating] = useState(false)
    const [terminationReason, setTerminationReason] = useState("")

    // Get available positions (with available slots)
    const getAvailablePositions = () => {
        if (!positionsData?.data?.positions) return []
        return positionsData.data.positions.filter(
            (p: JobPositionInterface) =>
                p.isActive && (p.occupancy?.available || 0) > 0
        )
    }

    // Get all active positions for edit
    const getAllActivePositions = () => {
        if (!positionsData?.data?.positions) return []
        return positionsData.data.positions.filter(
            (p: JobPositionInterface) => p.isActive
        )
    }

    const handleCreateContract = async (onClose: () => void) => {
        if (!formData.staff || !formData.position || !formData.startDate) return

        setIsSubmitting(true)
        try {
            await axios.post(
                `${baseUrl}/contracts`,
                {
                    staff: formData.staff,
                    position: formData.position,
                    startDate: formData.startDate,
                    endDate: formData.endDate || undefined,
                    salary: formData.salary
                        ? parseFloat(formData.salary)
                        : undefined,
                    currency: formData.currency,
                    status: "pending",
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            // Reset form and close drawer
            setFormData({
                staff: "",
                position: "",
                startDate: "",
                endDate: "",
                salary: "",
                currency: "GHS",
            })
            await mutate(`${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`) // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Contract created successfully",
            })
        } catch (error: any) {
            console.error("Error creating contract:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to create contract",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view contract
    const handleViewContract = (contract: any) => {
        setSelectedContract(contract)
        viewDisclosure.onOpen()
    }

    // Handle edit contract - open drawer with pre-filled data
    const handleEditContract = (contract: any) => {
        setSelectedContract(contract)
        setEditFormData({
            staff: contract.staff?._id || "",
            position: contract.position?._id || "",
            startDate: contract.startDate
                ? DateTime.fromISO(contract.startDate).toFormat("yyyy-MM-dd")
                : "",
            endDate: contract.endDate
                ? DateTime.fromISO(contract.endDate).toFormat("yyyy-MM-dd")
                : "",
            salary: contract.salary?.toString() || "",
            currency: contract.currency || "GHS",
            status: contract.status || "active",
        })
        editDisclosure.onOpen()
    }

    // Submit edit
    const handleSubmitEdit = async (onClose: () => void) => {
        if (!selectedContract || !editFormData.position || !editFormData.startDate)
            return

        setIsSubmitting(true)
        try {
            await axios.put(
                `${baseUrl}/contracts/${selectedContract._id}`,
                {
                    position: editFormData.position,
                    startDate: editFormData.startDate,
                    endDate: editFormData.endDate || undefined,
                    salary: editFormData.salary
                        ? parseFloat(editFormData.salary)
                        : undefined,
                    currency: editFormData.currency,
                    status: editFormData.status,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            await mutate(`${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`) // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Contract updated successfully",
            })
        } catch (error: any) {
            console.error("Error updating contract:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to update contract",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle delete contract - open confirmation modal
    const handleDeleteClick = (contract: any) => {
        setSelectedContract(contract)
        deleteDisclosure.onOpen()
    }

    // Confirm delete
    const handleConfirmDelete = async (onClose: () => void) => {
        if (!selectedContract) return

        setIsDeleting(true)
        try {
            await axios.patch(
                `${baseUrl}/contracts/${selectedContract._id}?op=cancel`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            await mutate(`${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`) // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Contract deleted successfully",
            })
        } catch (error: any) {
            console.error("Error deleting contract:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to delete contract",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    // Handle activate contract
    const handleActivateContract = async (contract: any) => {
        if (contract.status !== "pending") return

        setIsActivating(true)
        try {
            await axios.patch(
                `${baseUrl}/contracts/${contract._id}?op=activate`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            await mutate(`${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`)
            addToast({
                color: "success",
                title: "Success",
                description: "Contract activated successfully",
            })
        } catch (error: any) {
            console.error("Error activating contract:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to activate contract",
            })
        } finally {
            setIsActivating(false)
        }
    }

    // Handle terminate contract - open modal
    const handleTerminateClick = (contract: any) => {
        setSelectedContract(contract)
        setTerminationReason("")
        terminateDisclosure.onOpen()
    }

    // Confirm terminate
    const handleConfirmTerminate = async (onClose: () => void) => {
        if (!selectedContract || !terminationReason.trim()) return

        setIsTerminating(true)
        try {
            await axios.patch(
                `${baseUrl}/contracts/${selectedContract._id}?op=terminate`,
                { reason: terminationReason.trim() },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            await mutate(`${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`)
            onClose()
            setTerminationReason("")
            addToast({
                color: "success",
                title: "Success",
                description: "Contract terminated successfully",
            })
        } catch (error: any) {
            console.error("Error terminating contract:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to terminate contract",
            })
        } finally {
            setIsTerminating(false)
        }
    }

    // Get status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case "active":
                return "success"
            case "pending":
                return "warning"
            case "expired":
                return "danger"
            case "terminated":
                return "danger"
            case "cancelled":
                return "danger"
            case "renewed":
                return "primary"
            default:
                return "default"
        }
    }

    // Handle export contracts data
    const handleExportContracts = () => {
        if (!data?.data?.contracts || data.data.contracts.length === 0) {
            addToast({
                color: "warning",
                title: "No Data",
                description: "No contract data available to export",
            })
            return
        }

        const exportColumns = [
            { key: "staff.name", label: "Staff Name", formatter: formatters.staffName },
            { key: "staff.staffId", label: "Staff ID" },
            { key: "jobPosition.title", label: "Job Position" },
            { key: "department.name", label: "Department", formatter: formatters.department },
            { key: "startDate", label: "Start Date", formatter: formatters.date },
            { key: "endDate", label: "End Date", formatter: formatters.date },
            { key: "salary", label: "Salary", formatter: formatters.currency },
            { key: "currency", label: "Currency" },
            { key: "status", label: "Status" },
        ]

        exportData(
            data.data.contracts,
            exportColumns,
            selectedExportFormat,
            `contracts-export-${DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")}`
        )

        addToast({
            color: "success",
            title: "Export Complete",
            description: `Contract data exported successfully as ${selectedExportFormat.toUpperCase()}`,
        })
    }

    return (
        <AppLayout user={sessionData.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className='flex flex-col gap-8 pb-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Staff Contracts</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage staff contracts
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
                            onPress={handleExportContracts}
                            isDisabled={isLoading || !data?.data?.contracts?.length}
                        >
                            Export
                        </Button>
                        <Button
                            color='warning'
                            size='sm'
                            onPress={createDisclosure.onOpen}
                        >
                            Add Contract
                        </Button>
                    </div>
                </div>

                {/* stats card */}
                <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                    <DepartmentStatsCard
                        title='Total Departments'
                        value={departmentsStats?.data?.data?.totalDepartments}
                        icon={<Building2 className='size-5 text-warning' />}
                        color='warning'
                        description='active departments'
                    />
                    <DepartmentStatsCard
                        title='All Staff'
                        value={departmentsStats?.data?.data?.totalStaff}
                        icon={<Users className='size-5 text-primary' />}
                        color='primary'
                        description='total staff count'
                    />
                    <DepartmentStatsCard
                        title='Total Contracts'
                        value={data?.data?.statistics?.total}
                        icon={<Handshake className='size-5 text-success' />}
                        color='success'
                        description='contracts issued'
                    />
                    <DepartmentStatsCard
                        title='Contracts Expiring'
                        value={data?.data?.statistics?.expiringSoon}
                        icon={<Clock3 className='size-5 text-danger' />}
                        color='danger'
                        description='expiring in 30 days'
                    />
                </div>

                {/* contracts list */}
                <div className='flex flex-col gap-4'>
                    <div className='flex items-center justify-between'>
                        <SearchInput />
                        <Select
                            size='sm'
                            radius='sm'
                            variant='bordered'
                            className='w-36'
                            selectedKeys={[op]}
                            aria-label='Filter'
                            classNames={{
                                value: "dark:!text-white",
                                trigger: [
                                    "dark:data-[open=true]:!border-zinc-700",
                                    "dark:data-[focus=true]:!border-zinc-700",
                                ],
                            }}
                            onSelectionChange={(keys) => {
                                const value = Array.from(keys)[0] as string
                                const newParams = new URLSearchParams(searchParams)
                                newParams.set("op", value)
                                newParams.set("page", "1") // Reset to first page when filter changes
                                setSearchParams(newParams)
                            }}
                        >
                            <SelectItem key='all'>All</SelectItem>
                            <SelectItem key='pending'>Pending</SelectItem>
                            <SelectItem key='active'>Active</SelectItem>
                            <SelectItem key='terminated'>Terminated</SelectItem>
                            <SelectItem key='expiring'>Expiring Soon</SelectItem>
                        </Select>
                    </div>

                    {/* desktop data table */}
                    <DataTable
                        isLoading={isLoading}
                        columns={[
                            "Job Title",
                            "Staff",
                            "Duration",
                            "Remaining Days",
                            "Status",
                            "Actions",
                        ]}
                        totalPages={data?.data?.pagination?.totalPages}
                    >
                        {data?.data?.contracts?.map((contract: any) => (
                            <TableRow key={contract._id}>
                                <TableCell>
                                    <div className='flex gap-2'>
                                        <div className='size-9 flex items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800'>
                                            <Handshake className='size-4 text-warning' />
                                        </div>
                                        <div className='flex flex-col gap-0'>
                                            <p className='text-sm font-medium'>
                                                {contract?.position?.title}
                                            </p>
                                            <p className='text-xs text-zinc-500'>
                                                {contract?.position?.department?.name}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <StaffAvatar
                                        name={contract?.staff?.name}
                                        staffId={contract?.staff?.staffId}
                                    />
                                </TableCell>
                                <TableCell>
                                    {DateTime.fromISO(contract.startDate).toFormat(
                                        "dd MMM yyyy"
                                    )}{" "}
                                    -{" "}
                                    {contract?.endDate
                                        ? DateTime.fromISO(contract.endDate).toFormat(
                                              "dd MMM yyyy"
                                          )
                                        : "Indefinite"}
                                </TableCell>
                                <TableCell>
                                    {contract?.remainingDays !== null
                                        ? `${contract?.remainingDays} days`
                                        : "N/A"}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size='sm'
                                        variant='flat'
                                        color={getStatusColor(contract.status)}
                                    >
                                        {contract.status}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <div className='flex items-center gap-2'>
                                        {contract.status === "pending" && (
                                            <Tooltip content='Activate contract'>
                                                <Button
                                                    size='sm'
                                                    color='warning'
                                                    variant='flat'
                                                    isIconOnly
                                                    isLoading={isActivating}
                                                    onPress={() =>
                                                        handleActivateContract(contract)
                                                    }
                                                    startContent={
                                                        !isActivating && <Play className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                        )}
                                        <Tooltip content='View details'>
                                            <Button
                                                size='sm'
                                                color='success'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleViewContract(contract)
                                                }
                                                startContent={
                                                    <Eye className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                        <Tooltip content='Edit contract'>
                                            <Button
                                                size='sm'
                                                color='primary'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleEditContract(contract)
                                                }
                                                startContent={
                                                    <Pencil className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                        {contract.status === "active" && (
                                            <Tooltip content='Terminate contract'>
                                                <Button
                                                    size='sm'
                                                    color='danger'
                                                    variant='flat'
                                                    isIconOnly
                                                    onPress={() =>
                                                        handleTerminateClick(contract)
                                                    }
                                                    startContent={
                                                        <Ban className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                        )}
                                        <Tooltip content='Delete contract'>
                                            <Button
                                                size='sm'
                                                color='danger'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleDeleteClick(contract)
                                                }
                                                startContent={
                                                    <Trash2 className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </DataTable>

                    {/* mobile list */}
                    <MobileList
                        isLoading={isLoading}
                        listContent={data?.data?.contracts?.map((contract: any) => ({
                            startIcon: (
                                <Handshake className='size-4 text-warning' />
                            ),
                            content: (
                                <div
                                    onClick={() => handleViewContract(contract)}
                                    className='cursor-pointer'
                                >
                                    <div className='flex items-center justify-between'>
                                        <p className='text-sm font-medium'>
                                            {contract?.position?.title}
                                        </p>
                                        <Chip
                                            size='sm'
                                            variant='flat'
                                            color={getStatusColor(contract.status)}
                                        >
                                            {contract.status}
                                        </Chip>
                                    </div>
                                    <div className='flex items-center justify-between mt-1'>
                                        <p className='text-xs font-normal'>
                                            {contract?.staff?.name}
                                        </p>
                                        <p className='text-xs text-zinc-500'>
                                            {contract?.remainingDays !== null
                                                ? `${contract?.remainingDays} days left`
                                                : "Indefinite"}
                                        </p>
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </div>

            {/* Create Contract Drawer */}
            <Drawer
                isOpen={createDisclosure.isOpen}
                onOpenChange={createDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
                scrollBehavior='inside'
            >
                <DrawerContent>
                    {(onClose) => (
                        <>
                            <DrawerHeader>Create Contract</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Autocomplete
                                    label='Staff Member'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Search for a staff member'
                                    isRequired
                                    selectedKey={formData.staff}
                                    onSelectionChange={(key) =>
                                        setFormData({
                                            ...formData,
                                            staff: key as string,
                                        })
                                    }
                                    onInputChange={(value) => setStaffSearch(value)}
                                    inputValue={staffSearch}
                                    items={staffData?.data?.staff || []}
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {(staff: StaffInterface) => (
                                        <AutocompleteItem
                                            key={staff._id!}
                                            textValue={staff.name}
                                        >
                                            <div className='flex items-center gap-2'>
                                                <Avatar
                                                    name={staff.name}
                                                    size='sm'
                                                    className='bg-primary-100'
                                                />
                                                <div>
                                                    <p className='text-sm'>
                                                        {staff.name}
                                                    </p>
                                                    <p className='text-xs text-zinc-500'>
                                                        {staff.staffId}
                                                    </p>
                                                </div>
                                            </div>
                                        </AutocompleteItem>
                                    )}
                                </Autocomplete>

                                <Autocomplete
                                    label='Job Position'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select a position'
                                    isRequired
                                    selectedKey={formData.position}
                                    onSelectionChange={(key) =>
                                        setFormData({
                                            ...formData,
                                            position: key as string,
                                        })
                                    }
                                    description='Only positions with available slots are shown'
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {getAvailablePositions().map(
                                        (pos: JobPositionInterface) => (
                                            <AutocompleteItem
                                                key={pos._id!}
                                                textValue={pos.title}
                                            >
                                                <div className='flex items-center gap-2'>
                                                    <BriefcaseBusiness className='size-4 text-zinc-400' />
                                                    <div>
                                                        <p className='text-sm'>
                                                            {pos.title}
                                                        </p>
                                                        <p className='text-xs text-zinc-500'>
                                                            {(pos.department as any)?.name}{" "}
                                                            • {pos.occupancy?.available}{" "}
                                                            slots available
                                                        </p>
                                                    </div>
                                                </div>
                                            </AutocompleteItem>
                                        )
                                    )}
                                </Autocomplete>

                                <Input
                                    label='Start Date'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select start date'
                                    type='date'
                                    isRequired
                                    value={formData.startDate}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            startDate: value,
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
                                    placeholder='Select end date (optional)'
                                    type='date'
                                    value={formData.endDate}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            endDate: value,
                                        })
                                    }
                                    description='Leave empty for permanent/indefinite contracts'
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />

                                <Divider />

                                <div className='grid grid-cols-2 gap-4'>
                                    <Input
                                        label='Salary'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        placeholder='Enter salary'
                                        type='number'
                                        value={formData.salary}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                salary: value,
                                            })
                                        }
                                        classNames={{
                                            inputWrapper:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    />

                                    <Select
                                        label='Currency'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        placeholder='Select currency'
                                        selectedKeys={[formData.currency]}
                                        onSelectionChange={(keys) =>
                                            setFormData({
                                                ...formData,
                                                currency: Array.from(keys)[0] as string,
                                            })
                                        }
                                        classNames={{
                                            trigger:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    >
                                        {CURRENCY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                </div>
                            </DrawerBody>
                            <DrawerFooter>
                                <Button
                                    color='warning'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='warning'
                                    onPress={() => handleCreateContract(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !formData.staff ||
                                        !formData.position ||
                                        !formData.startDate
                                    }
                                >
                                    Create Contract
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Contract Drawer */}
            <Drawer
                isOpen={viewDisclosure.isOpen}
                onOpenChange={viewDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
                scrollBehavior='inside'
            >
                <DrawerContent>
                    {(onClose) => (
                        <>
                            <DrawerHeader className='flex flex-col gap-1 pb-0'>
                                <span className='text-sm text-zinc-500'>
                                    Contract Details
                                </span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedContract && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900/10 dark:to-warning-800/20 border-none shadow-sm'>
                                            <CardBody className='flex flex-row items-center gap-4 py-5'>
                                                <div className='size-14 rounded-xl bg-warning-500/20 flex items-center justify-center'>
                                                    <Handshake className='size-7 text-warning-600 dark:text-warning-400' />
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='text-xl font-semibold text-zinc-800 dark:text-zinc-100'>
                                                        {selectedContract.position?.title}
                                                    </h3>
                                                    <div className='flex items-center gap-2 mt-1'>
                                                        <Building2 className='size-3 text-zinc-400' />
                                                        <span className='text-sm text-zinc-500'>
                                                            {
                                                                selectedContract.position
                                                                    ?.department?.name
                                                            }
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardBody>
                                        </Card>

                                        {/* Status */}
                                        <div className='flex items-center gap-2 px-1'>
                                            <Chip
                                                size='sm'
                                                variant='flat'
                                                color={getStatusColor(
                                                    selectedContract.status
                                                )}
                                                startContent={
                                                    selectedContract.status ===
                                                    "active" ? (
                                                        <CheckCircle2 className='size-3' />
                                                    ) : (
                                                        <XCircle className='size-3' />
                                                    )
                                                }
                                            >
                                                {selectedContract.status}
                                            </Chip>
                                            {selectedContract.remainingDays !==
                                                null && (
                                                <Chip
                                                    size='sm'
                                                    variant='flat'
                                                    color={
                                                        selectedContract.remainingDays <=
                                                        30
                                                            ? "danger"
                                                            : "default"
                                                    }
                                                >
                                                    {selectedContract.remainingDays} days
                                                    remaining
                                                </Chip>
                                            )}
                                        </div>

                                        <Divider />

                                        {/* Staff Info */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <User className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Staff Member
                                                </span>
                                            </div>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='flex flex-row items-center gap-3 py-3'>
                                                    <Avatar
                                                        name={
                                                            selectedContract.staff?.name
                                                        }
                                                        size='md'
                                                        className='bg-primary-100 text-primary-600'
                                                    />
                                                    <div className='flex-1'>
                                                        <p className='font-medium text-sm'>
                                                            {selectedContract.staff?.name}
                                                        </p>
                                                        <p className='text-xs text-zinc-500'>
                                                            {
                                                                selectedContract.staff
                                                                    ?.staffId
                                                            }
                                                        </p>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        </div>

                                        <Divider />

                                        {/* Contract Duration */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Calendar className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Contract Duration
                                                </span>
                                            </div>
                                            <div className='grid grid-cols-2 gap-3'>
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='py-3 px-4'>
                                                        <span className='text-xs text-zinc-500'>
                                                            Start Date
                                                        </span>
                                                        <p className='text-sm font-medium'>
                                                            {DateTime.fromISO(
                                                                selectedContract.startDate
                                                            ).toFormat("dd MMM yyyy")}
                                                        </p>
                                                    </CardBody>
                                                </Card>
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='py-3 px-4'>
                                                        <span className='text-xs text-zinc-500'>
                                                            End Date
                                                        </span>
                                                        <p className='text-sm font-medium'>
                                                            {selectedContract.endDate
                                                                ? DateTime.fromISO(
                                                                      selectedContract.endDate
                                                                  ).toFormat(
                                                                      "dd MMM yyyy"
                                                                  )
                                                                : "Indefinite"}
                                                        </p>
                                                    </CardBody>
                                                </Card>
                                            </div>
                                        </div>

                                        {/* Salary Info */}
                                        {selectedContract.salary && (
                                            <>
                                                <Divider />
                                                <div className='px-1'>
                                                    <div className='flex items-center gap-2 mb-3'>
                                                        <Banknote className='size-4 text-zinc-400' />
                                                        <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                            Compensation
                                                        </span>
                                                    </div>
                                                    <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                        <CardBody className='py-3 px-4'>
                                                            <p className='text-2xl font-bold text-zinc-800 dark:text-zinc-100'>
                                                                {selectedContract.currency ||
                                                                    "GHS"}{" "}
                                                                {selectedContract.salary?.toLocaleString()}
                                                            </p>
                                                            <span className='text-xs text-zinc-500'>
                                                                Monthly salary
                                                            </span>
                                                        </CardBody>
                                                    </Card>
                                                </div>
                                            </>
                                        )}

                                        <Divider />

                                        {/* Created At */}
                                        <div className='px-1'>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='py-3 px-4'>
                                                    <div className='flex items-center gap-2 mb-1'>
                                                        <Clock className='size-4 text-zinc-400' />
                                                        <span className='text-xs text-zinc-500'>
                                                            Created
                                                        </span>
                                                    </div>
                                                    <p className='text-sm font-medium text-zinc-800 dark:text-zinc-100'>
                                                        {DateTime.fromISO(
                                                            selectedContract.createdAt
                                                        ).toFormat("dd MMM yyyy")}
                                                    </p>
                                                </CardBody>
                                            </Card>
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
                                {selectedContract?.status === "pending" && (
                                    <Button
                                        color='success'
                                        startContent={!isActivating && <Play className='size-4' />}
                                        isLoading={isActivating}
                                        onPress={async () => {
                                            await handleActivateContract(selectedContract)
                                            onClose()
                                        }}
                                    >
                                        Activate
                                    </Button>
                                )}
                                {selectedContract?.status === "active" && (
                                    <Button
                                        color='danger'
                                        variant='flat'
                                        startContent={<Ban className='size-4' />}
                                        onPress={() => {
                                            onClose()
                                            if (selectedContract) {
                                                handleTerminateClick(selectedContract)
                                            }
                                        }}
                                    >
                                        Terminate
                                    </Button>
                                )}
                                <Button
                                    color='warning'
                                    startContent={<Pencil className='size-4' />}
                                    onPress={() => {
                                        onClose()
                                        if (selectedContract) {
                                            handleEditContract(selectedContract)
                                        }
                                    }}
                                >
                                    Edit Contract
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Edit Contract Drawer */}
            <Drawer
                isOpen={editDisclosure.isOpen}
                onOpenChange={editDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
                scrollBehavior='inside'
            >
                <DrawerContent>
                    {(onClose) => (
                        <>
                            <DrawerHeader>Edit Contract</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                {/* Staff is read-only in edit mode */}
                                <Input
                                    label='Staff Member'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    isReadOnly
                                    value={selectedContract?.staff?.name || ""}
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900",
                                    }}
                                />

                                <Autocomplete
                                    label='Job Position'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select a position'
                                    isRequired
                                    selectedKey={editFormData.position}
                                    onSelectionChange={(key) =>
                                        setEditFormData({
                                            ...editFormData,
                                            position: key as string,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {getAllActivePositions().map(
                                        (pos: JobPositionInterface) => (
                                            <AutocompleteItem
                                                key={pos._id!}
                                                textValue={pos.title}
                                            >
                                                <div className='flex items-center gap-2'>
                                                    <BriefcaseBusiness className='size-4 text-zinc-400' />
                                                    <div>
                                                        <p className='text-sm'>
                                                            {pos.title}
                                                        </p>
                                                        <p className='text-xs text-zinc-500'>
                                                            {(pos.department as any)?.name}
                                                        </p>
                                                    </div>
                                                </div>
                                            </AutocompleteItem>
                                        )
                                    )}
                                </Autocomplete>

                                <Input
                                    label='Start Date'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select start date'
                                    type='date'
                                    isRequired
                                    value={editFormData.startDate}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            startDate: value,
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
                                    placeholder='Select end date (optional)'
                                    type='date'
                                    value={editFormData.endDate}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            endDate: value,
                                        })
                                    }
                                    description='Leave empty for permanent/indefinite contracts'
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />

                                <Select
                                    label='Status'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select status'
                                    selectedKeys={[editFormData.status]}
                                    onSelectionChange={(keys) =>
                                        setEditFormData({
                                            ...editFormData,
                                            status: Array.from(keys)[0] as string,
                                        })
                                    }
                                    classNames={{
                                        trigger:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                >
                                    {CONTRACT_STATUS_OPTIONS.map((option) => (
                                        <SelectItem key={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </Select>

                                <Divider />

                                <div className='grid grid-cols-2 gap-4'>
                                    <Input
                                        label='Salary'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        placeholder='Enter salary'
                                        type='number'
                                        value={editFormData.salary}
                                        onValueChange={(value) =>
                                            setEditFormData({
                                                ...editFormData,
                                                salary: value,
                                            })
                                        }
                                        classNames={{
                                            inputWrapper:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    />

                                    <Select
                                        label='Currency'
                                        variant='bordered'
                                        labelPlacement='outside'
                                        placeholder='Select currency'
                                        selectedKeys={[editFormData.currency]}
                                        onSelectionChange={(keys) =>
                                            setEditFormData({
                                                ...editFormData,
                                                currency: Array.from(keys)[0] as string,
                                            })
                                        }
                                        classNames={{
                                            trigger:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    >
                                        {CURRENCY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                </div>
                            </DrawerBody>
                            <DrawerFooter>
                                <Button
                                    color='warning'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='warning'
                                    onPress={() => handleSubmitEdit(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !editFormData.position ||
                                        !editFormData.startDate
                                    }
                                >
                                    Save Changes
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteDisclosure.isOpen}
                onOpenChange={deleteDisclosure.onOpenChange}
                size='sm'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className='flex flex-col gap-1'>
                                Delete Contract
                            </ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to delete the contract for{" "}
                                    <span className='font-semibold'>
                                        {selectedContract?.staff?.name}
                                    </span>{" "}
                                    as{" "}
                                    <span className='font-semibold'>
                                        {selectedContract?.position?.title}
                                    </span>
                                    ?
                                </p>
                                <p className='text-xs text-zinc-500'>
                                    This action cannot be undone. The staff member will
                                    no longer be associated with this position.
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color='danger'
                                    variant='flat'
                                    onPress={onClose}
                                    isDisabled={isDeleting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='danger'
                                    onPress={() => handleConfirmDelete(onClose)}
                                    isLoading={isDeleting}
                                >
                                    Delete
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Terminate Confirmation Modal */}
            <Modal
                isOpen={terminateDisclosure.isOpen}
                onOpenChange={terminateDisclosure.onOpenChange}
                size='md'
                backdrop='blur'
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className='flex flex-col gap-1'>
                                Terminate Contract
                            </ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to terminate the contract for{" "}
                                    <span className='font-semibold'>
                                        {selectedContract?.staff?.name}
                                    </span>{" "}
                                    as{" "}
                                    <span className='font-semibold'>
                                        {selectedContract?.position?.title}
                                    </span>
                                    ?
                                </p>
                                <p className='text-xs text-zinc-500 mb-2'>
                                    This will end the contract and set the staff member's
                                    status to inactive. The contract record will be kept
                                    for audit purposes.
                                </p>
                                <Input
                                    label='Termination Reason'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter reason for termination'
                                    isRequired
                                    value={terminationReason}
                                    onValueChange={setTerminationReason}
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
                                    isDisabled={isTerminating}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color='danger'
                                    onPress={() => handleConfirmTerminate(onClose)}
                                    isLoading={isTerminating}
                                    isDisabled={!terminationReason.trim()}
                                    startContent={!isTerminating && <Ban className='size-4' />}
                                >
                                    Terminate Contract
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
    // check if user is authenticated
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
