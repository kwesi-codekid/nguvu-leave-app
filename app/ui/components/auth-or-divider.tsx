import { Divider } from "@heroui/react"

export const AuthOrDivider = () => {
    return (
        <div className='flex items-center justify-between gap-2 mt-5'>
            <Divider className='w-28' />
            <p className='text-base text-gray-500'>Or</p>
            <Divider className='w-28' />
        </div>
    )
}
