import { Avatar } from "@heroui/react"
import { Bot, User } from "lucide-react"
import { DateTime } from "luxon"

interface ChatMessageProps {
    role: "user" | "assistant"
    content: string
    timestamp?: Date | string
    userName?: string
}

export function ChatMessage({ role, content, timestamp, userName }: ChatMessageProps) {
    const isUser = role === "user"

    const formattedTime = timestamp
        ? DateTime.fromJSDate(
            typeof timestamp === "string" ? new Date(timestamp) : timestamp
        ).toFormat("h:mm a")
        : null

    return (
        <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
            {/* Avatar */}
            <div className="flex-shrink-0">
                {isUser ? (
                    <Avatar
                        name={userName || "User"}
                        size="sm"
                        className="bg-warning/70 text-white"
                    />
                ) : (
                    <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
                        <Bot className="size-4 text-white" />
                    </div>
                )}
            </div>

            {/* Message Content */}
            <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[80%]`}>
                <div
                    className={`rounded-2xl px-4 py-2.5 ${
                        isUser
                            ? "bg-warning/70 text-white rounded-tr-sm"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-sm"
                    }`}
                >
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {content}
                    </p>
                </div>
                {formattedTime && (
                    <span className="text-[10px] text-zinc-400 mt-1 px-1">
                        {formattedTime}
                    </span>
                )}
            </div>
        </div>
    )
}

export default ChatMessage
