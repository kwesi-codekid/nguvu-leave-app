import { Button, TableCell, TableRow } from "@heroui/react"
import { LoaderFunctionArgs, redirect } from "react-router"
import { Link, useLoaderData, useSearchParams } from "react-router"
import {
    Briefcase,
    Building2,
    Clock3,
    Clock5,
    Clock6,
    Eye,
    Handshake,
    Plus,
    Users,
} from "lucide-react"
import useSWR from "swr"
import { isAuthenticated, getSessionData } from "~/auth-session"
import { StaffAvatar } from "~/ui/components/avatars"
import { DataTable } from "~/ui/components/data-table"
import AppLayout from "~/ui/layouts/app-layout"
import { fetcher } from "~/ui/lib/fetcher"
import { DateTime } from "luxon"
import { DepartmentStatsCard } from "~/ui/components/cards"
import { MobileList } from "~/ui/components/lists"

export default function StaffContracts() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [searchParams, setSearchParams] = useSearchParams()
    const search = searchParams.get("search") || ""
    const limit = searchParams.get("limit") || "10"
    const page = searchParams.get("page") || "1"
    const op = searchParams.get("op") || "active"

    const contractsSwr = useSWR(
        `${baseUrl}/contracts?op=${op}&search=${search}&limit=${limit}&page=${page}`,
        fetcher(sessionData?.token as string)
    )
    const departmentsStats = useSWR(
        `${baseUrl}/departments?op=statistics`,
        fetcher(sessionData?.token as string)
    )

    return (
        <AppLayout user={sessionData.user}>
            <div className='flex flex-col gap-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Staff Contracts</h1>
                        <p className='text-xs text-zinc-500'>
                            View, create and manage staff contracts
                        </p>
                    </div>
                    <Button color='warning' size='sm'>
                        Add Contract
                    </Button>
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
                        value={contractsSwr?.data?.data?.statistics?.total}
                        icon={<Handshake className='size-5 text-success' />}
                        color='success'
                        description='contracts issued'
                    />
                    <DepartmentStatsCard
                        title='Contracts Expiring'
                        value={
                            contractsSwr?.data?.data?.statistics?.expiringSoon
                        }
                        icon={<Clock3 className='size-5 text-danger' />}
                        color='danger'
                        description='expring in 30 days'
                    />
                </div>

                {/* contracts list */}
                <div className='flex flex-col gap-4'>
                    {/* desktop data table */}
                    <DataTable
                        isLoading={contractsSwr.isLoading}
                        columns={[
                            "Job Title",
                            "Staff",
                            "Duration",
                            "Remaining Days",
                            // "Salary",
                            "Status",
                            "Actions",
                        ]}
                        totalPages={
                            contractsSwr?.data?.data?.pagination?.totalPages
                        }
                    >
                        {contractsSwr.data?.data?.contracts?.map(
                            (contract: any) => (
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
                                                    {
                                                        contract?.position
                                                            ?.department?.name
                                                    }
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
                                        {DateTime.fromISO(
                                            contract.startDate
                                        ).toFormat("dd MMM yyyy")}{" "}
                                        -{" "}
                                        {contract?.endDate
                                            ? DateTime.fromISO(
                                                  contract.endDate
                                              ).toFormat("dd MMM yyyy")
                                            : "Indefinite"}
                                    </TableCell>
                                    <TableCell>
                                        {contract?.remainingDays}
                                    </TableCell>

                                    <TableCell>{contract.status}</TableCell>
                                    <TableCell>
                                        <div className='flex gap-2'>
                                            <Button
                                                color='success'
                                                size='sm'
                                                isIconOnly
                                                variant='flat'
                                            >
                                                <Eye className='size-4' />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        )}
                    </DataTable>

                    {/* mobile list */}
                    <MobileList
                        isLoading={contractsSwr.isLoading}
                        listContent={contractsSwr.data?.data?.contracts?.map(
                            (contract: any) => ({
                                startIcon: (
                                    <Handshake className='size-4 text-warning' />
                                ),
                                content: (
                                    <Link to={`/contracts/${contract._id}`}>
                                        <div className='flex items-center justify-between'>
                                            <p className='text-sm font-medium'>
                                                {contract?.position?.title}
                                            </p>
                                            <p className='text-xs text-zinc-500 border border-zinc-200 dark:border-zinc-800  rounded-md w-20 px-2 line-clamp-1 py-[2px] mb-[2px]'>
                                                {
                                                    contract?.position
                                                        ?.department?.name
                                                }
                                            </p>
                                        </div>
                                        <div className='flex items-center justify-between'>
                                            <p className='text-xs font-normal'>
                                                {contract?.staff?.name}
                                            </p>
                                            <p className='text-xs text-zinc-500'>
                                                {contract?.remainingDays
                                                    ? `${contract?.remainingDays} days left`
                                                    : "Indefinite"}
                                            </p>
                                        </div>
                                    </Link>
                                ),
                            })
                        )}
                    />
                </div>
            </div>
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
    return { sessionData, baseUrl }
}
