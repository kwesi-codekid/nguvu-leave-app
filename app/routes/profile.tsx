import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { getSessionData, isAuthenticated } from "~/auth-session"
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
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Input,
    useDisclosure,
    Spinner,
    addToast,
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
    XCircle,
    Eye,
    EyeOff,
    AlertCircle,
    Briefcase,
    Users,
    TrendingUp,
} from "lucide-react"
import { DateTime } from "luxon"
import useSWR from "swr"
import { fetcher } from "~/ui/lib/fetcher"
import { useState } from "react"
import axios from "axios"
import { LeaveTypes, LeaveStatus } from "~/utils/types"

// Leave type colors for the balance cards
const leaveTypeColors: Record<string, string> = {
    [LeaveTypes.ANNUAL]: "bg-blue-500",
    [LeaveTypes.SICK]: "bg-red-500",
    [LeaveTypes.MATERNITY]: "bg-pink-500",
    [LeaveTypes.PATERNITY]: "bg-purple-500",
    [LeaveTypes.BEREAVEMENT]: "bg-orange-500",
    // Fallback for any other types
    "casual": "bg-green-500",
    "study": "bg-yellow-500",
    "compassionate": "bg-amber-500",
    "unpaid": "bg-gray-500",
}

export default function Profile() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const user = sessionData?.user

    // Fetch full profile data
    const { data: profileData, mutate: mutateProfile } = useSWR(
        `${baseUrl}/auth?op=profile`,
        fetcher(sessionData.token as string)
    )

    // Fetch leave balances
    const { data: balancesData, isLoading: balancesLoading } = useSWR(
        user?._id ? `${baseUrl}/leave-balances?op=by-staff&staffId=${user._id}` : null,
        fetcher(sessionData.token as string)
    )

    // Fetch leave request statistics
    const { data: statsData } = useSWR(
        `${baseUrl}/leave-requests?op=my-requests`,
        fetcher(sessionData.token as string)
    )

    // Modals
    const editProfileModal = useDisclosure()
    const changePasswordModal = useDisclosure()

    // Edit profile form state
    const [profileForm, setProfileForm] = useState({
        name: "",
        phone: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        emergencyContactRelation: "",
    })
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

    // Change password form state
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })
    const [showCurrentPassword, setShowCurrentPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [isChangingPassword, setIsChangingPassword] = useState(false)

    // Get the full staff data from profile API or fallback to session user
    const staff = profileData?.data?.staff || user

    // Calculate statistics from leave requests
    const leaveRequests = statsData?.data?.leaveRequests || []
    const totalRequests = leaveRequests.length
    const approvedRequests = leaveRequests.filter((r: any) => r.status === LeaveStatus.APPROVED).length
    const pendingRequests = leaveRequests.filter((r: any) =>
        r.status === LeaveStatus.PENDING || r.status === LeaveStatus.ENDORSED
    ).length
    const rejectedRequests = leaveRequests.filter((r: any) => r.status === LeaveStatus.REJECTED).length

    // Get leave balances
    const leaveBalances = balancesData?.data?.balances || []

    // Open edit profile modal with current values
    const handleOpenEditProfile = () => {
        setProfileForm({
            name: staff?.name || "",
            phone: staff?.phone || "",
            emergencyContactName: staff?.emergencyContact?.name || "",
            emergencyContactPhone: staff?.emergencyContact?.phone || "",
            emergencyContactRelation: staff?.emergencyContact?.relation || "",
        })
        editProfileModal.onOpen()
    }

    // Handle profile update
    const handleUpdateProfile = async () => {
        setIsUpdatingProfile(true)
        try {
            const payload: any = {}

            if (profileForm.name && profileForm.name !== staff?.name) {
                payload.name = profileForm.name
            }
            if (profileForm.phone && profileForm.phone !== staff?.phone) {
                payload.phone = profileForm.phone
            }
            if (profileForm.emergencyContactName || profileForm.emergencyContactPhone) {
                payload.emergencyContact = {
                    name: profileForm.emergencyContactName,
                    phone: profileForm.emergencyContactPhone,
                    relation: profileForm.emergencyContactRelation,
                }
            }

            if (Object.keys(payload).length === 0) {
                addToast({
                    title: "No Changes",
                    description: "No changes were made to your profile",
                    color: "warning",
                })
                editProfileModal.onClose()
                return
            }

            await axios.patch(
                `${baseUrl}/auth?op=update-profile`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            await mutateProfile()
            editProfileModal.onClose()
            addToast({
                title: "Success",
                description: "Profile updated successfully",
                color: "success",
            })
        } catch (error: any) {
            console.error("Error updating profile:", error)
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to update profile",
                color: "danger",
            })
        } finally {
            setIsUpdatingProfile(false)
        }
    }

    // Handle password change
    const handleChangePassword = async () => {
        // Validate passwords match
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            addToast({
                title: "Error",
                description: "New passwords do not match",
                color: "danger",
            })
            return
        }

        // Validate password length
        if (passwordForm.newPassword.length < 8) {
            addToast({
                title: "Error",
                description: "Password must be at least 8 characters",
                color: "danger",
            })
            return
        }

        setIsChangingPassword(true)
        try {
            await axios.patch(
                `${baseUrl}/auth?op=change-password`,
                {
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword,
                },
                {
                    headers: {
                        Authorization: `Bearer ${sessionData?.token}`,
                    },
                }
            )

            setPasswordForm({
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
            })
            changePasswordModal.onClose()
            addToast({
                title: "Success",
                description: "Password changed successfully",
                color: "success",
            })
        } catch (error: any) {
            console.error("Error changing password:", error)
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to change password",
                color: "danger",
            })
        } finally {
            setIsChangingPassword(false)
        }
    }

    // Format date
    const formatDate = (date: string | Date | undefined) => {
        if (!date) return "N/A"
        return DateTime.fromISO(date.toString()).toFormat("LLL d, yyyy")
    }

    return (
        <AppLayout user={user} baseUrl={baseUrl} token={sessionData?.token}>
            <div className="p-6 max-w-5xl mx-auto space-y-6">
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
                                    src={staff?.profilePicture}
                                    name={staff?.name}
                                    size="lg"
                                    className="w-24 h-24"
                                    fallback={<User className="size-12" />}
                                />
                            </div>
                            <div className="flex-1">
                                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                            {staff?.name}
                                        </h2>
                                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                                            {staff?.jobPosition?.title || staff?.jobTitle || "Staff Member"}
                                        </p>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            <Chip size="sm" variant="flat" startContent={<Building className="size-3" />}>
                                                {staff?.department?.name || staff?.department || "No Department"}
                                            </Chip>
                                            {staff?.permissions?.map((perm: string) => (
                                                <Chip key={perm} size="sm" variant="flat" color="secondary" startContent={<Shield className="size-3" />}>
                                                    {perm}
                                                </Chip>
                                            ))}
                                            <Chip size="sm" color={staff?.status === "active" ? "success" : "danger"} variant="flat">
                                                {staff?.status || "Active"}
                                            </Chip>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="flat"
                                        startContent={<Edit className="size-4" />}
                                        onPress={handleOpenEditProfile}
                                    >
                                        Edit Profile
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Leave Balances Section */}
                <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="size-5 text-primary" />
                        Leave Balances ({balancesData?.data?.summary?.periodLabel || new Date().getFullYear()})
                    </h3>
                    {balancesLoading ? (
                        <div className="flex justify-center py-8">
                            <Spinner />
                        </div>
                    ) : leaveBalances.length === 0 ? (
                        <Card className="bg-content1">
                            <CardBody className="p-6 text-center">
                                <AlertCircle className="size-12 mx-auto text-zinc-400 mb-3" />
                                <p className="text-zinc-500">No leave balances found for this year</p>
                            </CardBody>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {leaveBalances.map((balance: any) => {
                                const used = balance.used || 0
                                const allocated = balance.allocated || 0
                                const remaining = balance.remaining ?? 0
                                const canRequestDays = balance.availableForRequest ?? Math.max(0, allocated - used)
                                const percentage = allocated > 0 ? (used / allocated) * 100 : 0

                                return (
                                    <Card key={balance._id} className="bg-content1">
                                        <CardBody className="p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className={`w-3 h-3 rounded-full ${leaveTypeColors[balance.leaveType] || "bg-gray-500"}`} />
                                                <span className="text-sm font-medium capitalize">
                                                    {balance.leaveType?.replace(/_/g, " ")}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-end mb-2">
                                                <div>
                                                    <p className={`text-2xl font-bold ${remaining < 0 ? 'text-danger-500' : ''}`}>{remaining}</p>
                                                    <p className="text-xs text-zinc-500">Balance</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-zinc-500">{used} / {allocated}</p>
                                                    <p className="text-xs text-zinc-500">Used</p>
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-500 mb-1">
                                                Accrued: {balance.accrued || 0} days ({balance.monthlyRate || 0}/month)
                                            </p>
                                            {remaining < 0 && (
                                                <p className="text-xs text-danger-500 font-medium mb-1">
                                                    Owing: {Math.abs(remaining)} days from next month
                                                </p>
                                            )}
                                            {canRequestDays > 0 && (
                                                <p className="text-xs text-primary-500 mb-1">
                                                    Can request up to: {canRequestDays} days
                                                </p>
                                            )}
                                            <Progress
                                                value={percentage}
                                                size="sm"
                                                color={percentage > 80 ? "danger" : percentage > 50 ? "warning" : "success"}
                                                className="mt-2"
                                            />
                                        </CardBody>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>

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
                                    <p className="font-medium">{staff?.email || "Not provided"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Phone className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Phone</p>
                                    <p className="font-medium">{staff?.phone || "Not provided"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Briefcase className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Staff ID</p>
                                    <p className="font-medium">{staff?.staffId || staff?.id || "N/A"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Building className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Department</p>
                                    <p className="font-medium">{staff?.department?.name || staff?.department || "N/A"}</p>
                                </div>
                            </div>
                            <Divider />
                            <div className="flex items-center gap-3">
                                <Users className="size-4 text-zinc-400" />
                                <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Emergency Contact</p>
                                    {staff?.emergencyContact?.name ? (
                                        <div>
                                            <p className="font-medium">{staff.emergencyContact.name}</p>
                                            <p className="text-sm text-zinc-500">
                                                {staff.emergencyContact.phone}
                                                {staff.emergencyContact.relation && ` (${staff.emergencyContact.relation})`}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-zinc-500">Not provided</p>
                                    )}
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    {/* Account Statistics */}
                    <Card className="bg-content1">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Award className="size-5 text-primary" />
                                <h3 className="font-semibold">Leave Request Statistics</h3>
                            </div>
                        </CardHeader>
                        <CardBody className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="size-4 text-zinc-400" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Total Requests</span>
                                </div>
                                <span className="font-semibold">{totalRequests}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="size-4 text-success" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Approved</span>
                                </div>
                                <span className="font-semibold text-success-600">{approvedRequests}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="size-4 text-warning" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Pending</span>
                                </div>
                                <span className="font-semibold text-warning-600">{pendingRequests}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <XCircle className="size-4 text-danger" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Rejected</span>
                                </div>
                                <span className="font-semibold text-danger-600">{rejectedRequests}</span>
                            </div>
                            <Divider />
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Calendar className="size-4 text-zinc-400" />
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Member Since</span>
                                </div>
                                <span className="font-semibold">
                                    {formatDate(staff?.createdAt)}
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
                            <Button
                                variant="flat"
                                className="justify-start"
                                onPress={handleOpenEditProfile}
                            >
                                <Edit className="size-4 mr-2" />
                                Update Personal Info
                            </Button>
                            <Button
                                variant="flat"
                                className="justify-start"
                                onPress={changePasswordModal.onOpen}
                            >
                                <Shield className="size-4 mr-2" />
                                Change Password
                            </Button>
                            <Button variant="flat" className="justify-start" isDisabled>
                                <Settings className="size-4 mr-2" />
                                Notification Settings
                            </Button>
                        </div>
                    </CardBody>
                </Card>

                {/* Account Status */}
                <Card className={`${staff?.status === "active" ? "bg-warning/70" : "bg-danger/70"} text-white`}>
                    <CardBody className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Account Status</h3>
                                <p className="text-sm opacity-90">
                                    {staff?.status === "active"
                                        ? "Your account is in good standing"
                                        : "Your account has been deactivated"}
                                </p>
                            </div>
                            <div className="text-right">
                                <Chip variant="flat" className="bg-white/20 text-white capitalize">
                                    {staff?.status || "Active"}
                                </Chip>
                                <p className="text-xs opacity-80 mt-2">
                                    Last updated: {formatDate(staff?.updatedAt)}
                                </p>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            </div>

            {/* Edit Profile Modal */}
            <Modal
                isOpen={editProfileModal.isOpen}
                onOpenChange={editProfileModal.onOpenChange}
                size="lg"
                backdrop="blur"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                Edit Profile
                            </ModalHeader>
                            <ModalBody>
                                <div className="space-y-4">
                                    <Input
                                        label="Full Name"
                                        placeholder="Enter your full name"
                                        value={profileForm.name}
                                        onValueChange={(value) => setProfileForm({ ...profileForm, name: value })}
                                        variant="bordered"
                                        startContent={<User className="size-4 text-zinc-400" />}
                                    />
                                    <Input
                                        label="Phone Number"
                                        placeholder="Enter your phone number"
                                        value={profileForm.phone}
                                        onValueChange={(value) => setProfileForm({ ...profileForm, phone: value })}
                                        variant="bordered"
                                        startContent={<Phone className="size-4 text-zinc-400" />}
                                    />
                                    <Divider />
                                    <p className="text-sm font-medium text-zinc-500">Emergency Contact</p>
                                    <Input
                                        label="Contact Name"
                                        placeholder="Enter emergency contact name"
                                        value={profileForm.emergencyContactName}
                                        onValueChange={(value) => setProfileForm({ ...profileForm, emergencyContactName: value })}
                                        variant="bordered"
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input
                                            label="Contact Phone"
                                            placeholder="Phone number"
                                            value={profileForm.emergencyContactPhone}
                                            onValueChange={(value) => setProfileForm({ ...profileForm, emergencyContactPhone: value })}
                                            variant="bordered"
                                        />
                                        <Input
                                            label="Relationship"
                                            placeholder="e.g., Spouse, Parent"
                                            value={profileForm.emergencyContactRelation}
                                            onValueChange={(value) => setProfileForm({ ...profileForm, emergencyContactRelation: value })}
                                            variant="bordered"
                                        />
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="flat" onPress={onClose} isDisabled={isUpdatingProfile}>
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={handleUpdateProfile}
                                    isLoading={isUpdatingProfile}
                                >
                                    Save Changes
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Change Password Modal */}
            <Modal
                isOpen={changePasswordModal.isOpen}
                onOpenChange={changePasswordModal.onOpenChange}
                backdrop="blur"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                Change Password
                            </ModalHeader>
                            <ModalBody>
                                <div className="space-y-4">
                                    <Input
                                        label="Current Password"
                                        placeholder="Enter your current password"
                                        type={showCurrentPassword ? "text" : "password"}
                                        value={passwordForm.currentPassword}
                                        onValueChange={(value) => setPasswordForm({ ...passwordForm, currentPassword: value })}
                                        variant="bordered"
                                        endContent={
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                className="focus:outline-none"
                                            >
                                                {showCurrentPassword ? (
                                                    <EyeOff className="size-4 text-zinc-400" />
                                                ) : (
                                                    <Eye className="size-4 text-zinc-400" />
                                                )}
                                            </button>
                                        }
                                    />
                                    <Input
                                        label="New Password"
                                        placeholder="Enter your new password"
                                        type={showNewPassword ? "text" : "password"}
                                        value={passwordForm.newPassword}
                                        onValueChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })}
                                        variant="bordered"
                                        description="Password must be at least 8 characters"
                                        endContent={
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                                className="focus:outline-none"
                                            >
                                                {showNewPassword ? (
                                                    <EyeOff className="size-4 text-zinc-400" />
                                                ) : (
                                                    <Eye className="size-4 text-zinc-400" />
                                                )}
                                            </button>
                                        }
                                    />
                                    <Input
                                        label="Confirm New Password"
                                        placeholder="Confirm your new password"
                                        type={showNewPassword ? "text" : "password"}
                                        value={passwordForm.confirmPassword}
                                        onValueChange={(value) => setPasswordForm({ ...passwordForm, confirmPassword: value })}
                                        variant="bordered"
                                        isInvalid={passwordForm.confirmPassword.length > 0 && passwordForm.newPassword !== passwordForm.confirmPassword}
                                        errorMessage={passwordForm.confirmPassword.length > 0 && passwordForm.newPassword !== passwordForm.confirmPassword ? "Passwords do not match" : ""}
                                    />
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    variant="flat"
                                    onPress={() => {
                                        setPasswordForm({
                                            currentPassword: "",
                                            newPassword: "",
                                            confirmPassword: "",
                                        })
                                        onClose()
                                    }}
                                    isDisabled={isChangingPassword}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={handleChangePassword}
                                    isLoading={isChangingPassword}
                                    isDisabled={
                                        !passwordForm.currentPassword ||
                                        !passwordForm.newPassword ||
                                        !passwordForm.confirmPassword ||
                                        passwordForm.newPassword !== passwordForm.confirmPassword ||
                                        passwordForm.newPassword.length < 8
                                    }
                                >
                                    Change Password
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await isAuthenticated(request)
    if (!authenticated) {
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
