import { useState, useEffect } from "react"

/**
 * A hook that returns whether a media query matches the current viewport
 * @param query The media query to check
 * @returns A boolean indicating whether the media query matches
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const media = window.matchMedia(query)

        // Set initial value
        if (media.matches !== matches) {
            setMatches(media.matches)
        }

        // Add listener for changes
        const listener = () => {
            setMatches(media.matches)
        }

        // Modern API
        media.addEventListener("change", listener)

        // Cleanup
        return () => media.removeEventListener("change", listener)
    }, [matches, query])

    return matches
}
