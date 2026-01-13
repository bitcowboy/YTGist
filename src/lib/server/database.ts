import { databases } from './appwrite.js';
import { ID, Query, Permission, Role } from 'node-appwrite';
import type { 
    SummaryData, 
    VideoSummaryContent, 
    VideoKeyInsights, 
    VideoCommentsAnalysis, 
    VideoEmbedding,
    FullSummaryData,
    BlockedChannel, 
    FollowedChannel, 
    Project, 
    ProjectVideo, 
    ProjectSummary, 
    Collection, 
    CollectionVideo, 
    CollectionSummary, 
    Cluster, 
    VideoCluster, 
    AppwriteDocument, 
    VideoPlatform 
} from '$lib/types.js';

// 数据库表名常量
export const COLLECTIONS = {
    // 主表和分表
    SUMMARIES: 'summaries',                      // 主表：视频基础信息和元数据
    VIDEO_SUMMARIES: 'video_summaries',          // 子表：视频摘要内容
    VIDEO_KEY_INSIGHTS: 'video_key_insights',    // 子表：关键要点
    VIDEO_COMMENTS_ANALYSIS: 'video_comments_analysis', // 子表：评论分析
    VIDEO_EMBEDDINGS: 'video_embeddings',        // 子表：向量嵌入
    
    // 其他表
    TRANSCRIPTS: 'transcripts',
    DAILY_SUMMARIES: 'daily-summaries',
    BLOCKED_CHANNELS: 'blocked_channels',
    FOLLOWED_CHANNELS: 'followed_channels',
    PROJECTS: 'projects',
    PROJECT_VIDEOS: 'project_videos',
    PROJECT_SUMMARIES: 'project_summaries',
    COLLECTIONS: 'collections',
    COLLECTION_VIDEOS: 'collection_videos',
    COLLECTION_SUMMARIES: 'collection_summaries',
    CLUSTERS: 'clusters',
    VIDEO_CLUSTERS: 'video_clusters'
} as const;

// ============ 分表操作 ============

