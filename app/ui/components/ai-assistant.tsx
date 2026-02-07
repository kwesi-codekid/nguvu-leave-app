import { useState, useRef, useEffect } from "react"
import {
    Button,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    Input,
    Spinner,
    ScrollShadow,
    Tabs,
    Tab,
    Card,
    CardBody,
    Select,
    SelectItem,
    Chip,
    Divider,
    addToast,
    Textarea,
} from "@heroui/react"
import {
    Bot,
    Send,
    Sparkles,
    TrendingUp,
    Calendar,
    Search,
    FileText,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Lightbulb,
    MessageSquare,
    X,
    ChevronRight,
} from "lucide-react"
import axios from "axios"

interface AIAssistantProps {
    isOpen: boolean
    onClose: () => void
    baseUrl: string
    token: string
    userPermissions: string[]
}

interface ChatMessage {
    role: "user" | "assistant"
    content: string
}

interface LeaveRecommendation {
    suggestedDates: Array<{
        startDate: string
        endDate: string
        reason: string
        score: number
    }>
    insights: string[]
    warnings: string[]
}

interface PatternAnalysis {
    patterns: Array<{
        type: string
        description: string
        frequency: string
        significance: "low" | "medium" | "high"
    }>
    anomalies: Array<{
        description: string
        staffInvolved?: string[]
        recommendedAction: string
    }>
    trends: Array<{
        trend: string
        direction: "increasing" | "decreasing" | "stable"
        insight: string
    }>
    summary: string
}

interface NLQueryResult {
    interpretation: string
    data: any[]
    summary: string
    visualizationType?: string
    followUpQuestions?: string[]
}

const leaveTypes = [
    { value: "annual", label: "Annual Leave" },
    { value: "sick", label: "Sick Leave" },
    { value: "casual", label: "Casual Leave" },
    { value: "maternity", label: "Maternity Leave" },
    { value: "paternity", label: "Paternity Leave" },
    { value: "study", label: "Study Leave" },
    { value: "compassionate", label: "Compassionate Leave" },
]

const months = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
]

