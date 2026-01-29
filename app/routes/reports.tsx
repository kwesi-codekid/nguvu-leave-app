import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { getSession } from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"

export default function Reports() {
    const { user } = useLoaderData<typeof loader>()
    return (
        <AppLayout user={user}>
            <div className="p-6">
                <h1 className="text-2xl font-bold">Reports</h1>
                <p className="text-gray-500 mt-2">View and generate reports here.</p>
            </div>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const session = await getSession(request.headers.get("Cookie"))
    const user = session.get("user")
    if (!user) {
        return redirect("/login-email")
    }
    return { user }
}