// 获取主表数据（仅基础信息和元数据）
export const getSummary = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<SummaryData | null> => {
    try {
        const { documents } = await databases.listDocuments<SummaryData>(
            'main',
            COLLECTIONS.SUMMARIES,
            [
                Query.equal('videoId', videoId),
                Query.equal('platform', platform)
            ]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get summary:', error);
        return null;
    }
};

// 获取视频摘要内容
export const getVideoSummaryContent = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoSummaryContent | null> => {
    try {
        const { documents } = await databases.listDocuments<VideoSummaryContent>(
            'main',
            COLLECTIONS.VIDEO_SUMMARIES,
            [
                Query.equal('videoId', videoId),
                Query.equal('platform', platform)
            ]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get video summary content:', error);
        return null;
    }
};

// 获取关键要点
export const getVideoKeyInsights = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoKeyInsights | null> => {
    try {
        const { documents } = await databases.listDocuments<VideoKeyInsights>(
            'main',
            COLLECTIONS.VIDEO_KEY_INSIGHTS,
            [
                Query.equal('videoId', videoId),
                Query.equal('platform', platform)
            ]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get video key insights:', error);
        return null;
    }
};

// 获取评论分析
export const getVideoCommentsAnalysis = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoCommentsAnalysis | null> => {
    try {
        const { documents } = await databases.listDocuments<VideoCommentsAnalysis>(
            'main',
            COLLECTIONS.VIDEO_COMMENTS_ANALYSIS,
            [
                Query.equal('videoId', videoId),
                Query.equal('platform', platform)
            ]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get video comments analysis:', error);
        return null;
    }
};

// 获取向量嵌入
export const getVideoEmbedding = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoEmbedding | null> => {
    try {
        const { documents } = await databases.listDocuments<VideoEmbedding>(
            'main',
            COLLECTIONS.VIDEO_EMBEDDINGS,
            [
                Query.equal('videoId', videoId),
                Query.equal('platform', platform)
            ]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get video embedding:', error);
        return null;
    }
};

// 获取完整的视频摘要数据（从所有分表组合）
export const getFullSummary = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<FullSummaryData | null> => {
    try {
        // 并行获取所有分表数据
        const [summary, summaryContent, keyInsights, commentsAnalysis, embedding] = await Promise.all([
            getSummary(videoId, platform),
            getVideoSummaryContent(videoId, platform),
            getVideoKeyInsights(videoId, platform),
            getVideoCommentsAnalysis(videoId, platform),
            getVideoEmbedding(videoId, platform)
        ]);

        // 如果主表数据不存在，返回null
        if (!summary) {
            return null;
        }

        // 解析 JSON 字符串回数组的辅助函数
        const parseJsonArray = (jsonStr: string | string[] | undefined): string[] => {
            if (!jsonStr) return [];
            if (Array.isArray(jsonStr)) return jsonStr; // 如果已经是数组，直接返回
            if (typeof jsonStr === 'string') {
                try {
                    const parsed = JSON.parse(jsonStr);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            }
            return [];
        };

        // 组合完整数据（需要将 JSON 字符串解析回数组）
        const fullData: FullSummaryData = {
            ...summary,
            // 来自 video_summaries 表
            summary: summaryContent?.summary || '',
            // 来自 video_key_insights 表
            keyTakeaway: keyInsights?.keyTakeaway || '',
            keyPoints: parseJsonArray(keyInsights?.keyPoints),
            coreTerms: parseJsonArray(keyInsights?.coreTerms),
            // 来自 video_comments_analysis 表
            commentsSummary: commentsAnalysis?.commentsSummary,
            commentsKeyPoints: parseJsonArray(commentsAnalysis?.commentsKeyPoints),
            commentsCount: commentsAnalysis?.commentsCount,
            // 来自 video_embeddings 表
            embedding: embedding?.embedding
        };

        return fullData;
    } catch (error) {
        console.error('Failed to get full summary:', error);
        return null;
    }
};

// 创建完整的视频摘要数据（写入所有分表）
export const createSummary = async (summaryData: {
    videoId: string;
    title: string;
    description: string;
    author: string;
    channelId?: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    hasSubtitles?: boolean;
    publishedAt?: string;
    platform?: VideoPlatform;
    commentsSummary?: string;
    commentsKeyPoints?: string[];
    commentsCount?: number;
}): Promise<FullSummaryData> => {
    // Clamp fields to Appwrite attribute limits to avoid document_invalid_structure
    // 字段大小限制与 init-database 中的定义保持一致
    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
    
    // keyPoints: 数据库限制 4000，每项最多 200 字符，最多 15 项，存储为 JSON 字符串
    const safeKeyPoints = JSON.stringify((summaryData.keyPoints || []).map((kp) => clamp(kp, 200)).slice(0, 15));
    // coreTerms: 数据库限制 2000，每项最多 100 字符，最多 15 项，存储为 JSON 字符串
    const safeCoreTerms = JSON.stringify((summaryData.coreTerms || []).map((ct) => clamp(ct, 100)).slice(0, 15));
    // commentsKeyPoints: 数据库限制 2000，每项最多 150 字符，最多 10 项，存储为 JSON 字符串
    const safeCommentsKeyPoints = JSON.stringify((summaryData.commentsKeyPoints || []).map((ckp) => clamp(ckp, 150)).slice(0, 10));

    const videoId = clamp(summaryData.videoId, 50);
    const platform = summaryData.platform || 'youtube';

    // 1. 创建主表数据
    const mainPayload = {
        videoId,
        platform,
        channelId: clamp(summaryData.channelId, 50),
        title: clamp(summaryData.title, 200),
        author: clamp(summaryData.author, 150),
        publishedAt: summaryData.publishedAt,
        hasSubtitles: summaryData.hasSubtitles,
        description: clamp(summaryData.description, 2000),
        hits: 0
    };

    const mainDoc = await databases.createDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        ID.unique(),
        mainPayload
    );

    // 2. 创建摘要内容子表数据
    const summaryContentPayload = {
        videoId,
        platform,
        summary: clamp(summaryData.summary, 5000)
    };

    await databases.createDocument<VideoSummaryContent>(
        'main',
        COLLECTIONS.VIDEO_SUMMARIES,
        ID.unique(),
        summaryContentPayload
    );

    // 3. 创建关键要点子表数据
    const keyInsightsPayload = {
        videoId,
        platform,
        keyTakeaway: clamp(summaryData.keyTakeaway, 600),
        keyPoints: safeKeyPoints,
        coreTerms: safeCoreTerms
    };

    await databases.createDocument<VideoKeyInsights>(
        'main',
        COLLECTIONS.VIDEO_KEY_INSIGHTS,
        ID.unique(),
        keyInsightsPayload as any  // 使用类型断言，因为数据库存储为 JSON 字符串
    );

    // 4. 创建评论分析子表数据
    const commentsPayload = {
        videoId,
        platform,
        commentsSummary: clamp(summaryData.commentsSummary, 1000),
        commentsKeyPoints: safeCommentsKeyPoints,
        commentsCount: summaryData.commentsCount || 0
    };

    await databases.createDocument<VideoCommentsAnalysis>(
        'main',
        COLLECTIONS.VIDEO_COMMENTS_ANALYSIS,
        ID.unique(),
        commentsPayload as any  // 使用类型断言，因为数据库存储为 JSON 字符串
    );

    // 解析 JSON 字符串回数组的辅助函数
    const parseJsonArray = (jsonStr: string): string[] => {
        try {
            const parsed = JSON.parse(jsonStr);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    // 返回组合后的完整数据（需要将 JSON 字符串解析回数组）
    return {
        ...mainDoc,
        summary: summaryContentPayload.summary,
        keyTakeaway: keyInsightsPayload.keyTakeaway,
        keyPoints: parseJsonArray(keyInsightsPayload.keyPoints),
        coreTerms: parseJsonArray(keyInsightsPayload.coreTerms),
        commentsSummary: commentsPayload.commentsSummary,
        commentsKeyPoints: parseJsonArray(commentsPayload.commentsKeyPoints),
        commentsCount: commentsPayload.commentsCount
    };
};

// 创建或更新向量嵌入
export const upsertVideoEmbedding = async (videoId: string, platform: VideoPlatform, embedding: number[]): Promise<VideoEmbedding> => {
    try {
        const existing = await getVideoEmbedding(videoId, platform);
        
        if (existing) {
            return await databases.updateDocument<VideoEmbedding>(
                'main',
                COLLECTIONS.VIDEO_EMBEDDINGS,
                existing.$id,
                { embedding }
            );
        }

        return await databases.createDocument<VideoEmbedding>(
            'main',
            COLLECTIONS.VIDEO_EMBEDDINGS,
            ID.unique(),
            { videoId, platform, embedding }
        );
    } catch (error) {
        console.error('Failed to upsert video embedding:', error);
        throw error;
    }
};

// 更新主表数据
export const updateSummary = async (videoId: string, platform: VideoPlatform = 'youtube', updateData: Partial<{
    title: string;
    hasSubtitles: boolean;
    hits: number;
    description: string;
    author: string;
    channelId: string;
    publishedAt: string;
}>): Promise<SummaryData> => {
    const existing = await getSummary(videoId, platform);
    if (!existing) {
        throw new Error('Summary not found');
    }
    
    return await databases.updateDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        existing.$id,
        updateData
    );
};

// 更新视频摘要内容
export const updateVideoSummaryContent = async (videoId: string, platform: VideoPlatform = 'youtube', summary: string): Promise<VideoSummaryContent> => {
    const existing = await getVideoSummaryContent(videoId, platform);
    if (!existing) {
        // 如果不存在则创建
        return await databases.createDocument<VideoSummaryContent>(
            'main',
            COLLECTIONS.VIDEO_SUMMARIES,
            ID.unique(),
            { videoId, platform, summary: summary.slice(0, 5000) }
        );
    }
    
    return await databases.updateDocument<VideoSummaryContent>(
        'main',
        COLLECTIONS.VIDEO_SUMMARIES,
        existing.$id,
        { summary: summary.slice(0, 5000) }
    );
};

// 更新关键要点
export const updateVideoKeyInsights = async (videoId: string, platform: VideoPlatform = 'youtube', updateData: Partial<{
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
}>): Promise<VideoKeyInsights> => {
    const existing = await getVideoKeyInsights(videoId, platform);
    
    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
    const payload: any = {};
    if (updateData.keyTakeaway !== undefined) payload.keyTakeaway = clamp(updateData.keyTakeaway, 600);
    // keyPoints 和 coreTerms 需要存储为 JSON 字符串
    if (updateData.keyPoints !== undefined) payload.keyPoints = JSON.stringify(updateData.keyPoints.map(kp => clamp(kp, 200)).slice(0, 15));
    if (updateData.coreTerms !== undefined) payload.coreTerms = JSON.stringify(updateData.coreTerms.map(ct => clamp(ct, 100)).slice(0, 15));
    
    if (!existing) {
        // 如果不存在则创建
        return await databases.createDocument<VideoKeyInsights>(
            'main',
            COLLECTIONS.VIDEO_KEY_INSIGHTS,
            ID.unique(),
            { videoId, platform, ...payload }
        );
    }
    
    return await databases.updateDocument<VideoKeyInsights>(
        'main',
        COLLECTIONS.VIDEO_KEY_INSIGHTS,
        existing.$id,
        payload
    );
};

// 更新评论分析
export const updateVideoCommentsAnalysis = async (videoId: string, platform: VideoPlatform = 'youtube', updateData: Partial<{
    commentsSummary: string;
    commentsKeyPoints: string[];
    commentsCount: number;
}>): Promise<VideoCommentsAnalysis> => {
    const existing = await getVideoCommentsAnalysis(videoId, platform);
    
    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
    const payload: any = {};
    if (updateData.commentsSummary !== undefined) payload.commentsSummary = clamp(updateData.commentsSummary, 1000);
    if (updateData.commentsKeyPoints !== undefined) payload.commentsKeyPoints = updateData.commentsKeyPoints.map(ckp => clamp(ckp, 150)).slice(0, 10);
    if (updateData.commentsCount !== undefined) payload.commentsCount = updateData.commentsCount;
    
    if (!existing) {
        // 如果不存在则创建
        return await databases.createDocument<VideoCommentsAnalysis>(
            'main',
            COLLECTIONS.VIDEO_COMMENTS_ANALYSIS,
            ID.unique(),
            { videoId, platform, ...payload }
        );
    }
    
    return await databases.updateDocument<VideoCommentsAnalysis>(
        'main',
        COLLECTIONS.VIDEO_COMMENTS_ANALYSIS,
        existing.$id,
        payload
    );
};

export const incrementSummaryHits = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<SummaryData> => {
    const existing = await getSummary(videoId, platform);
    if (!existing) {
        throw new Error('Summary not found');
    }
    
    return await databases.updateDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        existing.$id,
        { hits: (existing.hits || 0) + 1 }
    );
};

// 组合操作 - 获取完整的视频数据
// 单表模式不再提供组合查询与跨表检查

// Transcript 相关操作
export const upsertTranscript = async (
    videoId: string,
    transcript: string
) => {
    try {
        const { documents, total } = await databases.listDocuments(
            'main',
            COLLECTIONS.TRANSCRIPTS,
            [Query.equal('videoId', videoId), Query.limit(1)]
        );
        if (total > 0) {
            const doc = documents[0];
            return await databases.updateDocument(
                'main',
                COLLECTIONS.TRANSCRIPTS,
                doc.$id,
                { transcript }
            );
        }
        return await databases.createDocument(
            'main',
            COLLECTIONS.TRANSCRIPTS,
            ID.unique(),
            { videoId, transcript }
        );
    } catch (error) {
        console.error('Failed to upsert transcript:', error);
        throw error;
    }
};

export const getTranscriptByVideoId = async (
    videoId: string
): Promise<string | null> => {
    try {
        const { documents, total } = await databases.listDocuments(
            'main',
            COLLECTIONS.TRANSCRIPTS,
            [Query.equal('videoId', videoId), Query.limit(1)]
        );
        if (total > 0) {
            const doc = documents[0] as { transcript?: string };
            const value = (doc.transcript ?? '') || null;
            if (value) {
                console.log('[db] transcript hit for', videoId, `(length=${value.length})`);
            } else {
                console.log('[db] transcript empty for', videoId);
            }
            return value;
        }
        console.log('[db] transcript miss for', videoId);
        return null;
    } catch (error) {
        console.error('Failed to get transcript by videoId:', error);
        return null;
    }
};

// Daily Summary 相关操作
export interface DailySummaryData {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    $collectionId: string;
    $databaseId: string;
    $permissions: string[];
    $sequence: number;
    date: string; // YYYY-MM-DD format
    overview: string;
    themes: string; // JSON string
    keyInsights: string; // JSON string
    videoCount: number;
}

export const getDailySummary = async (date: string): Promise<DailySummaryData | null> => {
    try {
        const { documents } = await databases.listDocuments<DailySummaryData>(
            'main',
            COLLECTIONS.DAILY_SUMMARIES,
            [Query.equal('date', date), Query.limit(1)]
        );
        
        if (documents.length === 0) return null;
        
        const doc = documents[0];
        return {
            ...doc,
            themes: JSON.parse(doc.themes), // 反序列化 JSON 字符串
            keyInsights: JSON.parse(doc.keyInsights) // 反序列化 JSON 字符串
        };
    } catch (error) {
        console.error('Failed to get daily summary:', error);
        return null;
    }
};

export const createDailySummary = async (dailySummaryData: {
    date: string;
    overview: string;
    themes: Array<{
        theme: string;
        videos: Array<{
            title: string;
            keyTakeaway: string;
            videoId: string;
        }>;
        summary: string;
    }>;
    keyInsights: string[];
    videoCount: number;
}): Promise<DailySummaryData> => {
    return await databases.createDocument<DailySummaryData>(
        'main',
        COLLECTIONS.DAILY_SUMMARIES,
        ID.unique(),
        {
            date: dailySummaryData.date,
            overview: dailySummaryData.overview,
            themes: JSON.stringify(dailySummaryData.themes), // 序列化为 JSON 字符串
            keyInsights: JSON.stringify(dailySummaryData.keyInsights), // 序列化为 JSON 字符串
            videoCount: dailySummaryData.videoCount
        }
    );
};

export const updateDailySummary = async (date: string, updateData: Partial<{
    overview: string;
    themes: Array<{
        theme: string;
        videos: Array<{
            title: string;
            keyTakeaway: string;
            videoId: string;
        }>;
        summary: string;
    }>;
    keyInsights: string[];
    videoCount: number;
}>): Promise<DailySummaryData> => {
    const existing = await getDailySummary(date);
    if (!existing) {
        throw new Error('Daily summary not found');
    }
    
    // 序列化复杂对象
    const serializedData: any = {};
    if (updateData.overview) serializedData.overview = updateData.overview;
    if (updateData.videoCount !== undefined) serializedData.videoCount = updateData.videoCount;
    if (updateData.themes) serializedData.themes = JSON.stringify(updateData.themes);
    if (updateData.keyInsights) serializedData.keyInsights = JSON.stringify(updateData.keyInsights);
    
    return await databases.updateDocument<DailySummaryData>(
        'main',
        COLLECTIONS.DAILY_SUMMARIES,
        existing.$id,
        serializedData
    );
};

export const deleteDailySummary = async (date: string): Promise<void> => {
    const existing = await getDailySummary(date);
    if (!existing) {
        throw new Error('Daily summary not found');
    }
    
    await databases.deleteDocument(
        'main',
        COLLECTIONS.DAILY_SUMMARIES,
        existing.$id
    );
};

// Blocked Channel 相关操作
export const getBlockedChannels = async (): Promise<BlockedChannel[]> => {
    try {
        const { documents } = await databases.listDocuments<BlockedChannel>(
            'main',
            COLLECTIONS.BLOCKED_CHANNELS,
            [Query.orderDesc('$createdAt')]
        );
        return documents;
    } catch (error) {
        console.error('Failed to get blocked channels:', error);
        return [];
    }
};

export const isChannelBlocked = async (channelId: string): Promise<boolean> => {
    try {
        const { documents } = await databases.listDocuments<BlockedChannel>(
            'main',
            COLLECTIONS.BLOCKED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        return documents.length > 0;
    } catch (error) {
        console.error('Failed to check if channel is blocked:', error);
        return false;
    }
};

export const addBlockedChannel = async (channelId: string, channelName: string): Promise<BlockedChannel> => {
    try {
        // 检查是否已经存在
        const existing = await databases.listDocuments<BlockedChannel>(
            'main',
            COLLECTIONS.BLOCKED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        
        if (existing.documents.length > 0) {
            // 如果频道已经被阻止，仍然清除数据（以防有新的数据）
            await clearChannelData(channelId);
            return existing.documents[0];
        }
        
        // 在添加到block list之前，先清除该频道的所有数据
        await clearChannelData(channelId);
        
        return await databases.createDocument<BlockedChannel>(
            'main',
            COLLECTIONS.BLOCKED_CHANNELS,
            ID.unique(),
            {
                channelId,
                channelName,
                blockedAt: new Date().toISOString()
            }
        );
    } catch (error) {
        console.error('Failed to add blocked channel:', error);
        throw error;
    }
};

export const removeBlockedChannel = async (channelId: string): Promise<void> => {
    try {
        const { documents } = await databases.listDocuments<BlockedChannel>(
            'main',
            COLLECTIONS.BLOCKED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        
        if (documents.length > 0) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.BLOCKED_CHANNELS,
                documents[0].$id
            );
        }
    } catch (error) {
        console.error('Failed to remove blocked channel:', error);
        throw error;
    }
};

export const clearBlockedChannels = async (): Promise<void> => {
    try {
        const { documents } = await databases.listDocuments<BlockedChannel>(
            'main',
            COLLECTIONS.BLOCKED_CHANNELS
        );
        
        // 批量删除所有被阻止的频道
        for (const doc of documents) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.BLOCKED_CHANNELS,
                doc.$id
            );
        }
    } catch (error) {
        console.error('Failed to clear blocked channels:', error);
        throw error;
    }
};

// 清除指定频道的所有数据
export const clearChannelData = async (channelId: string): Promise<void> => {
    try {
        console.log(`Clearing all data for channel: ${channelId}`);
        
        // 1. 从summaries表中获取该频道的所有videoId
        const { documents: summaries } = await databases.listDocuments<SummaryData>(
            'main',
            COLLECTIONS.SUMMARIES,
            [Query.equal('channelId', channelId)]
        );
        
        const videoIds = summaries.map(summary => summary.videoId);
        console.log(`Found ${videoIds.length} videos for channel ${channelId}:`, videoIds);
        
        // 2. 删除summaries表中的记录
        for (const summary of summaries) {
            try {
                await databases.deleteDocument('main', COLLECTIONS.SUMMARIES, summary.$id);
                console.log(`Deleted summary for video: ${summary.videoId}`);
            } catch (error) {
                console.error(`Failed to delete summary for video ${summary.videoId}:`, error);
            }
        }
        
        // 3. 删除transcripts表中的记录
        for (const videoId of videoIds) {
            try {
                const { documents: transcripts } = await databases.listDocuments(
                    'main',
                    COLLECTIONS.TRANSCRIPTS,
                    [Query.equal('videoId', videoId)]
                );
                
                for (const transcript of transcripts) {
                    await databases.deleteDocument('main', COLLECTIONS.TRANSCRIPTS, transcript.$id);
                    console.log(`Deleted transcript for video: ${videoId}`);
                }
            } catch (error) {
                console.error(`Failed to delete transcript for video ${videoId}:`, error);
            }
        }
        
        // 4. 检查并更新daily-summaries表（如果包含被删除的视频）
        // 这里需要重新生成daily summary，因为可能包含被删除的视频
        await invalidateDailySummariesContainingChannel(channelId);
        
        console.log(`Channel data cleared successfully for channel: ${channelId}`);
        
    } catch (error) {
        console.error('Failed to clear channel data:', error);
        throw error;
    }
};

// 使包含指定频道视频的daily summaries失效
export const invalidateDailySummariesContainingChannel = async (channelId: string): Promise<void> => {
    try {
        // 获取该频道的所有videoId
        const { documents: summaries } = await databases.listDocuments<SummaryData>(
            'main',
            COLLECTIONS.SUMMARIES,
            [Query.equal('channelId', channelId)]
        );
        
        const videoIds = summaries.map(summary => summary.videoId);
        
        if (videoIds.length === 0) {
            console.log(`No videos found for channel ${channelId}, skipping daily summary invalidation`);
            return;
        }
        
        // 获取所有daily summaries
        const { documents: dailySummaries } = await databases.listDocuments<DailySummaryData>(
            'main',
            COLLECTIONS.DAILY_SUMMARIES
        );
        
        // 检查每个daily summary是否包含被删除的视频
        for (const dailySummary of dailySummaries) {
            try {
                const themes = JSON.parse(dailySummary.themes);
                let needsUpdate = false;
                
                // 检查themes中是否包含被删除的视频
                for (const theme of themes) {
                    const originalVideoCount = theme.videos.length;
                    theme.videos = theme.videos.filter((video: any) => !videoIds.includes(video.videoId));
                    
                    if (theme.videos.length !== originalVideoCount) {
                        needsUpdate = true;
                        console.log(`Removed ${originalVideoCount - theme.videos.length} videos from theme "${theme.theme}" in daily summary ${dailySummary.date}`);
                    }
                }
                
                if (needsUpdate) {
                    // 重新计算videoCount
                    const totalVideoCount = themes.reduce((count: number, theme: any) => count + theme.videos.length, 0);
                    
                    // 如果没有任何视频了，删除这个daily summary
                    if (totalVideoCount === 0) {
                        await databases.deleteDocument('main', COLLECTIONS.DAILY_SUMMARIES, dailySummary.$id);
                        console.log(`Deleted daily summary for ${dailySummary.date} as it contained only blocked channel videos`);
                    } else {
                        // 更新daily summary
                        await databases.updateDocument<DailySummaryData>(
                            'main',
                            COLLECTIONS.DAILY_SUMMARIES,
                            dailySummary.$id,
                            {
                                themes: JSON.stringify(themes),
                                videoCount: totalVideoCount
                            }
                        );
                        console.log(`Updated daily summary for ${dailySummary.date}, new video count: ${totalVideoCount}`);
                    }
                }
            } catch (error) {
                console.error(`Failed to process daily summary ${dailySummary.date}:`, error);
            }
        }
    } catch (error) {
        console.error('Failed to invalidate daily summaries:', error);
        // 不抛出错误，因为这不是关键操作
    }
};

// Follow Channel 相关操作
export const getFollowedChannels = async (): Promise<FollowedChannel[]> => {
    try {
        const { documents } = await databases.listDocuments<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            [Query.equal('isActive', true), Query.orderDesc('$createdAt')]
        );
        return documents;
    } catch (error) {
        console.error('Failed to get followed channels:', error);
        return [];
    }
};

export const addFollowedChannel = async (channelId: string, channelName: string, channelUrl?: string, thumbnailUrl?: string): Promise<FollowedChannel> => {
    try {
        // 检查是否已经存在
        const existing = await databases.listDocuments<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        
        if (existing.documents.length > 0) {
            // 如果频道已经被关注，激活它
            return await databases.updateDocument<FollowedChannel>(
                'main',
                COLLECTIONS.FOLLOWED_CHANNELS,
                existing.documents[0].$id,
                { isActive: true, followedAt: new Date().toISOString() }
            );
        }
        
        return await databases.createDocument<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            ID.unique(),
            {
                channelId,
                channelName,
                channelUrl,
                thumbnailUrl,
                followedAt: new Date().toISOString(),
                isActive: true
            }
        );
    } catch (error) {
        console.error('Failed to add followed channel:', error);
        throw error;
    }
};

export const removeFollowedChannel = async (channelId: string): Promise<void> => {
    try {
        const { documents } = await databases.listDocuments<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        
        if (documents.length > 0) {
            await databases.updateDocument<FollowedChannel>(
                'main',
                COLLECTIONS.FOLLOWED_CHANNELS,
                documents[0].$id,
                { isActive: false }
            );
        }
    } catch (error) {
        console.error('Failed to remove followed channel:', error);
        throw error;
    }
};

export const isChannelFollowed = async (channelId: string): Promise<boolean> => {
    try {
        const { documents } = await databases.listDocuments<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            [Query.equal('channelId', channelId), Query.equal('isActive', true), Query.limit(1)]
        );
        return documents.length > 0;
    } catch (error) {
        console.error('Failed to check if channel is followed:', error);
        return false;
    }
};

// 更新频道最新处理的视频信息
export const updateChannelLastProcessedVideo = async (
    channelId: string, 
    videoId: string, 
    videoTitle: string, 
    publishedAt: string
): Promise<void> => {
    try {
        const { documents } = await databases.listDocuments<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        
        if (documents.length > 0) {
            await databases.updateDocument<FollowedChannel>(
                'main',
                COLLECTIONS.FOLLOWED_CHANNELS,
                documents[0].$id,
                {
                    lastProcessedVideoId: videoId,
                    lastProcessedVideoTitle: videoTitle,
                    lastProcessedVideoPublishedAt: publishedAt,
                    lastCheckedAt: new Date().toISOString()
                }
            );
            console.log(`Updated last processed video for channel ${channelId}: ${videoId} - ${videoTitle}`);
        }
    } catch (error) {
        console.error(`Failed to update last processed video for channel ${channelId}:`, error);
        throw error;
    }
};

// 获取频道最新处理的视频ID
export const getChannelLastProcessedVideoId = async (channelId: string): Promise<string | null> => {
    try {
        const { documents } = await databases.listDocuments<FollowedChannel>(
            'main',
            COLLECTIONS.FOLLOWED_CHANNELS,
            [Query.equal('channelId', channelId), Query.limit(1)]
        );
        
        if (documents.length > 0 && documents[0].lastProcessedVideoId) {
            return documents[0].lastProcessedVideoId;
        }
        return null;
    } catch (error) {
        console.error(`Failed to get last processed video ID for channel ${channelId}:`, error);
        return null;
    }
};

// Project 相关操作
export const getProjects = async (): Promise<Project[]> => {
    try {
        const { documents } = await databases.listDocuments<Project>(
            'main',
            COLLECTIONS.PROJECTS,
            [Query.orderDesc('$createdAt')]
        );
        return documents;
    } catch (error) {
        console.error('Failed to get projects:', error);
        return [];
    }
};

export const getProject = async (projectId: string): Promise<Project | null> => {
    try {
        const { documents } = await databases.listDocuments<Project>(
            'main',
            COLLECTIONS.PROJECTS,
            [Query.equal('$id', projectId), Query.limit(1)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get project:', error);
        return null;
    }
};

export const createProject = async (name: string): Promise<Project> => {
    try {
        return await databases.createDocument<Project>(
            'main',
            COLLECTIONS.PROJECTS,
            ID.unique(),
            {
                name,
                createdAt: new Date().toISOString()
            }
        );
    } catch (error) {
        console.error('Failed to create project:', error);
        throw error;
    }
};

export const deleteProject = async (projectId: string): Promise<void> => {
    try {
        // First delete all project videos
        const { documents: projectVideos } = await databases.listDocuments<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            [Query.equal('projectId', projectId)]
        );
        
        for (const projectVideo of projectVideos) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.PROJECT_VIDEOS,
                projectVideo.$id
            );
        }
        
        // Then delete the project
        await databases.deleteDocument(
            'main',
            COLLECTIONS.PROJECTS,
            projectId
        );
    } catch (error) {
        console.error('Failed to delete project:', error);
        throw error;
    }
};