export function AIAssistant({
    isOpen,
    onClose,
    baseUrl,
    token,
    userPermissions,
}: AIAssistantProps) {
    const [activeTab, setActiveTab] = useState("chat")

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputMessage, setInputMessage] = useState("")
    const [isSending, setIsSending] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)

    // Recommendations state
    const [selectedLeaveType, setSelectedLeaveType] = useState("")
    const [selectedMonth, setSelectedMonth] = useState("")
    const [numberOfDays, setNumberOfDays] = useState("5")
    const [recommendations, setRecommendations] = useState<LeaveRecommendation | null>(null)
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false)

    // Patterns state
    const [patternScope, setPatternScope] = useState("company")
    const [patterns, setPatterns] = useState<PatternAnalysis | null>(null)
    const [isLoadingPatterns, setIsLoadingPatterns] = useState(false)

    // Natural Language Query state
    const [nlQuery, setNlQuery] = useState("")
    const [queryResult, setQueryResult] = useState<NLQueryResult | null>(null)
    const [isLoadingQuery, setIsLoadingQuery] = useState(false)

    const isHRorAdmin = userPermissions.includes("HR") || userPermissions.includes("ADMIN")
    const isManager = userPermissions.includes("MANAGER")

    // Scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    // Send chat message
    const handleSendMessage = async () => {
        if (!inputMessage.trim() || isSending) return

        const userMessage = inputMessage.trim()
        setInputMessage("")
        setMessages((prev) => [...prev, { role: "user", content: userMessage }])
        setIsSending(true)

        try {
            const response = await axios.post(
                `${baseUrl}/ai?op=chat`,
                {
                    message: userMessage,
                    conversationHistory: messages,
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (response.data.status === "success") {
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: response.data.data.response },
                ])
            } else {
                throw new Error(response.data.message)
            }
        } catch (error: any) {
            console.error("Chat error:", error)
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Sorry, I encountered an error. Please try again.",
                },
            ])
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to get response",
                color: "danger",
            })
        } finally {
            setIsSending(false)
        }
    }

    // Get leave recommendations
    const handleGetRecommendations = async () => {
        if (!selectedLeaveType) {
            addToast({
                title: "Error",
                description: "Please select a leave type",
                color: "warning",
            })
            return
        }

        setIsLoadingRecommendations(true)
        try {
            const response = await axios.post(
                `${baseUrl}/ai?op=recommendations`,
                {
                    leaveType: selectedLeaveType,
                    preferredMonth: selectedMonth || undefined,
                    numberOfDays: numberOfDays || "5",
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (response.data.status === "success") {
                setRecommendations(response.data.data)
            } else {
                throw new Error(response.data.message)
            }
        } catch (error: any) {
            console.error("Recommendations error:", error)
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to get recommendations",
                color: "danger",
            })
        } finally {
            setIsLoadingRecommendations(false)
        }
    }

    // Analyze patterns
    const handleAnalyzePatterns = async () => {
        setIsLoadingPatterns(true)
        try {
            const response = await axios.get(
                `${baseUrl}/ai?op=patterns&scope=${patternScope}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (response.data.status === "success") {
                setPatterns(response.data.data)
            } else {
                throw new Error(response.data.message)
            }
        } catch (error: any) {
            console.error("Patterns error:", error)
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to analyze patterns",
                color: "danger",
            })
        } finally {
            setIsLoadingPatterns(false)
        }
    }

    // Process natural language query
    const handleNLQuery = async () => {
        if (!nlQuery.trim()) {
            addToast({
                title: "Error",
                description: "Please enter a query",
                color: "warning",
            })
            return
        }

        setIsLoadingQuery(true)
        try {
            const response = await axios.post(
                `${baseUrl}/ai?op=query`,
                { query: nlQuery.trim() },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (response.data.status === "success") {
                setQueryResult(response.data.data)
            } else {
                throw new Error(response.data.message)
            }
        } catch (error: any) {
            console.error("Query error:", error)
            addToast({
                title: "Error",
                description: error.response?.data?.message || "Failed to process query",
                color: "danger",
            })
        } finally {
            setIsLoadingQuery(false)
        }
    }

    // Render significance badge
    const renderSignificanceBadge = (significance: string) => {
        const colors: Record<string, "success" | "warning" | "danger"> = {
            low: "success",
            medium: "warning",
            high: "danger",
        }
        return (
            <Chip size="sm" color={colors[significance] || "default"} variant="flat">
                {significance}
            </Chip>
        )
    }

    // Render direction badge
    const renderDirectionBadge = (direction: string) => {
        const colors: Record<string, "success" | "danger" | "default"> = {
            increasing: "success",
            decreasing: "danger",
            stable: "default",
        }
        const icons: Record<string, string> = {
            increasing: "up",
            decreasing: "down",
            stable: "~",
        }
        return (
            <Chip size="sm" color={colors[direction] || "default"} variant="flat">
                {direction}
            </Chip>
        )
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="4xl"
            scrollBehavior="inside"
            classNames={{
                base: "max-h-[90vh]",
            }}
        >
            <ModalContent>
                <ModalHeader className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
                    <Bot className="size-6 text-primary" />
                    <span>AI Assistant</span>
                    <Chip size="sm" color="secondary" variant="flat" className="ml-2">
                        Powered by Gemini
                    </Chip>
                </ModalHeader>
                <ModalBody className="p-0">
                    <Tabs
                        aria-label="AI Features"
                        selectedKey={activeTab}
                        onSelectionChange={(key) => setActiveTab(key as string)}
                        classNames={{
                            tabList: "px-4 pt-4",
                            panel: "p-0",
                        }}
                    >
                        {/* Chat Tab */}
                        <Tab
                            key="chat"
                            title={
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="size-4" />
                                    <span>Chat</span>
                                </div>
                            }
                        >
                            <div className="flex flex-col h-[500px]">
                                {/* Messages */}
                                <ScrollShadow className="flex-1 p-4">
                                    {messages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                            <Bot className="size-16 mb-4 opacity-50" />
                                            <p className="text-lg font-medium">
                                                Ask me anything about leave management
                                            </p>
                                            <p className="text-sm mt-2">
                                                I can help with policies, patterns, and recommendations
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
                                                {[
                                                    "What are common leave patterns?",
                                                    "How do I request leave?",
                                                    "What's the sick leave policy?",
                                                ].map((suggestion) => (
                                                    <Button
                                                        key={suggestion}
                                                        size="sm"
                                                        variant="flat"
                                                        onPress={() => {
                                                            setInputMessage(suggestion)
                                                        }}
                                                    >
                                                        {suggestion}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {messages.map((msg, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`flex ${
                                                        msg.role === "user"
                                                            ? "justify-end"
                                                            : "justify-start"
                                                    }`}
                                                >
                                                    <div
                                                        className={`max-w-[80%] rounded-xl px-4 py-2 ${
                                                            msg.role === "user"
                                                                ? "bg-primary text-white"
                                                                : "bg-zinc-100 dark:bg-zinc-800"
                                                        }`}
                                                    >
                                                        <p className="text-sm whitespace-pre-wrap">
                                                            {msg.content}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            {isSending && (
                                                <div className="flex justify-start">
                                                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl px-4 py-2">
                                                        <Spinner size="sm" />
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={chatEndRef} />
                                        </div>
                                    )}
                                </ScrollShadow>

                                {/* Input */}
                                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                                    <div className="flex gap-2">
                                        <Input
                                            value={inputMessage}
                                            onChange={(e) => setInputMessage(e.target.value)}
                                            placeholder="Ask about leave policies, patterns, or get help..."
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault()
                                                    handleSendMessage()
                                                }
                                            }}
                                            disabled={isSending}
                                        />
                                        <Button
                                            isIconOnly
                                            color="primary"
                                            onPress={handleSendMessage}
                                            isLoading={isSending}
                                            disabled={!inputMessage.trim()}
                                        >
                                            <Send className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Tab>

                        {/* Recommendations Tab */}
                        <Tab
                            key="recommendations"
                            title={
                                <div className="flex items-center gap-2">
                                    <Calendar className="size-4" />
                                    <span>Recommendations</span>
                                </div>
                            }
                        >
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Select
                                        label="Leave Type"
                                        placeholder="Select leave type"
                                        selectedKeys={selectedLeaveType ? [selectedLeaveType] : []}
                                        onSelectionChange={(keys) =>
                                            setSelectedLeaveType(Array.from(keys)[0] as string)
                                        }
                                    >
                                        {leaveTypes.map((type) => (
                                            <SelectItem key={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                    <Select
                                        label="Preferred Month (Optional)"
                                        placeholder="Any month"
                                        selectedKeys={selectedMonth ? [selectedMonth] : []}
                                        onSelectionChange={(keys) =>
                                            setSelectedMonth(Array.from(keys)[0] as string)
                                        }
                                    >
                                        {months.map((month) => (
                                            <SelectItem key={month.value}>
                                                {month.label}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                    <Input
                                        type="number"
                                        label="Number of Days"
                                        value={numberOfDays}
                                        onChange={(e) => setNumberOfDays(e.target.value)}
                                        min={1}
                                        max={30}
                                    />
                                </div>
                                <Button
                                    color="primary"
                                    onPress={handleGetRecommendations}
                                    isLoading={isLoadingRecommendations}
                                    startContent={<Sparkles className="size-4" />}
                                >
                                    Get Smart Recommendations
                                </Button>

                                {recommendations && (
                                    <div className="space-y-4 mt-4">
                                        {/* Suggested Dates */}
                                        <div>
                                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                <Calendar className="size-4 text-primary" />
                                                Suggested Dates
                                            </h4>
                                            <div className="grid gap-3">
                                                {recommendations.suggestedDates.map((date, idx) => (
                                                    <Card key={idx} className="bg-zinc-50 dark:bg-zinc-900">
                                                        <CardBody className="p-4">
                                                            <div className="flex items-start justify-between">
                                                                <div>
                                                                    <p className="font-medium">
                                                                        {new Date(date.startDate).toLocaleDateString()} - {new Date(date.endDate).toLocaleDateString()}
                                                                    </p>
                                                                    <p className="text-sm text-zinc-500 mt-1">
                                                                        {date.reason}
                                                                    </p>
                                                                </div>
                                                                <Chip
                                                                    color={
                                                                        date.score >= 80
                                                                            ? "success"
                                                                            : date.score >= 60
                                                                            ? "warning"
                                                                            : "default"
                                                                    }
                                                                    variant="flat"
                                                                >
                                                                    Score: {date.score}
                                                                </Chip>
                                                            </div>
                                                        </CardBody>
                                                    </Card>
                                                ))}
                                            </div>
                                        </div>

                                        <Divider />

                                        {/* Insights */}
                                        {recommendations.insights.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                    <Lightbulb className="size-4 text-warning" />
                                                    Insights
                                                </h4>
                                                <ul className="space-y-2">
                                                    {recommendations.insights.map((insight, idx) => (
                                                        <li
                                                            key={idx}
                                                            className="flex items-start gap-2 text-sm"
                                                        >
                                                            <ChevronRight className="size-4 text-primary mt-0.5 flex-shrink-0" />
                                                            {insight}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Warnings */}
                                        {recommendations.warnings.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                    <AlertTriangle className="size-4 text-warning" />
                                                    Warnings
                                                </h4>
                                                <ul className="space-y-2">
                                                    {recommendations.warnings.map((warning, idx) => (
                                                        <li
                                                            key={idx}
                                                            className="flex items-start gap-2 text-sm text-warning"
                                                        >
                                                            <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
                                                            {warning}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Tab>

                        {/* Pattern Analysis Tab - Only for HR/Admin/Manager */}
                        {(isHRorAdmin || isManager) && (
                            <Tab
                                key="patterns"
                                title={
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="size-4" />
                                        <span>Patterns</span>
                                    </div>
                                }
                            >
                                <div className="p-4 space-y-4">
                                    <div className="flex items-end gap-4">
                                        <Select
                                            label="Analysis Scope"
                                            selectedKeys={[patternScope]}
                                            onSelectionChange={(keys) =>
                                                setPatternScope(Array.from(keys)[0] as string)
                                            }
                                            className="max-w-xs"
                                        >
                                            {[
                                                ...(isHRorAdmin
                                                    ? [{ key: "company", label: "Company-wide" }]
                                                    : []),
                                                { key: "department", label: "Department" },
                                                { key: "staff", label: "Individual Staff" },
                                            ].map((item) => (
                                                <SelectItem key={item.key}>
                                                    {item.label}
                                                </SelectItem>
                                            ))}
                                        </Select>
                                        <Button
                                            color="primary"
                                            onPress={handleAnalyzePatterns}
                                            isLoading={isLoadingPatterns}
                                            startContent={<TrendingUp className="size-4" />}
                                        >
                                            Analyze Patterns
                                        </Button>
                                    </div>

                                    {patterns && (
                                        <div className="space-y-6 mt-4">
                                            {/* Summary */}
                                            <Card className="bg-primary-50 dark:bg-primary-900/20">
                                                <CardBody className="p-4">
                                                    <h4 className="font-semibold mb-2">Summary</h4>
                                                    <p className="text-sm">{patterns.summary}</p>
                                                </CardBody>
                                            </Card>

                                            {/* Patterns */}
                                            {patterns.patterns.length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold mb-3">Identified Patterns</h4>
                                                    <div className="grid gap-3">
                                                        {patterns.patterns.map((pattern, idx) => (
                                                            <Card key={idx}>
                                                                <CardBody className="p-4">
                                                                    <div className="flex items-start justify-between">
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <Chip size="sm" variant="flat">
                                                                                    {pattern.type}
                                                                                </Chip>
                                                                                {renderSignificanceBadge(pattern.significance)}
                                                                            </div>
                                                                            <p className="text-sm">{pattern.description}</p>
                                                                            <p className="text-xs text-zinc-500 mt-1">
                                                                                Frequency: {pattern.frequency}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </CardBody>
                                                            </Card>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Trends */}
                                            {patterns.trends.length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold mb-3">Trends</h4>
                                                    <div className="grid gap-3">
                                                        {patterns.trends.map((trend, idx) => (
                                                            <Card key={idx}>
                                                                <CardBody className="p-4">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-medium">{trend.trend}</span>
                                                                        {renderDirectionBadge(trend.direction)}
                                                                    </div>
                                                                    <p className="text-sm text-zinc-500">
                                                                        {trend.insight}
                                                                    </p>
                                                                </CardBody>
                                                            </Card>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Anomalies */}
                                            {patterns.anomalies.length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                        <AlertTriangle className="size-4 text-warning" />
                                                        Anomalies Detected
                                                    </h4>
                                                    <div className="grid gap-3">
                                                        {patterns.anomalies.map((anomaly, idx) => (
                                                            <Card key={idx} className="border-warning border">
                                                                <CardBody className="p-4">
                                                                    <p className="text-sm font-medium">
                                                                        {anomaly.description}
                                                                    </p>
                                                                    {anomaly.staffInvolved && anomaly.staffInvolved.length > 0 && (
                                                                        <div className="flex gap-1 mt-2">
                                                                            {anomaly.staffInvolved.map((staff, i) => (
                                                                                <Chip key={i} size="sm" variant="flat">
                                                                                    {staff}
                                                                                </Chip>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <p className="text-sm text-warning mt-2">
                                                                        Recommended: {anomaly.recommendedAction}
                                                                    </p>
                                                                </CardBody>
                                                            </Card>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Tab>
                        )}

                        {/* Natural Language Query Tab */}
                        <Tab
                            key="query"
                            title={
                                <div className="flex items-center gap-2">
                                    <Search className="size-4" />
                                    <span>Query</span>
                                </div>
                            }
                        >
                            <div className="p-4 space-y-4">
                                <div className="space-y-2">
                                    <Textarea
                                        label="Ask a question about leave data"
                                        placeholder="e.g., Show me staff who haven't taken leave in 6 months"
                                        value={nlQuery}
                                        onChange={(e) => setNlQuery(e.target.value)}
                                        minRows={2}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            "Who's on leave next week?",
                                            "Show me pending requests",
                                            "Department leave statistics",
                                            "Staff who haven't taken leave",
                                        ].map((example) => (
                                            <Button
                                                key={example}
                                                size="sm"
                                                variant="flat"
                                                onPress={() => setNlQuery(example)}
                                            >
                                                {example}
                                            </Button>
                                        ))}
                                    </div>
                                    <Button
                                        color="primary"
                                        onPress={handleNLQuery}
                                        isLoading={isLoadingQuery}
                                        startContent={<Search className="size-4" />}
                                    >
                                        Search
                                    </Button>
                                </div>

                                {queryResult && (
                                    <div className="space-y-4 mt-4">
                                        {/* Interpretation */}
                                        <Card className="bg-zinc-50 dark:bg-zinc-900">
                                            <CardBody className="p-4">
                                                <p className="text-sm text-zinc-500">
                                                    <span className="font-medium">Understanding:</span>{" "}
                                                    {queryResult.interpretation}
                                                </p>
                                            </CardBody>
                                        </Card>

                                        {/* Summary */}
                                        <Card>
                                            <CardBody className="p-4">
                                                <p className="text-sm">{queryResult.summary}</p>
                                            </CardBody>
                                        </Card>

                                        {/* Data Results */}
                                        {queryResult.data.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3">
                                                    Results ({queryResult.data.length})
                                                </h4>
                                                <ScrollShadow className="max-h-64">
                                                    <div className="space-y-2">
                                                        {queryResult.data.slice(0, 20).map((item, idx) => (
                                                            <Card key={idx}>
                                                                <CardBody className="p-3">
                                                                    <pre className="text-xs overflow-x-auto">
                                                                        {JSON.stringify(item, null, 2)}
                                                                    </pre>
                                                                </CardBody>
                                                            </Card>
                                                        ))}
                                                        {queryResult.data.length > 20 && (
                                                            <p className="text-sm text-zinc-500 text-center py-2">
                                                                ... and {queryResult.data.length - 20} more results
                                                            </p>
                                                        )}
                                                    </div>
                                                </ScrollShadow>
                                            </div>
                                        )}

                                        {/* Follow-up Questions */}
                                        {queryResult.followUpQuestions && queryResult.followUpQuestions.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">
                                                    Related questions:
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {queryResult.followUpQuestions.map((q, idx) => (
                                                        <Button
                                                            key={idx}
                                                            size="sm"
                                                            variant="flat"
                                                            onPress={() => setNlQuery(q)}
                                                        >
                                                            {q}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Tab>
                    </Tabs>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default AIAssistant
