import { useState } from "react"
import {
    Button,
    Select,
    SelectItem,
    Input,
    Card,
    CardBody,
    Chip,
    Divider,
    Spinner,
    addToast,
} from "@heroui/react"
import {
    Sparkles,
    Calendar,
    Lightbulb,
    AlertTriangle,
    ChevronRight,
} from "lucide-react"
import axios from "axios"

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

interface RecommendationsViewProps {
    baseUrl: string
    token: string
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

export function RecommendationsView({ baseUrl, token }: RecommendationsViewProps) {
    const [selectedLeaveType, setSelectedLeaveType] = useState("")
    const [selectedMonth, setSelectedMonth] = useState("")
    const [numberOfDays, setNumberOfDays] = useState("5")
    const [recommendations, setRecommendations] = useState<LeaveRecommendation | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const handleGetRecommendations = async () => {
        if (!selectedLeaveType) {
            addToast({
                title: "Error",
                description: "Please select a leave type",
                color: "warning",
            })
            return
        }

        setIsLoading(true)
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
            setIsLoading(false)
        }
    }

    return (
        <div className="p-6 space-y-6">
            {/* Form */}
            <Card>
                <CardBody className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Sparkles className="size-5 text-warning" />
                        Get Smart Leave Recommendations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <Select
                            label="Leave Type"
                            placeholder="Select leave type"
                            selectedKeys={selectedLeaveType ? [selectedLeaveType] : []}
                            onSelectionChange={(keys) =>
                                setSelectedLeaveType(Array.from(keys)[0] as string)
                            }
                            isRequired
                        >
                            {leaveTypes.map((type) => (
                                <SelectItem key={type.value}>{type.label}</SelectItem>
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
                                <SelectItem key={month.value}>{month.label}</SelectItem>
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
                        color="warning"
                        className="bg-warning/70"
                        onPress={handleGetRecommendations}
                        isLoading={isLoading}
                        startContent={!isLoading && <Sparkles className="size-4" />}
                    >
                        Get Smart Recommendations
                    </Button>
                </CardBody>
            </Card>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <Spinner size="lg" />
                        <p className="text-sm text-zinc-500 mt-4">
                            Analyzing your leave patterns and team schedules...
                        </p>
                    </div>
                </div>
            )}

            {/* Results */}
            {recommendations && !isLoading && (
                <div className="space-y-6">
                    {/* Suggested Dates */}
                    <div>
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                            <Calendar className="size-5 text-warning" />
                            Suggested Dates
                        </h4>
                        <div className="grid gap-4">
                            {recommendations.suggestedDates.map((date, idx) => (
                                <Card
                                    key={idx}
                                    className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                                >
                                    <CardBody className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="font-medium text-lg">
                                                    {new Date(date.startDate).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            weekday: "short",
                                                            month: "short",
                                                            day: "numeric",
                                                        }
                                                    )}{" "}
                                                    -{" "}
                                                    {new Date(date.endDate).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            weekday: "short",
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        }
                                                    )}
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
                                                size="lg"
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
                            <h4 className="font-semibold mb-4 flex items-center gap-2">
                                <Lightbulb className="size-5 text-warning" />
                                Insights
                            </h4>
                            <ul className="space-y-3">
                                {recommendations.insights.map((insight, idx) => (
                                    <li key={idx} className="flex items-start gap-3">
                                        <ChevronRight className="size-4 text-warning mt-1 flex-shrink-0" />
                                        <span className="text-sm">{insight}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Warnings */}
                    {recommendations.warnings.length > 0 && (
                        <div>
                            <h4 className="font-semibold mb-4 flex items-center gap-2">
                                <AlertTriangle className="size-5 text-warning" />
                                Warnings
                            </h4>
                            <ul className="space-y-3">
                                {recommendations.warnings.map((warning, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-start gap-3 text-warning-600 dark:text-warning-400"
                                    >
                                        <AlertTriangle className="size-4 mt-1 flex-shrink-0" />
                                        <span className="text-sm">{warning}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {!recommendations && !isLoading && (
                <div className="text-center py-12 text-zinc-500">
                    <Calendar className="size-12 mx-auto mb-4 opacity-50" />
                    <p>Select your preferences and click the button to get personalized leave recommendations</p>
                </div>
            )}
        </div>
    )
}

export default RecommendationsView
