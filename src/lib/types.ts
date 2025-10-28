export interface AppwriteDocument {
    $id: string;
    $collectionId: string;
    $databaseId: string;
    $createdAt: string;
    $updatedAt: string;
    $permissions: string[];
    $sequence: number;
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
    publishedAt?: string; // ISO 8601 date string
    commentsSummary?: string;
    commentsKeyPoints?: string[];
    commentsCount?: number;
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
    channelId?: string;
    hasSubtitles?: boolean;
    publishedAt?: string; // ISO 8601 date string
    hits?: number;
    commentsSummary?: string;
    commentsKeyPoints?: string[];
    commentsCount?: number;
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

// 被阻止的频道类型
export interface BlockedChannel extends AppwriteDocument {
    channelId: string;
    channelName: string;
    blockedAt: string;
}

// 关注的频道类型
export interface FollowedChannel extends AppwriteDocument {
    channelId: string;
    channelName: string;
    channelUrl?: string;
    thumbnailUrl?: string;
    followedAt: string;
    lastCheckedAt?: string;
    lastProcessedVideoId?: string; // 最新处理的视频ID，用于增量更新
    lastProcessedVideoTitle?: string; // 最新处理的视频标题
    lastProcessedVideoPublishedAt?: string; // 最新处理的视频发布时间
    isActive: boolean;
}

// 项目类型
export interface Project extends AppwriteDocument {
    name: string;
    createdAt: string;
    customPrompt?: string; // custom AI prompt for summary generation
}

// 项目视频类型
export interface ProjectVideo extends AppwriteDocument {
	projectId: string;
	videoId: string;
	addedAt: string;
	order: number;
}

// 项目总结缓存类型
export interface ProjectSummary extends AppwriteDocument {
	projectId: string;
	title: string;
	abstract: string;
	body: string;
	keyTakeaway: string; // 添加 keyTakeaway 字段
	videoIds: string; // comma-separated list of video IDs
	generatedAt: string;
	isStale: boolean;
}
