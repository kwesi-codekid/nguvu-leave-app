import { ResponseObject, UserInterface, Companies } from "./types"

/**
 * Create a success response object
 */
export function successResponseObject<T = any>(
    message: string,
    data?: T
): ResponseObject {
    return {
        status: "success",
        message,
        data,
    }
}

/**
 * Create an error response object
 */
export function errorResponseObject(
    message: string,
    data?: any
): ResponseObject {
    return {
        status: "error",
        message,
        data,
    }
}

/**
 * Create a validation error response object with field-level errors
 */
export function validationErrorResponseObject(
    message: string,
    errors: Array<{ field: string; message: string }>
): ResponseObject {
    return {
        status: "validation_error",
        message,
        errors: errors as [{ field: string; message: string }],
    }
}

/**
 * Create a success response
 * Returns a JSON response
 */
export function successResponse<T = any>(
    message: string,
    data?: T,
    statusCode: number = 200
) {
    return Response.json(successResponseObject(message, data), {
        status: statusCode,
    })
}

/**
 * Create an error response
 * Returns a JSON response
 */
export function errorResponse(
    message: string,
    data?: any,
    statusCode: number = 400
) {
    return Response.json(errorResponseObject(message, data), {
        status: statusCode,
    })
}

/**
 * Create a validation error response with field-level errors
 * Returns a JSON response
 */
export function validationErrorResponse(
    message: string,
    errors: Array<{ field: string; message: string }>,
    statusCode: number = 422
) {
    return Response.json(validationErrorResponseObject(message, errors), {
        status: statusCode,
    })
}

/**
 * Helper function to extract token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null
    }

    return authHeader.split(" ")[1]
}

/**
 * Helper function to add company filtering to queries based on authenticated user
 * @param query - The existing MongoDB query object
 * @param user - The authenticated user
 * @returns Modified query with company filtering applied
 */
export function addCompanyFilter(
    query: Record<string, any>,
    user: UserInterface
): Record<string, any> {
    // Add company filter to ensure users can only see data from their own company
    return {
        ...query,
        company: user.company,
    }
}

/**
 * Helper function to get user IDs filtered by company for populate queries
 * @param userModel - The User model
 * @param currentUser - The authenticated user
 * @param additionalFilters - Additional filters to apply
 * @returns Promise<string[]> - Array of user IDs from the same company
 */
export async function getUserIdsByCompany(
    userModel: any,
    currentUser: UserInterface,
    additionalFilters: Record<string, any> = {}
): Promise<string[]> {
    const users = await userModel
        .find({
            ...additionalFilters,
            company: currentUser.company,
            deletedAt: null,
        })
        .distinct("_id")

    return users.map((id: any) => id.toString())
}
