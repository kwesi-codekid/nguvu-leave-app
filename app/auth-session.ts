import { createCookieSessionStorage } from "react-router"

interface AuthSessionInterface {
    token: string
    refreshToken: string
    user: {
        _id: string
        id?: string // Staff ID (optional, for backward compatibility)
        email?: string
        phone: string
        name: string
        department: string // Department ID
        permissions: string[]
        profilePicture?: string
        jobTitle?: string
        gender?: string
    }
}

const session_secret =
    process.env.NODE_ENV === "production"
        ? process.env.SESSION_SECRET
        : "your-secret-key"

if (!session_secret) {
    throw new Error(
        "Auth session secret is not set! Please contact IT for support..."
    )
}

const { getSession, commitSession, destroySession } =
    createCookieSessionStorage<AuthSessionInterface>({
        cookie: {
            name: "__leave_auth_session",
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            secrets: [session_secret],
        },
    })

// helper functions
const isAuthenticated = async (request: Request) => {
    const session = await getSession(request.headers.get("Cookie"))
    return session.has("token")
}

const getSessionData = async (request: Request) => {
    const session = await getSession(request.headers.get("Cookie"))

    const user = session.get("user")
    const token = session.get("token")
    const refreshToken = session.get("refreshToken")

    return { user, token, refreshToken }
}

const setSessionData = async (request: Request, data: AuthSessionInterface) => {
    const session = await getSession(request.headers.get("Cookie"))
    session.set("user", data.user)
    session.set("token", data.token)
    session.set("refreshToken", data.refreshToken)

    return session
}

export {
    getSession,
    commitSession,
    destroySession,
    type AuthSessionInterface,
    isAuthenticated,
    getSessionData,
    setSessionData,
}
