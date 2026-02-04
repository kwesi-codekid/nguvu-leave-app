import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { getSession } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import {
    Card,
    CardBody,
    CardHeader,
    Avatar,
    Chip,
    Button,
    Divider,
    Progress,
} from "@heroui/react"
import {
    User,
    Mail,
    Phone,
    Building,
    Calendar,
    Award,
    Settings,
    Edit,
    Shield,
    Clock,
    CheckCircle,
    FileText,
} from "lucide-react"
import { DateTime } from "luxon"

export default function Profile() {
    const { user } = useLoaderData<typeof loader>()

    return (
        <AppLayout user={user}>
            <div className="p-6 max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">My Profile</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">
                        Manage your personal information and account settings
                    </p>
                </div>

                {/* Profile Overview Card */}
                <Card className="bg-content1">
                    <CardBody className="p-8">
                        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className="flex-shrink-0">
                                <Avatar
                                    src={user.profilePicture}
                                    name={user.name}
                                    size="xl"
                                    className="w-24 h-24"
                                    fallback={<User className="size-12" />}
                                />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                            {user.name}
                                        </h2>
                                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                                            {user.jobTitle || "Staff Member"}
                                        </p>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            <Chip size="sm" variant="flat" startContent={<Building className="size-3" />}>
                                                {user.department}
                                            </Chip>
                                            <Chip size="sm" variant="flat" startContent={<Shield className="size-3" />}>
                                                {user.permissions?.[0] || "Staff"}
                                            </Chip>
                                            <Chip size="sm" color="success" variant="flat">
                                                Active
                                            </Chip>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="flat" startContent={<Edit className="size-4" />}>
                                        Edit Profile
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Information Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <Card className="bg-content1">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <User className="size-5 text-primary" />
                                <h3 className="font-semibold">Personal Information</h3>
                            </div>
                        </CardHeader>
                        <CardBody className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Mail className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Email</p>
                                    <p className="font-medium">{user.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Phone className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Phone</p>
                                    <p className="font-medium">{user.phone || "Not provided"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Calendar className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Staff ID</p>
                                    <p className="font-medium">{user.id}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Building className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Department</p>
                                    <p className="font-medium">{user.department}</p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    {/* Account Statistics */}
                    <Card className="bg-content1">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Award className="size-5 text-primary" />
                                <h3 className="font-semibold">Account Statistics</h3>
                            </div>
                        </CardHeader>
                        <CardBody className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="size-4 text-zinc-400" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Total Requests</span>
                                </div>
                                <span className="font-semibold">24</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="size-4 text-zinc-400" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Approved</span>
                                </div>
                                <span className="font-semibold text-success-600">18</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="size-4 text-zinc-400" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Pending</span>
                                </div>
                                <span className="font-semibold text-warning-600">3</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Calendar className="size-4 text-zinc-400" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Member Since</span>
                                </div>
                                <span className="font-semibold">
                                    {DateTime.now().minus({ years: 2 }).toFormat("MMM yyyy")}
                                </span>
                            </div>
                        </CardBody>
                    </Card>
                </div>

                {/* Quick Actions */}
                <Card className="bg-content1">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Settings className="size-5 text-primary" />
                            <h3 className="font-semibold">Quick Actions</h3>
                        </div>
                    </CardHeader>
                    <CardBody>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button variant="flat" className="justify-start">
                                <Edit className="size-4 mr-2" />
                                Update Personal Info
                            </Button>
                            <Button variant="flat" className="justify-start">
                                <Shield className="size-4 mr-2" />
                                Change Password
                            </Button>
                            <Button variant="flat" className="justify-start">
                                <Settings className="size-4 mr-2" />
                                Notification Settings
                            </Button>
                        </div>
                    </CardBody>
                </Card>

                {/* Account Status */}
                <Card className="bg-warning dark:bg-content1">
                    <CardBody className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Account Status</h3>
                                <p className="text-sm opacity-90">Your account is in good standing</p>
                            </div>
                            <div className="text-right">
                                <Chip  variant="flat" className="bg-white/20 text-white">
                                    Active
                                </Chip>
                                <p className="text-xs opacity-80 mt-2">Last login: Today</p>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            </div>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const session = await getSession(request.headers.get("Cookie"))
    const user = session.get("user")
    if (!user) {
        return redirect("/")
    }
    return { user }
}
