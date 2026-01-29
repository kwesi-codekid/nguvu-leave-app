import { redirect, type LoaderFunctionArgs } from "react-router"
import { destroySession, getSession } from "~/auth-session"

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const session = await getSession(request.headers.get("Cookie"))

    return redirect("/login-email", {
        headers: {
            "Set-Cookie": await destroySession(session),
        },
    })
}

export default function Logout() {
    return null
}
