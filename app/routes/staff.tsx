import {
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
    Pagination,
    Select,
    SelectItem,
    TableCell,
    TableRow,
    Tooltip,
    useDisclosure,
    CheckboxGroup,
    Checkbox,
    addToast,
} from "@heroui/react"
import { useState } from "react"
import axios from "axios"
import {
    Link,
    redirect,
    useLoaderData,
    useNavigate,
    useSearchParams,
} from "react-router"
import useSWR from "swr"
import { fetcher } from "~/ui/lib/fetcher"
import AppLayout from "~/ui/layouts/app-layout"
import { getSessionData, isAuthenticated } from "~/auth-session"
import { LoaderFunctionArgs } from "react-router"
import { SearchInput } from "~/ui/components/inputs"
import { DataTable } from "~/ui/components/data-table"
import { DepartmentInterface, StaffInterface } from "~/utils/types"
import { DateTime } from "luxon"
import {
    Building2,
    Eye,
    Pencil,
    Plus,
    Search,
    Trash2,
    User,
    Users,
    X,
    Download,
    Calendar,
    CheckCircle2,
    Mail,
    Phone,
    Shield,
    UserCircle,
    XCircle,
    Hash,
    MapPin,
    AlertCircle,
} from "lucide-react"
import { GenderChip } from "~/ui/components/chips"
import { StaffAvatar } from "~/ui/components/avatars"
import { MobileList } from "~/ui/components/lists"
import { exportData, formatters, ExportFormat } from "~/ui/lib/export-utils"

// Permission options
const PERMISSION_OPTIONS = [
    { value: "STAFF", label: "Staff", description: "Basic staff access" },
    { value: "MANAGER", label: "Manager", description: "Can manage team members" },
    { value: "HR", label: "HR", description: "Human resources access" },
    { value: "ADMIN", label: "Admin", description: "Full system access" },
    { value: "DELEGATE", label: "Delegate", description: "Can request leave on behalf of department members" },
]

// Gender options
const GENDER_OPTIONS = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
]

