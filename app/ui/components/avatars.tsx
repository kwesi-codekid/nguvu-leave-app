import { User } from "@heroui/react"
import { BriefcaseBusiness, UserRound } from "lucide-react"

export const StaffAvatar = ({
    name,
    profileImage,
    staffId,
    isOnLeave,
}: {
    name: string
    profileImage?: string
    staffId: string
    isOnLeave?: boolean
}) => (
    <User
        avatarProps={{
            src: profileImage,
            isBordered: true,
            color: isOnLeave ? "danger" : "default",
            size: "sm",
            fallback: <UserRound className='size-4' />,
        }}
        description={staffId}
        name={name}
        classNames={{
            name: "font-medium",
        }}
    />
)

export const JobPositionAvatar = ({
    title,
    department,
}: {
    title: string
    department?: string
}) => (
    <div className='flex items-start gap-3'>
        <div className='size-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center'>
            <BriefcaseBusiness className='size-4 text-warning' />
        </div>
        <div className='flex flex-col'>
            <p className='text-sm font-medium'>{title}</p>
            <p className='text-xs text-zinc-500'>{department}</p>
        </div>
    </div>
)