export const getProjectVideos = async (projectId: string): Promise<ProjectVideo[]> => {
    try {
        const { documents } = await databases.listDocuments<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            [Query.equal('projectId', projectId), Query.orderAsc('order')]
        );
        return documents;
    } catch (error) {
        console.error('Failed to get project videos:', error);
        return [];
    }
};

export const addVideoToProject = async (projectId: string, videoId: string): Promise<ProjectVideo> => {
    try {
        // Check if video is already in project
        const existing = await databases.listDocuments<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            [Query.equal('projectId', projectId), Query.equal('videoId', videoId), Query.limit(1)]
        );
        
        if (existing.documents.length > 0) {
            throw new Error('Video is already in this project');
        }
        
        // Get the next order number
        const { documents: existingVideos } = await databases.listDocuments<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            [Query.equal('projectId', projectId), Query.orderDesc('order'), Query.limit(1)]
        );
        
        const nextOrder = existingVideos.length > 0 ? existingVideos[0].order + 1 : 1;
        
        return await databases.createDocument<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            ID.unique(),
            {
                projectId,
                videoId,
                addedAt: new Date().toISOString(),
                order: nextOrder
            }
        );
    } catch (error) {
        console.error('Failed to add video to project:', error);
        throw error;
    }
};

export const removeVideoFromProject = async (projectId: string, videoId: string): Promise<void> => {
    try {
        const { documents } = await databases.listDocuments<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            [Query.equal('projectId', projectId), Query.equal('videoId', videoId), Query.limit(1)]
        );
        
        if (documents.length > 0) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.PROJECT_VIDEOS,
                documents[0].$id
            );
        }
    } catch (error) {
        console.error('Failed to remove video from project:', error);
        throw error;
    }
};

