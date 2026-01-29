import { Button } from "@heroui/react"
import { ActionFunctionArgs, redirect } from "react-router"
import { Form, Link, useNavigation } from "react-router"
import { PasswordInput, TextInput } from "~/ui/components/inputs"
import AuthLayout from "~/ui/layouts/auth-layout"
import { AuthOrDivider } from "~/ui/components/auth-or-divider"
import axios from "axios"
import { commitFlashSession, getFlashSession } from "~/flash-session"
import {
    AuthSessionInterface,
    commitSession,
    setSessionData,
} from "~/auth-session"

export default function Login() {
    const navigation = useNavigation()
    return (
        <AuthLayout
            title='Sign In To Your Account'
            description='Enter your email and password to login'
        >
            <Form
                method='post'
                id='login-email-form'
                className='flex flex-col gap-5'
            >
                <TextInput name='email' label='Email' />
                <PasswordInput name='password' label='Password' />
                <Button
                    type='submit'
                    color='warning'
                    form='login-email-form'
                    isLoading={navigation.state === "submitting"}
                >
                    Login
                </Button>

                <AuthOrDivider />

                <Button
                    type='button'
                    color='warning'
                    variant='light'
                    fullWidth
                    as={Link}
                    to='/request-otp'
                >
                    Sign in with phone
                </Button>
            </Form>
        </AuthLayout>
    )
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const baseUrl = process.env.BASE_URL
    const flashSession = await getFlashSession(request.headers.get("Cookie"))
    const formData = await request.formData()
    const email = formData.get("email")
    const password = formData.get("password")

    try {
        const response = await axios.post(`${baseUrl}/auth?op=login`, {
            email,
            password,
        })

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
