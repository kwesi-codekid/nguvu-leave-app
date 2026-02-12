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
    TableCell,
    TableRow,
    Tooltip,
    useDisclosure,
    addToast,
    Select,
    SelectItem,
} from "@heroui/react"
import { useState } from "react"
import axios from "axios"
import { LoaderFunctionArgs, redirect } from "react-router"
import { Link, useLoaderData, useNavigate } from "react-router"
import {
    Briefcase,
    Building2,
    Calendar,
    CheckCircle2,
    Eye,
    FileText,
    List,
    Mail,
    Pencil,
    PlaneTakeoff,
    Trash2,
    User,
    Users,
    XCircle,
    Download,
} from "lucide-react"
import useSWR from "swr"
import { DateTime } from "luxon"
import {
    getSessionData,
    isAuthenticated as checkAuthenticated,
} from "~/auth-session"
import { DepartmentStatsCard } from "~/ui/components/cards"
import { DataTable } from "~/ui/components/data-table"
import { SearchInput } from "~/ui/components/inputs"
import { DepartmentStatsSection } from "~/ui/fragments/department-stats"
import AppLayout from "~/ui/layouts/app-layout"
import { fetcher } from "~/ui/lib/fetcher"
import { exportData, formatters, ExportFormat } from "~/ui/lib/export-utils"
import { DepartmentInterface } from "~/utils/types"

