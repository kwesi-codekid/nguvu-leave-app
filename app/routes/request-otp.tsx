import { Button } from "@heroui/react"
import { ActionFunctionArgs, redirect } from "react-router"
import { Form, Link, useNavigation } from "react-router"
import axios from "axios"
import { commitFlashSession, getFlashSession } from "~/flash-session"
import { AuthOrDivider } from "~/ui/components/auth-or-divider"
import { TextInput } from "~/ui/components/inputs"
import AuthLayout from "~/ui/layouts/auth-layout"

export default function RequestOTP() {
    const navigation = useNavigation()
    return (
        <AuthLayout
            title='Sign In To Your Account'
            description='Enter your phone number to receive an OTP'
        >
            <Form
                method='post'
                id='request-otp-form'
                className='flex flex-col gap-5'
            >
                <TextInput name='phone' label='Phone Number' type='tel' />
                <Button
                    type='submit'
                    color='warning'
                    form='request-otp-form'
                    isLoading={navigation.state === "submitting"}
                >
                    Send OTP
                </Button>

                <AuthOrDivider />

                <Button
                    type='button'
                    color='warning'
                    variant='light'
                    fullWidth
                    as={Link}
                    to='/'
                >
                    Sign in with email
                </Button>
            </Form>
        </AuthLayout>
    )
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const baseUrl = process.env.BASE_URL
    const flashSession = await getFlashSession(request.headers.get("Cookie"))
    const formData = await request.formData()
    const phone = formData.get("phone")

    try {
        const response = await axios.post(`${baseUrl}/auth?op=send-otp`, {
            phone,
        })

        flashSession.flash("alert", {
            status: "success",
            message: `Kindly note that the OTP will expire in ${
                response.data.data.expiresIn / 60
            } minutes`,
            title: "OTP sent successfully",
        })

        return redirect(`/verify-otp?phone=${phone}`, {
            headers: {
                "Set-Cookie": await commitFlashSession(flashSession),
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
