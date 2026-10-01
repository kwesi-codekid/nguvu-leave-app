/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios"

// SMSOnlineGH REST API v5
// Docs: https://dev.smsonlinegh.com/docs/v5/http/rest/messaging/sms_non_personalised.html
const SMS_API_URL = "https://api.smsonlinegh.com/v5/message/sms/send"
const SMS_API_KEY = process.env.SMS_API_KEY
const SMS_SENDER = process.env.SMS_SENDER || "Nguvu"

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
  if (!SMS_API_KEY) {
    throw new Error("SMS_API_KEY is not set")
  }

  const headers = {
    // SMSOnlineGH uses "key <API_KEY>", not "Bearer <API_KEY>"
    Authorization: `key ${SMS_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  try {
    const { data: responseData } = await axios.post(SMS_API_URL, data, {
      headers,
    })

    // A request is only accepted when the handshake is { id: 0, label: "HSHK_OK" }
    const handshake = responseData?.handshake
    if (!handshake || handshake.id !== 0) {
      throw new Error(
        `Failed to send SMS: ${handshake?.label || "invalid response"}`
      )
    }

    console.log("sms delivery", JSON.stringify(responseData.data))
    return responseData
  } catch (error: any) {
    // SMSOnlineGH returns the handshake in the body even on non-200 responses
    const label = error?.response?.data?.handshake?.label
    console.error("sms error", label || error?.message)
    throw new Error(
      label ? `Failed to send SMS: ${label}` : error?.message || "Unknown error"
    )
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
    text: smsText,
    type: 0, // 0 = GSM default text message
    sender: SMS_SENDER, // must be an approved sender name on the SMSOnlineGH account
    destinations: [phone],
  }

  try {
    return await httpPost(data)
  } catch (error: any) {
    console.error("sendSMS error", error)
    throw new Error(error.message || "Failed to send SMS")
  }
}

export default sendSMS
