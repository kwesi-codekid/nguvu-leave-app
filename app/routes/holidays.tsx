import {
    addToast,
    Button,
    Card,
    CardBody,
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
    Textarea,
    Tooltip,
    useDisclosure,
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
import { HolidayInterface, HolidayTypes } from "~/utils/types"
import {
    Calendar,
    CalendarCheck,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Eye,
    Pencil,
    Trash2,
} from "lucide-react"
import { MobileList } from "~/ui/components/lists"
import { HolidayChip } from "~/ui/components/chips"

// Holiday type options
const HOLIDAY_TYPE_OPTIONS = [
    {
        value: HolidayTypes.FIXED,
        label: "Fixed",
        description: "Same dates every year (e.g., Christmas - Dec 25)",
    },
    {
        value: HolidayTypes.VARYING,
        label: "Varying",
        description: "Different dates each year (e.g., Easter)",
    },
]

export default function Holidays() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()

    // Get current year or from search params
    const currentYear = new Date().getFullYear()
    const selectedYear = parseInt(
        searchParams.get("year") || currentYear.toString()
    )

    const { data, isLoading, error, mutate } = useSWR(
        `${baseUrl}/holidays?op=year&year=${selectedYear}`,
        fetcher(sessionData.token as string)
    )

    const createDisclosure = useDisclosure()
    const editDisclosure = useDisclosure()
    const viewDisclosure = useDisclosure()
    const deleteDisclosure = useDisclosure()

    // Selected holiday for view/edit/delete
    const [selectedHoliday, setSelectedHoliday] =
        useState<HolidayInterface | null>(null)

    // Form state for create
    const [formData, setFormData] = useState({
        name: "",
        type: HolidayTypes.FIXED as HolidayTypes,
        startDate: "",
        endDate: "",
        description: "",
    })

    // Form state for edit
    const [editFormData, setEditFormData] = useState({
        name: "",
        type: HolidayTypes.FIXED as HolidayTypes,
        startDate: "",
        endDate: "",
        description: "",
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Handle year change
    const handleYearChange = (direction: "prev" | "next") => {
        const newYear =
            direction === "prev" ? selectedYear - 1 : selectedYear + 1
        setSearchParams({ year: newYear.toString() })
    }

    // Get holiday date display
    const getHolidayDate = (holiday: HolidayInterface) => {
        if (!holiday.startDate) return "Date not set"

        const startDate = DateTime.fromISO(holiday.startDate as any)
        const endDate = holiday.endDate
            ? DateTime.fromISO(holiday.endDate as any)
            : startDate

        // For fixed holidays, show without year
        if (holiday.type === HolidayTypes.FIXED) {
            if (startDate.hasSame(endDate, "day")) {
                return startDate.toFormat("LLL d")
            }
            return `${startDate.toFormat("LLL d")} - ${endDate.toFormat("LLL d")}`
        }

        // For varying holidays, show with year
        if (startDate.hasSame(endDate, "day")) {
            return startDate.toFormat("ccc, LLL d yyyy")
        }
        return `${startDate.toFormat("LLL d")} - ${endDate.toFormat("LLL d, yyyy")}`
    }

    // Handle create holiday
    const handleCreateHoliday = async (onClose: () => void) => {
        if (!formData.name.trim() || !formData.startDate) return

        setIsSubmitting(true)
        try {
            const payload: any = {
                name: formData.name,
                type: formData.type,
                startDate: formData.startDate,
                endDate: formData.endDate || formData.startDate,
                description: formData.description || undefined,
            }

            await axios.post(`${baseUrl}/holidays`, payload, {
                headers: {
                    Authorization: `Bearer ${sessionData?.token}`,
                },
            })

            // Reset form and close drawer
            setFormData({
                name: "",
                type: HolidayTypes.FIXED,
                startDate: "",
                endDate: "",
                description: "",
            })
            await mutate()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Holiday created successfully",
            })
        } catch (error: any) {
            console.error("Error creating holiday:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to create holiday",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle view holiday
    const handleViewHoliday = (holiday: HolidayInterface) => {
        setSelectedHoliday(holiday)
        viewDisclosure.onOpen()
    }

    // Handle edit holiday - open drawer with pre-filled data
    const handleEditHoliday = (holiday: HolidayInterface) => {
        setSelectedHoliday(holiday)
        setEditFormData({
            name: holiday.name,
            type: holiday.type,
            startDate: holiday.startDate
                ? DateTime.fromISO(holiday.startDate as any).toFormat("yyyy-MM-dd")
                : "",
            endDate: holiday.endDate
                ? DateTime.fromISO(holiday.endDate as any).toFormat("yyyy-MM-dd")
                : "",
            description: holiday.description || "",
        })
        editDisclosure.onOpen()
    }

    // Submit edit
    const handleSubmitEdit = async (onClose: () => void) => {
        if (!selectedHoliday || !editFormData.name.trim() || !editFormData.startDate)
            return

        setIsSubmitting(true)
        try {
            const payload: any = {
                name: editFormData.name,
                startDate: editFormData.startDate,
                endDate: editFormData.endDate || editFormData.startDate,
                description: editFormData.description || undefined,
            }

            await axios.put(
                `${baseUrl}/holidays/${selectedHoliday._id}`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            await mutate()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Holiday updated successfully",
            })
        } catch (error: any) {
            console.error("Error updating holiday:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to update holiday",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle delete holiday - open confirmation modal
    const handleDeleteClick = (holiday: HolidayInterface) => {
        setSelectedHoliday(holiday)
        deleteDisclosure.onOpen()
    }

    // Confirm delete
    const handleConfirmDelete = async (onClose: () => void) => {
        if (!selectedHoliday) return

        setIsDeleting(true)
        try {
            await axios.delete(`${baseUrl}/holidays/${selectedHoliday._id}`, {
                headers: {
                    Authorization: `Bearer ${sessionData?.token}`,
                },
            })
            await mutate()
            onClose()
            addToast({
                color: "success",
                title: "Success",
                description: "Holiday deleted successfully",
            })
        } catch (error: any) {
            console.error("Error deleting holiday:", error)
            addToast({
                color: "danger",
                title: "Error",
                description:
                    error.response?.data?.message || "Failed to delete holiday",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <AppLayout user={sessionData?.user}>
            <div className='flex flex-col gap-8 pb-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Holidays</h1>
                        <p className='text-sm text-zinc-500'>
                            View, create and manage holidays
                        </p>
                    </div>
                    <Button
                        color='warning'
                        size='sm'
                        onPress={createDisclosure.onOpen}
                    >
                        Add Holiday
                    </Button>
                </div>

                {/* holiday list */}
                <div className='flex flex-col gap-4'>
                    <div className='flex items-center justify-between'>
                        <SearchInput />

                        {/* Year selector */}
                        <div className='flex items-center gap-2'>
                            <Button
                                size='sm'
                                variant='flat'
                                isIconOnly
                                onPress={() => handleYearChange("prev")}
                            >
                                <ChevronLeft className='size-4' />
                            </Button>
                            <span className='text-sm font-medium min-w-16 text-center'>
                                {selectedYear}
                            </span>
                            <Button
                                size='sm'
                                variant='flat'
                                isIconOnly
                                onPress={() => handleYearChange("next")}
                            >
                                <ChevronRight className='size-4' />
                            </Button>
                        </div>
                    </div>

                    {/* desktop view: data table */}
                    <DataTable
                        isLoading={isLoading}
                        columns={["Holiday Name", "Type", "Date Range", "Actions"]}
                    >
                        {data?.data?.holidays?.map((holiday: HolidayInterface) => (
                            <TableRow key={holiday._id}>
                                <TableCell className='font-medium text-base'>
                                    {holiday.name}
                                </TableCell>
                                <TableCell>
                                    <HolidayChip type={holiday.type} />
                                </TableCell>
                                <TableCell className='text-sm'>
                                    {getHolidayDate(holiday)}
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
                                                    handleViewHoliday(holiday)
                                                }
                                                startContent={
                                                    <Eye className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                        <Tooltip content='Edit holiday'>
                                            <Button
                                                size='sm'
                                                color='primary'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleEditHoliday(holiday)
                                                }
                                                startContent={
                                                    <Pencil className='size-4' />
                                                }
                                            ></Button>
                                        </Tooltip>
                                        <Tooltip content='Delete holiday'>
                                            <Button
                                                size='sm'
                                                color='danger'
                                                variant='flat'
                                                isIconOnly
                                                onPress={() =>
                                                    handleDeleteClick(holiday)
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

                    {/* mobile view: holiday list */}
                    <MobileList
                        isLoading={isLoading}
                        isError={error}
                        isEmpty={
                            data?.data?.holidays?.length === 0 ||
                            !data?.data?.holidays
                        }
                        emptyContent='No holidays found'
                        listContent={data?.data?.holidays?.map(
                            (holiday: HolidayInterface) => ({
                                startIcon: (
                                    <CalendarCheck className='size-5 text-warning' />
                                ),
                                content: (
                                    <div
                                        onClick={() => handleViewHoliday(holiday)}
                                        className='cursor-pointer'
                                    >
                                        <div className='flex items-center justify-between'>
                                            <h3 className='text-base font-medium'>
                                                {holiday.name}
                                            </h3>
                                            <HolidayChip type={holiday.type} />
                                        </div>
                                        <p className='text-xs text-zinc-500 mt-1'>
                                            {getHolidayDate(holiday)}
                                        </p>
                                    </div>
                                ),
                            })
                        )}
                    />
                </div>
            </div>

            {/* Create Holiday Drawer */}
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
                            <DrawerHeader>Add New Holiday</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Holiday Name'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter holiday name'
                                    isRequired
                                    value={formData.name}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, name: value })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />

                                <Select
                                    label='Holiday Type'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select holiday type'
                                    isRequired
                                    selectedKeys={[formData.type]}
                                    onSelectionChange={(keys) =>
                                        setFormData({
                                            ...formData,
                                            type: Array.from(keys)[0] as HolidayTypes,
                                        })
                                    }
                                    classNames={{
                                        trigger: "border-zinc-200 dark:border-zinc-800",
                                    }}
                                >
                                    {HOLIDAY_TYPE_OPTIONS.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            textValue={option.label}
                                        >
                                            <div>
                                                <p className='text-sm'>{option.label}</p>
                                                <p className='text-xs text-zinc-500'>
                                                    {option.description}
                                                </p>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </Select>

                                <div className='grid grid-cols-2 gap-4'>
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
                                                // Auto-set endDate if not set or if it's before startDate
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
                                        placeholder='Select end date'
                                        type='date'
                                        value={formData.endDate}
                                        min={formData.startDate}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                endDate: value,
                                            })
                                        }
                                        description='Same as start for single day'
                                        classNames={{
                                            inputWrapper:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    />
                                </div>

                                <Textarea
                                    label='Description'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter description (optional)'
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
                                    onPress={() => handleCreateHoliday(onClose)}
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !formData.name.trim() || !formData.startDate
                                    }
                                >
                                    Add Holiday
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* View Holiday Drawer */}
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
                                    Holiday Details
                                </span>
                            </DrawerHeader>
                            <DrawerBody className='flex flex-col gap-5 pt-2'>
                                {selectedHoliday && (
                                    <>
                                        {/* Header Card */}
                                        <Card className='bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900/10 dark:to-warning-800/20 border-none shadow-sm'>
                                            <CardBody className='flex flex-row items-center gap-4 py-5'>
                                                <div className='size-14 rounded-xl bg-warning-500/20 flex items-center justify-center'>
                                                    <CalendarCheck className='size-7 text-warning-600 dark:text-warning-400' />
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='text-xl font-semibold text-zinc-800 dark:text-zinc-100'>
                                                        {selectedHoliday.name}
                                                    </h3>
                                                    <HolidayChip type={selectedHoliday.type} />
                                                </div>
                                            </CardBody>
                                        </Card>

                                        <Divider />

                                        {/* Date Info */}
                                        <div className='px-1'>
                                            <div className='flex items-center gap-2 mb-3'>
                                                <CalendarDays className='size-4 text-zinc-400' />
                                                <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                    Date Range
                                                </span>
                                            </div>
                                            <Card className='border border-zinc-200 dark:border-zinc-800 shadow-none'>
                                                <CardBody className='py-3 px-4'>
                                                    <p className='text-lg font-semibold text-zinc-800 dark:text-zinc-100'>
                                                        {getHolidayDate(selectedHoliday)}
                                                    </p>
                                                    <span className='text-xs text-zinc-500'>
                                                        {selectedHoliday.type ===
                                                        HolidayTypes.FIXED
                                                            ? "Same dates every year"
                                                            : "Date varies each year"}
                                                    </span>
                                                </CardBody>
                                            </Card>
                                        </div>

                                        {/* Description */}
                                        {selectedHoliday.description && (
                                            <>
                                                <Divider />
                                                <div className='px-1'>
                                                    <div className='flex items-center gap-2 mb-3'>
                                                        <Calendar className='size-4 text-zinc-400' />
                                                        <span className='text-xs font-medium text-zinc-500 uppercase tracking-wider'>
                                                            Description
                                                        </span>
                                                    </div>
                                                    <p className='text-sm text-zinc-600 dark:text-zinc-400 pl-6'>
                                                        {selectedHoliday.description}
                                                    </p>
                                                </div>
                                            </>
                                        )}
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
                                        if (selectedHoliday) {
                                            handleEditHoliday(selectedHoliday)
                                        }
                                    }}
                                >
                                    Edit Holiday
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>

            {/* Edit Holiday Drawer */}
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
                            <DrawerHeader>Edit Holiday</DrawerHeader>
                            <Divider className='my-4' />
                            <DrawerBody className='flex flex-col gap-6'>
                                <Input
                                    label='Holiday Name'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter holiday name'
                                    isRequired
                                    value={editFormData.name}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            name: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />

                                <Select
                                    label='Holiday Type'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Select holiday type'
                                    isRequired
                                    isDisabled
                                    selectedKeys={[editFormData.type]}
                                    classNames={{
                                        trigger:
                                            "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900",
                                    }}
                                >
                                    {HOLIDAY_TYPE_OPTIONS.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            textValue={option.label}
                                        >
                                            <div>
                                                <p className='text-sm'>{option.label}</p>
                                                <p className='text-xs text-zinc-500'>
                                                    {option.description}
                                                </p>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </Select>

                                <div className='grid grid-cols-2 gap-4'>
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
                                                endDate:
                                                    !editFormData.endDate ||
                                                    editFormData.endDate < value
                                                        ? value
                                                        : editFormData.endDate,
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
                                        placeholder='Select end date'
                                        type='date'
                                        value={editFormData.endDate}
                                        min={editFormData.startDate}
                                        onValueChange={(value) =>
                                            setEditFormData({
                                                ...editFormData,
                                                endDate: value,
                                            })
                                        }
                                        description='Same as start for single day'
                                        classNames={{
                                            inputWrapper:
                                                "border-zinc-200 dark:border-zinc-800",
                                        }}
                                    />
                                </div>

                                <Textarea
                                    label='Description'
                                    variant='bordered'
                                    labelPlacement='outside'
                                    placeholder='Enter description (optional)'
                                    value={editFormData.description}
                                    onValueChange={(value) =>
                                        setEditFormData({
                                            ...editFormData,
                                            description: value,
                                        })
                                    }
                                    classNames={{
                                        inputWrapper:
                                            "border-zinc-200 dark:border-zinc-800",
                                    }}
                                />
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
                                Delete Holiday
                            </ModalHeader>
                            <ModalBody>
                                <p className='text-sm'>
                                    Are you sure you want to delete{" "}
                                    <span className='font-semibold'>
                                        {selectedHoliday?.name}
                                    </span>
                                    ?
                                </p>
                                <p className='text-xs text-zinc-500'>
                                    This action cannot be undone.
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
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
