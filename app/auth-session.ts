import { createCookieSessionStorage } from "react-router"
import { getSessionSecrets } from "~/utils/session-secrets"

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

// Throws in production if SESSION_SECRET is not set
const session_secrets = getSessionSecrets()

const { getSession, commitSession, destroySession } =
    createCookieSessionStorage<AuthSessionInterface>({
        cookie: {
            name: "__leave_auth_session",
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            secrets: session_secrets,
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