export default function Staff() {
    const { sessionData, baseUrl, search, limit, page } =
        useLoaderData<typeof loader>()
    const navigate = useNavigate()

    const { data, isLoading, error, mutate } = useSWR(
        `${baseUrl}/staff?search=${search}&limit=${limit}&page=${page}`,
        fetcher(sessionData?.token as string),
        {
            refreshInterval: 0
        }
    )

    // Fetch departments for dropdown
    const { data: departmentsData } = useSWR(
        `${baseUrl}/departments`,
        fetcher(sessionData?.token as string),
        {
            refreshInterval: 0
        }
    )

    const createDisclosure = useDisclosure()
    const editDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const deleteDisclosure = useDisclosure()

    // Selected staff for view/edit/delete
    const [selectedStaff, setSelectedStaff] = useState<StaffInterface | null>(
        null
    )

    // Selected export format
    const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("csv")

    // Form state for create
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        email: "",
        staffId: "",
        department: "",
        gender: "",
        permissions: ["STAFF"] as string[],
        profileImage: null as any,
    })

    // Form state for edit
    const [editFormData, setEditFormData] = useState({
        name: "",
        phone: "",
        email: "",
        staffId: "",
        department: "",
        gender: "",
        password: "",
        permissions: [] as string[],
        profileImage: null as any,
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Generate staff ID
    const generateStaffId = () => {
        const prefix = "STF"
        const timestamp = Date.now().toString().slice(-6)
        const random = Math.floor(Math.random() * 100)
            .toString()
            .padStart(2, "0")
        return `${prefix}${timestamp}${random}`
    }

    const handleCreateStaff = async (onClose: () => void) => {
        if (
            !formData.name.trim() ||
            !formData.phone.trim() ||
            !formData.department ||
            !formData.gender
        )
            return

        setIsSubmitting(true)
        try {
            await axios.post(
                `${baseUrl}/staff`,
                {
                    name: formData.name,
                    phone: formData.phone,
                    email: formData.email || undefined,
                    staffId: formData.staffId || generateStaffId(),
                    department: formData.department,
                    gender: formData.gender,
                    permissions: formData.permissions,
                    profileImage: formData.profileImage,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            // Reset form and close drawer
            setFormData({
                name: "",
                phone: "",
                email: "",
                staffId: "",
                department: "",
                gender: "",
                permissions: ["STAFF"],
                profileImage: null,
            })
            mutate() // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Staff member created successfully",
            })
        } catch (error: any) {
            console.error("Error creating staff:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to create staff member",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view staff
    const handleViewStaff = (staff: StaffInterface) => {
        setSelectedStaff(staff)
        viewDisclosure.onOpen()
    }

    // Handle edit staff - open drawer with pre-filled data
    const handleEditStaff = (staff: StaffInterface) => {
        setSelectedStaff(staff)
        setEditFormData({
            name: staff.name,
            phone: staff.phone,
            email: staff.email || "",
            staffId: staff.staffId,
            department: staff.department?._id || staff.department,
            gender: staff.gender,
            password: "",
            permissions: staff.permissions || [],
            profileImage: staff.profileImage || null,
        })
        editDisclosure.onOpen()
    }

    // Submit edit
    const handleSubmitEdit = async (onClose: () => void) => {
        if (!selectedStaff || !editFormData.name.trim()) return

        // Client-side validation
        const validationErrors = []
        
        if (!editFormData.name.trim()) {
            validationErrors.push("Name is required")
        }
        
        if (!editFormData.phone.trim()) {
            validationErrors.push("Phone number is required")
        }
        
        if (!editFormData.department) {
            validationErrors.push("Department is required")
        }
        
        if (!editFormData.gender) {
            validationErrors.push("Gender is required")
        }
        
        if (editFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
            validationErrors.push("Invalid email format")
        }

        if (validationErrors.length > 0) {
            addToast({
                color: "danger",
                title: "Validation Error",
                description: validationErrors.join(", "),
            })
            return
        }

        setIsSubmitting(true)
        try {
            await axios.put(
                `${baseUrl}/staff/${selectedStaff._id}`,
                {
                    name: editFormData.name,
                    phone: editFormData.phone,
                    email: editFormData.email || undefined,
                    staffId: editFormData.staffId,
                    department: editFormData.department,
                    gender: editFormData.gender,
                    profileImage: editFormData.profileImage,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            // Update permissions separately if changed
            const originalPermissions = selectedStaff.permissions || []
            const newPermissions = editFormData.permissions
            if (
                JSON.stringify(originalPermissions.sort()) !==
                JSON.stringify(newPermissions.sort())
            ) {
                await axios.patch(
                    `${baseUrl}/staff/${selectedStaff._id}?op=permissions`,
                    { permissions: newPermissions },
                    {
                        headers: {
                            Authorization: `Bearer ${sessionData?.token}`,
                        },
                    }
                )
            }

            mutate() // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Staff member updated successfully",
            })
        } catch (error: any) {
            console.error("Error updating staff:", error)
            
            // Handle validation errors specifically
            let errorMessage = "Failed to update staff member"
            if (error.response?.status === 422) {
                if (error.response?.data?.errors) {
                    const errors = error.response.data.errors
                    if (Array.isArray(errors)) {
                        errorMessage = errors.map((err: any) => err.message).join(", ")
                    } else {
                        errorMessage = error.response.data.message || "Validation failed"
                    }
                } else {
                    errorMessage = error.response?.data?.message || "Validation failed"
                }
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

    // Handle delete staff - open confirmation modal
    const handleDeleteClick = (staff: StaffInterface) => {
        setSelectedStaff(staff)
        deleteDisclosure.onOpen()
    }

    // Confirm delete
    const handleConfirmDelete = async (onClose: () => void) => {
        if (!selectedStaff) return

        setIsDeleting(true)
        try {
            await axios.delete(`${baseUrl}/staff/${selectedStaff._id}`, {
                headers: {
                    Authorization: `Bearer ${sessionData?.token}`,
                },
            })
            mutate() // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Staff member deleted successfully",
            })
        } catch (error: any) {
            console.error("Error deleting staff:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to delete staff member",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    // Get status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case "active":
                return "success"
            case "inactive":
                return "warning"
            case "suspended":
                return "danger"
            default:
                return "default"
        }
    }

    // Handle export staff data
    const handleExportStaff = () => {
        if (!data?.data?.staff || data.data.staff.length === 0) {
            addToast({
                color: "warning",
                title: "No Data",
                description: "No staff data available to export",
            })
            return
        }

        const exportColumns = [
            { key: "staffId", label: "Staff ID" },
            { key: "name", label: "Name" },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
            { key: "gender", label: "Gender" },
            { key: "department.name", label: "Department", formatter: formatters.department },
            { key: "status", label: "Status" },
            { key: "permissions", label: "Permissions", formatter: formatters.array },
        ]

        exportData(
            data.data.staff,
            exportColumns,
            selectedExportFormat,
            `staff-export-${DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")}`
        )

        addToast({
            color: "success",
            title: "Export Complete",
            description: `Staff data exported successfully as ${selectedExportFormat.toUpperCase()}`,
        })
    }

    return (
        <AppLayout user={sessionData.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className='flex flex-col gap-8 pb-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Staff</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage staff members
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
                            onPress={handleExportStaff}
                            isDisabled={isLoading || !data?.data?.staff?.length}
                        >
                            Export
                        </Button>
                        <Button
                            size='sm'
                            color='warning'
                            onPress={createDisclosure.onOpen}
                            className='bg-warning/70 dark:bg-warning/70 text-white hover:shadow-lg hover:scale-[1.01] transition-all duration-300'
                        >
                            Add Staff
                        </Button>
                    </div>
                </div>

                {/* staff list */}
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <SearchInput />
                    </div>

                    {/* desktop view: data table */}
                    <DataTable
                        isLoading={isLoading}
                        columns={[
                            "Staff",
                            "Contact",
                            "Gender",
                            "Department",
                            "Status",
                            "Actions",
                        ]}
                        bottomContent={
                            <div className='flex items-center justify-between'>
                                <Select
                                    size='sm'
                                    radius='sm'
                                    variant='bordered'
                                    className='w-20'
                                    selectedKeys={[limit.toString()]}
                                    aria-label='Limit'
                                    classNames={{
                                        value: "dark:!text-white",
                                        trigger: [
                                            "dark:data-[open=true]:!border-zinc-700",
                                            "dark:data-[focus=true]:!border-zinc-700",
                                        ],
                                    }}
                                    onSelectionChange={(keys) => {
                                        navigate(`?limit=${Array.from(keys)[0]}`)
                                    }}
                                >
                                    <SelectItem key='10'>10</SelectItem>
                                    <SelectItem key='20'>20</SelectItem>
                                    <SelectItem key='50'>50</SelectItem>
                                    <SelectItem key='100'>100</SelectItem>
                                </Select>

                                <div className='flex items-center gap-2'>
                                    <Pagination
                                        total={
                                            data?.data?.pagination?.totalPages || 1
                                        }
                                        page={parseInt(page)}
                                        size='sm'
                                        showControls
                                        radius='sm'
                                        color='warning'
                                        classNames={{
                                            item: "dark:bg-zinc-800 dark:text-white",
                                            next: "dark:bg-zinc-800 dark:text-white",
                                            prev: "dark:bg-zinc-800 dark:text-white",
                                        }}
                                        onChange={(p) => {
                                            navigate(`?page=${p}&limit=${limit}`)
                                        }}
                                    />
                                </div>
                            </div>
                        }
                    >
                        {data?.data?.staff?.map((staff: StaffInterface) => (
                            <TableRow
                                key={staff._id}
                                className='hover:bg-zinc-100 dark:hover:bg-zinc-900/50 transition-all duration-300'
                            >
                                <TableCell>
                                    <StaffAvatar
                                        name={staff.name}
                                        profileImage={
                                            staff.profileImage?.url || null
                                        }
                                        staffId={staff.staffId}
                                    />
                                </TableCell>
                                <TableCell>
                                    <div>
                                        <p className='text-sm'>{staff.phone}</p>
                                        <p className='text-xs text-zinc-500'>
                                            {staff.email || "-"}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <GenderChip gender={staff.gender} />
                                </TableCell>
                                <TableCell className='line-clamp-1 leading-loose'>
                                    {(staff.department as any)?.name || "-"}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size='sm'
                                        variant='flat'
                                        color={getStatusColor(staff.status)}
                                    >
                                        {staff.status}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <div className='flex items-center gap-3'>
                                        <Tooltip content='View details'>
                                            <Button
                                                size='sm'
                                                color='success'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleViewStaff(staff)
                                                }
                                                startContent={
                                                    <Eye className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                        <Tooltip content='Edit staff'>
                                            <Button
                                                size='sm'
                                                color='primary'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleEditStaff(staff)
                                                }
                                                startContent={
                                                    <Pencil className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                        <Tooltip content='Delete staff'>
                                            <Button
                                                size='sm'
                                                color='danger'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleDeleteClick(staff)
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

                    {/* mobile view: staff list */}
                    <MobileList
                        isLoading={isLoading}
                        isError={error}
                        isEmpty={data?.data?.staff?.length === 0}
                        emptyContent='No staff found'
                        listContent={data?.data?.staff?.map(
                            (staff: StaffInterface) => ({
                                content: (
                                    <div
                                        onClick={() => handleViewStaff(staff)}
                                        className='cursor-pointer'
                                    >
                                        <StaffAvatar
                                            name={staff.name}
                                            profileImage={
                                                staff.profileImage?.url || null
                                            }
                                            staffId={staff.staffId}
                                        />
                                        <div className='flex items-center justify-between pl-10 mt-1'>
                                            <div className='flex items-center gap-1'>
                                                <p className='text-sm'>
                                                    {staff.phone}
                                                </p>
                                            </div>
                                            <div className='flex items-center gap-1'>
                                                <Building2 className='size-4 text-zinc-400' />
                                                <p className='text-sm'>
                                                    {
                                                        (staff.department as any)
                                                            ?.name
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ),
                            })
                        )}
                    />

                    {/* mobile pagination */}
                    <div className='flex md:hidden items-center justify-between mt-3'>
                        <Select
                            size='sm'
                            radius='sm'
                            variant='bordered'
                            className='w-20'
                            selectedKeys={[limit.toString()]}
                            aria-label='Limit'
                            classNames={{
                                value: "dark:!text-white",
                                trigger: [
                                    "dark:data-[open=true]:!border-zinc-700",
                                    "dark:data-[focus=true]:!border-zinc-700",
                                ],
                            }}
                            onSelectionChange={(keys) => {
                                navigate(`?limit=${Array.from(keys)[0]}`)
                            }}
                        >
                            <SelectItem key='10'>10</SelectItem>
                            <SelectItem key='20'>20</SelectItem>
                            <SelectItem key='50'>50</SelectItem>
                            <SelectItem key='100'>100</SelectItem>
                        </Select>

                        <div className='flex items-center gap-2'>
                            <Pagination
                                total={data?.data?.pagination?.totalPages || 1}
                                page={parseInt(page)}
                                size='sm'
                                showControls
                                radius='sm'
                                color='warning'
                                classNames={{
                                    item: "dark:bg-zinc-800 dark:text-white",
                                    next: "dark:bg-zinc-800 dark:text-white",
                                    prev: "dark:bg-zinc-800 dark:text-white",
                                }}
                                onChange={(p) => {
                                    navigate(`?page=${p}&limit=${limit}`)
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Staff Drawer */}
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
                            <DrawerHeader>Add New Staff</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Full Name'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter full name'
                                    isRequired
                                    value={formData.name}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, name: value })
                                    }
                                    classNames={{
                                        label: "text-primary-500",
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <div className='flex flex-col gap-2'>
                                    <label className='text-sm font-medium text-foreground-600'>
                                        Profile Image (Optional)
                                    </label>
                                    <input
                                        type='file'
                                        accept='image/*'
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                // For now, just store the file info
                                                // In a real implementation, you'd upload to cloud storage
                                                setFormData({
                                                    ...formData,
                                                    profileImage: {
                                                        url: URL.createObjectURL(file),
                                                        publicId: file.name,
                                                        filename: file.name,
                                                        fileType: file.type,
                                                        uploadedAt: new Date(),
                                                    },
                                                })
                                            }
                                        }}
                                        className='block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer'
                                    />
                                    {formData.profileImage && (
                                        <div className='mt-2'>
                                            <img
                                                src={formData.profileImage.url}
                                                alt='Profile preview'
                                                className='h-16 w-16 rounded-full object-cover'
                                            />
                                        </div>
                                    )}
                                </div>
                                <Input
                                    label='Phone Number'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter phone number'
                                    isRequired
                                    value={formData.phone}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, phone: value })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Input
                                    label='Email Address'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter email (optional)'
                                    type='email'
                                    value={formData.email}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, email: value })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Input
                                    label='Staff ID'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Auto-generated if left empty'
                                    value={formData.staffId}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            staffId: value,
                                        })
                                    }
                                    description='Leave empty to auto-generate'
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Autocomplete
                                    label='Department'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select a department'
                                    isRequired
                                    selectedKey={formData.department}
                                    onSelectionChange={(key) =>
                                        setFormData({
                                            ...formData,
                                            department: key as string,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {(
                                        departmentsData?.data?.departments || []
                                    ).map((dept: DepartmentInterface) => (
                                        <AutocompleteItem
                                            key={dept._id}
                                            textValue={dept.name}
                                        >
                                            <div className='flex items-center gap-2'>
                                                <Building2 className='size-4 text-zinc-400' />
                                                <span>{dept.name}</span>
                                            </div>
                                        </AutocompleteItem>
                                    ))}
                                </Autocomplete>
                                <Select
                                    label='Gender'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select gender'
                                    isRequired
                                    selectedKeys={
                                        formData.gender ? [formData.gender] : []
                                    }
                                    onSelectionChange={(keys) =>
                                        setFormData({
                                            ...formData,
                                            gender: Array.from(keys)[0] as string,
                                        })
                                    }
                                    classNames={{
                                        trigger:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                >
                                    {GENDER_OPTIONS.map((option) => (
                                        <SelectItem key={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </Select>
                                <Divider />
                                <div>
                                    <p className='text-sm font-medium mb-3'>
                                        Permissions
                                    </p>
                                    <CheckboxGroup
                                        value={formData.permissions}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                permissions: value,
                                            })
                                        }
                                    >
                                        {PERMISSION_OPTIONS.map((option) => (
                                            <Checkbox
                                                key={option.value}
                                                value={option.value}
                                                classNames={{
                                                    label: "text-sm",
                                                }}
                                            >
                                                <div>
                                                    <p className='text-sm'>
                                                        {option.label}
                                                    </p>
                                                    <p className='text-xs text-zinc-500'>
                                                        {option.description}
                                                    </p>
                                                </div>
                                            </Checkbox>
                                        ))}
                                    </CheckboxGroup>
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
                                    onPress={() => handleCreateStaff(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !formData.name.trim() ||
                                        !formData.phone.trim() ||
                                        !formData.department ||
                                        !formData.gender
                                    }
                                >
                                    Add Staff
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Staff Drawer */}
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
                                    Staff Details
                                </span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedStaff && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-success-100 to-success-50 dark:from-success-900/10 dark:to-success-800/20 border-none shadow-sm'>
                                            <CardBody className='flex flex-row items-center gap-4 py-5'>
                                                <Avatar
                                                    src={
                                                        selectedStaff.profileImage
                                                            ?.url || null
                                                    }
                                                    name={selectedStaff.name}
                                                    size='lg'
                                                    className='bg-success-500/20'
                                                />
                                                <div className='flex-1'>
                                                    <h3 className='text-xl font-semibold text-zinc-800 dark:text-zinc-100'>
                                                        {selectedStaff.name}
                                                    </h3>
                                                    <div className='flex items-center gap-2 mt-1'>
                                                        <Hash className='size-3 text-zinc-400' />
                                                        <span className='text-sm text-zinc-500'>
                                                            {selectedStaff.staffId}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardBody>
                                        </Card>

                                        {/* Status & Leave Badge */}
                                        <div className='flex items-center gap-2 px-1'>
                                            <Chip
                                                size='sm'
                                                variant='flat'
                                                color={getStatusColor(
                                                    selectedStaff.status
                                                )}
                                                startContent={
                                                    selectedStaff.status ===
                                                    "active" ? (
                                                        <CheckCircle2 className='size-3' />
                                                    ) : (
                                                        <XCircle className='size-3' />
                                                    )
                                                }
                                            >
                                                {selectedStaff.status}
                                            </Chip>
                                            {selectedStaff.isOnLeave && (
                                                <Chip
                                                    size='sm'
                                                    variant='flat'
                                                    color='warning'
                                                >
                                                    On Leave
                                                </Chip>
                                            )}
                                            <GenderChip
                                                gender={selectedStaff.gender}
                                            />
                                        </div>

                                        <Divider />

                                        {/* Contact Info */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Phone className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Contact
                                                </span>
                                            </div>
                                            <div className='space-y-2 pl-6'>
                                                <div className='flex items-center gap-2'>
                                                    <Phone className='size-4 text-zinc-400' />
                                                    <span className='text-sm'>
                                                        {selectedStaff.phone}
                                                    </span>
                                                </div>
                                                {selectedStaff.email && (
                                                    <div className='flex items-center gap-2'>
                                                        <Mail className='size-4 text-zinc-400' />
                                                        <span className='text-sm'>
                                                            {selectedStaff.email}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <Divider />

                                        {/* Department */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Building2 className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Department
                                                </span>
                                            </div>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='flex flex-row items-center gap-3 py-3'>
                                                    <div className='size-10 rounded-lg bg-primary-100 flex items-center justify-center'>
                                                        <Building2 className='size-5 text-primary-600' />
                                                    </div>
                                                    <div className='flex-1'>
                                                        <p className='font-medium text-sm'>
                                                            {(
                                                                selectedStaff.department as any
                                                            )?.name || "-"}
                                                        </p>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        </div>

                                        <Divider />

                                        {/* Permissions */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Shield className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Permissions
                                                </span>
                                            </div>
                                            <div className='flex flex-wrap gap-2 pl-6'>
                                                {selectedStaff.permissions?.length >
                                                0 ? (
                                                    selectedStaff.permissions.map(
                                                        (perm) => (
                                                            <Chip
                                                                key={perm}
                                                                size='sm'
                                                                variant='flat'
                                                                color='primary'
                                                            >
                                                                {perm}
                                                            </Chip>
                                                        )
                                                    )
                                                ) : (
                                                    <span className='text-sm text-zinc-400 italic'>
                                                        No permissions assigned
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Emergency Contact */}
                                        {selectedStaff.emergencyContact && (
                                            <>
                                                <Divider />
                                                <div className='px-1'>
                                                    <div className='flex items-center gap-2 mb-3'>
                                                        <AlertCircle className='size-4 text-zinc-400' />
                                                        <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                            Emergency Contact
                                                        </span>
                                                    </div>
                                                    <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                        <CardBody className='py-3'>
                                                            <p className='font-medium text-sm'>
                                                                {
                                                                    selectedStaff
                                                                        .emergencyContact
                                                                        .name
                                                                }
                                                            </p>
                                                            <p className='text-xs text-zinc-500'>
                                                                {
                                                                    selectedStaff
                                                                        .emergencyContact
                                                                        .phone
                                                                }
                                                            </p>
                                                            {selectedStaff
                                                                .emergencyContact
                                                                .relation && (
                                                                <p className='text-xs text-zinc-400'>
                                                                    {
                                                                        selectedStaff
                                                                            .emergencyContact
                                                                            .relation
                                                                    }
                                                                </p>
                                                            )}
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
                                                        <Calendar className='size-4 text-zinc-400' />
                                                        <span className='text-xs text-zinc-500'>
                                                            Joined
                                                        </span>
                                                    </div>
                                                    <p className='text-sm font-medium text-zinc-800 dark:text-zinc-100'>
                                                        {new Date(
                                                            selectedStaff.createdAt!
                                                        ).toLocaleDateString(
                                                            "en-US",
                                                            {
                                                                month: "short",
                                                                day: "numeric",
                                                                year: "numeric",
                                                            }
                                                        )}
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
                                <Button
                                    color='warning'
                                    startContent={<Pencil className='size-4' />}
                                    onPress={() => {
                                        onClose()
                                        if (selectedStaff) {
                                            handleEditStaff(selectedStaff)
                                        }
                                    }}
                                >
                                    Edit Staff
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Edit Staff Drawer */}
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
                            <DrawerHeader>Edit Staff</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Full Name'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter full name'
                                    isRequired
                                    value={editFormData.name}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            name: value,
                                        })
                                    }
                                    classNames={{
                                        label: "text-primary-500",
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <div className='flex flex-col gap-2'>
                                    <label className='text-sm font-medium text-foreground-600'>
                                        Profile Image (Optional)
                                    </label>
                                    <input
                                        type='file'
                                        accept='image/*'
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                setEditFormData({
                                                    ...editFormData,
                                                    profileImage: {
                                                        url: URL.createObjectURL(file),
                                                        publicId: file.name,
                                                        filename: file.name,
                                                        fileType: file.type,
                                                        uploadedAt: new Date(),
                                                    },
                                                })
                                            }
                                        }}
                                        className='block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer'
                                    />
                                    {editFormData.profileImage && (
                                        <div className='mt-2'>
                                            <img
                                                src={editFormData.profileImage.url}
                                                alt='Profile preview'
                                                className='h-16 w-16 rounded-full object-cover'
                                            />
                                        </div>
                                    )}
                                </div>
                                <Input
                                    label='Phone Number'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter phone number'
                                    isRequired
                                    value={editFormData.phone}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            phone: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Input
                                    label='Email Address'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter email (optional)'
                                    type='email'
                                    value={editFormData.email}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            email: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Input
                                    label='Staff ID'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Staff ID'
                                    isReadOnly
                                    value={editFormData.staffId}
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900",
                                    }}
                                />
                                <Autocomplete
                                    label='Department'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select a department'
                                    isRequired
                                    selectedKey={editFormData.department}
                                    onSelectionChange={(key) =>
                                        setEditFormData({
                                            ...editFormData,
                                            department: key as string,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {(
                                        departmentsData?.data?.departments || []
                                    ).map((dept: DepartmentInterface) => (
                                        <AutocompleteItem
                                            key={dept._id}
                                            textValue={dept.name}
                                        >
                                            <div className='flex items-center gap-2'>
                                                <Building2 className='size-4 text-zinc-400' />
                                                <span>{dept.name}</span>
                                            </div>
                                        </AutocompleteItem>
                                    ))}
                                </Autocomplete>
                                <Select
                                    label='Gender'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select gender'
                                    isRequired
                                    selectedKeys={
                                        editFormData.gender
                                            ? [editFormData.gender]
                                            : []
                                    }
                                    onSelectionChange={(keys) =>
                                        setEditFormData({
                                            ...editFormData,
                                            gender: Array.from(keys)[0] as string,
                                        })
                                    }
                                    classNames={{
                                        trigger:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                >
                                    {GENDER_OPTIONS.map((option) => (
                                        <SelectItem key={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </Select>
                                <Divider />
                                <div>
                                    <p className='text-sm font-medium mb-3'>
                                        Permissions
                                    </p>
                                    <CheckboxGroup
                                        value={editFormData.permissions}
                                        onValueChange={(value) =>
                                            setEditFormData({
                                                ...editFormData,
                                                permissions: value,
                                            })
                                        }
                                    >
                                        {PERMISSION_OPTIONS.map((option) => (
                                            <Checkbox
                                                key={option.value}
                                                value={option.value}
                                                classNames={{
                                                    label: "text-sm",
                                                }}
                                            >
                                                <div>
                                                    <p className='text-sm'>
                                                        {option.label}
                                                    </p>
                                                    <p className='text-xs text-zinc-500'>
                                                        {option.description}
                                                    </p>
                                                </div>
                                            </Checkbox>
                                        ))}
                                    </CheckboxGroup>
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
                                        !editFormData.name.trim() ||
                                        !editFormData.phone.trim() ||
                                        !editFormData.department ||
                                        !editFormData.gender
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
                                Delete Staff Member
                            </ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to delete{" "}
                                    <span className='font-semibold'>
                                        {selectedStaff?.name}
                                    </span>
                                    ?
                                </p>
                                <p className='text-xs text-zinc-500'>
                                    This action cannot be undone. All associated
                                    contracts, leave requests, and records will
                                    be affected.
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
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await isAuthenticated(request)
    const sessionData = await getSessionData(request)

    if (!authenticated) {
        return redirect("/")
    }

    const baseUrl = process.env.BASE_URL
    const url = new URL(request.url)
    const search = url.searchParams.get("search") || ""
    const limit = url.searchParams.get("limit") || "10"
    const page = url.searchParams.get("page") || "1"

    return { sessionData, baseUrl, search, limit, page }
}