export default function Departments() {
    const { sessionData, baseUrl, search } = useLoaderData<typeof loader>()

    const { data, isLoading, error, mutate } = useSWR(
        `${baseUrl}/departments?search=${search}`,
        fetcher(sessionData?.token as string)
    )
    const departmentsStats = useSWR(
        `${baseUrl}/departments?op=statistics`,
        fetcher(sessionData?.token as string)
    )

    // Fetch staff for head dropdown
    const { data: staffData } = useSWR(
        `${baseUrl}/staff`,
        fetcher(sessionData?.token as string)
    )

    // Filter staff by department for edit mode
    const getStaffInDepartment = (departmentId: string) => {
        if (!staffData?.data?.staff) return []
        return staffData.data.staff.filter(
            (staff: any) =>
                staff.department?._id === departmentId ||
                staff.department === departmentId
        )
    }

    const createDisclosure = useDisclosure()
    const editDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const deleteDisclosure = useDisclosure()
    const navigate = useNavigate()

    // Selected department for view/edit/delete
    const [selectedDepartment, setSelectedDepartment] = useState<DepartmentInterface | null>(null)
    const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("csv")

    // Form state for create (no head - will be assigned after staff are added)
    const [formData, setFormData] = useState({
        name: "",
        description: "",
    })

    // Form state for edit
    const [editFormData, setEditFormData] = useState({
        name: "",
        description: "",
        head: "" as string | null,
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleCreateDepartment = async (onClose: () => void) => {
        if (!formData.name.trim()) return

        setIsSubmitting(true)
        try {
            await axios.post(
                `${baseUrl}/departments`,
                {
                    name: formData.name,
                    description: formData.description,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            // Reset form and close drawer
            setFormData({ name: "", description: "" })
            mutate() // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Department created successfully",
            })
        } catch (error: any) {
            console.error("Error creating department:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to create department",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view department
    const handleViewDepartment = (department: DepartmentInterface) => {
        setSelectedDepartment(department)
        viewDisclosure.onOpen()
    }

    // Handle edit department - open drawer with pre-filled data
    const handleEditDepartment = (department: DepartmentInterface) => {
        setSelectedDepartment(department)
        setEditFormData({
            name: department.name,
            description: department.description || "",
            head: (department.head as any)?._id || null,
        })
        editDisclosure.onOpen()
    }

    // Submit edit
    const handleSubmitEdit = async (onClose: () => void) => {
        if (!selectedDepartment || !editFormData.name.trim()) return

        setIsSubmitting(true)
        try {
            await axios.put(
                `${baseUrl}/departments/${selectedDepartment._id}`,
                {
                    name: editFormData.name,
                    description: editFormData.description,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            // If head changed, use the assign-head or remove-head endpoint
            const currentHeadId = (selectedDepartment.head as any)?._id
            if (editFormData.head !== currentHeadId) {
                if (editFormData.head) {
                    // Assign new head
                    await axios.patch(
                        `${baseUrl}/departments/${selectedDepartment._id}?op=assign-head`,
                        { staffId: editFormData.head },
                        {
                            headers: {
                                Authorization: `Bearer ${sessionData?.token}`,
                            },
                        }
                    )
                } else if (currentHeadId) {
                    // Remove head
                    await axios.patch(
                        `${baseUrl}/departments/${selectedDepartment._id}?op=remove-head`,
                        {},
                        {
                            headers: {
                                Authorization: `Bearer ${sessionData?.token}`,
                            },
                        }
                    )
                }
            }

            mutate() // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Department updated successfully",
            })
        } catch (error: any) {
            console.error("Error updating department:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to update department",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle delete department - open confirmation modal
    const handleDeleteClick = (department: DepartmentInterface) => {
        setSelectedDepartment(department)
        deleteDisclosure.onOpen()
    }

    // Confirm delete
    const handleConfirmDelete = async (onClose: () => void) => {
        if (!selectedDepartment) return

        setIsDeleting(true)
        try {
            await axios.delete(
                `${baseUrl}/departments/${selectedDepartment._id}`,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            mutate() // Refresh the list
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Department deleted successfully",
            })
        } catch (error: any) {
            console.error("Error deleting department:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to delete department",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    // Handle export departments data
    const handleExportDepartments = () => {
        if (!data?.data?.departments || data.data.departments.length === 0) {
            addToast({
                color: "warning",
                title: "No Data",
                description: "No department data available to export",
            })
            return
        }

        const exportColumns = [
            { key: "name", label: "Department Name" },
            { key: "description", label: "Description" },
            { key: "head.name", label: "Department Head", formatter: formatters.staffName },
            { key: "staffCount", label: "Staff Count" },
        ]

        exportData(
            data.data.departments,
            exportColumns,
            selectedExportFormat,
            `departments-export-${DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")}`
        )

        addToast({
            color: "success",
            title: "Export Complete",
            description: `Department data exported successfully as ${selectedExportFormat.toUpperCase()}`,
        })
    }

    return (
        <AppLayout user={sessionData.user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className='flex flex-col gap-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Departments</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage departments
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
                            onPress={handleExportDepartments}
                            isDisabled={isLoading || !data?.data?.departments?.length}
                        >
                            Export
                        </Button>
                        <Button
                            size='sm'
                            color='warning'
                            onPress={createDisclosure.onOpen}
                            className='bg-warning/70 dark:bg-warning/70 text-white hover:shadow-lg hover:scale-[1.01] transition-all duration-300'
                        >
                            Add Department
                        </Button>
                    </div>
                </div>

                {/* department stats */}
                <DepartmentStatsSection
                    baseUrl={baseUrl as string}
                    token={sessionData?.token as string}
                />

                {/* department list */}
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <SearchInput />
                    </div>

                    {/* desktop view: data table */}
                    <DataTable
                        isLoading={isLoading}
                        columns={[
                            "Department Info",
                            "Head",
                            "Staff Count",
                            "Actions",
                        ]}
                    >
                        {data?.data?.departments?.map(
                            (department: DepartmentInterface) => (
                                <TableRow
                                    key={department._id}
                                    className='hover:bg-zinc-100 dark:hover:bg-zinc-900/50 transition-all duration-300'
                                >
                                    <TableCell>
                                        <h4 className='text-base font-medium'>
                                            {department.name}
                                        </h4>
                                        <div className='w-44'>
                                            <span className='text-xs text-zinc-500  line-clamp-1'>
                                                {department.description}
                                            </span>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        {(department.head as any)?.name || ""}
                                    </TableCell>
                                    <TableCell>
                                        {department.staffCount}
                                    </TableCell>
                                    <TableCell>
                                        <div className='flex items-center gap-3'>
                                            <Tooltip content='View details'>
                                                <Button
                                                    size='sm'
                                                    color='success'
                                                    variant='flat'
                                                    isIconOnly
                                                    onPress={() => handleViewDepartment(department)}
                                                    startContent={
                                                        <Eye className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                            <Tooltip content='Edit department'>
                                                <Button
                                                    size='sm'
                                                    color='primary'
                                                    variant='flat'
                                                    isIconOnly
                                                    onPress={() => handleEditDepartment(department)}
                                                    startContent={
                                                        <Pencil className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                            <Tooltip content='Delete department'>
                                                <Button
                                                    size='sm'
                                                    color='danger'
                                                    variant='flat'
                                                    isIconOnly
                                                    onPress={() => handleDeleteClick(department)}
                                                    startContent={
                                                        <Trash2 className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        )}
                    </DataTable>

                    {/* mobile view: department list */}
                    <div className='block md:hidden border-2 border-zinc-200 dark:border-zinc-800 rounded-xl p-4'>
                        {data?.data?.departments?.map(
                            (department: DepartmentInterface) => (
                                <Link
                                    to={`/departments/${department._id}`}
                                    key={department._id}
                                    className='border-b last:border-b-0 border-zinc-200 dark:border-zinc-800 py-3 flex gap-2'
                                >
                                    <div className='size-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center'>
                                        <Building2 className='size-4' />
                                    </div>
                                    <div className='flex-1'>
                                        <div>
                                            <h4 className='text-base font-medium'>
                                                {department.name}
                                            </h4>
                                            <span className='text-xs text-zinc-500 line-clamp-1'>
                                                {department.description}
                                            </span>
                                        </div>

                                        <div className='flex items-center justify-between'>
                                            <div className='flex items-center gap-2'>
                                                <span className='opacity-50 text-xs'>
                                                    HOD:{" "}
                                                </span>
                                                <p className='font-medium text-xs text-zinc-700 dark:text-zinc-300'>
                                                    {
                                                        (department.head as any)
                                                            ?.name
                                                    }
                                                </p>
                                            </div>
                                            <div className='flex gap-2 items-center'>
                                                <Users className='size-4 opacity-50' />
                                                <p className='font-medium'>
                                                    {department.staffCount}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            )
                        )}
                    </div>
                </div>
            </div>

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
                            <DrawerHeader>Create Department</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Department Name'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter department name'
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
                                <Input
                                    label='Department Description'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter department description'
                                    value={formData.description}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            description: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <p className='text-xs text-zinc-500'>
                                    You can assign a department head after adding staff members to this department.
                                </p>
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
                                    onPress={() => handleCreateDepartment(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={!formData.name.trim()}
                                >
                                    Create Department
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Department Drawer */}
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
                                <span className='text-sm text-zinc-500'>Department Details</span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedDepartment && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900/10 dark:to-warning-800/20 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                            <CardBody className='flex flex-row items-center gap-4 py-5'>
                                                <div className='size-14 rounded-xl bg-warning-500/20 flex items-center justify-center'>
                                                    <Building2 className='size-7 text-warning-600 dark:text-warning-400' />
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='text-xl font-semibold text-zinc-800 dark:text-zinc-100'>
                                                        {selectedDepartment.name}
                                                    </h3>
                                                    <Chip
                                                        size='sm'
                                                        variant='flat'
                                                        color={selectedDepartment.isActive ? "success" : "danger"}
                                                        startContent={
                                                            selectedDepartment.isActive
                                                                ? <CheckCircle2 className='size-3' />
                                                                : <XCircle className='size-3' />
                                                        }
                                                        className='mt-1'
                                                    >
                                                        {selectedDepartment.isActive ? "Active" : "Inactive"}
                                                    </Chip>
                                                </div>
                                            </CardBody>
                                        </Card>

                                        {/* Description */}
                                        {selectedDepartment.description && (
                                            <div className='px-1'>
                                                <div className='flex items-center gap-2 mb-2'>
                                                    <FileText className='size-4 text-zinc-400' />
                                                    <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                        Description
                                                    </span>
                                                </div>
                                                <p className='text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pl-6'>
                                                    {selectedDepartment.description}
                                                </p>
                                            </div>
                                        )}

                                        <Divider />

                                        {/* Department Head Section */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <User className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Department Head
                                                </span>
                                            </div>
                                            {(selectedDepartment.head as any)?.name ? (
                                                <Card className='shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                                    <CardBody className='flex flex-row items-center gap-3 py-3'>
                                                        <Avatar
                                                            name={(selectedDepartment.head as any)?.name}
                                                            size='md'
                                                            className='bg-primary-100 text-primary-600'
                                                        />
                                                        <div className='flex-1'>
                                                            <p className='font-medium text-sm'>
                                                                {(selectedDepartment.head as any)?.name}
                                                            </p>
                                                            {(selectedDepartment.head as any)?.email && (
                                                                <div className='flex items-center gap-1.5 mt-0.5'>
                                                                    <Mail className='size-3 text-zinc-400' />
                                                                    <span className='text-xs text-zinc-500'>
                                                                        {(selectedDepartment.head as any)?.email}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CardBody>
                                                </Card>
                                            ) : (
                                                <div className='pl-6 text-sm text-zinc-400 italic'>
                                                    No department head assigned
                                                </div>
                                            )}
                                        </div>

                                        <Divider />

                                        {/* Stats Row */}
                                        <div className='grid grid-cols-2 gap-3'>
                                            <Card className='shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                                <CardBody className='py-3 px-4'>
                                                    <div className='flex items-center gap-2 mb-1'>
                                                        <Users className='size-4 text-primary-500' />
                                                        <span className='text-xs text-zinc-500'>Staff Members</span>
                                                    </div>
                                                    <p className='text-2xl font-bold text-zinc-800 dark:text-zinc-100'>
                                                        {selectedDepartment.staffCount || 0}
                                                    </p>
                                                </CardBody>
                                            </Card>
                                            <Card className='shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20'>
                                                <CardBody className='py-3 px-4'>
                                                    <div className='flex items-center gap-2 mb-1'>
                                                        <Calendar className='size-4 text-success-500' />
                                                        <span className='text-xs text-zinc-500'>Created</span>
                                                    </div>
                                                    <p className='text-sm font-medium text-zinc-800 dark:text-zinc-100'>
                                                        {new Date(selectedDepartment.createdAt!).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                </CardBody>
                                            </Card>
                                        </div>
                                    </>
                                )}
                            </DrawerBody>
                            <DrawerFooter className='border-t border-zinc-200 dark:border-zinc-800'>
                                <Button
                                    color='warning'
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
                                        if (selectedDepartment) {
                                            handleEditDepartment(selectedDepartment)
                                        }
                                    }}
                                >
                                    Edit Department
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Edit Department Drawer */}
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
                            <DrawerHeader>Edit Department</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Department Name'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter department name'
                                    isRequired
                                    value={editFormData.name}
                                    onValueChange={(value) =>
                                        setEditFormData({ ...editFormData, name: value })
                                    }
                                    classNames={{
                                        label: "text-primary-500",
                                        inputWrapper: "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Input
                                    label='Department Description'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter department description'
                                    value={editFormData.description}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            description: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper: "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Autocomplete
                                    label='Department Head'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select a staff member from this department'
                                    description={
                                        getStaffInDepartment(selectedDepartment?._id || "").length === 0
                                            ? "No staff members in this department yet"
                                            : "Select from staff members in this department"
                                    }
                                    selectedKey={editFormData.head}
                                    onSelectionChange={(key) =>
                                        setEditFormData({
                                            ...editFormData,
                                            head: key as string | null,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                    isDisabled={getStaffInDepartment(selectedDepartment?._id || "").length === 0}
                                >
                                    {getStaffInDepartment(selectedDepartment?._id || "").map((staff: any) => (
                                        <AutocompleteItem key={staff._id} textValue={staff.name}>
                                            <div className='flex flex-col'>
                                                <span className='text-sm'>{staff.name}</span>
                                                <span className='text-xs text-zinc-500'>
                                                    {staff.email || staff.phone}
                                                </span>
                                            </div>
                                        </AutocompleteItem>
                                    ))}
                                </Autocomplete>
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
                                    isDisabled={!editFormData.name.trim()}
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
                                Delete Department
                            </ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to delete{" "}
                                    <span className='font-semibold'>
                                        {selectedDepartment?.name}
                                    </span>
                                    ?
                                </p>
                                <p className='text-xs text-zinc-500'>
                                    This action cannot be undone. All staff members in this
                                    department will need to be reassigned.
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
    const baseUrl = process.env.BASE_URL
    const url = new URL(request.url)
    const search = url.searchParams.get("search") || ""
    const authenticated = await checkAuthenticated(request)
    const sessionData = await getSessionData(request)

    if (!authenticated) {
        return redirect("/")
    }
    return { sessionData, baseUrl, search }
}
