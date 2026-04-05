import { databases } from './appwrite.js';
import { ID, Query } from 'node-appwrite';
import type { 
    SummaryData, 
    VideoSummaryContent, 
    VideoKeyInsights, 
    VideoCommentsAnalysis, 
    FullSummaryData,
    BlockedChannel, 
    Collection, 
    CollectionVideo, 
    CollectionSummary, 
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
    // 其他表
    TRANSCRIPTS: 'transcripts',
    BLOCKED_CHANNELS: 'blocked_channels',
    COLLECTIONS: 'collections',
    COLLECTION_VIDEOS: 'collection_videos',
    COLLECTION_SUMMARIES: 'collection_summaries'
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

// 获取完整的视频摘要数据（从所有分表组合）
export const getFullSummary = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<FullSummaryData | null> => {
    try {
        // 并行获取所有分表数据
        const [summary, summaryContent, keyInsights, commentsAnalysis] = await Promise.all([
            getSummary(videoId, platform),
            getVideoSummaryContent(videoId, platform),
            getVideoKeyInsights(videoId, platform),
            getVideoCommentsAnalysis(videoId, platform)
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
            commentsCount: commentsAnalysis?.commentsCount
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
        
        console.log(`Channel data cleared successfully for channel: ${channelId}`);
        
    } catch (error) {
        console.error('Failed to clear channel data:', error);
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
