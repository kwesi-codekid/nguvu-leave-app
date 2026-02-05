import { useState, useRef, useEffect } from "react"
import { Button, Textarea } from "@heroui/react"
import { Send, Loader2 } from "lucide-react"

interface ChatInputProps {
    onSend: (message: string) => void
    isLoading?: boolean
    placeholder?: string
    disabled?: boolean
}

export function ChatInput({
    onSend,
    isLoading = false,
    placeholder = "Type a message...",
    disabled = false,
}: ChatInputProps) {
    const [message, setMessage] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const handleSend = () => {
        if (!message.trim() || isLoading || disabled) return
        onSend(message.trim())
        setMessage("")
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Auto-focus on mount
    useEffect(() => {
        if (!disabled && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [disabled])

    return (
        <div className="flex items-end gap-2 p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isLoading || disabled}
                minRows={1}
                maxRows={5}
                classNames={{
                    base: "flex-1",
                    inputWrapper: "bg-zinc-100 dark:bg-zinc-800 border-none shadow-none",
                    input: "text-sm",
                }}
            />
            <Button
                isIconOnly
                color="warning"
                onPress={handleSend}
                isDisabled={!message.trim() || isLoading || disabled}
                className="h-10 w-10 bg-warning/70"
            >
                {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                ) : (
                    <Send className="size-4" />
                )}
            </Button>
        </div>
    )
}

export default ChatInput
