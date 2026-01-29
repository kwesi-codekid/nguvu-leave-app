import { Button, Chip, TableCell, TableRow, Tooltip } from "@heroui/react"
import { LoaderFunctionArgs, redirect } from "react-router"
import { Link, useLoaderData } from "react-router"
import { BriefcaseBusiness, Pencil, Trash2 } from "lucide-react"
import useSWR from "swr"
import { isAuthenticated, getSessionData } from "~/auth-session"
import { JobPositionAvatar } from "~/ui/components/avatars"
import { DataTable } from "~/ui/components/data-table"
import { SearchInput } from "~/ui/components/inputs"
import { MobileList } from "~/ui/components/lists"
import { ApprovalFlow, OccupancyChips } from "~/ui/fragments/job-positions"
import AppLayout from "~/ui/layouts/app-layout"
import { fetcher } from "~/ui/lib/fetcher"
import { JobPositionInterface, OccupancyInterface } from "~/utils/types"

export default function JobPositions() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const searchParams = new URLSearchParams()

    const { data, isLoading, error } = useSWR(
        `${baseUrl}/job-positions`,
        fetcher(sessionData.token as string)
    )

    return (
        <AppLayout user={sessionData.user}>
            <div className='flex flex-col gap-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Job Positions</h1>
                        <p className='text-sm text-zinc-500'>
                            View, create and manage job positions
                        </p>
                    </div>
                    <Button color='warning' size='sm'>
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
                                <TableRow key={position._id}>
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

                    {/* mobile view: data table */}
                    <MobileList
                        isLoading={isLoading}
                        listContent={data?.data?.positions?.map(
                            (position: JobPositionInterface) => ({
                                startIcon: (
                                    <BriefcaseBusiness className='size-5' />
                                ),
                                content: (
                                    <Link
                                        to={`/job-positions/${position._id}`}
                                        className='flex flex-col gap-1'
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
