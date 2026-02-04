/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Table,
    TableBody,
    TableColumn,
    TableHeader,
    TableProps,
    Pagination,
    TableRow,
    TableCell,
    Skeleton,
    Select,
    SelectItem,
} from "@heroui/react"
import { useSearchParams } from "react-router"
import { NotebookText } from "lucide-react"
import { ReactNode } from "react"

interface DataTableProps extends TableProps {
    columns: string[]
    children: ReactNode | any
    customHeightClass?: string
    isLoading?: boolean
    totalPages?: number
    itemsPerPage?: number
    currentPage?: number
    onPageChange?: (page: number) => void
    emptyContent?: ReactNode
    bottomContent?: ReactNode
}

export const DataTable = (props: DataTableProps) => {
    const [searchParams, setSearchParams] = useSearchParams()
    const limit = searchParams.get("limit") || "10"
    const page = searchParams.get("page") || "1"

    return (
        <div className='flex flex-col gap-4'>
            <Table
                aria-label='Data table'
                classNames={{
                    base: `${
                        props.customHeightClass
                            ? props.customHeightClass
                            : "md:h-[60vh] xl:!h-[78vh]"
                    } h-[65vh] overflow-y-auto w-[97vw] vertical-scrollbar md:w-full overflow-x-auto shadow-none hidden md:block`,
                    wrapper:
                        "vertical-scrollbar horizontal-scrollbar bg-transparent dark:border-zinc-800 border-2 border-zinc-200 shadow-none",
                    td: "text-sm",
                    thead: "sticky top-0 z-10 ",
                    th: "dark:bg-zinc-900 bg-zinc-100",
                }}
                bottomContent={
                    props.bottomContent ||
                    (props.totalPages && props.totalPages > 0 && (
                        <div className='flex items-center justify-between'>
                            <Select
                                size='sm'
                                radius='sm'
                                variant='bordered'
                                className='w-20'
                                selectedKeys={[limit as string]}
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
                                    setSearchParams({
                                        limit: Array.from(keys)[0] as string,
                                    })
                                }}
                            >
                                <SelectItem key={"10"}>10</SelectItem>
                                <SelectItem key={"20"}>20</SelectItem>
                                <SelectItem key={"50"}>50</SelectItem>
                                <SelectItem key={"100"}>100</SelectItem>
                            </Select>

                            <div className='flex items-center gap-2'>
                                <Pagination
                                    total={props.totalPages}
                                    page={parseInt(page as string)}
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
                                        setSearchParams({
                                            page: page.toString(),
                                            limit: limit as string,
                                        })
                                    }}
                                />
                            </div>
                        </div>
                    ))
                }
                {...props}
            >
                <TableHeader>
                    {props.columns.map((column, index) => (
                        <TableColumn className='uppercase' key={index}>
                            {column}
                        </TableColumn>
                    ))}
                </TableHeader>

                <TableBody
                    loadingContent={<></>}
                    isLoading={props.isLoading}
                    emptyContent={
                        props.emptyContent || (
                            <div className='md:!h-[63vh] h-[60vh] w-[97vw] md:w-full flex flex-col gap-8 items-center justify-center'>
                                <NotebookText size={80} />
                                <p className=''>No records found</p>
                            </div>
                        )
                    }
                >
                    {props.isLoading
                        ? Array.from({ length: 10 }).map((_, index) => (
                              <TableRow key={index}>
                                  {Array.from({
                                      length: props.columns.length,
                                  }).map((_, colIndex) => (
                                      <TableCell key={colIndex}>
                                          <Skeleton className='h-6 rounded-lg' />
                                      </TableCell>
                                  ))}
                              </TableRow>
                          ))
                        : props.children}
                </TableBody>
            </Table>
        </div>
    )
}
