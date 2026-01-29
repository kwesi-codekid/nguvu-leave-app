import { Button, Skeleton } from "@heroui/react"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export const ThemeSwitcher = () => {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return <Skeleton className='size-8 rounded-full' />

    return (
        <Button
            size='sm'
            variant='flat'
            isIconOnly
            radius='full'
            onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
            {theme !== "dark" ? (
                <MoonIcon className='text-zinc-500 size-5' />
            ) : (
                <SunIcon className='text-zinc-500 size-5' />
            )}
        </Button>
    )
}
