/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    useDisclosure,
    User,
} from "@heroui/react"
import { useNavigate } from "react-router"
// import { ConfirmModal } from "./modals"
// import { getFirstLetter } from "~/utils/functions"
import { ChevronDown } from "lucide-react"
import { ConfirmModal } from "./modals"
// import { UserInterface } from "~/utils/types"

export function AuthUserDropdown({
    user,
}: {
    user?: {
        name: string
        department: string
        profilePicture?: string
        jobTitle?: string
    }
}) {
    const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure()
    const navigate = useNavigate()

    const handleLogout = () => {
        // Perform logout logic here (e.g., redirect to /logout)
        navigate("/logout")
    }

    const confirmLogout = () => {
        handleLogout()
        onClose() // Close the modal after logout
    }

    return (
        <>
            <Dropdown placement='bottom-start'>
                <DropdownTrigger>
                    <div className='flex items-center gap-3'>
                        <User
                            as='button'
                            avatarProps={{
                                icon: user?.name?.charAt(0).toUpperCase(),
                                isBordered: false,
                                size: "sm",
                                radius: "sm",
                                className: "bg-warning/70 text-white text-base",
                            }}
                            className='transition-transform'
                            description={user?.department}
                            name={user?.name}
                            classNames={{
                                name: "font-medium hidden lg:inline-block text-xs",
                                description:
                                    "hidden lg:inline-block text-[10px]",
                            }}
                        />

                        <ChevronDown size={16} />
                    </div>
                </DropdownTrigger>
                <DropdownMenu
                    aria-label='User Actions'
                    variant='flat'
                    onAction={(key) => {
                        if (key === "logout") {
                            onOpen()
                            return
                        }
                        navigate(key as string)
                    }}
                    itemClasses={{
                        title: "text-xs",
                    }}
                >
                    <DropdownItem key='/profile' href='/profile'>
                        My Profile
                    </DropdownItem>
                    {/* <DropdownItem key="help_and_feedback">Help & Feedback</DropdownItem> */}
                    <DropdownItem
                        key='logout'
                        color='danger'
                        variant='flat'
                        onPress={onOpen}
                    >
                        Log Out
                    </DropdownItem>
                </DropdownMenu>
            </Dropdown>

            {/* logout modal */}
            <ConfirmModal
                size='sm'
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                title='Confirm Logout'
                footer={
                    <div className='flex items-center gap-4'>
                        <Button size='sm' variant='flat' onPress={onClose}>
                            Cancel
                        </Button>
                        <Button
                            size='sm'
                            color='danger'
                            onPress={confirmLogout}
                        >
                            Sign Out
                        </Button>
                    </div>
                }
            >
                <p className='text-xs'>Are you sure you want to log out?</p>
            </ConfirmModal>
        </>
    )
}
