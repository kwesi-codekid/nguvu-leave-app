import { useState } from "react"
import {
    Button,
    Select,
    SelectItem,
    Card,
    CardBody,
    Chip,
    Spinner,
    addToast,
} from "@heroui/react"
import { TrendingUp, AlertTriangle } from "lucide-react"
import axios from "axios"

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

interface PatternsViewProps {
    baseUrl: string
    token: string
    isHRorAdmin: boolean
}

export function PatternsView({ baseUrl, token, isHRorAdmin }: PatternsViewProps) {
    const [patternScope, setPatternScope] = useState("department")
    const [patterns, setPatterns] = useState<PatternAnalysis | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const handleAnalyzePatterns = async () => {
        setIsLoading(true)
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
            setIsLoading(false)
        }
    }

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

    const renderDirectionBadge = (direction: string) => {
        const colors: Record<string, "success" | "danger" | "default"> = {
            increasing: "success",
            decreasing: "danger",
            stable: "default",
        }
        return (
            <Chip size="sm" color={colors[direction] || "default"} variant="flat">
                {direction}
            </Chip>
        )
    }

    return (
        <div className="p-6 space-y-6">
            {/* Controls */}
            <Card>
                <CardBody className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="size-5 text-warning" />
                        Pattern Analysis
                    </h3>
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
                                <SelectItem key={item.key}>{item.label}</SelectItem>
                            ))}
                        </Select>
                        <Button
                            color="warning"
                            onPress={handleAnalyzePatterns}
                            isLoading={isLoading}
                            startContent={!isLoading && <TrendingUp className="size-4" />}
                        >
                            Analyze Patterns
                        </Button>
                    </div>
                </CardBody>
            </Card>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <Spinner size="lg" />
                        <p className="text-sm text-zinc-500 mt-4">
                            Analyzing leave patterns and detecting anomalies...
                        </p>
                    </div>
                </div>
            )}

            {/* Results */}
            {patterns && !isLoading && (
                <div className="space-y-6">
                    {/* Summary */}
                    <Card className="bg-warning-50 dark:bg-warning-900/20">
                        <CardBody className="p-6">
                            <h4 className="font-semibold mb-2">Summary</h4>
                            <p className="text-sm">{patterns.summary}</p>
                        </CardBody>
                    </Card>

                    {/* Patterns */}
                    {patterns.patterns.length > 0 && (
                        <div>
                            <h4 className="font-semibold mb-4">Identified Patterns</h4>
                            <div className="grid gap-4">
                                {patterns.patterns.map((pattern, idx) => (
                                    <Card key={idx}>
                                        <CardBody className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Chip size="sm" variant="flat">
                                                            {pattern.type}
                                                        </Chip>
                                                        {renderSignificanceBadge(pattern.significance)}
                                                    </div>
                                                    <p className="text-sm">{pattern.description}</p>
                                                    <p className="text-xs text-zinc-500 mt-2">
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
                            <h4 className="font-semibold mb-4">Trends</h4>
                            <div className="grid gap-4">
                                {patterns.trends.map((trend, idx) => (
                                    <Card key={idx}>
                                        <CardBody className="p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-medium">{trend.trend}</span>
                                                {renderDirectionBadge(trend.direction)}
                                            </div>
                                            <p className="text-sm text-zinc-500">{trend.insight}</p>
                                        </CardBody>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Anomalies */}
                    {patterns.anomalies.length > 0 && (
                        <div>
                            <h4 className="font-semibold mb-4 flex items-center gap-2">
                                <AlertTriangle className="size-5 text-warning" />
                                Anomalies Detected
                            </h4>
                            <div className="grid gap-4">
                                {patterns.anomalies.map((anomaly, idx) => (
                                    <Card
                                        key={idx}
                                        className="border-warning-200 dark:border-warning-800 border"
                                    >
                                        <CardBody className="p-4">
                                            <p className="text-sm font-medium mb-2">
                                                {anomaly.description}
                                            </p>
                                            {anomaly.staffInvolved &&
                                                anomaly.staffInvolved.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                        {anomaly.staffInvolved.map((staff, i) => (
                                                            <Chip key={i} size="sm" variant="flat">
                                                                {staff}
                                                            </Chip>
                                                        ))}
                                                    </div>
                                                )}
                                            <p className="text-sm text-warning-600 dark:text-warning-400">
                                                <strong>Recommended:</strong>{" "}
                                                {anomaly.recommendedAction}
                                            </p>
                                        </CardBody>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {!patterns && !isLoading && (
                <div className="text-center py-12 text-zinc-500">
                    <TrendingUp className="size-12 mx-auto mb-4 opacity-50" />
                    <p>Select a scope and click analyze to discover leave patterns and anomalies</p>
                </div>
            )}
        </div>
    )
}

export default PatternsView
