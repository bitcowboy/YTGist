import { databases } from '$lib/server/appwrite.js';
import { upsertTranscript, isChannelBlocked } from '$lib/server/database.js';
import { getSummary } from '$lib/server/summary.js';
import { getVideoData } from '$lib/server/videoData.js';
import type { SummaryData } from '$lib/types.js';
import { ID, Query } from 'node-appwrite';

export interface VideoSummaryResult {
    success: boolean;
    summaryData?: SummaryData;
    error?: string;
    errorType?: 'CHANNEL_BLOCKED' | 'NO_SUBTITLES' | 'PROCESSING_ERROR';
}

/**
 * 统一的视频总结生成服务
 * 所有视频总结都包含：频道检查、字幕保存、评论总结
 */
export const generateVideoSummary = async (videoId: string): Promise<VideoSummaryResult> => {
    const startTime = Date.now();
    try {
        console.log(`Processing video ${videoId}`);
        
        // 1. 获取视频数据（包含评论总结）
        const step1Start = Date.now();
        const videoData = await getVideoData(videoId);
        const step1Time = Date.now() - step1Start;
        console.log(`📊 Video ${videoId} - Step 1 (Get video data): ${step1Time}ms`, { channelId: videoData.channelId, author: videoData.author });

        // 2. 频道阻止检查
        const step2Start = Date.now();
        const isBlocked = await isChannelBlocked(videoData.channelId);
        const step2Time = Date.now() - step2Start;
        console.log(`📊 Video ${videoId} - Step 2 (Channel check): ${step2Time}ms - blocked: ${isBlocked}`);
        if (isBlocked) {
            console.log(`Channel ${videoData.channelId} (${videoData.author}) is blocked, refusing to process video ${videoId}`);
            return {
                success: false,
                error: 'Channel is blocked',
                errorType: 'CHANNEL_BLOCKED'
            };
        }

        // 3. 生成AI总结
        const step3Start = Date.now();
        const summaryResult = await getSummary(videoData);
        const step3Time = Date.now() - step3Start;
        console.log(`📊 Video ${videoId} - Step 3 (Generate summary): ${step3Time}ms`);

        // 4. 保存字幕
        const step4Start = Date.now();
        let step4Time = 0;
        try { 
            await upsertTranscript(videoId, videoData.transcript); 
            step4Time = Date.now() - step4Start;
            console.log(`📊 Video ${videoId} - Step 4 (Save transcript): ${step4Time}ms`);
        } catch (e) { 
            step4Time = Date.now() - step4Start;
            console.warn(`Failed to save transcript: ${e} (${step4Time}ms)`); 
        }

        // 5. 准备数据库数据
        const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);

        const summaryData = {
            videoId,
            title: clamp(videoData.title, 100),
            description: clamp(videoData.description, 5000),
            author: clamp(videoData.author, 100),
            channelId: videoData.channelId,
            summary: clamp(summaryResult.summary, 5000),
            keyTakeaway: clamp(summaryResult.keyTakeaway, 500),
            keyPoints: summaryResult.keyPoints,
            coreTerms: summaryResult.coreTerms,
            hasSubtitles: videoData.hasSubtitles,
            publishedAt: videoData.publishedAt,
            hits: 0,
            // 包含评论总结
            commentsSummary: clamp(videoData.commentsSummary || '', 1000),
            commentsKeyPoints: videoData.commentsKeyPoints || [],
            commentsCount: videoData.commentsCount || 0
        };

        // 6. 保存到数据库（upsert逻辑）
        const step5Start = Date.now();
        const existing = await databases.listDocuments<SummaryData>('main', 'summaries', [
            Query.equal('videoId', videoId),
            Query.limit(1)
        ]);

        let finalSummaryData: SummaryData;
        if (existing.total > 0) {
            const doc = existing.documents[0];
            finalSummaryData = await databases.updateDocument<SummaryData>(
                'main', 
                'summaries', 
                doc.$id, 
                summaryData
            );
        } else {
            finalSummaryData = await databases.createDocument<SummaryData>(
                'main',
                'summaries',
                ID.unique(),
                summaryData
            );
        }
        const step5Time = Date.now() - step5Start;
        console.log(`📊 Video ${videoId} - Step 5 (Save to database): ${step5Time}ms`);

        const totalTime = Date.now() - startTime;
        console.log(`✅ Successfully processed video: ${videoId} (total: ${totalTime}ms)`);
        console.log(`📊 Video ${videoId} breakdown: getData=${step1Time}ms, channelCheck=${step2Time}ms, generate=${step3Time}ms, transcript=${step4Time}ms, database=${step5Time}ms`);
        return {
            success: true,
            summaryData: finalSummaryData
        };

    } catch (error) {
        console.error('Failed to generate video summary:', error);
        
        // 处理特殊错误类型
        if (error instanceof Error) {
            if (error.message === 'NO_SUBTITLES_AVAILABLE') {
                return {
                    success: false,
                    error: 'No subtitles available',
                    errorType: 'NO_SUBTITLES'
                };
            }
        }
        
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType: 'PROCESSING_ERROR'
        };
    }
};
