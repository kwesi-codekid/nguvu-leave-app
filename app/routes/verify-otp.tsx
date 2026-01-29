import { Button, InputOtp } from "@heroui/react"
import { ActionFunctionArgs, redirect } from "react-router"
import { Form, Link, useNavigation } from "react-router"
import axios from "axios"
import {
    AuthSessionInterface,
    commitSession,
    setSessionData,
} from "~/auth-session"
import { commitFlashSession, getFlashSession } from "~/flash-session"
import { AuthOrDivider } from "~/ui/components/auth-or-divider"
import AuthLayout from "~/ui/layouts/auth-layout"

export default function RequestOTP() {
    const navigation = useNavigation()
    return (
        <AuthLayout
            title='Sign In To Your Account'
            description='Enter the one-time password sent to your phone'
        >
            <Form
                method='post'
                id='verify-otp-form'
                className='flex flex-col gap-5 items-center'
            >
                <InputOtp length={4} variant='bordered' name='otp' />
                <Button
                    type='submit'
                    color='warning'
                    className='px-14'
                    form='verify-otp-form'
                    isLoading={navigation.state === "submitting"}
                >
                    Send OTP
                </Button>

                <AuthOrDivider />

                <Button
                    type='button'
                    color='warning'
                    variant='light'
                    as={Link}
                    to='/request-otp'
                >
                    Change phone number
                </Button>
            </Form>
        </AuthLayout>
    )
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const url = new URL(request.url)
    const phone = url.searchParams.get("phone")
    const baseUrl = process.env.BASE_URL
    const flashSession = await getFlashSession(request.headers.get("Cookie"))
    const formData = await request.formData()
    const otp = formData.get("otp")

    try {
        const response = await axios.post(`${baseUrl}/auth?op=verify-otp`, {
            otp,
            phone,
        })

        console.log(response.data)

        const sessionData: AuthSessionInterface = {
            user: {
                id: response.data?.data?.staff._id,
                email: response.data?.data?.staff.email,
                phone: response.data?.data?.staff.phone,
                name: response.data?.data?.staff.name,
                department: response.data?.data?.staff.department?.name,
                permissions: response.data?.data?.staff.permissions,
                profilePicture: response.data?.data?.staff.profileImage?.url,
            },
            token: response.data?.data?.token,
            refreshToken: response.data?.data?.refreshToken,
        }

        const session = await setSessionData(request, sessionData)

        return redirect(`/dashboard`, {
            headers: {
                "Set-Cookie": await commitSession(session),
            },
        })
    } catch (error: any) {
        console.error(error.response?.data)

        flashSession.flash("alert", {
            status: "error",
            message:
                error.response?.data?.errors?.[0]?.message ||
                error.response?.data.message ||
                error.message ||
                "An unknown error occurred",
            title: error.response?.data.message,
        })

        return Response.json(
            { error: error.response?.data },
            {
                headers: {
                    "Set-Cookie": await commitFlashSession(flashSession),
                },
            }
        )
    }
}
