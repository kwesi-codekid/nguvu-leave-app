import { useState } from "react"
import { Button, Tooltip } from "@heroui/react"
import { Bot, Sparkles } from "lucide-react"
import { AIAssistant } from "./ai-assistant"

interface AIButtonProps {
    baseUrl: string
    token: string
    userPermissions: string[]
    variant?: "floating" | "navbar"
}

export function AIButton({
    baseUrl,
    token,
    userPermissions,
    variant = "floating",
}: AIButtonProps) {
    const [isOpen, setIsOpen] = useState(false)

    if (variant === "floating") {
        return (
            <>
                <Tooltip content="AI Assistant" placement="left">
                    <Button
                        isIconOnly
                        color="secondary"
                        variant="shadow"
                        size="lg"
                        className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg hover:scale-110 transition-transform"
                        onPress={() => setIsOpen(true)}
                    >
                        <Bot className="size-6" />
                    </Button>
                </Tooltip>

                <AIAssistant
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    baseUrl={baseUrl}
                    token={token}
                    userPermissions={userPermissions}
                />
            </>
        )
    }

    return (
        <>
            <Tooltip content="AI Assistant">
                <Button
                    isIconOnly
                    variant="flat"
                    size="sm"
                    onPress={() => setIsOpen(true)}
                    className="relative"
                >
                    <Bot className="size-5" />
                    <span className="absolute -top-1 -right-1 size-2 bg-secondary rounded-full animate-pulse" />
                </Button>
            </Tooltip>

            <AIAssistant
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                baseUrl={baseUrl}
                token={token}
                userPermissions={userPermissions}
            />
        </>
    )
}

export default AIButton
