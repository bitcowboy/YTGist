export interface AppwriteDocument {
    $id: string;
    $collectionId: string;
    $databaseId: string;
    $createdAt: string;
    $updatedAt: string;
    $permissions: string[];
    $sequence: number;
}

// 视频基本信息表（数据库：videoInfo）
export interface VideoInfo extends AppwriteDocument {
    videoId: string;
    title: string;
    description: string;
    author: string;
    channelId: string;
    hasSubtitles: boolean;
}

// 字幕（数据库：transcripts）
export interface Transcript extends AppwriteDocument {
    videoId: string;
    transcript: string;
}

export interface VideoMeta {
    title: string;
    description: string;
    channelId: string;
    author: string;
    hasSubtitles: boolean;
    transcript: string;
}

export interface SummaryData extends AppwriteDocument {
    videoId: string;
    title: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    description: string;
    author: string;
    hasSubtitles?: boolean;
    hits?: number;
}

// 聊天消息类型
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// 聊天请求类型
export interface ChatRequest {
    message: string;
    videoId: string;
    videoTitle: string;
    summaryData: SummaryData;
    conversationHistory?: ChatMessage[];
}

// 聊天响应类型
export interface ChatResponse {
    response: string;
}