import { useState, useEffect, useRef } from "react"
import {
    Button,
    ScrollShadow,
    Spinner,
    addToast,
    Drawer,
    DrawerContent,
    DrawerBody,
} from "@heroui/react"
import { LoaderFunctionArgs, redirect, useLoaderData } from "react-router"
import {
    isAuthenticated as checkAuthenticated,
    getSessionData,
} from "~/auth-session"
import AppLayout from "~/ui/layouts/app-layout"
import useSWR, { mutate } from "swr"
import { fetcher } from "~/ui/lib/fetcher"
import axios from "axios"
import { Bot, Menu, Sparkles } from "lucide-react"
import {
    ChatSidebar,
    ChatMessage,
    ChatInput,
    AIModeTabs,
    RecommendationsView,
    PatternsView,
    SearchView,
} from "~/ui/components/ai"
import type { AIMode } from "~/ui/components/ai"

interface Message {
    role: "user" | "assistant"
    content: string
    timestamp: Date
    metadata?: any
}

interface Conversation {
    _id: string
    title: string
    mode: string
    isPinned: boolean
    lastMessageAt: string
    createdAt: string
    messages?: Message[]
}

export default function AIAssistantPage() {
    const { sessionData, baseUrl } = useLoaderData<typeof loader>()
    const [activeMode, setActiveMode] = useState<AIMode>("chat")
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isSending, setIsSending] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const chatEndRef = useRef<HTMLDivElement>(null)

    const isHRorAdmin =
        sessionData?.user?.permissions?.includes("HR") ||
        sessionData?.user?.permissions?.includes("ADMIN")
    const isManager = sessionData?.user?.permissions?.includes("MANAGER")
    const showPatterns = isHRorAdmin || isManager

    // Fetch conversations
    const conversationsUrl = searchTerm
        ? `${baseUrl}/ai?op=conversations&search=${encodeURIComponent(searchTerm)}`
        : `${baseUrl}/ai?op=conversations`

    const {
        data: conversationsData,
        isLoading: isLoadingConversations,
        mutate: mutateConversations,
    } = useSWR(conversationsUrl, fetcher(sessionData.token as string), {
        revalidateOnFocus: false,
    })

    const conversations: Conversation[] = conversationsData?.data?.conversations || []

    // Fetch single conversation when selected
    const { data: conversationData, isLoading: isLoadingConversation } = useSWR(
        selectedConversationId
            ? `${baseUrl}/ai?op=conversation&id=${selectedConversationId}`
            : null,
        fetcher(sessionData.token as string),
        {
            revalidateOnFocus: false,
        }
    )

    // Update messages when conversation data loads
    useEffect(() => {
        if (conversationData?.data?.messages) {
            setMessages(conversationData.data.messages)
        }
    }, [conversationData])

    // Scroll to bottom when messages change
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    // Handle new chat
    const handleNewChat = async () => {
        setSelectedConversationId(null)
        setMessages([])
        setSidebarOpen(false)
    }

    // Handle conversation selection
    const handleSelectConversation = (id: string) => {
        setSelectedConversationId(id)
        setSidebarOpen(false)
    }

    // Handle search
    const handleSearch = (term: string) => {
        setSearchTerm(term)
    }

    // Handle pin
    const handlePin = async (id: string) => {
        try {
            await axios.post(
                `${baseUrl}/ai?op=pin-conversation`,
                { conversationId: id },
                { headers: { Authorization: `Bearer ${sessionData.token}` } }
            )
            mutateConversations()
        } catch (error: any) {
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to pin conversation",
                color: "danger",
            })
        }
    }

    // Handle delete
    const handleDelete = async (id: string) => {
        try {
            await axios.post(
                `${baseUrl}/ai?op=delete-conversation`,
                { conversationId: id },
                { headers: { Authorization: `Bearer ${sessionData.token}` } }
            )
            mutateConversations()
            if (selectedConversationId === id) {
                setSelectedConversationId(null)
                setMessages([])
            }
            addToast({
                title: "Success",
                description: "Conversation deleted",
                color: "success",
            })
        } catch (error: any) {
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to delete conversation",
                color: "danger",
            })
        }
    }

    // Handle rename
    const handleRename = async (id: string, newTitle: string) => {
        try {
            await axios.post(
                `${baseUrl}/ai?op=rename-conversation`,
                { conversationId: id, title: newTitle },
                { headers: { Authorization: `Bearer ${sessionData.token}` } }
            )
            mutateConversations()
            addToast({
                title: "Success",
                description: "Conversation renamed",
                color: "success",
            })
        } catch (error: any) {
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to rename conversation",
                color: "danger",
            })
        }
    }

    // Handle send message
    const handleSendMessage = async (message: string) => {
        if (!message.trim() || isSending) return

        // Add user message to UI immediately
        const userMessage: Message = {
            role: "user",
            content: message,
            timestamp: new Date(),
        }
        setMessages((prev) => [...prev, userMessage])
        setIsSending(true)

        try {
            const response = await axios.post(
                `${baseUrl}/ai?op=chat`,
                {
                    message,
                    conversationId: selectedConversationId,
                    mode: activeMode,
                },
                { headers: { Authorization: `Bearer ${sessionData.token}` } }
            )

            if (response.data.status === "success") {
                const { response: aiResponse, conversationId, title } = response.data.data

                // Add assistant message
                const assistantMessage: Message = {
                    role: "assistant",
                    content: aiResponse,
                    timestamp: new Date(),
                }
                setMessages((prev) => [...prev, assistantMessage])

                // If this is a new conversation, update the selected ID
                if (!selectedConversationId && conversationId) {
                    setSelectedConversationId(conversationId)
                    mutateConversations()
                }
            } else {
                throw new Error(response.data.message)
            }
        } catch (error: any) {
            console.error("Chat error:", error)
            // Add error message
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Sorry, I encountered an error. Please try again.",
                    timestamp: new Date(),
                },
            ])
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to send message",
                color: "danger",
            })
        } finally {
            setIsSending(false)
        }
    }

    // Render chat empty state
    const renderChatEmptyState = () => (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8">
            <div className="size-20 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <Bot className="size-10 text-secondary" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                How can I help you today?
            </h2>
            <p className="text-sm text-center max-w-md mb-6">
                I can help with leave policies, patterns, recommendations, and answer questions about your leave management.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                    "What are common leave patterns?",
                    "How do I request leave?",
                    "What's the sick leave policy?",
                    "Who's on leave this week?",
                ].map((suggestion) => (
                    <Button
                        key={suggestion}
                        size="sm"
                        variant="flat"
                        onPress={() => handleSendMessage(suggestion)}
                    >
                        {suggestion}
                    </Button>
                ))}
            </div>
        </div>
    )

    // Render chat content
    const renderChatContent = () => (
        <div className="flex flex-col h-full">
            {/* Messages Area */}
            <ScrollShadow className="flex-1 overflow-y-auto p-4">
                {isLoadingConversation ? (
                    <div className="flex items-center justify-center h-full">
                        <Spinner size="lg" />
                    </div>
                ) : messages.length === 0 ? (
                    renderChatEmptyState()
                ) : (
                    <div className="space-y-4 max-w-3xl mx-auto">
                        {messages.map((msg, idx) => (
                            <ChatMessage
                                key={idx}
                                role={msg.role}
                                content={msg.content}
                                timestamp={msg.timestamp}
                                userName={sessionData?.user?.name}
                            />
                        ))}
                        {isSending && (
                            <div className="flex justify-start">
                                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 rounded-tl-sm">
                                    <div className="flex items-center gap-2">
                                        <Spinner size="sm" />
                                        <span className="text-sm text-zinc-500">Thinking...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                )}
            </ScrollShadow>

            {/* Input Area */}
            <div className="max-w-3xl mx-auto w-full">
                <ChatInput
                    onSend={handleSendMessage}
                    isLoading={isSending}
                    placeholder="Ask about leave policies, patterns, or get help..."
                />
            </div>
        </div>
    )

    // Render main content based on active mode
    const renderMainContent = () => {
        switch (activeMode) {
            case "chat":
                return renderChatContent()
            case "search":
                return <SearchView baseUrl={baseUrl} token={sessionData.token as string} />
            case "recommendations":
                return (
                    <RecommendationsView
                        baseUrl={baseUrl}
                        token={sessionData.token as string}
                    />
                )
            case "patterns":
                return (
                    <PatternsView
                        baseUrl={baseUrl}
                        token={sessionData.token as string}
                        isHRorAdmin={isHRorAdmin || false}
                    />
                )
            default:
                return renderChatContent()
        }
    }

    return (
        <AppLayout user={sessionData.user} baseUrl={baseUrl} token={sessionData.token}>
            <div className="flex h-[calc(100vh-3.5rem)] -m-4">
                {/* Desktop Sidebar */}
                <div className="hidden lg:block w-64 flex-shrink-0">
                    <ChatSidebar
                        conversations={conversations}
                        selectedId={selectedConversationId || undefined}
                        onSelect={handleSelectConversation}
                        onNewChat={handleNewChat}
                        onPin={handlePin}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        onSearch={handleSearch}
                        isLoading={isLoadingConversations}
                    />
                </div>

                {/* Mobile Sidebar Drawer */}
                <Drawer
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    placement="left"
                    size="xs"
                >
                    <DrawerContent>
                        <DrawerBody className="p-0">
                            <ChatSidebar
                                conversations={conversations}
                                selectedId={selectedConversationId || undefined}
                                onSelect={handleSelectConversation}
                                onNewChat={handleNewChat}
                                onPin={handlePin}
                                onDelete={handleDelete}
                                onRename={handleRename}
                                onSearch={handleSearch}
                                isLoading={isLoadingConversations}
                            />
                        </DrawerBody>
                    </DrawerContent>
                </Drawer>

                {/* Main Content */}
                <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
                    {/* Header with Mobile Menu Button and Mode Tabs */}
                    <div className="flex items-center gap-2 px-4 pt-2 lg:pt-4 border-b border-zinc-200 dark:border-zinc-800">
                        <Button
                            isIconOnly
                            variant="flat"
                            size="sm"
                            className="lg:hidden"
                            onPress={() => setSidebarOpen(true)}
                        >
                            <Menu className="size-5" />
                        </Button>
                        <div className="flex-1">
                            <AIModeTabs
                                activeMode={activeMode}
                                onModeChange={setActiveMode}
                                showPatterns={showPatterns}
                            />
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden">{renderMainContent()}</div>
                </div>
            </div>
        </AppLayout>
    )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const authenticated = await checkAuthenticated(request)
    if (!authenticated) {
        return redirect("/")
    }
    const sessionData = await getSessionData(request)
    const baseUrl = process.env.BASE_URL as string
    return { sessionData, baseUrl }
}
