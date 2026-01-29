interface DepartmentStatsCardProps {
    title: string
    value: number
    description?: string
    icon: React.ReactNode
    color: string
}

export const DepartmentStatsCard = ({
    title,
    value,
    description,
    icon,
    color,
}: DepartmentStatsCardProps) => {
    return (
        <div className='md:rounded-xl rounded-lg border-2 dark:border-zinc-800 md:p-4 p-2 px-3'>
            <div className='flex items-center justify-between'>
                <h3 className='text-sm md:text-base font-medium line-clamp-1 text-zinc-600 dark:text-zinc-300'>
                    {title}
                </h3>
                <div
                    className={`bg-${color} bg-opacity-20 rounded-lg size-9 hidden lg:flex items-center justify-center`}
                >
                    {icon}
                </div>
            </div>

            <div className='flex items-end gap-1 mt-2'>
                <h2 className='font-semibold text-xl md:text-2xl'>{value}</h2>
                <p className='text-xs md:text-sm text-zinc-500 mb-[3px] line-clamp-1'>
                    {description}
                </p>
            </div>
        </div>
    )
}
