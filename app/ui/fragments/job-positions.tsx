import { Chip } from "@heroui/react"
import { ArrowRight } from "lucide-react"
import { OccupancyInterface } from "~/utils/types"

export const ApprovalFlow = ({
    endorser,
    approver,
}: {
    endorser?: string
    approver?: string
}) => {
    if (!endorser && !approver) {
        return <p className='text-sm text-zinc-500'>Not set</p>
    }

    return (
        <div className='flex items-center gap-2'>
            {endorser && (
                <div className='rounded-lg w-36 xl:w-44 py-1 px-2 border border-zinc-200 dark:border-zinc-800 flex items-center'>
                    <p className='line-clamp-1 text-xs'>{endorser}</p>
                </div>
            )}
            {endorser && approver && <ArrowRight className='size-4' />}
            {approver && (
                <div className='rounded-lg w-36 xl:w-44 py-1 px-2 border border-zinc-200 dark:border-zinc-800 flex items-center'>
                    <p className='line-clamp-1 text-xs'>{approver}</p>
                </div>
            )}
        </div>
    )
}

export const OccupancyChips = ({
    occupancy,
}: {
    occupancy: OccupancyInterface
}) => {
    return (
        <div className='flex items-center gap-2'>
            <Chip
                classNames={{
                    content: "dark:text-zinc-50",
                    base: "dark:bg-zinc-800",
                }}
                size='sm'
                radius='sm'
                variant='flat'
            >
                {occupancy.current} / {occupancy.max}
            </Chip>
            <Chip
                size='sm'
                radius='sm'
                variant='flat'
                color={occupancy.available > 0 ? "success" : "danger"}
            >
                {occupancy.available > 0
                    ? `Available: ${occupancy.available}`
                    : "Occupied"}
            </Chip>
        </div>
    )
}
