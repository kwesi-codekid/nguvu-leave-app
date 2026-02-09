import {
    NavLink,
    useLocation,
    useNavigate,
    useNavigation,
} from "react-router"
import { useState, useEffect, ReactNode, Fragment } from "react"
import { useMediaQuery } from "../hooks/use-media-query"
import { AnimatePresence, motion } from "framer-motion"
import logo from "~/assets/images/nguvu-white-gold.png"
import { Button, Image, Progress, Skeleton, Tooltip } from "@heroui/react"
import { SideDrawer } from "../components/side-drawer"
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react"
import { navlinks } from "../lib/navlinks"
import { AuthUserDropdown } from "../components/dropdowns"
import { ThemeSwitcher } from "../components/theme-switcher"
import { NotificationDropdown } from "../components/notification-dropdown"

export default function AppLayout({
    children,
    user,
    pageLoading,
    baseUrl,
    token,
}: {
    children: React.ReactNode
    user?: {
        name: string
        department: string
        profilePicture?: string
        jobTitle?: string
        permissions: string[]
    }
    pageLoading?: boolean
    baseUrl?: string
    token?: string
}) {
    // Use a state variable to track the collapsed state, initializing it from localStorage
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof localStorage !== "undefined") {
            const storedValue = localStorage.getItem("isCollapsed")
            if (storedValue === "true") {
                return true
            } else if (storedValue === "false") {
                return false
            }
        }
        return false // Default to expanded if no value is in localStorage
    })
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const navigate = useNavigate()
    const navigation = useNavigation()
    const isLargeScreen = useMediaQuery("(min-width: 1024px)")

    // Toggle sidebar collapse state
    const toggleSidebar = () => {
        setIsCollapsed(!isCollapsed)
    }

    // Persist the collapsed state to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem("isCollapsed", JSON.stringify(isCollapsed))
    }, [isCollapsed])

    // Close mobile nav when screen size changes to large
    useEffect(() => {
        if (isLargeScreen) {
            setMobileNavOpen(false)
        }
    }, [isLargeScreen])

    const NavItems = () => {
        return (
            <div className='flex-1 flex flex-col gap-2 py-8 pr-2 justify-center'>
                {navlinks.map((navlink) => (
                    // programmatically display the navitems based on user permissions
                    <Fragment key={navlink.href}>
                        {user?.permissions?.some((permission) =>
                            navlink.permittedRoles.includes(permission)
                        ) && (
                                <NavItem
                                    key={navlink.href}
                                    label={navlink.label}
                                    icon={navlink.icon}
                                    to={navlink.href}
                                    isCollapsed={isCollapsed}
                                />
                            )}
                    </Fragment>
                ))}
            </div>
        )
    }
    const NavItem = ({
        label,
        icon,
        badgeContent,
        to,
        isCollapsed,
        onClick,
    }: {
        label: string
        icon: ReactNode
        badgeContent?: string | number
        to: string
        isCollapsed?: boolean
        onClick?: () => void
    }) => {
        const { pathname } = useLocation()

        // const isActive = pathname === to || pathname.startsWith(`${to}/`);
        const isActive = pathname === to

        // Render collapsed version with tooltip
        if (isCollapsed) {
            return (
                <Tooltip content={label} placement='right'>
                    <NavLink
                        to={to as string}
                        className={`flex items-center justify-center rounded-lg p-2 ${isActive ? "bg-warning-800 !text-white dark:bg-zinc-800" : ""
                            }`}
                        onClick={onClick}
                    >
                        <div
                            className={`${isActive
                                    ? "text-zinc-900"
                                    : " hover:text-zinc-900"
                                } transition-all duration-300`}
                        >
                            {icon}
                        </div>
                        {badgeContent && (
                            <div className='absolute top-0 right-0 rounded-full bg-warning w-3 h-3 flex items-center justify-center text-[10px] text-white'>
                                {badgeContent}
                            </div>
                        )}
                    </NavLink>
                </Tooltip>
            )
        }

        // Render expanded version
        const navLink = (
            <NavLink
                to={to as string}
                className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2 ${isActive ? "bg-warning-800 dark:bg-warning/70 !text-white" : ""
                    }`}
                onClick={onClick}
            >
                <div
                    className={`flex ${isActive ? "text-text-white/10" : " hover:text-zinc-600"
                        } items-center gap-2 flex-1 transition-all duration-300`}
                >
                    {icon}
                    <span className='text-xs line-clamp-1 max-w-52'>
                        {label}
                    </span>
                </div>
                {badgeContent && (
                    <div className='rounded-3xl bg-white px-2 py-[2px] text-xs text-primary-800'>
                        {badgeContent}
                    </div>
                )}
            </NavLink>
        )

        return label.length > 25 ? (
            <Tooltip content={label} placement='right'>
                {navLink}
            </Tooltip>
        ) : (
            navLink
        )
    }

    return (
        <div className='flex h-screen overflow-hidden transition-colors duration-400'>
            {/* Desktop Sidebar - visible on lg screens and larger */}
            <AnimatePresence initial={false}>
                <motion.div
                    initial={false}
                    animate={{
                        width: isCollapsed ? "5rem" : "16rem",
                        transition: { duration: 0.3 },
                    }}
                    className={`hidden lg:block h-screen bg-warning dark:bg-zinc-950 dark:border-r-2 dark:border-zinc-800 p-4 overflow-hidden`}
                >
                    <div className='flex flex-col justify-between h-full'>
                        {/* logo and name */}
                        <div
                            className={`flex items-center   ${isCollapsed
                                    ? "justify-center"
                                    : "justify-between"
                                }`}
                        >
                            <div className='flex justify-center items-center gap-2 w-full'>
                                <div className=''>
                                    <Image
                                        src="/nguvu-favicon.png"
                                        className='size-9 object-cover border dark:border-zinc-800 border-2 bg-white mt-1'
                                        shadow='sm'
                                        radius='sm'
                                    />
                                </div>

                                {!isCollapsed && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className='flex-1'
                                    >
                                        <div className='flex items-center justify-between w-full'>
                                            <div className='flex-1'>
                                                <h1 className=' font-bold text-sm'>
                                                    Leave Management
                                                </h1>
                                                <p className='text-xs  opacity-50'>
                                                    Staff Portal
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* nav items */}
                        <NavItems />

                        <div className='h-20 flex items-center justify-center'>
                            <div className='w-8 h-[1px] bg-white/20'></div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Mobile Nav Drawer - visible on screens smaller than lg */}
            <SideDrawer
                isOpen={mobileNavOpen}
                onClose={() => setMobileNavOpen(false)}
                position='left'
                title='Nguvu Leave Management'
                width='w-60'
            >
                <div className='flex flex-col gap-8 py-4'>
                    <NavItems />
                </div>
            </SideDrawer>

            {/* page content */}
            <div className='flex-1 flex flex-col h-full overflow-y-auto vertical-scrollbar  dark:bg-zinc-950'>
                {/* top navbar */}
                <header className='h-14 w-full dark:border-b-2 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-50 px-4  border-b-2 border-warning/70 dark:shadow-zinc-800/10 rounded-tl-lg'>
                    <div className='2xl:mx-auto 2xl:max-w-[90rem] h-14 flex items-center justify-between'>
                        <div className='flex items-center gap-4'>
                            {/* Mobile menu toggle - only visible on small screens */}
                            <Button
                                isIconOnly
                                startContent={
                                    mobileNavOpen ? (
                                        <X strokeWidth={2} />
                                    ) : (
                                        <PanelLeftOpen className='size-5' />
                                    )
                                }
                                onPress={() => setMobileNavOpen(!mobileNavOpen)}
                                size='sm'
                                variant='flat'
                                className='lg:hidden' // Only show on mobile
                            />
                            {/* Desktop sidebar toggle - only visible on large screens */}
                            <Button
                                isIconOnly
                                startContent={
                                    isCollapsed ? (
                                        <PanelLeftOpen className='size-5' />
                                    ) : (
                                        <PanelLeftClose className='size-5' />
                                    )
                                }
                                onPress={toggleSidebar}
                                size='sm'
                                variant='flat'
                                className='hidden lg:flex' // Only show on desktop
                            />
                            {/* <TextInput
                placeholder="Search everything..."
                startContent={<Search size={18} />}
                size="sm"
                className="w-60 max-w-[calc(100vw-130px)] hidden sm:flex"
              /> */}
                        </div>

                        <div className='flex items-center gap-3'>
                            {baseUrl && token && (
                                <NotificationDropdown baseUrl={baseUrl} token={token} />
                            )}
                            <ThemeSwitcher />
                            {user && <AuthUserDropdown user={user} />}
                        </div>
                    </div>
                </header>
                {/* main content */}
                <main className='flex-1 w-full 2xl:mx-auto 2xl:max-w-[90rem]  p-4 relative rounded rounded-tl-lg'>
                    {pageLoading || navigation.state === "loading" ? (
                        <div className='absolute inset-0 flex items-center justify-center'>
                            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-warning'></div>
                        </div>
                    ) : (
                        children
                    )}
                </main>

            </div>
        </div>
    )
}
