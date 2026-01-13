export interface AppwriteDocument {
    $id: string;
    $collectionId: string;
    $databaseId: string;
    $createdAt: string;
    $updatedAt: string;
    $permissions: string[];
    $sequence: number;
}

// 视频平台类型
export type VideoPlatform = 'youtube' | 'bilibili' | 'vimeo' | 'dailymotion';

// 平台信息类型
export interface VideoPlatformInfo {
	platform: VideoPlatform;
	videoId: string;
}

// 评论数据接口
export interface CommentsData {
	comments: Comment[];
	totalCount: number;
}

// Import Comment interface from comments.ts
export interface Comment {
    id: string;
    text: string;
    author: string;
    likeCount: number;
    publishedAt: string;
    replyCount?: number;
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
    comments?: Comment[]; // 新增：原始评论数据
    commentsCount?: number;
}

// ============ 分表设计 ============
// 主表：summaries - 存储视频基础信息和元数据
// 子表：video_summaries - 存储视频摘要内容
// 子表：video_key_insights - 存储关键要点（keyTakeaway/keyPoints/coreTerms）
// 子表：video_comments_analysis - 存储评论分析
// 子表：video_embeddings - 存储向量嵌入

// 主表 - 视频基础信息和元数据
export interface SummaryData extends AppwriteDocument {
    // 标识字段
    videoId: string;
    platform: VideoPlatform; // 平台标识（必需字段）
    channelId?: string;
    
    // 元数据字段
    title: string;
    author: string;
    publishedAt?: string; // ISO 8601 date string
    hasSubtitles?: boolean;
    
    // 原始视频描述
    description: string;
    
    // 统计字段
    hits?: number;
}

// 视频摘要表 - 存储AI生成的摘要内容
export interface VideoSummaryContent extends AppwriteDocument {
    videoId: string;
    platform: VideoPlatform;
    summary: string; // 主摘要内容，最大5000字符
}

// 关键要点表 - 存储keyTakeaway/keyPoints/coreTerms
// 注意：keyPoints 和 coreTerms 在数据库中存储为 JSON 字符串，但在应用层使用数组
export interface VideoKeyInsights extends AppwriteDocument {
    videoId: string;
    platform: VideoPlatform;
    keyTakeaway: string;   // 核心要点，最大600字符
    keyPoints: string | string[];   // 关键点数组，数据库存储为 JSON 字符串，应用层使用数组
    coreTerms: string | string[];   // 核心术语数组，数据库存储为 JSON 字符串，应用层使用数组
}

// 评论分析表 - 存储评论相关的AI分析结果
// 注意：commentsKeyPoints 在数据库中存储为 JSON 字符串，但在应用层使用数组
export interface VideoCommentsAnalysis extends AppwriteDocument {
    videoId: string;
    platform: VideoPlatform;
    commentsSummary: string;      // 评论总结，最大1000字符
    commentsKeyPoints: string | string[];  // 评论要点，数据库存储为 JSON 字符串，应用层使用数组
    commentsCount: number;        // 评论数量
}

// 向量嵌入表 - 用于语义搜索和聚类
export interface VideoEmbedding extends AppwriteDocument {
    videoId: string;
    platform: VideoPlatform;
    embedding: number[]; // 1536维向量
}

// 组合类型 - 用于API响应，包含所有分表数据
export interface FullSummaryData extends SummaryData {
    // 来自 video_summaries 表
    summary: string;
    
    // 来自 video_key_insights 表
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    
    // 来自 video_comments_analysis 表
    commentsSummary?: string;
    commentsKeyPoints?: string[];
    commentsCount?: number;
    
    // 来自 video_embeddings 表
    embedding?: number[];
}

// AI 生成的摘要结果类型（不包含数据库元数据）
export interface AISummaryResult {
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    commentsSummary?: string;
    commentsKeyPoints?: string[];
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
    summaryData: FullSummaryData;
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
	body: string;
	keyTakeaway: string; // 添加 keyTakeaway 字段
	videoIds: string; // comma-separated list of video IDs
	generatedAt: string;
	isStale: boolean;
}

// 分类类型
export interface Collection extends AppwriteDocument {
	name: string;
	description?: string;
	createdAt: string;
}

// 分类视频关联类型
export interface CollectionVideo extends AppwriteDocument {
	collectionId: string;
	videoId: string;
	addedAt: string;
}

// 分类总结缓存类型
export interface CollectionSummary extends AppwriteDocument {
	collectionId: string;
	title: string;
	body: string;
	keyTakeaway: string;
	videoIds: string; // comma-separated list of video IDs
	generatedAt: string;
	isStale: boolean;
}

// 聚类类型
export interface Cluster extends AppwriteDocument {
	name: string;
	description?: string;
	videoCount: number;
	createdAt: string;
}

// 视频聚类关联类型
export interface VideoCluster extends AppwriteDocument {
	videoId: string;
	clusterId: string;
	createdAt: string;
}

// 聚类层次结构类型
export interface ClusterHierarchy {
	lambdaRange: [number, number];
	levels: ClusterLevel[];
}

export interface ClusterLevel {
	lambda: number;
	clusters: ClusterAssignment[];
	noiseCount: number;
	clusterCount: number;
}

export interface ClusterAssignment {
	clusterId: string;
	videoIds: string[];
	size: number;
	stability?: number;
}

// 聚类树状结构类型
export interface ClusterTreeNode {
	id: string;
	lambda: number;
	videoIds: string[];
	videoCount: number;
	children?: ClusterTreeNode[];
	isExpanded?: boolean;
}

export interface ClusterTree {
	root: ClusterTreeNode;
}
