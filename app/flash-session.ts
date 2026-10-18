import { createCookieSessionStorage } from "react-router"
import { getSessionSecrets } from "~/utils/session-secrets"

const { getSession, commitSession, destroySession } =
    createCookieSessionStorage<{
        alert: {
            status: "success" | "error" | "validation_error" | "not_found"
            message: string
            title?: string
        }
    }>({
        cookie: {
            name: "__leave_flash_session",
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1,
            secrets: getSessionSecrets(),
        },
    })

const getFlashSession = getSession
const commitFlashSession = commitSession
const destroyFlashSession = destroySession

export { getFlashSession, commitFlashSession, destroyFlashSession }
