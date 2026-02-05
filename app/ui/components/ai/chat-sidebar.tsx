import { useState } from "react"
import {
    Button,
    Input,
    ScrollShadow,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Chip,
} from "@heroui/react"
import {
    Plus,
    Search,
    MessageSquare,
    Pin,
    PinOff,
    Trash2,
    Pencil,
    MoreVertical,
    Bot,
} from "lucide-react"
import { DateTime } from "luxon"

interface Conversation {
    _id: string
    title: string
    mode: string
    isPinned: boolean
    lastMessageAt: string
    createdAt: string
}

interface ChatSidebarProps {
    conversations: Conversation[]
    selectedId?: string
    onSelect: (id: string) => void
    onNewChat: () => void
    onPin: (id: string) => void
    onDelete: (id: string) => void
    onRename: (id: string, newTitle: string) => void
    onSearch: (term: string) => void
    isLoading?: boolean
}

export function ChatSidebar({
    conversations,
    selectedId,
    onSelect,
    onNewChat,
    onPin,
    onDelete,
    onRename,
    onSearch,
    isLoading = false,
}: ChatSidebarProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [renameModalOpen, setRenameModalOpen] = useState(false)
    const [renameId, setRenameId] = useState<string | null>(null)
    const [renameTitle, setRenameTitle] = useState("")
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<string | null>(null)

    // Group conversations by date
    const groupConversations = () => {
        const today = DateTime.now().startOf("day")
        const yesterday = today.minus({ days: 1 })
        const lastWeek = today.minus({ days: 7 })

        const groups: { label: string; conversations: Conversation[] }[] = [
            { label: "Pinned", conversations: [] },
            { label: "Today", conversations: [] },
            { label: "Yesterday", conversations: [] },
            { label: "Last 7 Days", conversations: [] },
            { label: "Older", conversations: [] },
        ]

        conversations.forEach((conv) => {
            const convDate = DateTime.fromISO(conv.lastMessageAt).startOf("day")

            if (conv.isPinned) {
                groups[0].conversations.push(conv)
            } else if (convDate >= today) {
                groups[1].conversations.push(conv)
            } else if (convDate >= yesterday) {
                groups[2].conversations.push(conv)
            } else if (convDate >= lastWeek) {
                groups[3].conversations.push(conv)
            } else {
                groups[4].conversations.push(conv)
            }
        })

        return groups.filter((g) => g.conversations.length > 0)
    }

    const handleSearchChange = (value: string) => {
        setSearchTerm(value)
        onSearch(value)
    }

    const handleRenameClick = (conv: Conversation) => {
        setRenameId(conv._id)
        setRenameTitle(conv.title)
        setRenameModalOpen(true)
    }

    const handleRenameSubmit = () => {
        if (renameId && renameTitle.trim()) {
            onRename(renameId, renameTitle.trim())
        }
        setRenameModalOpen(false)
        setRenameId(null)
        setRenameTitle("")
    }

    const handleDeleteClick = (id: string) => {
        setDeleteId(id)
        setDeleteModalOpen(true)
    }

    const handleDeleteConfirm = () => {
        if (deleteId) {
            onDelete(deleteId)
        }
        setDeleteModalOpen(false)
        setDeleteId(null)
    }

    const groupedConversations = groupConversations()

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 mb-4">
                    <Bot className="size-6 text-primary" />
                    <h2 className="font-semibold text-lg">AI Assistant</h2>
                </div>
                <Button
                    color="primary"
                    className="w-full"
                    startContent={<Plus className="size-4" />}
                    onPress={onNewChat}
                >
                    New Chat
                </Button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
                <Input
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    startContent={<Search className="size-4 text-zinc-400" />}
                    size="sm"
                    classNames={{
                        inputWrapper: "bg-zinc-100 dark:bg-zinc-800",
                    }}
                    isClearable
                    onClear={() => handleSearchChange("")}
                />
            </div>

            {/* Conversation List */}
            <ScrollShadow className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="p-4 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse"
                            />
                        ))}
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500">
                        <MessageSquare className="size-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No conversations yet</p>
                        <p className="text-xs mt-1">Start a new chat to begin</p>
                    </div>
                ) : (
                    <div className="p-2">
                        {groupedConversations.map((group) => (
                            <div key={group.label} className="mb-4">
                                <p className="text-xs font-medium text-zinc-400 uppercase px-2 mb-2">
                                    {group.label}
                                </p>
                                <div className="space-y-1">
                                    {group.conversations.map((conv) => (
                                        <div
                                            key={conv._id}
                                            className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                                                selectedId === conv._id
                                                    ? "bg-primary/10 text-primary"
                                                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            }`}
                                            onClick={() => onSelect(conv._id)}
                                        >
                                            <MessageSquare className="size-4 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {conv.title}
                                                </p>
                                                <p className="text-xs text-zinc-400 truncate">
                                                    {DateTime.fromISO(
                                                        conv.lastMessageAt
                                                    ).toRelative()}
                                                </p>
                                            </div>
                                            {conv.isPinned && (
                                                <Pin className="size-3 text-warning flex-shrink-0" />
                                            )}
                                            <Dropdown>
                                                <DropdownTrigger>
                                                    <Button
                                                        isIconOnly
                                                        size="sm"
                                                        variant="light"
                                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 min-w-6"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <MoreVertical className="size-3" />
                                                    </Button>
                                                </DropdownTrigger>
                                                <DropdownMenu
                                                    aria-label="Conversation actions"
                                                    onAction={(key) => {
                                                        if (key === "pin") onPin(conv._id)
                                                        if (key === "rename")
                                                            handleRenameClick(conv)
                                                        if (key === "delete")
                                                            handleDeleteClick(conv._id)
                                                    }}
                                                >
                                                    <DropdownItem
                                                        key="pin"
                                                        startContent={
                                                            conv.isPinned ? (
                                                                <PinOff className="size-4" />
                                                            ) : (
                                                                <Pin className="size-4" />
                                                            )
                                                        }
                                                    >
                                                        {conv.isPinned ? "Unpin" : "Pin"}
                                                    </DropdownItem>
                                                    <DropdownItem
                                                        key="rename"
                                                        startContent={
                                                            <Pencil className="size-4" />
                                                        }
                                                    >
                                                        Rename
                                                    </DropdownItem>
                                                    <DropdownItem
                                                        key="delete"
                                                        className="text-danger"
                                                        color="danger"
                                                        startContent={
                                                            <Trash2 className="size-4" />
                                                        }
                                                    >
                                                        Delete
                                                    </DropdownItem>
                                                </DropdownMenu>
                                            </Dropdown>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollShadow>

            {/* Rename Modal */}
            <Modal isOpen={renameModalOpen} onClose={() => setRenameModalOpen(false)}>
                <ModalContent>
                    <ModalHeader>Rename Conversation</ModalHeader>
                    <ModalBody>
                        <Input
                            label="Title"
                            value={renameTitle}
                            onChange={(e) => setRenameTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameSubmit()
                            }}
                            autoFocus
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="flat" onPress={() => setRenameModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button color="primary" onPress={handleRenameSubmit}>
                            Save
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
                <ModalContent>
                    <ModalHeader>Delete Conversation</ModalHeader>
                    <ModalBody>
                        <p>
                            Are you sure you want to delete this conversation? This action
                            cannot be undone.
                        </p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="flat" onPress={() => setDeleteModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button color="danger" onPress={handleDeleteConfirm}>
                            Delete
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    )
}

export default ChatSidebar