export const isVideoInProject = async (projectId: string, videoId: string): Promise<boolean> => {
    try {
        const { documents } = await databases.listDocuments<ProjectVideo>(
            'main',
            COLLECTIONS.PROJECT_VIDEOS,
            [Query.equal('projectId', projectId), Query.equal('videoId', videoId), Query.limit(1)]
        );
        return documents.length > 0;
    } catch (error) {
        console.error('Failed to check if video is in project:', error);
        return false;
    }
};

// Project Summary Cache 相关操作
export const getProjectSummary = async (projectId: string): Promise<ProjectSummary | null> => {
    try {
        const { documents } = await databases.listDocuments<ProjectSummary>(
            'main',
            COLLECTIONS.PROJECT_SUMMARIES,
            [Query.equal('projectId', projectId), Query.limit(1)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get project summary:', error);
        return null;
    }
};

export const createProjectSummary = async (summaryData: {
    projectId: string;
    title: string;
    body: string;
    keyTakeaway: string;
    videoIds: string;
    isStale: boolean;
}): Promise<ProjectSummary> => {
    const payload = {
        projectId: summaryData.projectId,
        title: (summaryData.title || '').slice(0, 500),
        body: (summaryData.body || '').slice(0, 20000),
        keyTakeaway: (summaryData.keyTakeaway || '').slice(0, 2000),
        videoIds: (summaryData.videoIds || '').slice(0, 5000),
        generatedAt: new Date().toISOString(),
        isStale: summaryData.isStale ?? false
    };

    return await databases.createDocument<ProjectSummary>(
        'main',
        COLLECTIONS.PROJECT_SUMMARIES,
        ID.unique(),
        payload
    );
};

export const updateProjectSummary = async (projectId: string, updateData: Partial<{
    title: string;
    body: string;
    keyTakeaway: string;
    videoIds: string;
    isStale: boolean;
}>): Promise<ProjectSummary> => {
    const existing = await getProjectSummary(projectId);
    if (!existing) {
        throw new Error('Project summary not found');
    }
    
    const payload: any = {};
    if (updateData.title !== undefined) payload.title = (updateData.title || '').slice(0, 500);
    if (updateData.body !== undefined) payload.body = (updateData.body || '').slice(0, 20000);
    if (updateData.keyTakeaway !== undefined) payload.keyTakeaway = (updateData.keyTakeaway || '').slice(0, 2000);
    if (updateData.videoIds !== undefined) payload.videoIds = (updateData.videoIds || '').slice(0, 5000);
    if (updateData.isStale !== undefined) payload.isStale = updateData.isStale;
    
    return await databases.updateDocument<ProjectSummary>(
        'main',
        COLLECTIONS.PROJECT_SUMMARIES,
        existing.$id,
        payload
    );
};

export const deleteProjectSummary = async (projectId: string): Promise<void> => {
    try {
        const existing = await getProjectSummary(projectId);
        if (existing) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.PROJECT_SUMMARIES,
                existing.$id
            );
        }
    } catch (error) {
        console.error('Failed to delete project summary:', error);
        throw error;
    }
};

