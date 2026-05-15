import { pb, ensureAdminAuth, escapeFilterValue, withCreatedTimestamps, withUpdatedTimestamp } from './pocketbase.js';
import type {
    SummaryData,
    VideoSummaryContent,
    VideoKeyInsights,
    VideoCommentsAnalysis,
    FullSummaryData,
    BlockedChannel,
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
    BLOCKED_CHANNELS: 'blocked_channels'
} as const;

const buildVideoFilter = (videoId: string, platform: VideoPlatform) =>
    `videoId = "${escapeFilterValue(videoId)}" && platform = "${escapeFilterValue(platform)}"`;

const findFirst = async <T>(collection: string, filter: string): Promise<T | null> => {
    await ensureAdminAuth();
    try {
        const record = await pb.collection(collection).getFirstListItem<T>(filter);
        return record;
    } catch (err: any) {
        if (err?.status === 404) return null;
        throw err;
    }
};

// ============ 分表操作 ============

// 获取主表数据（仅基础信息和元数据）
export const getSummary = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<SummaryData | null> => {
    try {
        return await findFirst<SummaryData>(COLLECTIONS.SUMMARIES, buildVideoFilter(videoId, platform));
    } catch (error) {
        console.error('Failed to get summary:', error);
        return null;
    }
};

// 获取视频摘要内容
export const getVideoSummaryContent = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoSummaryContent | null> => {
    try {
        return await findFirst<VideoSummaryContent>(COLLECTIONS.VIDEO_SUMMARIES, buildVideoFilter(videoId, platform));
    } catch (error) {
        console.error('Failed to get video summary content:', error);
        return null;
    }
};

// 获取关键要点
export const getVideoKeyInsights = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoKeyInsights | null> => {
    try {
        return await findFirst<VideoKeyInsights>(COLLECTIONS.VIDEO_KEY_INSIGHTS, buildVideoFilter(videoId, platform));
    } catch (error) {
        console.error('Failed to get video key insights:', error);
        return null;
    }
};

