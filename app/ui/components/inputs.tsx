import { Button, Input, InputProps } from "@heroui/react"
import { useNavigate } from "react-router"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useEffect, useState } from "react"

export const TextInput = (props: InputProps) => {
    return (
        <Input
            placeholder=' '
            labelPlacement='outside'
            variant='bordered'
            classNames={{
                input: "focus:ring-0 focus-visible:ring-0 focus:outline-none focus-visible:outline-none",
            }}
            {...props}
        />
    )
}

export const PasswordInput = (props: InputProps) => {
    const [showPassword, setShowPassword] = useState(false)
    return (
        <Input
            placeholder=' '
            labelPlacement='outside'
            variant='bordered'
            type={showPassword ? "text" : "password"}
            classNames={{
                input: "focus:ring-0 focus-visible:ring-0 focus:outline-none focus-visible:outline-none",
            }}
            endContent={
                <Button
                    isIconOnly
                    variant='light'
                    onPress={() => setShowPassword(!showPassword)}
                >
                    {showPassword ? (
                        <EyeIcon className='size-4' />
                    ) : (
                        <EyeOffIcon className='size-4' />
                    )}
                </Button>
            }
            {...props}
        />
    )
}

export const SearchInput = (props: InputProps) => {
    const [search, setSearch] = useState("")
    const navigate = useNavigate()
    
    // Initialize search from URL on mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const initialSearch = urlParams.get("search") || ""
        setSearch(initialSearch)
    }, [])
    
    useEffect(() => {
        // debounce for 1 second
        const timeout = setTimeout(() => {
            const urlParams = new URLSearchParams(window.location.search)
            const currentSearch = urlParams.get("search") || ""
            
            // Only navigate if search actually changed
            if (search !== currentSearch) {
                if (search) {
                    navigate(`?search=${encodeURIComponent(search)}`, {
                        replace: true,
                    })
                } else {
                    // Remove search param if empty
                    urlParams.delete("search")
                    navigate(`${urlParams.toString() ? `?${urlParams.toString()}` : ""}`, {
                        replace: true,
                    })
                }
            }
        }, 1000)
        return () => clearTimeout(timeout)
    }, [search, navigate])
    
    return (
        <Input
            variant='bordered'
            className='max-w-[15rem]'
            classNames={{
                inputWrapper: "border-zinc-200 dark:border-zinc-800",
                input: "focus-visible:outline-none",
            }}
            placeholder='Search staff...'
            value={search}
            onValueChange={setSearch}
            {...props}
        />
    )
}
