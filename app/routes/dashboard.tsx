import { LoaderFunctionArgs, redirect } from "react-router"
import { useLoaderData } from "react-router"
import {
    isAuthenticated as checkAuthenticated,
    getSessionData,
} from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"

export default function Dashboard() {
    const { sessionData } = useLoaderData<typeof loader>()
    // console.log(sessionData)
    return <AppLayout user={sessionData.user}>Dashboard</AppLayout>
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await checkAuthenticated(request)
    const sessionData = await getSessionData(request)

    if (!authenticated) {
        return redirect("/login-email")
    }
    return { sessionData }
}
