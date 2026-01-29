import { createCookieSessionStorage } from "react-router"

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
        },
    })

const getFlashSession = getSession
const commitFlashSession = commitSession
const destroyFlashSession = destroySession

export { getFlashSession, commitFlashSession, destroyFlashSession }
