import { ReactNode } from "react"
import {
    Users,
    FilePenLine,
    Building2,
    Handshake,
    CalendarCheck,
    BriefcaseBusiness,
    UndoDot,
    Logs,
    LayoutDashboard,
    ChartNoAxesColumn,
} from "lucide-react"

export const navlinks: {
    label: string
    icon: ReactNode
    permittedRoles: string[]
    href: string
}[] = [
    {
        label: "Dashboard",
        icon: <LayoutDashboard className='w-5 h-5' />,
        permittedRoles: ["STAFF", "MANAGER", "HR", "ADMIN"],
        href: "/dashboard",
    },
    {
        label: "Leave Requests",
        icon: <FilePenLine className='w-5 h-5' />,
        permittedRoles: ["STAFF", "MANAGER", "HR", "ADMIN"],
        href: "/leave-requests",
    },
    // {
    //     label: "Leave Balances",
    //     icon: <CalendarCheck className='w-5 h-5' />,
    //     permittedRoles: ["STAFF", "MANAGER", "HR", "ADMIN"],
    //     href: "/leave-balances",
    // },
    {
        label: "Staff Management",
        icon: <Users className='w-5 h-5' />,
        permittedRoles: ["MANAGER", "HR", "ADMIN"],
        href: "/staff",
    },
    {
        label: "Departments",
        icon: <Building2 className='w-5 h-5' />,
        permittedRoles: ["HR", "ADMIN"],
        href: "/departments",
    },
    {
        label: "Job Positions",
        icon: <BriefcaseBusiness className='w-5 h-5' />,
        permittedRoles: ["HR", "ADMIN"],
        href: "/job-positions",
    },
    {
        label: "Contracts",
        icon: <Handshake className='w-5 h-5' />,
        permittedRoles: ["HR", "ADMIN"],
        href: "/contracts",
    },
    {
        label: "Holidays",
        icon: <CalendarCheck className='w-5 h-5' />,
        permittedRoles: ["STAFF", "MANAGER", "HR", "ADMIN"],
        href: "/holidays",
    },
    {
        label: "Call-Ins",
        icon: <UndoDot className='w-5 h-5' />,
        permittedRoles: ["MANAGER", "HR", "ADMIN"],
        href: "/call-ins",
    },
    {
        label: "Reports",
        icon: <ChartNoAxesColumn className='w-5 h-5' />,
        permittedRoles: ["MANAGER", "HR", "ADMIN"],
        href: "/reports",
    },
    {
        label: "Audit Logs",
        icon: <Logs className='w-5 h-5' />,
        permittedRoles: ["HR", "ADMIN", "MANAGER"],
        href: "/audit-logs",
    },
]
