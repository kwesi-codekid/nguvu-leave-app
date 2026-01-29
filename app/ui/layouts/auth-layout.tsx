import logo from "~/assets/images/nguvu-white-gold.png"
import authBg from "~/assets/images/nguvu-elephant.jpg"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Button, Skeleton } from "@heroui/react"
import { MoonIcon, SunIcon } from "lucide-react"

export default function AuthLayout({
    children,
    title,
    description,
}: {
    children: React.ReactNode
    title: string
    description: string
}) {
    const { theme, setTheme } = useTheme()
    const [isLoaded, setIsLoaded] = useState(false)
    useEffect(() => {
        setIsLoaded(true)
    }, [])

    return (
        <div className='h-screen flex flex-col lg:flex-row dark:bg-zinc-950'>
            <div
                className='w-full lg:w-1/2 bg-blue-500 p-6 flex flex-col h-[25%] md:h-[35%] lg:h-auto'
                style={{
                    background: `linear-gradient(to bottom, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.9)), url(${authBg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div className='flex items-center lg:items-start justify-between'>
                    <img
                        src={logo}
                        className='lg:h-20 md:h-16 h-8'
                        alt='logo'
                    />

                    {isLoaded ? (
                        <Button
                            isIconOnly
                            startContent={
                                theme === "dark" ? (
                                    <SunIcon className='size-4' />
                                ) : (
                                    <MoonIcon className='size-4' />
                                )
                            }
                            variant='flat'
                            size='sm'
                            radius='full'
                            onPress={() =>
                                setTheme(theme === "dark" ? "light" : "dark")
                            }
                        ></Button>
                    ) : (
                        <Skeleton className='size-8 rounded-lg' />
                    )}
                </div>

                <div className='flex-1 flex flex-col justify-center items-center'>
                    <h2 className='font-semibold text-white text-3xl md:text-4xl lg:text-5xl text-center'>
                        Leave Management System
                    </h2>
                </div>
            </div>

            <div className='flex-1 flex flex-col justify-center items-center'>
                <div className='w-full md:w-[60%] xl:w-[50%]  p-5  rounded-2xl '>
                    <div className='lg:mb-10 mb-6 flex flex-col gap-2'>
                        <h1 className='font-bold text-4xl md:text-5xl'>
                            {title}
                        </h1>
                        <p className='text-gray-500 text-xs md:text-base'>
                            {description}
                        </p>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    )
}
