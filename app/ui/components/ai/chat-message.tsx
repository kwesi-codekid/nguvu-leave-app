import { Avatar } from "@heroui/react"
import { Bot } from "lucide-react"
import { DateTime } from "luxon"
import ReactMarkdown from "react-markdown"

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
            <div className="flex-shrink-0 mt-1">
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
                    className={`rounded-2xl px-4 py-3 ${
                        isUser
                            ? "bg-warning/70 text-white rounded-tr-sm"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-sm"
                    }`}
                >
                    {isUser ? (
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                            {content}
                        </p>
                    ) : (
                        <div className="text-sm break-words leading-relaxed ai-markdown">
                            <ReactMarkdown
                                components={{
                                    h1: ({ children }) => (
                                        <h3 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h3>
                                    ),
                                    h2: ({ children }) => (
                                        <h4 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h4>
                                    ),
                                    h3: ({ children }) => (
                                        <h4 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h4>
                                    ),
                                    h4: ({ children }) => (
                                        <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>
                                    ),
                                    p: ({ children }) => (
                                        <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                                    ),
                                    ul: ({ children }) => (
                                        <ul className="mb-2 last:mb-0 ml-4 list-disc space-y-0.5">{children}</ul>
                                    ),
                                    ol: ({ children }) => (
                                        <ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-0.5">{children}</ol>
                                    ),
                                    li: ({ children }) => (
                                        <li className="leading-relaxed">{children}</li>
                                    ),
                                    strong: ({ children }) => (
                                        <strong className="font-semibold">{children}</strong>
                                    ),
                                    blockquote: ({ children }) => (
                                        <blockquote className="border-l-3 border-secondary/40 pl-3 my-2 text-zinc-600 dark:text-zinc-300 italic">
                                            {children}
                                        </blockquote>
                                    ),
                                    code: ({ children, className }) => {
                                        const isBlock = className?.includes("language-")
                                        if (isBlock) {
                                            return (
                                                <code className="block bg-zinc-200 dark:bg-zinc-700 rounded-lg p-3 my-2 text-xs font-mono overflow-x-auto">
                                                    {children}
                                                </code>
                                            )
                                        }
                                        return (
                                            <code className="bg-zinc-200 dark:bg-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono">
                                                {children}
                                            </code>
                                        )
                                    },
                                    table: ({ children }) => (
                                        <div className="overflow-x-auto my-2 rounded-lg border border-zinc-200 dark:border-zinc-600">
                                            <table className="w-full text-xs">{children}</table>
                                        </div>
                                    ),
                                    thead: ({ children }) => (
                                        <thead className="bg-zinc-200/70 dark:bg-zinc-700">{children}</thead>
                                    ),
                                    th: ({ children }) => (
                                        <th className="px-3 py-1.5 text-left font-semibold border-b border-zinc-200 dark:border-zinc-600">
                                            {children}
                                        </th>
                                    ),
                                    td: ({ children }) => (
                                        <td className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-700">
                                            {children}
                                        </td>
                                    ),
                                    hr: () => (
                                        <hr className="my-3 border-zinc-200 dark:border-zinc-600" />
                                    ),
                                    a: ({ href, children }) => (
                                        <a href={href} className="text-secondary underline underline-offset-2" target="_blank" rel="noopener noreferrer">
                                            {children}
                                        </a>
                                    ),
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        </div>
                    )}
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
