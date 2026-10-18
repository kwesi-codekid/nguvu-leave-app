import { getSessionData } from "~/auth-session"
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    extractToken,
} from "~/utils/api-utils"
import { verifyAccessToken } from "~/utils/auth-token"
import { connectDB } from "~/database/connect"
import Staff from "~/models/staff.model"
import { AccountStatus } from "~/utils/types"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_FILES = 5

// Allowed extensions and the MIME types accepted for each
const ALLOWED_FILE_TYPES: Record<string, string[]> = {
    ".pdf": ["application/pdf"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".png": ["image/png"],
    ".doc": ["application/msword"],
    ".docx": [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
}

// Verify the JWT (from the Authorization header or the session) and require
// an active account, rather than trusting that a session merely has a token
async function getAuthenticatedStaff(request: Request) {
    const sessionData = await getSessionData(request)
    const token =
        extractToken(request.headers.get("Authorization")) ||
        sessionData?.token

    if (!token) {
        return null
    }

    try {
        const decoded = verifyAccessToken(token)
        await connectDB()

        const staff = await Staff.findById(decoded.staffId)
            .select("_id status")
            .lean()

        if (!staff || staff.status !== AccountStatus.ACTIVE) {
            return null
        }

        return staff
    } catch (error) {
        return null
    }
}

function validateFile(file: File): string | null {
    const name = file.name || ""
    const dotIndex = name.lastIndexOf(".")
    const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : ""
    const allowedMimeTypes = ALLOWED_FILE_TYPES[extension]

    if (!allowedMimeTypes) {
        return `${name || "File"}: only PDF, JPG, PNG, DOC and DOCX files are allowed`
    }

    // Browsers occasionally send an empty or generic type; otherwise it must match
    if (
        file.type &&
        file.type !== "application/octet-stream" &&
        !allowedMimeTypes.includes(file.type)
    ) {
        return `${name}: file type does not match its extension`
    }

    if (file.size > MAX_FILE_SIZE) {
        return `${name}: file exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    }

    return null
}

export async function loader() {
    return errorResponse("Method not allowed. Use POST for file uploads.", null, 405)
}

export async function action({ request }: { request: Request }) {
    if (request.method !== "POST") {
        return errorResponse("Method not allowed", null, 405)
    }

    try {
        const staff = await getAuthenticatedStaff(request)
        if (!staff) {
            return errorResponse("Unauthorized", null, 401)
        }

        // Reject oversized requests before buffering the body. A length is
        // required: chunked bodies would otherwise bypass this check.
        const contentLengthHeader = request.headers.get("Content-Length")
        if (!contentLengthHeader) {
            return errorResponse("Content-Length header is required", null, 411)
        }
        const contentLength = Number(contentLengthHeader)
        if (!Number.isFinite(contentLength) || contentLength < 0) {
            return errorResponse("Invalid Content-Length header", null, 400)
        }
        if (contentLength > MAX_FILES * MAX_FILE_SIZE + 1024 * 1024) {
            return errorResponse("Upload is too large", null, 413)
        }

        const formData = await request.formData()
        const files = formData
            .getAll("files")
            .filter((entry): entry is File => typeof entry !== "string")

        if (!files || files.length === 0) {
            return validationErrorResponse("No files provided", [])
        }

        if (files.length > MAX_FILES) {
            return validationErrorResponse("Too many files", [
                {
                    field: "files",
                    message: `You can upload at most ${MAX_FILES} files at a time`,
                },
            ])
        }

        const fileErrors = files
            .map((file) => validateFile(file))
            .filter((message): message is string => message !== null)
            .map((message) => ({ field: "files", message }))

        if (fileErrors.length > 0) {
            return validationErrorResponse("Invalid files", fileErrors)
        }

        const { createWriteStream, existsSync, mkdirSync } = await import("fs")
        const { join } = await import("path")

        const UPLOAD_DIR = join(process.cwd(), "uploads")

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            mkdirSync(UPLOAD_DIR, { recursive: true })
        }

        const uploadedFiles = []

        for (const file of files) {
            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            // Generate unique filename
            const timestamp = Date.now()
            const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
            const filename = `${timestamp}_${originalName}`
            const filepath = join(UPLOAD_DIR, filename)

            // Write file to disk
            const writeStream = createWriteStream(filepath)
            writeStream.write(buffer)
            writeStream.end()

            // Create file URL (in production, this would be your CDN/base URL)
            const fileUrl = `/uploads/${filename}`

            uploadedFiles.push({
                url: fileUrl,
                publicId: filename,
                filename: file.name,
                size: file.size,
                fileType: file.type,
                uploadedAt: new Date()
            })
        }

        return successResponse("Files uploaded successfully", {
            files: uploadedFiles
        })
    } catch (error) {
        console.error("Upload error:", error)
        return errorResponse("Failed to upload files", null, 500)
    }
}
