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
        <div className='bg-content1 shadow-none hover:scale-[1.01] transition-all duration-300 border border-black/20 dark:border-white/20 rounded-xl p-4'>
            <div className='flex items-center justify-between'>
                <h3 className='text-sm font-medium text-zinc-600 dark:text-zinc-300'>
                    {title}
                </h3>
                <div
                    className={`bg-${color}-500/20 rounded-lg size-9 flex items-center justify-center`}
                >
                    {icon}
                </div>
            </div>

            <div className='flex items-end gap-1 mt-2'>
                <h2 className='font-semibold text-2xl'>{value || 0}</h2>
                <p className='text-xs text-zinc-500 mb-[3px] line-clamp-1'>
                    {description}
                </p>
            </div>
        </div>
    )
}
