import { v2 as cloudinary, UploadApiResponse } from "cloudinary"

// Explicitly type the callback to match Cloudinary's expectations
type UploadCallback = (err?: any, callResult?: UploadApiResponse) => void

// Configure Cloudinary with credentials from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Upload a file to Cloudinary in the Adamus Leave folder
 * @param fileBuffer - The file buffer to upload
 * @param fileName - Original file name (used to derive public_id)
 * @param folder - Optional subfolder within Adamus Leave folder
 * @returns Promise resolving to Cloudinary upload response
 */
export const uploadToCloudinary = async (
    fileBuffer: Buffer,
    fileName: string,
    folder: string = ""
): Promise<UploadApiResponse> => {
    try {
        // Generate a unique public_id based on the file name and current timestamp
        const timestamp = new Date().getTime()
        const publicId = `${fileName.split(".")[0]}_${timestamp}`

        // Create the folder path (always within the Adamus Leave main folder)
        const folderPath = folder ? `Adamus Leave/${folder}` : "Adamus Leave"

        // Upload to Cloudinary
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: folderPath,
                    public_id: publicId,
                    resource_type: "auto",
                    overwrite: true,
                },
                (error: any, result?: UploadApiResponse) => {
                    if (error || !result) {
                        console.error("Cloudinary upload error:", error)
                        reject(
                            error || new Error("Upload failed with no result")
                        )
                    } else {
                        resolve(result)
                    }
                }
            )

            uploadStream.end(fileBuffer)
        })
    } catch (error) {
        console.error("Error uploading to Cloudinary:", error)
        throw error
    }
}

/**
 * Delete a file from Cloudinary
 * @param publicId - Cloudinary public ID of the file to delete
 * @returns Promise resolving to Cloudinary deletion response
 */
export const deleteFromCloudinary = async (publicId: string): Promise<any> => {
    try {
        return await cloudinary.uploader.destroy(publicId)
    } catch (error) {
        console.error("Error deleting from Cloudinary:", error)
        throw error
    }
}

export default {
    uploadToCloudinary,
    deleteFromCloudinary,
}
