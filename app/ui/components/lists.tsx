import { Skeleton } from "@heroui/react"
import { FolderOpen } from "lucide-react"
import { ReactNode } from "react"

interface MobileListProps {
    isLoading?: boolean
    isError?: boolean
    isEmpty?: boolean
    emptyContent?: ReactNode
    listContent?: MobileListItemProps[]
}
interface MobileListItemProps {
    startIcon?: ReactNode
    content: ReactNode
}
export const MobileListItem = ({ startIcon, content }: MobileListItemProps) => {
    return (
        <div className='py-3 border-b last:border-b-0 border-zinc-200 dark:border-zinc-800 flex gap-3'>
            {startIcon && (
                <div className='size-9 rounded-lg flex items-center justify-center bg-zinc-200/60 dark:bg-zinc-800/40 text-warning dark:text-warning/50'>
                    {startIcon}
                </div>
            )}
            <div className='flex-1'>{content}</div>
        </div>
    )
}
export const MobileList = ({
    isLoading,
    isError,
    isEmpty,
    emptyContent,
    listContent,
}: MobileListProps) => {
    return (
        <div className='block md:hidden border-2 border-zinc-200 dark:border-zinc-800 rounded-xl px-4 flex-1'>
            {/* empty state */}
            {isEmpty && (
                <div className='flex flex-col gap-4 items-center justify-center min-h-[20rem]'>
                    <div className='size-32 flex items-center justify-center rounded-full bg-zinc-200/40 dark:bg-zinc-800/40'>
                        <FolderOpen
                            className='size-16 text-zinc-400 dark:text-zinc-500'
                            strokeWidth={1}
                        />
                    </div>

                    <div className='flex flex-col gap-2 items-center justify-center'>
                        {emptyContent || (
                            <h2 className='font-semibold text-lg text-zinc-700 dark:text-zinc-50'>
                                No records found
                            </h2>
                        )}
                    </div>
                </div>
            )}

            {/* loading state */}
            {isLoading && (
                <div className='flex flex-col gap-4'>
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div
                            key={index}
                            className='h-20 border-b last:border-b-0 border-zinc-200 dark:border-zinc-800 flex gap-3'
                        >
                            <Skeleton className='size-10 rounded-lg dark:bg-zinc-800/40' />
                            <div className='flex-1'>
                                <Skeleton className='h-4 w-4/5 rounded-lg dark:bg-zinc-800/40' />
                                <Skeleton className='h-4 w-3/5 mt-2 rounded-lg dark:bg-zinc-800/40' />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* list content */}
            {listContent?.map((item, index) => (
                <MobileListItem key={index} {...item} />
            ))}
        </div>
    )
}
