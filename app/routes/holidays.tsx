import { LoaderFunctionArgs, redirect } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import { useLoaderData } from "react-router"
import { SearchInput } from "~/ui/components/inputs"
import { DataTable } from "~/ui/components/data-table"
import useSWR from "swr"
import { DateTime } from "luxon"
import { fetcher } from "~/ui/lib/fetcher"
import { Button, TableCell, TableRow, Tooltip } from "@heroui/react"
import { HolidayInterface, HolidayTypes } from "~/utils/types"
import { Calendar, CalendarCheck, Pencil, Trash2 } from "lucide-react"
import { MobileList } from "~/ui/components/lists"
import { HolidayChip } from "~/ui/components/chips"

export default function Holidays() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()

    const holidaySwr = useSWR(
        `${baseUrl}/holidays?op=year&year=2025`,
        fetcher(sessionData.token as string)
    )

    return (
        <AppLayout user={sessionData?.user}>
            <div className='flex flex-col gap-8'>
                {/* header */}
                <div className='flex justify-between items-center'>
                    <div>
                        <h1 className='text-2xl font-bold'>Holidays</h1>
                        <p className='text-sm text-zinc-500'>
                            View, create and manage holidays
                        </p>
                    </div>
                    <Button color='warning' size='sm'>
                        Add Holiday
                    </Button>
                </div>

                {/* holiday list */}
                <div className='flex flex-col gap-4'>
                    <div className='flex items-center justify-between'>
                        <SearchInput />
                    </div>

                    {/* desktop view: data table */}
                    <DataTable
                        columns={[
                            "Holiday Name",
                            "Type",
                            "Occurs On",
                            "Actions",
                        ]}
                    >
                        {holidaySwr.data?.data?.holidays?.map(
                            (holiday: HolidayInterface) => (
                                <TableRow key={holiday._id}>
                                    <TableCell className='font-medium text-base'>
                                        {holiday.name}
                                    </TableCell>
                                    <TableCell>
                                        <HolidayChip type={holiday.type} />
                                    </TableCell>
                                    <TableCell className='text-sm'>
                                        {holiday.type === HolidayTypes.FIXED
                                            ? DateTime.fromISO(
                                                  `2025-${holiday.fixedMonth}-${holiday.fixedDay}`
                                              ).toFormat("ccc, LLL d yyyy")
                                            : DateTime.fromISO(
                                                  holiday.date as any
                                              ).toFormat("ccc, LLL d yyyy")}
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

                    {/* mobile view: holiday list */}
                    <MobileList
                        isLoading={holidaySwr.isLoading}
                        isError={holidaySwr.error}
                        isEmpty={
                            holidaySwr.data?.data?.holidays?.length === 0 ||
                            !holidaySwr.data?.data?.holidays
                        }
                        emptyContent='No holidays found'
                        listContent={holidaySwr.data?.data?.holidays?.map(
                            (holiday: HolidayInterface) => ({
                                startIcon: <CalendarCheck className='size-5' />,
                                content: (
                                    <div>
                                        <div className='flex items-center justify-between'>
                                            <h3 className='text-base font-medium'>
                                                {holiday.name}
                                            </h3>
                                            <HolidayChip type={holiday.type} />
                                        </div>

                                        <div>
                                            <p className='text-xs text-zinc-800 font-medium dark:text-zinc-300 mt-1'>
                                                <span className='text-zinc-500 font-normal'>
                                                    Occurs:{" "}
                                                </span>{" "}
                                                {holiday.type ===
                                                HolidayTypes.VARYING
                                                    ? DateTime.fromISO(
                                                          holiday.date as any
                                                      ).toFormat(
                                                          "ccc, LLL d yyyy"
                                                      )
                                                    : DateTime.fromISO(
                                                          `2025-${holiday.fixedMonth}-${holiday.fixedDay}`
                                                      ).toFormat(
                                                          "ccc, LLL d yyyy"
                                                      )}
                                            </p>
                                        </div>
                                    </div>
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
