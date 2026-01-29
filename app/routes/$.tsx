// Catch-all route for undefined paths
import { type LoaderFunctionArgs } from "react-router"

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url)

    // Handle Chrome DevTools requests silently
    if (url.pathname.includes(".well-known/appspecific")) {
        return new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })
    }

    // Return 404 for other unmatched routes
    throw new Response("Not Found", { status: 404 })
}
