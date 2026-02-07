import mongoose, { Schema, Model, Document } from "mongoose"

// Chat mode types
export enum ChatMode {
    CHAT = "chat",
    SEARCH = "search",
    RECOMMENDATIONS = "recommendations",
    PATTERNS = "patterns",
}

// Chat message interface
export interface ChatMessageInterface {
    role: "user" | "assistant"
    content: string
    timestamp: Date
    metadata?: {
        mode?: string
        queryResult?: any
    }
}

// Chat conversation interface
export interface ChatConversationInterface {
    _id: string
    staff: mongoose.Types.ObjectId
    title: string
    messages: ChatMessageInterface[]
    mode: ChatMode
    isPinned: boolean
    lastMessageAt: Date
    createdAt: Date
    updatedAt: Date
}

// Document interface with methods
interface ChatConversationDocument extends Omit<ChatConversationInterface, "_id">, Document {
    addMessage(role: "user" | "assistant", content: string, metadata?: any): Promise<void>
    updateTitle(title: string): Promise<void>
    togglePin(): Promise<boolean>
}

// Model interface with static methods
interface ChatConversationModel extends Model<ChatConversationDocument> {
    getConversationsForStaff(
        staffId: string,
        options?: { limit?: number; skip?: number; pinnedFirst?: boolean }
    ): Promise<ChatConversationDocument[]>
    searchConversations(
        staffId: string,
        searchTerm: string,
        options?: { limit?: number }
    ): Promise<ChatConversationDocument[]>
    createConversation(
        staffId: string,
        mode?: ChatMode,
        title?: string
    ): Promise<ChatConversationDocument>
    getConversationCount(staffId: string): Promise<number>
}

// Message sub-schema
const chatMessageSchema = new Schema<ChatMessageInterface>(
    {
        role: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    { _id: false }
)

// Main conversation schema
const chatConversationSchema = new Schema<ChatConversationDocument>(
    {
        staff: {
            type: Schema.Types.ObjectId,
            ref: "Staff",
            required: [true, "Staff reference is required"],
            index: true,
        },
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [200, "Title cannot exceed 200 characters"],
            default: "New Conversation",
        },
        messages: {
            type: [chatMessageSchema],
            default: [],
        },
        mode: {
            type: String,
            enum: Object.values(ChatMode),
            default: ChatMode.CHAT,
        },
        isPinned: {
            type: Boolean,
            default: false,
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
)

// Compound indexes for common queries
chatConversationSchema.index({ staff: 1, lastMessageAt: -1 })
chatConversationSchema.index({ staff: 1, isPinned: -1, lastMessageAt: -1 })
chatConversationSchema.index({ staff: 1, title: "text", "messages.content": "text" })

// Instance method: Add a message to the conversation
chatConversationSchema.methods.addMessage = async function (
    role: "user" | "assistant",
    content: string,
    metadata?: any
): Promise<void> {
    this.messages.push({
        role,
        content,
        timestamp: new Date(),
        metadata: metadata || {},
    })
    this.lastMessageAt = new Date()

    // Auto-generate title from first user message if still default
    if (this.title === "New Conversation" && role === "user" && this.messages.length <= 2) {
        // Use first 50 chars of first user message as title
        this.title = content.length > 50 ? content.substring(0, 47) + "..." : content
    }

    await this.save()
}

// Instance method: Update conversation title
chatConversationSchema.methods.updateTitle = async function (title: string): Promise<void> {
    this.title = title.trim()
    await this.save()
}

// Instance method: Toggle pin status
chatConversationSchema.methods.togglePin = async function (): Promise<boolean> {
    this.isPinned = !this.isPinned
    await this.save()
    return this.isPinned
}

// Static method: Get conversations for a staff member
chatConversationSchema.statics.getConversationsForStaff = async function (
    staffId: string,
    options: { limit?: number; skip?: number; pinnedFirst?: boolean } = {}
): Promise<ChatConversationDocument[]> {
    const { limit = 50, skip = 0, pinnedFirst = true } = options

    const sortOptions = pinnedFirst
        ? { isPinned: -1 as const, lastMessageAt: -1 as const }
        : { lastMessageAt: -1 as const }

    return this.find({ staff: staffId })
        .select("_id title mode isPinned lastMessageAt createdAt")
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean()
}

// Static method: Search conversations by title or message content
chatConversationSchema.statics.searchConversations = async function (
    staffId: string,
    searchTerm: string,
    options: { limit?: number } = {}
): Promise<ChatConversationDocument[]> {
    const { limit = 20 } = options

    // Use regex search for better partial matching
    const searchRegex = new RegExp(searchTerm, "i")

    return this.find({
        staff: staffId,
        $or: [
            { title: searchRegex },
            { "messages.content": searchRegex },
        ],
    })
        .select("_id title mode isPinned lastMessageAt createdAt")
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .lean()
}

// Static method: Create a new conversation
chatConversationSchema.statics.createConversation = async function (
    staffId: string,
    mode: ChatMode = ChatMode.CHAT,
    title?: string
): Promise<ChatConversationDocument> {
    return this.create({
        staff: staffId,
        mode,
        title: title || "New Conversation",
        messages: [],
        isPinned: false,
        lastMessageAt: new Date(),
    })
}

// Static method: Get conversation count for a staff member
chatConversationSchema.statics.getConversationCount = async function (
    staffId: string
): Promise<number> {
    return this.countDocuments({ staff: staffId })
}

const ChatConversation = (mongoose.models.ChatConversation as ChatConversationModel) ||
    mongoose.model<ChatConversationDocument, ChatConversationModel>(
        "ChatConversation",
        chatConversationSchema
    )

export default ChatConversation
