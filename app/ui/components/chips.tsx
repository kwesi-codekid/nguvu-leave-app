import { Chip, Image } from "@heroui/react"
import { Mars, Venus } from "lucide-react"
import { Gender, HolidayTypes } from "~/utils/types"

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
