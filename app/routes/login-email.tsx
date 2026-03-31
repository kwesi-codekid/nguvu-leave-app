import { Button, Tabs, Tab } from "@heroui/react";
import { ActionFunctionArgs, redirect } from "react-router";
import { Form, useNavigation } from "react-router";
import { PasswordInput, TextInput } from "~/ui/components/inputs";
import AuthLayout from "~/ui/layouts/auth-layout";
import axios from "axios";
import { commitFlashSession, getFlashSession } from "~/flash-session";
import {
  AuthSessionInterface,
  commitSession,
  setSessionData,
} from "~/auth-session";
import { Mail, Phone } from "lucide-react";

export default function Login() {
  const navigation = useNavigation();

  return (
    <AuthLayout
      title="Sign In To Your Account"
      description="Choose your preferred login method"
    >
      <div className="w-full">
        <Tabs
          fullWidth
          color="warning"
          variant="light"
          classNames={{
            tabList:
              "gap-6 w-full relative rounded-xl p-1 bg-default-100 dark:bg-default-50 flex justify-between",
            cursor: "w-full bg-white dark:bg-neutral-800 shadow-lg rounded-lg",
            tab: "px-4 h-9 rounded-lg",
            tabContent: "group-data-[selected=true]:text-warning font-semibold",
          }}
        >
          <Tab
            key="phone"
            title={
              <div className="flex items-center space-x-2">
                <Phone size={18} />
                <span>Phone</span>
              </div>
            }
          >
            <Form method="post" className="flex flex-col gap-5 mt-6">
              <TextInput name="phone" label="Phone Number" type="tel" />
              <Button
                type="submit"
                color="warning"
                isLoading={navigation.state === "submitting"}
              >
                Send OTP
              </Button>
            </Form>
          </Tab>
          <Tab
            key="email"
            title={
              <div className="flex items-center space-x-2">
                <Mail size={18} />
                <span>Email</span>
              </div>
            }
          >
            <Form method="post" className="flex flex-col gap-5 mt-6">
              <TextInput name="email" label="Email" type="email" />
              <Button
                type="submit"
                color="warning"
                isLoading={navigation.state === "submitting"}
              >
                Send OTP
              </Button>
            </Form>
          </Tab>
        </Tabs>
      </div>
    </AuthLayout>
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const baseUrl = process.env.BASE_URL;
  const flashSession = await getFlashSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const email = formData.get("email");
  const phone = formData.get("phone");

  // Preserve redirectTo across the login flow
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || ""
  const redirectParam = redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ""

  // Handle phone login (send OTP)
  if (phone && !email) {
    try {
      const response = await axios.post(`${baseUrl}/auth?op=send-otp`, {
        phone,
      });

      flashSession.flash("alert", {
        status: "success",
        message: `Kindly note that the OTP will expire in ${
          response.data.data.expiresIn / 60
        } minutes`,
        title: "OTP sent successfully",
      });

      return redirect(`/verify-otp?phone=${phone}${redirectParam}`, {
        headers: {
          "Set-Cookie": await commitFlashSession(flashSession),
        },
      });
    } catch (error: any) {
      console.error(error.response?.data);

      flashSession.flash("alert", {
        status: "error",
        message:
          error.response?.data?.errors?.[0]?.message ||
          error.response?.data.message ||
          error.message ||
          "An unknown error occurred",
        title: error.response?.data.message,
      });

      return Response.json(
        { error: error.response?.data },
        {
          headers: {
            "Set-Cookie": await commitFlashSession(flashSession),
          },
        },
      );
    }
  }

  // Handle email login (send OTP)
  if (email && !phone) {
    try {
      const response = await axios.post(`${baseUrl}/auth?op=send-otp`, {
        email,
      });

      flashSession.flash("alert", {
        status: "success",
        message: `Kindly note that the OTP will expire in ${
          response.data.data.expiresIn / 60
        } minutes`,
        title: "OTP sent successfully",
      });

      return redirect(`/verify-otp?email=${email}${redirectParam}`, {
        headers: {
          "Set-Cookie": await commitFlashSession(flashSession),
        },
      });
    } catch (error: any) {
      console.error(error.response?.data);

      flashSession.flash("alert", {
        status: "error",
        message:
          error.response?.data?.errors?.[0]?.message ||
          error.response?.data.message ||
          error.message ||
          "An unknown error occurred",
        title: error.response?.data.message,
      });

      return Response.json(
        { error: error.response?.data },
        {
          headers: {
            "Set-Cookie": await commitFlashSession(flashSession),
          },
        },
      );
    }
  }
};
