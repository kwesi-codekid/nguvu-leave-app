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
} from "@heroui/react"
import { useState } from "react"
import axios from "axios"
import { LoaderFunctionArgs, redirect } from "react-router"
import { Link, useLoaderData, useNavigate } from "react-router"
import {
    ArrowRight,
    BriefcaseBusiness,
    Building2,
    Calendar,
    CheckCircle2,
    Eye,
    GitBranch,
    Hash,
    Pencil,
    Trash2,
    UserCheck,
    Users,
    XCircle,
} from "lucide-react"
import useSWR from "swr"
import { isAuthenticated, getSessionData } from "~/auth-session"
import { JobPositionAvatar } from "~/ui/components/avatars"
import { DataTable } from "~/ui/components/data-table"
import { SearchInput } from "~/ui/components/inputs"
import { MobileList } from "~/ui/components/lists"
import { ApprovalFlow, OccupancyChips } from "~/ui/fragments/job-positions"
import AppLayout from "~/ui/layouts/app-layout"
import { fetcher } from "~/ui/lib/fetcher"
import {
    DepartmentInterface,
    JobPositionInterface,
    OccupancyInterface,
} from "~/utils/types"

export default function JobPositions() {
    const { sessionData, baseUrl, search } = useLoaderData<typeof loader>()

    const { data, isLoading, error, mutate } = useSWR(
        `${baseUrl}/job-positions?search=${search}`,
        fetcher(sessionData.token as string)
    )

    // Fetch departments for dropdown
    const { data: departmentsData } = useSWR(
        `${baseUrl}/departments`,
        fetcher(sessionData.token as string)
    )

    // Fetch all positions for endorser/approver dropdowns
    const { data: allPositionsData } = useSWR(
        `${baseUrl}/job-positions`,
        fetcher(sessionData.token as string)
    )

    const createDisclosure = useDisclosure()
    const editDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const deleteDisclosure = useDisclosure()
    const navigate = useNavigate()

    // Selected position for view/edit/delete
    const [selectedPosition, setSelectedPosition] =
        useState<JobPositionInterface | null>(null)

    // Form state for create
    const [formData, setFormData] = useState({
        title: "",
        department: "",
        maxOccupancy: "1",
        endorserPosition: "" as string | null,
        approverPosition: "" as string | null,
    })

    // Form state for edit
    const [editFormData, setEditFormData] = useState({
        title: "",
        department: "",
        maxOccupancy: "1",
        endorserPosition: "" as string | null,
        approverPosition: "" as string | null,
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Get positions excluding the current one (for endorser/approver selection)
    const getAvailablePositionsForApproval = (excludeId?: string) => {
        if (!allPositionsData?.data?.positions) return []
        return allPositionsData.data.positions.filter(
            (p: JobPositionInterface) => p._id !== excludeId && p.isActive
        )
    }

    const handleCreatePosition = async (onClose: () => void) => {
        if (!formData.title.trim() || !formData.department) return

        setIsSubmitting(true)
        try {
            await axios.post(
                `${baseUrl}/job-positions`,
                {
                    title: formData.title,
                    department: formData.department,
                    maxOccupancy: parseInt(formData.maxOccupancy) || 1,
                    endorserPosition: formData.endorserPosition || null,
                    approverPosition: formData.approverPosition || null,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            // Reset form and close drawer
            setFormData({
                title: "",
                department: "",
                maxOccupancy: "1",
                endorserPosition: null,
                approverPosition: null,
            })
            mutate() // Refresh the list
            onClose()
        } catch (error: any) {
            console.error("Error creating position:", error)
            alert(
                error.response?.data?.message || "Failed to create job position"
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view position
    const handleViewPosition = (position: JobPositionInterface) => {
        setSelectedPosition(position)
        viewDisclosure.onOpen()
    }

    // Handle edit position - open drawer with pre-filled data
    const handleEditPosition = (position: JobPositionInterface) => {
        setSelectedPosition(position)
        setEditFormData({
            title: position.title,
            department: (position.department as any)?._id || "",
            maxOccupancy: position.maxOccupancy?.toString() || "1",
            endorserPosition:
                (position.endorserPosition as any)?._id || null,
            approverPosition:
                (position.approverPosition as any)?._id || null,
        })
        editDisclosure.onOpen()
    }

    // Submit edit
    const handleSubmitEdit = async (onClose: () => void) => {
        if (!selectedPosition || !editFormData.title.trim()) return

        setIsSubmitting(true)
        try {
            await axios.put(
                `${baseUrl}/job-positions/${selectedPosition._id}`,
                {
                    title: editFormData.title,
                    department: editFormData.department,
                    maxOccupancy: parseInt(editFormData.maxOccupancy) || 1,
                    endorserPosition: editFormData.endorserPosition || null,
                    approverPosition: editFormData.approverPosition || null,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            mutate() // Refresh the list
            onClose()
        } catch (error: any) {
            console.error("Error updating position:", error)
            alert(
                error.response?.data?.message || "Failed to update job position"
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle delete position - open confirmation modal
    const handleDeleteClick = (position: JobPositionInterface) => {
        setSelectedPosition(position)
        deleteDisclosure.onOpen()
    }

    // Confirm delete
    const handleConfirmDelete = async (onClose: () => void) => {
        if (!selectedPosition) return

        setIsDeleting(true)
        try {
            await axios.delete(
                `${baseUrl}/job-positions/${selectedPosition._id}`,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )
            mutate() // Refresh the list
            onClose()
        } catch (error: any) {
            console.error("Error deleting position:", error)
            alert(
                error.response?.data?.message || "Failed to delete job position"
            )
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <AppLayout user={sessionData.user}>
            <div className='flex flex-col gap-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Job Positions</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage job positions
                        </p>
                    </div>
                    <Button
                        color='warning'
                        size='sm'
                        onPress={createDisclosure.onOpen}
                    >
                        Add Position
                    </Button>
                </div>

                {/* job position list */}
                <div className='flex flex-col gap-4'>
                    <div className='flex items-center justify-between'>
                        <SearchInput />
                    </div>

                    {/* desktop view: data table */}
                    <DataTable
                        columns={[
                            "Position",
                            "Occupancy",
                            "Approval Flow",
                            "Actions",
                        ]}
                        isLoading={isLoading}
                        totalPages={data?.data?.pagination?.totalPages}
                    >
                        {data?.data?.positions?.map(
                            (position: JobPositionInterface) => (
                                <TableRow
                                    key={position._id}
                                    className='hover:bg-zinc-100 dark:hover:bg-zinc-900/50 transition-all duration-300'
                                >
                                    <TableCell>
                                        <JobPositionAvatar
                                            title={position.title}
                                            department={
                                                (position.department as any)
                                                    ?.name
                                            }
                                        />
                                    </TableCell>

                                    <TableCell>
                                        <OccupancyChips
                                            occupancy={
                                                position.occupancy as OccupancyInterface
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <ApprovalFlow
                                            endorser={
                                                (
                                                    position.endorserPosition as any
                                                )?.title
                                            }
                                            approver={
                                                (
                                                    position.approverPosition as any
                                                )?.title
                                            }
                                        />
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
                                                        handleViewPosition(
                                                            position
                                                        )
                                                    }
                                                    startContent={
                                                        <Eye className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                            <Tooltip content='Edit position'>
                                                <Button
                                                    size='sm'
                                                    color='primary'
                                                    variant='flat'
                                                    isIconOnly
                                                    onPress={() =>
                                                        handleEditPosition(
                                                            position
                                                        )
                                                    }
                                                    startContent={
                                                        <Pencil className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                            <Tooltip content='Delete position'>
                                                <Button
                                                    size='sm'
                                                    color='danger'
                                                    variant='flat'
                                                    isIconOnly
                                                    onPress={() =>
                                                        handleDeleteClick(
                                                            position
                                                        )
                                                    }
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

                    {/* mobile view: data table */}
                    <MobileList
                        isLoading={isLoading}
                        listContent={data?.data?.positions?.map(
                            (position: JobPositionInterface) => ({
                                startIcon: (
                                    <BriefcaseBusiness className='size-5' />
                                ),
                                content: (
                                    <div
                                        onClick={() =>
                                            handleViewPosition(position)
                                        }
                                        className='flex flex-col gap-1 cursor-pointer'
                                    >
                                        <div className='flex items-center justify-between'>
                                            <h3 className='text-sm font-medium line-clamp-1 w-56'>
                                                {position.title}
                                            </h3>
                                            <Chip
                                                classNames={{
                                                    content:
                                                        "dark:text-zinc-50",
                                                    base: "dark:bg-zinc-800",
                                                }}
                                                size='sm'
                                                radius='sm'
                                                variant='flat'
                                            >
                                                {position.occupancy?.current} /{" "}
                                                {position.occupancy?.max}
                                            </Chip>
                                        </div>

                                        <div className='flex items-center justify-between'>
                                            <p className='text-xs text-zinc-500'>
                                                {
                                                    (position.department as any)
                                                        ?.name
                                                }
                                            </p>
                                            <p
                                                className={`text-xs ${
                                                    position?.occupancy
                                                        ?.available &&
                                                    position?.occupancy
                                                        ?.available > 0
                                                        ? "text-green-500"
                                                        : "text-red-500"
                                                }`}
                                            >
                                                {position?.occupancy
                                                    ?.available &&
                                                position?.occupancy?.available >
                                                    0
                                                    ? `${position.occupancy?.available} available`
                                                    : "Occupied"}
                                            </p>
                                        </div>
                                    </div>
                                ),
                            })
                        )}
                    />
                </div>
            </div>

            {/* Create Position Drawer */}
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
                            <DrawerHeader>Create Job Position</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Position Title'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter position title'
                                    isRequired
                                    value={formData.title}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, title: value })
                                    }
                                    classNames={{
                                        label: "text-primary-500",
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
                                <Input
                                    label='Maximum Occupancy'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter max occupancy'
                                    type='number'
                                    min={1}
                                    value={formData.maxOccupancy}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            maxOccupancy: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Divider />
                                <p className='text-xs text-zinc-500'>
                                    Approval Flow (Optional)
                                </p>
                                <Autocomplete
                                    label='Endorser Position'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select endorser position'
                                    description='Position that endorses leave requests'
                                    selectedKey={formData.endorserPosition}
                                    onSelectionChange={(key) =>
                                        setFormData({
                                            ...formData,
                                            endorserPosition: key as string | null,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {getAvailablePositionsForApproval().map(
                                        (pos: JobPositionInterface) => (
                                            <AutocompleteItem
                                                key={pos._id}
                                                textValue={pos.title}
                                            >
                                                <div className='flex flex-col'>
                                                    <span className='text-sm'>
                                                        {pos.title}
                                                    </span>
                                                    <span className='text-xs text-zinc-500'>
                                                        {
                                                            (
                                                                pos.department as any
                                                            )?.name
                                                        }
                                                    </span>
                                                </div>
                                            </AutocompleteItem>
                                        )
                                    )}
                                </Autocomplete>
                                <Autocomplete
                                    label='Approver Position'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select approver position'
                                    description='Position that gives final approval'
                                    selectedKey={formData.approverPosition}
                                    onSelectionChange={(key) =>
                                        setFormData({
                                            ...formData,
                                            approverPosition: key as string | null,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {getAvailablePositionsForApproval().map(
                                        (pos: JobPositionInterface) => (
                                            <AutocompleteItem
                                                key={pos._id}
                                                textValue={pos.title}
                                            >
                                                <div className='flex flex-col'>
                                                    <span className='text-sm'>
                                                        {pos.title}
                                                    </span>
                                                    <span className='text-xs text-zinc-500'>
                                                        {
                                                            (
                                                                pos.department as any
                                                            )?.name
                                                        }
                                                    </span>
                                                </div>
                                            </AutocompleteItem>
                                        )
                                    )}
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
                                    onPress={() => handleCreatePosition(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !formData.title.trim() ||
                                        !formData.department
                                    }
                                >
                                    Create Position
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Position Drawer */}
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
                                    Position Details
                                </span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedPosition && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/10 dark:to-primary-800/20 border-none shadow-sm'>
                                            <CardBody className='flex flex-row items-center gap-4 py-5'>
                                                <div className='size-14 rounded-xl bg-primary-500/20 flex items-center justify-center'>
                                                    <BriefcaseBusiness className='size-7 text-primary-600 dark:text-primary-400' />
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='text-xl font-semibold text-zinc-800 dark:text-zinc-100'>
                                                        {selectedPosition.title}
                                                    </h3>
                                                    <div className='flex items-center gap-2 mt-1'>
                                                        <Building2 className='size-3 text-zinc-400' />
                                                        <span className='text-sm text-zinc-500'>
                                                            {
                                                                (
                                                                    selectedPosition.department as any
                                                                )?.name
                                                            }
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardBody>
                                        </Card>

                                        {/* Status */}
                                        <div className='px-1'>
                                            <Chip
                                                size='sm'
                                                variant='flat'
                                                color={
                                                    selectedPosition.isActive
                                                        ? "success"
                                                        : "danger"
                                                }
                                                startContent={
                                                    selectedPosition.isActive ? (
                                                        <CheckCircle2 className='size-3' />
                                                    ) : (
                                                        <XCircle className='size-3' />
                                                    )
                                                }
                                            >
                                                {selectedPosition.isActive
                                                    ? "Active"
                                                    : "Inactive"}
                                            </Chip>
                                        </div>

                                        <Divider />

                                        {/* Occupancy Stats */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <Users className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Occupancy
                                                </span>
                                            </div>
                                            <div className='grid grid-cols-3 gap-3'>
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='py-3 px-4 text-center'>
                                                        <p className='text-2xl font-bold text-zinc-800 dark:text-zinc-100'>
                                                            {selectedPosition
                                                                .occupancy
                                                                ?.current || 0}
                                                        </p>
                                                        <span className='text-xs text-zinc-500'>
                                                            Current
                                                        </span>
                                                    </CardBody>
                                                </Card>
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='py-3 px-4 text-center'>
                                                        <p className='text-2xl font-bold text-zinc-800 dark:text-zinc-100'>
                                                            {selectedPosition.maxOccupancy ||
                                                                0}
                                                        </p>
                                                        <span className='text-xs text-zinc-500'>
                                                            Maximum
                                                        </span>
                                                    </CardBody>
                                                </Card>
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='py-3 px-4 text-center'>
                                                        <p
                                                            className={`text-2xl font-bold ${
                                                                (selectedPosition
                                                                    .occupancy
                                                                    ?.available ||
                                                                    0) > 0
                                                                    ? "text-success-600"
                                                                    : "text-danger-600"
                                                            }`}
                                                        >
                                                            {selectedPosition
                                                                .occupancy
                                                                ?.available || 0}
                                                        </p>
                                                        <span className='text-xs text-zinc-500'>
                                                            Available
                                                        </span>
                                                    </CardBody>
                                                </Card>
                                            </div>
                                        </div>

                                        <Divider />

                                        {/* Approval Flow */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <GitBranch className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Approval Flow
                                                </span>
                                            </div>
                                            <div className='space-y-3'>
                                                {/* Endorser */}
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='flex flex-row items-center gap-3 py-3'>
                                                        <Avatar
                                                            name='E'
                                                            size='sm'
                                                            className='bg-warning-100 text-warning-600'
                                                        />
                                                        <div className='flex-1'>
                                                            <p className='text-xs text-zinc-500'>
                                                                Endorser
                                                            </p>
                                                            <p className='font-medium text-sm'>
                                                                {(
                                                                    selectedPosition.endorserPosition as any
                                                                )?.title ||
                                                                    "Not assigned"}
                                                            </p>
                                                        </div>
                                                    </CardBody>
                                                </Card>
                                                {/* Arrow */}
                                                <div className='flex justify-center'>
                                                    <ArrowRight className='size-4 text-zinc-300 rotate-90' />
                                                </div>
                                                {/* Approver */}
                                                <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                    <CardBody className='flex flex-row items-center gap-3 py-3'>
                                                        <Avatar
                                                            name='A'
                                                            size='sm'
                                                            className='bg-success-100 text-success-600'
                                                        />
                                                        <div className='flex-1'>
                                                            <p className='text-xs text-zinc-500'>
                                                                Approver
                                                            </p>
                                                            <p className='font-medium text-sm'>
                                                                {(
                                                                    selectedPosition.approverPosition as any
                                                                )?.title ||
                                                                    "Not assigned"}
                                                            </p>
                                                        </div>
                                                    </CardBody>
                                                </Card>
                                            </div>
                                        </div>

                                        <Divider />

                                        {/* Created At */}
                                        <div className='px-1'>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='py-3 px-4'>
                                                    <div className='flex items-center gap-2 mb-1'>
                                                        <Calendar className='size-4 text-zinc-400' />
                                                        <span className='text-xs text-zinc-500'>
                                                            Created
                                                        </span>
                                                    </div>
                                                    <p className='text-sm font-medium text-zinc-800 dark:text-zinc-100'>
                                                        {new Date(
                                                            selectedPosition.createdAt!
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
                                        if (selectedPosition) {
                                            handleEditPosition(selectedPosition)
                                        }
                                    }}
                                >
                                    Edit Position
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Edit Position Drawer */}
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
                            <DrawerHeader>Edit Job Position</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Position Title'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter position title'
                                    isRequired
                                    value={editFormData.title}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            title: value,
                                        })
                                    }
                                    classNames={{
                                        label: "text-primary-500",
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
                                <Input
                                    label='Maximum Occupancy'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter max occupancy'
                                    type='number'
                                    min={1}
                                    value={editFormData.maxOccupancy}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            maxOccupancy: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
                                <Divider />
                                <p className='text-xs text-zinc-500'>
                                    Approval Flow (Optional)
                                </p>
                                <Autocomplete
                                    label='Endorser Position'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select endorser position'
                                    description='Position that endorses leave requests'
                                    selectedKey={editFormData.endorserPosition}
                                    onSelectionChange={(key) =>
                                        setEditFormData({
                                            ...editFormData,
                                            endorserPosition: key as
                                                | string
                                                | null,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {getAvailablePositionsForApproval(
                                        selectedPosition?._id
                                    ).map((pos: JobPositionInterface) => (
                                        <AutocompleteItem
                                            key={pos._id}
                                            textValue={pos.title}
                                        >
                                            <div className='flex flex-col'>
                                                <span className='text-sm'>
                                                    {pos.title}
                                                </span>
                                                <span className='text-xs text-zinc-500'>
                                                    {
                                                        (pos.department as any)
                                                            ?.name
                                                    }
                                                </span>
                                            </div>
                                        </AutocompleteItem>
                                    ))}
                                </Autocomplete>
                                <Autocomplete
                                    label='Approver Position'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select approver position'
                                    description='Position that gives final approval'
                                    selectedKey={editFormData.approverPosition}
                                    onSelectionChange={(key) =>
                                        setEditFormData({
                                            ...editFormData,
                                            approverPosition: key as
                                                | string
                                                | null,
                                        })
                                    }
                                    classNames={{
                                        base: "w-full",
                                    }}
                                >
                                    {getAvailablePositionsForApproval(
                                        selectedPosition?._id
                                    ).map((pos: JobPositionInterface) => (
                                        <AutocompleteItem
                                            key={pos._id}
                                            textValue={pos.title}
                                        >
                                            <div className='flex flex-col'>
                                                <span className='text-sm'>
                                                    {pos.title}
                                                </span>
                                                <span className='text-xs text-zinc-500'>
                                                    {
                                                        (pos.department as any)
                                                            ?.name
                                                    }
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
                                    isDisabled={!editFormData.title.trim()}
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
                                Delete Job Position
                            </ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to delete{" "}
                                    <span className='font-semibold'>
                                        {selectedPosition?.title}
                                    </span>
                                    ?
                                </p>
                                <p className='text-xs text-zinc-500'>
                                    This action cannot be undone. Any staff
                                    contracts linked to this position will need
                                    to be reassigned.
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

export async function loader({ request }: LoaderFunctionArgs) {
    // check if user is authenticated
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/login-email")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string

    const url = new URL(request.url)
    const search = url.searchParams.get("search") || ""

    return { sessionData, baseUrl, search }
}