// 获取评论分析
export const getVideoCommentsAnalysis = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<VideoCommentsAnalysis | null> => {
    try {
        return await findFirst<VideoCommentsAnalysis>(COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, buildVideoFilter(videoId, platform));
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
    await ensureAdminAuth();

    // Clamp fields to attribute limits to avoid invalid_structure errors
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

    const mainDoc = await pb.collection(COLLECTIONS.SUMMARIES).create<SummaryData>(withCreatedTimestamps(mainPayload));

    // 2. 创建摘要内容子表数据
    const summaryContentPayload = {
        videoId,
        platform,
        summary: clamp(summaryData.summary, 5000)
    };

    await pb.collection(COLLECTIONS.VIDEO_SUMMARIES).create<VideoSummaryContent>(withCreatedTimestamps(summaryContentPayload));

    // 3. 创建关键要点子表数据
    const keyInsightsPayload = {
        videoId,
        platform,
        keyTakeaway: clamp(summaryData.keyTakeaway, 600),
        keyPoints: safeKeyPoints,
        coreTerms: safeCoreTerms
    };

    await pb.collection(COLLECTIONS.VIDEO_KEY_INSIGHTS).create<VideoKeyInsights>(withCreatedTimestamps(keyInsightsPayload) as any);

    // 4. 创建评论分析子表数据
    const commentsPayload = {
        videoId,
        platform,
        commentsSummary: clamp(summaryData.commentsSummary, 1000),
        commentsKeyPoints: safeCommentsKeyPoints,
        commentsCount: summaryData.commentsCount || 0
    };

    await pb.collection(COLLECTIONS.VIDEO_COMMENTS_ANALYSIS).create<VideoCommentsAnalysis>(withCreatedTimestamps(commentsPayload) as any);

    // 解析 JSON 字符串回数组的辅助函数
    const parseJsonArray = (jsonStr: string): string[] => {
        try {
            const parsed = JSON.parse(jsonStr);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    // 返回组合后的完整数据
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
    await ensureAdminAuth();
    return await pb.collection(COLLECTIONS.SUMMARIES).update<SummaryData>(existing.id, withUpdatedTimestamp(updateData));
};

// 更新视频摘要内容
export const updateVideoSummaryContent = async (videoId: string, platform: VideoPlatform = 'youtube', summary: string): Promise<VideoSummaryContent> => {
    const existing = await getVideoSummaryContent(videoId, platform);
    await ensureAdminAuth();
    if (!existing) {
        return await pb.collection(COLLECTIONS.VIDEO_SUMMARIES).create<VideoSummaryContent>(
            withCreatedTimestamps({ videoId, platform, summary: summary.slice(0, 5000) })
        );
    }
    return await pb.collection(COLLECTIONS.VIDEO_SUMMARIES).update<VideoSummaryContent>(
        existing.id,
        withUpdatedTimestamp({ summary: summary.slice(0, 5000) })
    );
};

// 更新关键要点
export const updateVideoKeyInsights = async (videoId: string, platform: VideoPlatform = 'youtube', updateData: Partial<{
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
}>): Promise<VideoKeyInsights> => {
    const existing = await getVideoKeyInsights(videoId, platform);
    await ensureAdminAuth();

    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
    const payload: any = {};
    if (updateData.keyTakeaway !== undefined) payload.keyTakeaway = clamp(updateData.keyTakeaway, 600);
    if (updateData.keyPoints !== undefined) payload.keyPoints = JSON.stringify(updateData.keyPoints.map(kp => clamp(kp, 200)).slice(0, 15));
    if (updateData.coreTerms !== undefined) payload.coreTerms = JSON.stringify(updateData.coreTerms.map(ct => clamp(ct, 100)).slice(0, 15));

    if (!existing) {
        return await pb.collection(COLLECTIONS.VIDEO_KEY_INSIGHTS).create<VideoKeyInsights>(
            withCreatedTimestamps({ videoId, platform, ...payload })
        );
    }
    return await pb.collection(COLLECTIONS.VIDEO_KEY_INSIGHTS).update<VideoKeyInsights>(existing.id, withUpdatedTimestamp(payload));
};

// 更新评论分析
export const updateVideoCommentsAnalysis = async (videoId: string, platform: VideoPlatform = 'youtube', updateData: Partial<{
    commentsSummary: string;
    commentsKeyPoints: string[];
    commentsCount: number;
}>): Promise<VideoCommentsAnalysis> => {
    const existing = await getVideoCommentsAnalysis(videoId, platform);
    await ensureAdminAuth();

    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
    const payload: any = {};
    if (updateData.commentsSummary !== undefined) payload.commentsSummary = clamp(updateData.commentsSummary, 1000);
    if (updateData.commentsKeyPoints !== undefined) payload.commentsKeyPoints = JSON.stringify(updateData.commentsKeyPoints.map(ckp => clamp(ckp, 150)).slice(0, 10));
    if (updateData.commentsCount !== undefined) payload.commentsCount = updateData.commentsCount;

    if (!existing) {
        return await pb.collection(COLLECTIONS.VIDEO_COMMENTS_ANALYSIS).create<VideoCommentsAnalysis>(
            withCreatedTimestamps({ videoId, platform, ...payload })
        );
    }
    return await pb.collection(COLLECTIONS.VIDEO_COMMENTS_ANALYSIS).update<VideoCommentsAnalysis>(existing.id, withUpdatedTimestamp(payload));
};

export const incrementSummaryHits = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<SummaryData> => {
    const existing = await getSummary(videoId, platform);
    if (!existing) {
        throw new Error('Summary not found');
    }
    await ensureAdminAuth();
    return await pb.collection(COLLECTIONS.SUMMARIES).update<SummaryData>(
        existing.id,
        withUpdatedTimestamp({ hits: (existing.hits || 0) + 1 })
    );
};

// Transcript 相关操作
export const upsertTranscript = async (
    videoId: string,
    transcript: string
) => {
    await ensureAdminAuth();
    try {
        const existing = await findFirst<{ id: string }>(
            COLLECTIONS.TRANSCRIPTS,
            `videoId = "${escapeFilterValue(videoId)}"`
        );
        if (existing) {
            return await pb.collection(COLLECTIONS.TRANSCRIPTS).update(existing.id, withUpdatedTimestamp({ transcript }));
        }
        return await pb.collection(COLLECTIONS.TRANSCRIPTS).create(withCreatedTimestamps({ videoId, transcript }));
    } catch (error) {
        console.error('Failed to upsert transcript:', error);
        throw error;
    }
};

export const getTranscriptByVideoId = async (
    videoId: string
): Promise<string | null> => {
    try {
        const record = await findFirst<{ transcript?: string }>(
            COLLECTIONS.TRANSCRIPTS,
            `videoId = "${escapeFilterValue(videoId)}"`
        );
        if (!record) {
            console.log('[db] transcript miss for', videoId);
            return null;
        }
        const value = (record.transcript ?? '') || null;
        if (value) {
            console.log('[db] transcript hit for', videoId, `(length=${value.length})`);
        } else {
            console.log('[db] transcript empty for', videoId);
        }
        return value;
    } catch (error) {
        console.error('Failed to get transcript by videoId:', error);
        return null;
    }
};

// Blocked Channel 相关操作
export const getBlockedChannels = async (): Promise<BlockedChannel[]> => {
    try {
        await ensureAdminAuth();
        return await pb.collection(COLLECTIONS.BLOCKED_CHANNELS).getFullList<BlockedChannel>({
            sort: '-created'
        });
    } catch (error) {
        console.error('Failed to get blocked channels:', error);
        return [];
    }
};

export const isChannelBlocked = async (channelId: string): Promise<boolean> => {
    try {
        const record = await findFirst<BlockedChannel>(
            COLLECTIONS.BLOCKED_CHANNELS,
            `channelId = "${escapeFilterValue(channelId)}"`
        );
        return record !== null;
    } catch (error) {
        console.error('Failed to check if channel is blocked:', error);
        return false;
    }
};

export const addBlockedChannel = async (channelId: string, channelName: string): Promise<BlockedChannel> => {
    try {
        await ensureAdminAuth();
        const existing = await findFirst<BlockedChannel>(
            COLLECTIONS.BLOCKED_CHANNELS,
            `channelId = "${escapeFilterValue(channelId)}"`
        );

        if (existing) {
            // 如果频道已经被阻止，仍然清除数据（以防有新的数据）
            await clearChannelData(channelId);
            return existing;
        }

        // 在添加到block list之前，先清除该频道的所有数据
        await clearChannelData(channelId);

        return await pb.collection(COLLECTIONS.BLOCKED_CHANNELS).create<BlockedChannel>(withCreatedTimestamps({
            channelId,
            channelName,
            blockedAt: new Date().toISOString()
        }));
    } catch (error) {
        console.error('Failed to add blocked channel:', error);
        throw error;
    }
};

export const removeBlockedChannel = async (channelId: string): Promise<void> => {
    try {
        await ensureAdminAuth();
        const existing = await findFirst<BlockedChannel>(
            COLLECTIONS.BLOCKED_CHANNELS,
            `channelId = "${escapeFilterValue(channelId)}"`
        );
        if (existing) {
            await pb.collection(COLLECTIONS.BLOCKED_CHANNELS).delete(existing.id);
        }
    } catch (error) {
        console.error('Failed to remove blocked channel:', error);
        throw error;
    }
};

export const clearBlockedChannels = async (): Promise<void> => {
    try {
        await ensureAdminAuth();
        const records = await pb.collection(COLLECTIONS.BLOCKED_CHANNELS).getFullList<BlockedChannel>();
        for (const record of records) {
            await pb.collection(COLLECTIONS.BLOCKED_CHANNELS).delete(record.id);
        }
    } catch (error) {
        console.error('Failed to clear blocked channels:', error);
        throw error;
    }
};

// 清除指定频道的所有数据
export const clearChannelData = async (channelId: string): Promise<void> => {
    try {
        await ensureAdminAuth();
        console.log(`Clearing all data for channel: ${channelId}`);

        // 1. 从summaries表中获取该频道的所有videoId
        const summaries = await pb.collection(COLLECTIONS.SUMMARIES).getFullList<SummaryData>({
            filter: `channelId = "${escapeFilterValue(channelId)}"`
        });

        const videoIds = summaries.map((s) => s.videoId);
        console.log(`Found ${videoIds.length} videos for channel ${channelId}:`, videoIds);

        // 2. 删除主表 + 三个子表的记录
        for (const summary of summaries) {
            try {
                await pb.collection(COLLECTIONS.SUMMARIES).delete(summary.id);
                console.log(`Deleted summary for video: ${summary.videoId}`);
            } catch (error) {
                console.error(`Failed to delete summary for video ${summary.videoId}:`, error);
            }

            for (const childCollection of [COLLECTIONS.VIDEO_SUMMARIES, COLLECTIONS.VIDEO_KEY_INSIGHTS, COLLECTIONS.VIDEO_COMMENTS_ANALYSIS]) {
                try {
                    const children = await pb.collection(childCollection).getFullList<{ id: string }>({
                        filter: `videoId = "${escapeFilterValue(summary.videoId)}"`
                    });
                    for (const child of children) {
                        await pb.collection(childCollection).delete(child.id);
                    }
                } catch (error) {
                    console.error(`Failed to delete ${childCollection} for video ${summary.videoId}:`, error);
                }
            }
        }

        // 3. 删除transcripts表中的记录
        for (const videoId of videoIds) {
            try {
                const transcripts = await pb.collection(COLLECTIONS.TRANSCRIPTS).getFullList<{ id: string }>({
                    filter: `videoId = "${escapeFilterValue(videoId)}"`
                });
                for (const transcript of transcripts) {
                    await pb.collection(COLLECTIONS.TRANSCRIPTS).delete(transcript.id);
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
