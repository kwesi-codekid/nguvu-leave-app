import { motion, AnimatePresence } from "framer-motion"
import type { ReactNode } from "react"
import { X } from "lucide-react"

interface SideDrawerProps {
    isOpen: boolean
    onClose: () => void
    children: ReactNode
    title?: string
    position?: "left" | "right"
    width?: string
}

export function SideDrawer({
    isOpen,
    onClose,
    children,
    title = "Menu",
    position = "right",
    width = "w-80",
}: SideDrawerProps) {
    const slideDirection = position === "right" ? "100%" : "-100%"
    const positionClass = position === "right" ? "right-0" : "left-0"

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className='fixed inset-0 z-40 backdrop-blur-sm bg-black/20'
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: slideDirection }}
                        animate={{ x: 0 }}
                        exit={{ x: slideDirection }}
                        transition={{
                            type: "tween",
                            duration: 0.4,
                        }}
                        className={`fixed ${positionClass} top-0 z-50 h-full ${width} bg-blue-900 dark:bg-zinc-950 dark:border-r dark:border-zinc-800 p-4 shadow-2xl`}
                    >
                        <div className='flex h-full flex-col pt-10'>
                            {/* Content */}
                            <div className='mt-8 flex-1 overflow-y-auto'>
                                {children}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
