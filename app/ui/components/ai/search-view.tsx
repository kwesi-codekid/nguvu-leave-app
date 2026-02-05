import { useState } from "react"
import {
    Button,
    Textarea,
    Card,
    CardBody,
    Chip,
    ScrollShadow,
    Spinner,
    addToast,
} from "@heroui/react"
import { Search } from "lucide-react"
import axios from "axios"

interface NLQueryResult {
    interpretation: string
    data: any[]
    summary: string
    visualizationType?: string
    followUpQuestions?: string[]
}

interface SearchViewProps {
    baseUrl: string
    token: string
}

export function SearchView({ baseUrl, token }: SearchViewProps) {
    const [nlQuery, setNlQuery] = useState("")
    const [queryResult, setQueryResult] = useState<NLQueryResult | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const handleNLQuery = async (query?: string) => {
        const searchQuery = query || nlQuery
        if (!searchQuery.trim()) {
            addToast({
                title: "Error",
                description: "Please enter a query",
                color: "warning",
            })
            return
        }

        setIsLoading(true)
        try {
            const response = await axios.post(
                `${baseUrl}/ai?op=query`,
                { query: searchQuery.trim() },
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
            setIsLoading(false)
        }
    }

    const exampleQueries = [
        "Who's on leave next week?",
        "Show me pending requests",
        "Department leave statistics",
        "Staff who haven't taken leave",
    ]

    return (
        <div className="p-6 space-y-6">
            {/* Search Input */}
            <Card>
                <CardBody className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Search className="size-5 text-primary" />
                        Natural Language Search
                    </h3>
                    <div className="space-y-4">
                        <Textarea
                            label="Ask a question about leave data"
                            placeholder="e.g., Show me staff who haven't taken leave in 6 months"
                            value={nlQuery}
                            onChange={(e) => setNlQuery(e.target.value)}
                            minRows={2}
                            maxRows={4}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    handleNLQuery()
                                }
                            }}
                        />
                        <div className="flex flex-wrap gap-2">
                            {exampleQueries.map((example) => (
                                <Button
                                    key={example}
                                    size="sm"
                                    variant="flat"
                                    onPress={() => {
                                        setNlQuery(example)
                                        handleNLQuery(example)
                                    }}
                                >
                                    {example}
                                </Button>
                            ))}
                        </div>
                        <Button
                            color="primary"
                            onPress={() => handleNLQuery()}
                            isLoading={isLoading}
                            startContent={!isLoading && <Search className="size-4" />}
                        >
                            Search
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
                            Processing your query...
                        </p>
                    </div>
                </div>
            )}

            {/* Results */}
            {queryResult && !isLoading && (
                <div className="space-y-4">
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
                            <ScrollShadow className="max-h-80">
                                <div className="space-y-2">
                                    {queryResult.data.slice(0, 20).map((item, idx) => (
                                        <Card key={idx}>
                                            <CardBody className="p-3">
                                                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
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
                    {queryResult.followUpQuestions &&
                        queryResult.followUpQuestions.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium mb-3">Related questions:</h4>
                                <div className="flex flex-wrap gap-2">
                                    {queryResult.followUpQuestions.map((q, idx) => (
                                        <Button
                                            key={idx}
                                            size="sm"
                                            variant="flat"
                                            onPress={() => {
                                                setNlQuery(q)
                                                handleNLQuery(q)
                                            }}
                                        >
                                            {q}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                </div>
            )}

            {/* Empty State */}
            {!queryResult && !isLoading && (
                <div className="text-center py-12 text-zinc-500">
                    <Search className="size-12 mx-auto mb-4 opacity-50" />
                    <p>
                        Ask questions in natural language to search and analyze leave data
                    </p>
                    <p className="text-sm mt-2">
                        Try one of the example queries above to get started
                    </p>
                </div>
            )}
        </div>
    )
}

export default SearchView
