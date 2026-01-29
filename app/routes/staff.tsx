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
import {
    Button,
    Pagination,
    Select,
    SelectItem,
    TableCell,
    TableRow,
    Tooltip,
} from "@heroui/react"
import { getSessionData, isAuthenticated } from "~/auth-session"
import { LoaderFunctionArgs } from "react-router"
import { DepartmentStatsSection } from "~/ui/fragments/department-stats"
import { SearchInput } from "~/ui/components/inputs"
import { DataTable } from "~/ui/components/data-table"
import { StaffInterface } from "~/utils/types"
import { Building2, List, Pencil, Phone, Trash2, User } from "lucide-react"
import { GenderChip, StaffChip } from "~/ui/components/chips"
import { StaffAvatar } from "~/ui/components/avatars"
import { MobileList } from "~/ui/components/lists"

export default function Staff() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const navigate = useNavigate()
    const params = new URLSearchParams()
    const search = params.get("search") || ""
    const limit = params.get("limit") || "10"
    const page = params.get("page") || "1"

    const { data, isLoading, error } = useSWR(
        `${baseUrl}/staff?search=${search}&limit=${limit}&page=${page}`,
        fetcher(sessionData?.token as string)
    )

    return (
        <AppLayout user={sessionData.user}>
            <div className='flex flex-col gap-8 pb-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Staff</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage staff
                        </p>
                    </div>
                    <div>
                        <Button
                            size='sm'
                            color='warning'
                            // onPress={createDisclosure.onOpen}
                        >
                            Add Staff
                        </Button>
                    </div>
                </div>

                {/* staff stats */}
                <DepartmentStatsSection
                    baseUrl={baseUrl as string}
                    token={sessionData?.token as string}
                />

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
                            "Contract",
                            "Actions",
                        ]}
                        bottomContent={
                            <div className='flex items-center justify-between'>
                                <Select
                                    size='sm'
                                    radius='sm'
                                    variant='bordered'
                                    className='w-20'
                                    selectedKeys={[limit.toString() || "10"]}
                                    aria-label='Limit'
                                    aria-labelledby='Limit'
                                    classNames={{
                                        value: "dark:!text-white",
                                        trigger: [
                                            "dark:data-[open=true]:!border-zinc-700",
                                            "dark:data-[focus=true]:!border-zinc-700",
                                        ],
                                    }}
                                    onSelectionChange={(keys) => {
                                        navigate(
                                            `?limit=${Array.from(keys)[0]}`
                                        )
                                    }}
                                >
                                    <SelectItem key={"10"}>10</SelectItem>
                                    <SelectItem key={"20"}>20</SelectItem>
                                    <SelectItem key={"50"}>50</SelectItem>
                                    <SelectItem key={"100"}>100</SelectItem>
                                </Select>

                                <div className='flex items-center gap-2'>
                                    <Pagination
                                        total={
                                            data?.data?.pagination?.totalPages
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
                                        onChange={(page) => {
                                            navigate(
                                                `?page=${page}&limit=${limit}`
                                            )
                                        }}
                                    />
                                </div>
                            </div>
                        }
                    >
                        {data?.data?.staff?.map((staff: StaffInterface) => (
                            <TableRow key={staff._id}>
                                <TableCell>
                                    <StaffAvatar
                                        name={staff.name}
                                        profileImage={
                                            staff.profileImage?.url || ""
                                        }
                                        staffId={staff.staffId}
                                    />
                                </TableCell>
                                <TableCell>
                                    <div>
                                        <p>{staff.phone}</p>
                                        <p className='text-xs text-zinc-500'>
                                            {staff.email}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <GenderChip gender={staff.gender} />
                                </TableCell>
                                <TableCell className='line-clamp-1 leading-loose'>
                                    {(staff.department as any)?.name}
                                </TableCell>
                                <TableCell>{staff.gender}</TableCell>
                                <TableCell>
                                    <div className='flex items-center gap-3'>
                                        <Tooltip content='View details'>
                                            <Button
                                                size='sm'
                                                color='success'
                                                variant='flat'
                                                as={Link}
                                                to={`/departments/${staff._id}`}
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
                                    <Link to={`/staff/${staff._id}`}>
                                        <StaffAvatar
                                            name={staff.name}
                                            profileImage={
                                                staff.profileImage?.url || ""
                                            }
                                            staffId={staff.staffId}
                                        />
                                        <div className='flex items-center justify-between pl-10'>
                                            <div className='flex items-center gap-1'>
                                                {/* <Phone className='size-4' /> */}
                                                <p className='text-sm'>
                                                    {staff.phone}
                                                </p>
                                            </div>
                                            <div className='flex items-center gap-1'>
                                                <Building2 className='size-4' />
                                                <p className='text-sm'>
                                                    {
                                                        (
                                                            staff.department as any
                                                        )?.name
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ),
                            })
                        )}
                    />
                    <div className='flex items-center justify-between mt-3'>
                        <Select
                            size='sm'
                            radius='sm'
                            variant='bordered'
                            className='w-20'
                            selectedKeys={[limit.toString() || "10"]}
                            aria-label='Limit'
                            aria-labelledby='Limit'
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
                            <SelectItem key={"10"}>10</SelectItem>
                            <SelectItem key={"20"}>20</SelectItem>
                            <SelectItem key={"50"}>50</SelectItem>
                            <SelectItem key={"100"}>100</SelectItem>
                        </Select>

                        <div className='flex items-center gap-2'>
                            <Pagination
                                total={data?.data?.pagination?.totalPages}
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
                                onChange={(page) => {
                                    navigate(`?page=${page}&limit=${limit}`)
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await isAuthenticated(request)
    const sessionData = await getSessionData(request)

    if (!authenticated) {
        return redirect("/login-email")
    }

    const baseUrl = process.env.BASE_URL

    return { sessionData, baseUrl }
}