export const markProjectSummaryStale = async (projectId: string): Promise<void> => {
    try {
        const existing = await getProjectSummary(projectId);
        if (existing) {
            await databases.updateDocument<ProjectSummary>(
                'main',
                COLLECTIONS.PROJECT_SUMMARIES,
                existing.$id,
                { isStale: true }
            );
        }
    } catch (error) {
        console.error('Failed to mark project summary as stale:', error);
        // Don't throw error, as this is not critical
    }
};

export const checkSummaryCacheValidity = async (projectId: string, currentVideoIds: string[]): Promise<boolean> => {
    try {
        const cachedSummary = await getProjectSummary(projectId);
        if (!cachedSummary) {
            return false; // No cache exists
        }

        if (cachedSummary.isStale) {
            return false; // Cache is marked as stale
        }

        // Compare video IDs
        const cachedVideoIds = cachedSummary.videoIds.split(',').filter(id => id.trim());
        const currentVideoIdsSorted = [...currentVideoIds].sort();
        const cachedVideoIdsSorted = [...cachedVideoIds].sort();

        if (currentVideoIdsSorted.length !== cachedVideoIdsSorted.length) {
            return false; // Different number of videos
        }

        // Check if all video IDs match
        for (let i = 0; i < currentVideoIdsSorted.length; i++) {
            if (currentVideoIdsSorted[i] !== cachedVideoIdsSorted[i]) {
                return false; // Video lists don't match
            }
        }

        return true; // Cache is valid
    } catch (error) {
        console.error('Failed to check summary cache validity:', error);
        return false;
    }
};

