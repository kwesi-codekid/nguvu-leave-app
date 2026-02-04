import { Chip, Image } from "@heroui/react"
import {
    Mars,
    Venus,
    Clock,
    CheckCircle,
    XCircle,
    ThumbsUp,
    Ban,
    Undo2,
    CalendarDays,
    Stethoscope,
    Baby,
    HeartHandshake,
    Heart,
} from "lucide-react"
import { Gender, HolidayTypes, LeaveStatus, LeaveTypes } from "~/utils/types"

export const HolidayChip = ({ type }: { type: HolidayTypes }) => (
    <Chip
        size='sm'
        color={type === HolidayTypes.VARYING ? "warning" : "primary"}
        variant='flat'
        radius='sm'
    >
        {type === HolidayTypes.VARYING ? "Varying" : "Fixed"}
    </Chip>
)

export const GenderChip = ({ gender }: { gender: Gender }) => (
    <Chip
        size='sm'
        color={gender === Gender.MALE ? "primary" : "secondary"}
        variant='flat'
        radius='full'
        startContent={
            gender === Gender.MALE ? (
                <Mars className='size-3' />
            ) : (
                <Venus className='size-3' />
            )
        }
    >
        {gender === Gender.MALE ? "Male" : "Female"}
    </Chip>
)

export const StaffChip = ({
    name,
    staffId,
    profileImage,
}: {
    name: string
    staffId: string
    profileImage: string
}) => (
    <div className='flex gap-3'>
        <Image
            src={profileImage}
            alt={`${name}'s profile image`}
            className='size-8 rounded-full'
        />
        <div>
            <h4 className='text-sm font-medium'>{name}</h4>
            <p className='text-xs text-zinc-500'>{staffId}</p>
        </div>
    </div>
)

// Leave Status Chip
const leaveStatusConfig: Record<
    LeaveStatus,
    { label: string; color: "warning" | "primary" | "success" | "danger" | "default"; icon: React.ReactNode }
> = {
    [LeaveStatus.PENDING]: {
        label: "Pending",
        color: "warning",
        icon: <Clock className='size-3' />,
    },
    [LeaveStatus.ENDORSED]: {
        label: "Endorsed",
        color: "primary",
        icon: <ThumbsUp className='size-3' />,
    },
    [LeaveStatus.APPROVED]: {
        label: "Approved",
        color: "success",
        icon: <CheckCircle className='size-3' />,
    },
    [LeaveStatus.REJECTED]: {
        label: "Rejected",
        color: "danger",
        icon: <XCircle className='size-3' />,
    },
    [LeaveStatus.CANCELLED]: {
        label: "Cancelled",
        color: "default",
        icon: <Ban className='size-3' />,
    },
    [LeaveStatus.WITHDRAWN]: {
        label: "Withdrawn",
        color: "default",
        icon: <Undo2 className='size-3' />,
    },
}

export const LeaveStatusChip = ({ status }: { status: LeaveStatus }) => {
    const config = leaveStatusConfig[status] || leaveStatusConfig[LeaveStatus.PENDING]
    return (
        <Chip
            size='sm'
            color={config.color}
            variant='flat'
            radius='sm'
            startContent={config.icon}
        >
            {config.label}
        </Chip>
    )
}

// Leave Type Chip
const leaveTypeConfig: Record<
    LeaveTypes,
    { label: string; color: "primary" | "secondary" | "success" | "warning" | "danger"; icon: React.ReactNode }
> = {
    [LeaveTypes.ANNUAL]: {
        label: "Annual",
        color: "primary",
        icon: <CalendarDays className='size-3' />,
    },
    [LeaveTypes.SICK]: {
        label: "Sick",
        color: "danger",
        icon: <Stethoscope className='size-3' />,
    },
    [LeaveTypes.MATERNITY]: {
        label: "Maternity",
        color: "secondary",
        icon: <Baby className='size-3' />,
    },
    [LeaveTypes.PATERNITY]: {
        label: "Paternity",
        color: "success",
        icon: <Baby className='size-3' />,
    },
    [LeaveTypes.BEREAVEMENT]: {
        label: "Bereavement",
        color: "warning",
        icon: <HeartHandshake className='size-3' />,
    },
}

export const LeaveTypeChip = ({ type }: { type: LeaveTypes }) => {
    const config = leaveTypeConfig[type] || leaveTypeConfig[LeaveTypes.ANNUAL]
    return (
        <Chip
            size='sm'
            color={config.color}
            variant='flat'
            radius='sm'
            startContent={config.icon}
        >
            {config.label}
        </Chip>
    )
}
