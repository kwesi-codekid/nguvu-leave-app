/* eslint-disable @typescript-eslint/no-explicit-any */
import { addToast } from "@heroui/react"
import axios from "axios"

export const fetcher = (token: string) => async (url: string) => {
    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })

        return response.data
        console.log(response.data)
    } catch (error: any) {
        console.log("🚀 ~ fetcher ~ error:", error)

        addToast({
            title: "Error",
            description: error.response.data
                ? error.response.data.message
                : `Failed to fetch data! ${error.message}`,
            color: "danger",
        })
        if (error.response.status === 401) {
            // redirect to logout
            window.location.href = "/logout"
            return null
        }

        return error
    }
}