export const updateProjectName = async (projectId: string, name: string): Promise<Project> => {
    try {
        const trimmed = (name || '').trim().slice(0, 500);
        return await databases.updateDocument<Project>(
            'main',
            COLLECTIONS.PROJECTS,
            projectId,
            {
                name: trimmed
            }
        );
    } catch (error) {
        console.error('Failed to update project name:', error);
        throw error;
    }
};

// Collection 相关操作
export const getCollections = async (): Promise<Collection[]> => {
    try {
        const { documents } = await databases.listDocuments<Collection>(
            'main',
            COLLECTIONS.COLLECTIONS,
            [Query.orderDesc('createdAt')]
        );
        return documents;
    } catch (error) {
        console.error('Failed to get collections:', error);
        return [];
    }
};

export const getCollection = async (collectionId: string): Promise<Collection | null> => {
    try {
        const { documents } = await databases.listDocuments<Collection>(
            'main',
            COLLECTIONS.COLLECTIONS,
            [Query.equal('$id', collectionId), Query.limit(1)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get collection:', error);
        return null;
    }
};

export const createCollection = async (name: string, description?: string): Promise<Collection> => {
    try {
        const trimmed = (name || '').trim().slice(0, 500);
        const trimmedDesc = description ? description.trim().slice(0, 2000) : undefined;
        
        return await databases.createDocument<Collection>(
            'main',
            COLLECTIONS.COLLECTIONS,
            ID.unique(),
            {
                name: trimmed,
                description: trimmedDesc,
                createdAt: new Date().toISOString()
            }
        );
    } catch (error) {
        console.error('Failed to create collection:', error);
        throw error;
    }
};

export const updateCollection = async (collectionId: string, name: string, description?: string): Promise<Collection> => {
    try {
        const trimmed = (name || '').trim().slice(0, 500);
        const trimmedDesc = description ? description.trim().slice(0, 2000) : undefined;
        
        const updateData: any = { name: trimmed };
        if (description !== undefined) {
            updateData.description = trimmedDesc;
        }
        
        return await databases.updateDocument<Collection>(
            'main',
            COLLECTIONS.COLLECTIONS,
            collectionId,
            updateData
        );
    } catch (error) {
        console.error('Failed to update collection:', error);
        throw error;
    }
};

export const deleteCollection = async (collectionId: string): Promise<void> => {
    try {
        // First delete all collection videos
        const { documents: collectionVideos } = await databases.listDocuments<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            [Query.equal('collectionId', collectionId)]
        );
        
        for (const collectionVideo of collectionVideos) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.COLLECTION_VIDEOS,
                collectionVideo.$id
            );
        }
        
        // Then delete the collection
        await databases.deleteDocument(
            'main',
            COLLECTIONS.COLLECTIONS,
            collectionId
        );
    } catch (error) {
        console.error('Failed to delete collection:', error);
        throw error;
    }
};

export const getCollectionByName = async (name: string): Promise<Collection | null> => {
    try {
        const { documents } = await databases.listDocuments<Collection>(
            'main',
            COLLECTIONS.COLLECTIONS,
            [Query.equal('name', name), Query.limit(1)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get collection by name:', error);
        return null;
    }
};

export const getOrCreateDefaultCollection = async (): Promise<Collection> => {
    try {
        const defaultCollection = await getCollectionByName('未分类');
        if (defaultCollection) {
            return defaultCollection;
        }
        
        return await createCollection('未分类', '默认分类，用于存放未分类的视频');
    } catch (error) {
        console.error('Failed to get or create default collection:', error);
        throw error;
    }
};

// Collection Video 相关操作
export const getCollectionVideos = async (collectionId: string): Promise<CollectionVideo[]> => {
    try {
        const { documents } = await databases.listDocuments<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            [Query.equal('collectionId', collectionId), Query.orderDesc('addedAt')]
        );
        return documents;
    } catch (error) {
        console.error('Failed to get collection videos:', error);
        return [];
    }
};

export const addVideoToCollection = async (collectionId: string, videoId: string): Promise<CollectionVideo> => {
    try {
        // Check if video is already in collection
        const existing = await databases.listDocuments<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            [Query.equal('collectionId', collectionId), Query.equal('videoId', videoId), Query.limit(1)]
        );
        
        if (existing.documents.length > 0) {
            return existing.documents[0]; // Already exists, return existing record
        }
        
        return await databases.createDocument<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            ID.unique(),
            {
                collectionId,
                videoId,
                addedAt: new Date().toISOString()
            }
        );
    } catch (error) {
        console.error('Failed to add video to collection:', error);
        throw error;
    }
};

export const removeVideoFromCollection = async (collectionId: string, videoId: string): Promise<void> => {
    try {
        const { documents } = await databases.listDocuments<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            [Query.equal('collectionId', collectionId), Query.equal('videoId', videoId), Query.limit(1)]
        );
        
        if (documents.length > 0) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.COLLECTION_VIDEOS,
                documents[0].$id
            );
        }
    } catch (error) {
        console.error('Failed to remove video from collection:', error);
        throw error;
    }
};

export const isVideoInCollection = async (collectionId: string, videoId: string): Promise<boolean> => {
    try {
        const { documents } = await databases.listDocuments<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            [Query.equal('collectionId', collectionId), Query.equal('videoId', videoId), Query.limit(1)]
        );
        return documents.length > 0;
    } catch (error) {
        console.error('Failed to check if video is in collection:', error);
        return false;
    }
};

export const getVideoCollections = async (videoId: string): Promise<Collection[]> => {
    try {
        const { documents: collectionVideos } = await databases.listDocuments<CollectionVideo>(
            'main',
            COLLECTIONS.COLLECTION_VIDEOS,
            [Query.equal('videoId', videoId)]
        );
        
        if (collectionVideos.length === 0) {
            return [];
        }
        
        const collectionIds = collectionVideos.map(cv => cv.collectionId);
        // Fetch each collection individually since Appwrite doesn't support array queries
        const collections: Collection[] = [];
        for (const collectionId of collectionIds) {
            const collection = await getCollection(collectionId);
            if (collection) {
                collections.push(collection);
            }
        }
        
        return collections;
    } catch (error) {
        console.error('Failed to get video collections:', error);
        return [];
    }
};

