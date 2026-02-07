import { Tabs, Tab } from "@heroui/react"
import { MessageSquare, Search, Calendar, TrendingUp } from "lucide-react"

export type AIMode = "chat" | "search" | "recommendations" | "patterns"

interface AIModeTabsProps {
    activeMode: AIMode
    onModeChange: (mode: AIMode) => void
    showPatterns?: boolean
}

export function AIModeTabs({
    activeMode,
    onModeChange,
    showPatterns = false,
}: AIModeTabsProps) {
    return (
        <Tabs
            aria-label="AI Modes"
            selectedKey={activeMode}
            onSelectionChange={(key) => onModeChange(key as AIMode)}
            classNames={{
                base: "w-full",
                tabList: "gap-2 w-full relative rounded-none p-0 border-b border-zinc-200 dark:border-zinc-800",
                cursor: "w-full bg-warning",
                tab: "max-w-fit px-4 h-10",
                tabContent: "group-data-[selected=true]:text-warning",
            }}
            variant="underlined"
            color="warning"
        >
            <Tab
                key="chat"
                title={
                    <div className="flex items-center gap-2">
                        <MessageSquare className="size-4" />
                        <span>Chat</span>
                    </div>
                }
            />
            <Tab
                key="search"
                title={
                    <div className="flex items-center gap-2">
                        <Search className="size-4" />
                        <span>Search</span>
                    </div>
                }
            />
            <Tab
                key="recommendations"
                title={
                    <div className="flex items-center gap-2">
                        <Calendar className="size-4" />
                        <span>Recommendations</span>
                    </div>
                }
            />
            {showPatterns && (
                <Tab
                    key="patterns"
                    title={
                        <div className="flex items-center gap-2">
                            <TrendingUp className="size-4" />
                            <span>Patterns</span>
                        </div>
                    }
                />
            )}
        </Tabs>
    )
}

export default AIModeTabs
