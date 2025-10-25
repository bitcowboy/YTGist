import { databases } from './appwrite.js';
import { ID, Query } from 'node-appwrite';
import type { SummaryData, BlockedChannel, FollowedChannel, Project, ProjectVideo, ProjectSummary, AppwriteDocument } from '$lib/types.js';

// 数据库表名常量
export const COLLECTIONS = {
    SUMMARIES: 'summaries',
    TRANSCRIPTS: 'transcripts',
    DAILY_SUMMARIES: 'daily-summaries',
    BLOCKED_CHANNELS: 'blocked_channels',
    FOLLOWED_CHANNELS: 'followed_channels',
    PROJECTS: 'projects',
    PROJECT_VIDEOS: 'project_videos',
    PROJECT_SUMMARIES: 'project_summaries'
} as const;

// Summary 相关操作
export const getSummary = async (videoId: string): Promise<SummaryData | null> => {
    try {
        const { documents } = await databases.listDocuments<SummaryData>(
            'main',
            COLLECTIONS.SUMMARIES,
            [Query.equal('videoId', videoId)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get summary:', error);
        return null;
    }
};

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
}): Promise<SummaryData> => {
    // Clamp fields to Appwrite attribute limits to avoid document_invalid_structure
    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
    const safeKeyPoints = (summaryData.keyPoints || []).map((kp) => clamp(kp, 200)).slice(0, 50);
    const safeCoreTerms = (summaryData.coreTerms || []).map((ct) => clamp(ct, 100)).slice(0, 50);

    const payload = {
        videoId: summaryData.videoId,
        title: clamp(summaryData.title, 100),
        description: clamp(summaryData.description, 5000),
        author: clamp(summaryData.author, 100),
        channelId: summaryData.channelId,
        summary: clamp(summaryData.summary, 5000),
        keyTakeaway: clamp(summaryData.keyTakeaway, 500),
        keyPoints: safeKeyPoints,
        coreTerms: safeCoreTerms,
        hasSubtitles: summaryData.hasSubtitles,
        publishedAt: summaryData.publishedAt,
        hits: 0
    } as any;

    return await databases.createDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        ID.unique(),
        payload
    );
};

export const updateSummary = async (videoId: string, updateData: Partial<{
    title: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    hasSubtitles: boolean;
    hits: number;
}>): Promise<SummaryData> => {
    const existing = await getSummary(videoId);
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

export const incrementSummaryHits = async (videoId: string): Promise<SummaryData> => {
    const existing = await getSummary(videoId);
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
    abstract: string;
    body: string;
    videoIds: string;
    isStale: boolean;
}): Promise<ProjectSummary> => {
    const payload = {
        projectId: summaryData.projectId,
        title: (summaryData.title || '').slice(0, 500),
        abstract: (summaryData.abstract || '').slice(0, 5000),
        body: (summaryData.body || '').slice(0, 20000),
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
    abstract: string;
    body: string;
    videoIds: string;
    isStale: boolean;
}>): Promise<ProjectSummary> => {
    const existing = await getProjectSummary(projectId);
    if (!existing) {
        throw new Error('Project summary not found');
    }
    
    const payload: any = {};
    if (updateData.title !== undefined) payload.title = (updateData.title || '').slice(0, 500);
    if (updateData.abstract !== undefined) payload.abstract = (updateData.abstract || '').slice(0, 5000);
    if (updateData.body !== undefined) payload.body = (updateData.body || '').slice(0, 20000);
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
