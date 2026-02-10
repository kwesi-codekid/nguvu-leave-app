import { createWriteStream, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { type MetaFunction } from "react-router"
import { getSessionData } from "~/auth-session"
import { successResponse, errorResponse, validationErrorResponse } from "~/utils/api-utils"

const UPLOAD_DIR = join(process.cwd(), "uploads")

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true })
}

export const meta: MetaFunction = () => {
    return [
        { title: "Upload API" },
        { name: "description", content: "API endpoint for file uploads" },
    ]
}

export async function loader() {
    return errorResponse("Method not allowed. Use POST for file uploads.", null, 405)
}

export async function action({ request }: { request: Request }) {
    if (request.method !== "POST") {
        return errorResponse("Method not allowed", null, 405)
    }
    
    try {
        const sessionData = await getSessionData(request)
        if (!sessionData?.token) {
            return errorResponse("Unauthorized", null, 401)
        }

        const formData = await request.formData()
        const files = formData.getAll("files") as File[]

        if (!files || files.length === 0) {
            return validationErrorResponse("No files provided", [])
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
                fileType: file.type,  // Changed from 'type' to 'fileType'
                uploadedAt: new Date()  // Added required uploadedAt field
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
