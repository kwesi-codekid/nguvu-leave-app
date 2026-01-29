import useSWR from "swr"
import { fetcher } from "../lib/fetcher"
import { DepartmentStatsCard } from "../components/cards"
import { Building2, Users, Briefcase, PlaneTakeoff } from "lucide-react"

interface DepartmentStatsSectionProps {
    baseUrl: string
    token: string
}

export const DepartmentStatsSection = ({
    baseUrl,
    token,
}: DepartmentStatsSectionProps) => {
    const departmentsStats = useSWR(
        `${baseUrl}/departments?op=statistics`,
        fetcher(token as string)
    )

    return (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            <DepartmentStatsCard
                title='Total Departments'
                value={departmentsStats?.data?.data?.totalDepartments}
                icon={<Building2 className='size-5 text-warning' />}
                color='warning'
                description='active departments'
            />
            <DepartmentStatsCard
                title='All Staff'
                value={departmentsStats?.data?.data?.totalStaff}
                icon={<Users className='size-5 text-primary' />}
                color='primary'
                description='total staff count'
            />
            <DepartmentStatsCard
                title='Job Positions'
                value={departmentsStats?.data?.data?.totalPositions}
                icon={<Briefcase className='size-5 text-success' />}
                color='success'
                description='assigned job positions'
            />
            <DepartmentStatsCard
                title='Staff On Leave'
                value={departmentsStats?.data?.data?.totalOnLeave}
                icon={<PlaneTakeoff className='size-5 text-danger' />}
                color='danger'
                description='today'
            />
        </div>
    )
}
