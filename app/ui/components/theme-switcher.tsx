import { Button, Skeleton } from "@heroui/react"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export const ThemeSwitcher = () => {
    const { theme, setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return <Skeleton className='size-8 rounded-full' />

    const isDark = resolvedTheme === "dark"

    return (
        <Button
            size='sm'
            variant='flat'
            isIconOnly
            radius='full'
            onPress={() => setTheme(isDark ? "light" : "dark")}
        >
            {isDark ? (
                <SunIcon className='text-zinc-500 size-5' />
            ) : (
                <MoonIcon className='text-zinc-500 size-5' />
            )}
        </Button>
    )
}
