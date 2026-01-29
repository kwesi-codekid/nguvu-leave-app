import {
    Button,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    Input,
    TableCell,
    TableRow,
    Tooltip,
    useDisclosure,
} from "@heroui/react"
import { LoaderFunctionArgs, redirect } from "react-router"
import { Link, useLoaderData, useNavigate } from "react-router"
import {
    Briefcase,
    Building2,
    Eye,
    List,
    Pencil,
    PlaneTakeoff,
    Trash2,
    Users,
} from "lucide-react"
import useSWR from "swr"
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
import { DepartmentInterface } from "~/utils/types"

export default function Departments() {
    const { sessionData, baseUrl, search } = useLoaderData<typeof loader>()

    const { data, isLoading, error } = useSWR(
        `${baseUrl}/departments?search=${search}`,
        fetcher(sessionData?.token as string)
    )
    const departmentsStats = useSWR(
        `${baseUrl}/departments?op=statistics`,
        fetcher(sessionData?.token as string)
    )

    const createDisclosure = useDisclosure()
    const navigate = useNavigate()

    return (
        <AppLayout user={sessionData.user}>
            <div className='flex flex-col gap-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Departments</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage departments
                        </p>
                    </div>
                    <div>
                        <Button
                            size='sm'
                            color='warning'
                            onPress={createDisclosure.onOpen}
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
                                                    as={Link}
                                                    to={`/departments/${department._id}`}
                                                    isIconOnly
                                                    startContent={
                                                        <List className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                            <Tooltip content='Edit department'>
                                                <Button
                                                    size='sm'
                                                    color='primary'
                                                    variant='flat'
                                                    isIconOnly
                                                    startContent={
                                                        <Pencil className='size-4' />
                                                    }
                                                ></Button>
                                            </Tooltip>
                                            <Tooltip content='Trash department'>
                                                <Button
                                                    size='sm'
                                                    color='danger'
                                                    variant='flat'
                                                    isIconOnly
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
            >
                <DrawerContent>
                    {(onClose) => (
                        <>
                            <DrawerHeader>Create Department</DrawerHeader>
                            <DrawerBody>
                                <Input label='Department Name' />
                                <Input label='Department Description' />
                                <Input label='Department Head' />
                            </DrawerBody>
                            <DrawerFooter>
                                <Button color='primary' onPress={onClose}>
                                    Create Department
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>
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
        return redirect("/login-email")
    }
    return { sessionData, baseUrl, search }
}
