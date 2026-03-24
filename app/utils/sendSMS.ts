/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios"

const SMS_API_KEY = process.env.SMS_API_KEY

// Normalize phone number
function normalizePhoneNumber(phoneNumber: string): string | false {
    if (!phoneNumber) return false

    // Take first number before "/" or "\\" and remove spaces/non-digits
    const cleaned = phoneNumber.split(/[\\/]/)[0].replace(/\D+/g, "")

    if (!cleaned) return false

    // Convert 0-prefixed number to international format
    const normalized = cleaned.startsWith("0")
        ? "233" + cleaned.slice(1)
        : cleaned

    return normalized.length >= 9 ? normalized : false
}

// HTTP POST request
async function httpPost(data: any): Promise<any> {
    const url = process.env.SMS_API_URL as string

    const headers = {
        Authorization: `Bearer ${SMS_API_KEY as string}`,
        "Content-Type": "application/json",
        Accept: "application/json",
    }

    try {
        const { data: responseData } = await axios.post(url, data, { headers })

        if (responseData?.status === "FAILED") {
            throw new Error("Failed to send SMS: Unregistered sender")
        }

        console.log("sms delivery", responseData)
        return responseData
    } catch (error: any) {
        console.error("sms error", error)
        throw new Error(error?.message || "Unknown error")
    }
}

// Send SMS
async function sendSMS({
    smsText,
    recipient,
}: {
    smsText: string
    recipient: string
}): Promise<any> {
    const phone = normalizePhoneNumber(recipient)
    // console.info("formatted phone", phone)

    if (!phone) return false

    const data = {
        from: "Nguvu",
        refId: `nguvu_leave_ref_${Date.now()}`,
        to: phone,
        message: smsText,
    }

    try {
        return await httpPost(data)
    } catch (error: any) {
        console.error("sendSMS error", error)
        throw new Error(error.message || "Failed to send SMS")
    }
}

export default sendSMS