// Collection Summary 相关操作
export const getCollectionSummary = async (collectionId: string): Promise<CollectionSummary | null> => {
    try {
        const { documents } = await databases.listDocuments<CollectionSummary>(
            'main',
            COLLECTIONS.COLLECTION_SUMMARIES,
            [Query.equal('collectionId', collectionId), Query.limit(1)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get collection summary:', error);
        return null;
    }
};

export const createCollectionSummary = async (summaryData: {
    collectionId: string;
    title: string;
    body: string;
    keyTakeaway: string;
    videoIds: string;
    isStale: boolean;
}): Promise<CollectionSummary> => {
    const payload = {
        collectionId: summaryData.collectionId,
        title: (summaryData.title || '').slice(0, 500),
        body: (summaryData.body || '').slice(0, 20000),
        keyTakeaway: (summaryData.keyTakeaway || '').slice(0, 2000),
        videoIds: (summaryData.videoIds || '').slice(0, 5000),
        generatedAt: new Date().toISOString(),
        isStale: summaryData.isStale ?? false
    };

    return await databases.createDocument<CollectionSummary>(
        'main',
        COLLECTIONS.COLLECTION_SUMMARIES,
        ID.unique(),
        payload
    );
};

export const updateCollectionSummary = async (collectionId: string, updateData: Partial<{
    title: string;
    body: string;
    keyTakeaway: string;
    videoIds: string;
    isStale: boolean;
}>): Promise<CollectionSummary> => {
    const existing = await getCollectionSummary(collectionId);
    if (!existing) {
        throw new Error('Collection summary not found');
    }
    
    const payload: any = {};
    if (updateData.title !== undefined) payload.title = (updateData.title || '').slice(0, 500);
    if (updateData.body !== undefined) payload.body = (updateData.body || '').slice(0, 20000);
    if (updateData.keyTakeaway !== undefined) payload.keyTakeaway = (updateData.keyTakeaway || '').slice(0, 2000);
    if (updateData.videoIds !== undefined) payload.videoIds = (updateData.videoIds || '').slice(0, 5000);
    if (updateData.isStale !== undefined) payload.isStale = updateData.isStale;
    
    return await databases.updateDocument<CollectionSummary>(
        'main',
        COLLECTIONS.COLLECTION_SUMMARIES,
        existing.$id,
        payload
    );
};

export const deleteCollectionSummary = async (collectionId: string): Promise<void> => {
    try {
        const existing = await getCollectionSummary(collectionId);
        if (existing) {
            await databases.deleteDocument(
                'main',
                COLLECTIONS.COLLECTION_SUMMARIES,
                existing.$id
            );
        }
    } catch (error) {
        console.error('Failed to delete collection summary:', error);
        throw error;
    }
};

export const markCollectionSummaryStale = async (collectionId: string): Promise<void> => {
    try {
        const existing = await getCollectionSummary(collectionId);
        if (existing) {
            await databases.updateDocument<CollectionSummary>(
                'main',
                COLLECTIONS.COLLECTION_SUMMARIES,
                existing.$id,
                { isStale: true }
            );
        }
    } catch (error) {
        console.error('Failed to mark collection summary as stale:', error);
        // Don't throw error, as this is not critical
    }
};

export const checkCollectionSummaryCacheValidity = async (collectionId: string, currentVideoIds: string[]): Promise<boolean> => {
    try {
        const cachedSummary = await getCollectionSummary(collectionId);
        if (!cachedSummary) {
            return false; // No cache exists
        }

        if (cachedSummary.isStale) {
            return false; // Cache is marked as stale
        }

        // Compare video IDs
        const cachedVideoIds = cachedSummary.videoIds.split(',').filter(id => id.trim());
        const currentVideoIdsSorted = [...currentVideoIds].sort();
        const cachedVideoIdsSorted = [...cachedVideoIds].sort();

        if (currentVideoIdsSorted.length !== cachedVideoIdsSorted.length) {
            return false; // Different number of videos
        }

        // Check if all video IDs match
        for (let i = 0; i < currentVideoIdsSorted.length; i++) {
            if (currentVideoIdsSorted[i] !== cachedVideoIdsSorted[i]) {
                return false; // Video lists don't match
            }
        }

        return true; // Cache is valid
    } catch (error) {
        console.error('Failed to check collection summary cache validity:', error);
        return false;
    }
};

// Cluster 相关操作
export const getAllSummariesWithEmbeddings = async (): Promise<Array<{ videoId: string; embedding: number[]; title: string; summary: string }>> => {
    try {
        // 从 video_embeddings 表获取所有有嵌入的视频
        const allEmbeddings: VideoEmbedding[] = [];
        let lastId: string | undefined = undefined;
        const pageSize = 100;
        
        let pageCount = 0;
        while (true) {
            const queries = [Query.limit(pageSize), Query.orderAsc('$id')];
            if (lastId) {
                queries.push(Query.cursorAfter(lastId));
            }
            
            pageCount++;
            console.log(`[getAllSummariesWithEmbeddings] Fetching embeddings page ${pageCount}...`);
            
            const { documents, total } = await databases.listDocuments<VideoEmbedding>(
                'main',
                COLLECTIONS.VIDEO_EMBEDDINGS,
                queries
            );
            
            allEmbeddings.push(...documents);
            console.log(`[getAllSummariesWithEmbeddings] Page ${pageCount}: fetched ${documents.length} embeddings (total: ${allEmbeddings.length}/${total})`);
            
            if (documents.length < pageSize || allEmbeddings.length >= total) {
                break;
            }
            
            lastId = documents[documents.length - 1].$id;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`[getAllSummariesWithEmbeddings] Fetched ${allEmbeddings.length} total embeddings in ${pageCount} pages`);
        
        // 过滤有效的嵌入
        const validEmbeddings = allEmbeddings.filter(doc => {
            const emb: any = doc.embedding;
            if (emb === null || emb === undefined) return false;
            if (typeof emb === 'string') {
                return emb.trim() !== '';
            }
            if (Array.isArray(emb)) {
                return emb.length > 0;
            }
            return false;
        });

        // 获取对应的标题和摘要
        const results: Array<{ videoId: string; embedding: number[]; title: string; summary: string }> = [];
        
        for (const embDoc of validEmbeddings) {
            let embedding: number[] = [];
            if (typeof embDoc.embedding === 'string') {
                try {
                    embedding = JSON.parse(embDoc.embedding as any);
                } catch (e) {
                    console.warn(`Failed to parse embedding for video ${embDoc.videoId}:`, e);
                    continue;
                }
            } else if (Array.isArray(embDoc.embedding)) {
                embedding = embDoc.embedding;
            }
            
            if (embedding.length === 0) {
                continue;
            }
            
            // 获取主表和摘要内容
            const [mainDoc, summaryContent] = await Promise.all([
                getSummary(embDoc.videoId, embDoc.platform),
                getVideoSummaryContent(embDoc.videoId, embDoc.platform)
            ]);
            
            if (mainDoc && summaryContent) {
                results.push({
                    videoId: embDoc.videoId,
                    embedding,
                    title: mainDoc.title,
                    summary: summaryContent.summary
                });
            }
        }
        
        return results;
    } catch (error) {
        console.error('Failed to get summaries with embeddings:', error);
        throw error;
    }
};

export const createCluster = async (name: string, description?: string, videoCount: number = 0): Promise<Cluster> => {
    try {
        return await databases.createDocument<Cluster>(
            'main',
            COLLECTIONS.CLUSTERS,
            ID.unique(),
            {
                name,
                description,
                videoCount,
                createdAt: new Date().toISOString()
            }
        );
    } catch (error) {
        console.error('Failed to create cluster:', error);
        throw error;
    }
};

export const assignVideoToCluster = async (videoId: string, clusterId: string): Promise<VideoCluster> => {
    try {
        // Check if assignment already exists
        const existing = await databases.listDocuments<VideoCluster>(
            'main',
            COLLECTIONS.VIDEO_CLUSTERS,
            [
                Query.equal('videoId', videoId),
                Query.equal('clusterId', clusterId),
                Query.limit(1)
            ]
        );
        
        if (existing.documents.length > 0) {
            return existing.documents[0];
        }
        
        return await databases.createDocument<VideoCluster>(
            'main',
            COLLECTIONS.VIDEO_CLUSTERS,
            ID.unique(),
            {
                videoId,
                clusterId,
                createdAt: new Date().toISOString()
            }
        );
    } catch (error) {
        console.error('Failed to assign video to cluster:', error);
        throw error;
    }
};

export const getClusters = async (): Promise<Cluster[]> => {
    try {
        // Use pagination to get all clusters (Appwrite has default limit)
        const allClusters: Cluster[] = [];
        let lastId: string | undefined = undefined;
        const pageSize = 100; // Fetch in batches
        
        while (true) {
            const queries = [Query.limit(pageSize), Query.orderDesc('createdAt')];
            if (lastId) {
                queries.push(Query.cursorAfter(lastId));
            }
            
            const { documents, total } = await databases.listDocuments<Cluster>(
                'main',
                COLLECTIONS.CLUSTERS,
                queries
            );
            
            allClusters.push(...documents);
            
            // Check if we've fetched all clusters
            if (documents.length < pageSize || allClusters.length >= total) {
                break;
            }
            
            lastId = documents[documents.length - 1].$id;
        }
        
        console.log(`[getClusters] Fetched ${allClusters.length} clusters`);
        return allClusters;
    } catch (error) {
        console.error('Failed to get clusters:', error);
        return [];
    }
};

export const getOrCreateUncategorizedCluster = async (): Promise<Cluster> => {
    try {
        const uncategorizedName = '未分类';
        // Try to find existing "未分类" cluster
        const { documents } = await databases.listDocuments<Cluster>(
            'main',
            COLLECTIONS.CLUSTERS,
            [Query.equal('name', uncategorizedName), Query.limit(1)]
        );
        
        if (documents.length > 0) {
            return documents[0];
        }
        
        // Create new "未分类" cluster if not found
        return await createCluster(
            uncategorizedName,
            'HDBSCAN聚类算法判定为噪声点的视频',
            0
        );
    } catch (error) {
        console.error('Failed to get or create uncategorized cluster:', error);
        throw error;
    }
};

export const getVideosByCluster = async (clusterId: string): Promise<SummaryData[]> => {
    try {
        const { documents: videoClusters } = await databases.listDocuments<VideoCluster>(
            'main',
            COLLECTIONS.VIDEO_CLUSTERS,
            [Query.equal('clusterId', clusterId)]
        );
        
        if (videoClusters.length === 0) {
            return [];
        }
        
        const videoIds = videoClusters.map(vc => vc.videoId);
        const summaries: SummaryData[] = [];
        
        // Fetch each summary individually since Appwrite doesn't support array queries
        for (const videoId of videoIds) {
            const summary = await getSummary(videoId);
            if (summary) {
                summaries.push(summary);
            }
        }
        
        return summaries;
    } catch (error) {
        console.error('Failed to get videos by cluster:', error);
        return [];
    }
};

export const updateClusterVideoCount = async (clusterId: string, videoCount: number): Promise<Cluster> => {
    try {
        const cluster = await databases.getDocument<Cluster>(
            'main',
            COLLECTIONS.CLUSTERS,
            clusterId
        );
        
        return await databases.updateDocument<Cluster>(
            'main',
            COLLECTIONS.CLUSTERS,
            clusterId,
            { videoCount }
        );
    } catch (error) {
        console.error('Failed to update cluster video count:', error);
        throw error;
    }
};

export const clearClusterAssignments = async (): Promise<void> => {
    try {
        // Step 1: Delete existing collections
        console.log('[clearClusterAssignments] Deleting existing collections...');
        
        const existingCollections = await databases.listCollections('main');
        
        // Delete video_clusters collection if it exists
        const videoClustersCollection = existingCollections.collections.find(c => c.name === COLLECTIONS.VIDEO_CLUSTERS);
        if (videoClustersCollection) {
            console.log(`[clearClusterAssignments] Deleting collection '${COLLECTIONS.VIDEO_CLUSTERS}'...`);
            await databases.deleteCollection('main', videoClustersCollection.$id);
            console.log(`[clearClusterAssignments] Deleted collection '${COLLECTIONS.VIDEO_CLUSTERS}'`);
        }
        
        // Delete clusters collection if it exists
        const clustersCollection = existingCollections.collections.find(c => c.name === COLLECTIONS.CLUSTERS);
        if (clustersCollection) {
            console.log(`[clearClusterAssignments] Deleting collection '${COLLECTIONS.CLUSTERS}'...`);
            await databases.deleteCollection('main', clustersCollection.$id);
            console.log(`[clearClusterAssignments] Deleted collection '${COLLECTIONS.CLUSTERS}'`);
        }
        
        // Step 2: Recreate collections
        console.log('[clearClusterAssignments] Recreating collections...');
        
        // Create clusters collection
        console.log(`[clearClusterAssignments] Creating collection '${COLLECTIONS.CLUSTERS}'...`);
        const createdClustersCollection = await databases.createCollection(
            'main',
            COLLECTIONS.CLUSTERS,
            COLLECTIONS.CLUSTERS,
            [Permission.write(Role.any())]
        );
        
        // Create attributes for clusters
        await databases.createStringAttribute(
            'main',
            createdClustersCollection.$id,
            'name',
            500,
            true
        );
        await databases.createStringAttribute(
            'main',
            createdClustersCollection.$id,
            'description',
            2000,
            false
        );
        await databases.createIntegerAttribute(
            'main',
            createdClustersCollection.$id,
            'videoCount',
            true
        );
        await databases.createDatetimeAttribute(
            'main',
            createdClustersCollection.$id,
            'createdAt',
            true
        );
        
        console.log(`[clearClusterAssignments] Created collection '${COLLECTIONS.CLUSTERS}'`);
        
        // Create video_clusters collection
        console.log(`[clearClusterAssignments] Creating collection '${COLLECTIONS.VIDEO_CLUSTERS}'...`);
        const createdVideoClustersCollection = await databases.createCollection(
            'main',
            COLLECTIONS.VIDEO_CLUSTERS,
            COLLECTIONS.VIDEO_CLUSTERS,
            [Permission.write(Role.any())]
        );
        
        // Create attributes for video_clusters
        await databases.createStringAttribute(
            'main',
            createdVideoClustersCollection.$id,
            'videoId',
            255,
            true
        );
        await databases.createStringAttribute(
            'main',
            createdVideoClustersCollection.$id,
            'clusterId',
            255,
            true
        );
        await databases.createDatetimeAttribute(
            'main',
            createdVideoClustersCollection.$id,
            'createdAt',
            true
        );
        
        console.log(`[clearClusterAssignments] Created collection '${COLLECTIONS.VIDEO_CLUSTERS}'`);
        
        console.log('[clearClusterAssignments] Successfully cleared and recreated cluster collections');
    } catch (error) {
        console.error('Failed to clear cluster assignments:', error);
        throw error;
    }
};

