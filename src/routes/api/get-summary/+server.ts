import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { validateNonce } from '$lib/server/nonce.js';
import { generateVideoSummary } from '$lib/server/video-summary-service.js';
import { error, json } from '@sveltejs/kit';
import { ID, Query } from 'node-appwrite';
import { databases } from '$lib/server/appwrite.js';
import type { SummaryData } from '$lib/types.js';

export const GET = async ({ url }) => {
    const videoId = url.searchParams.get('v');
    const nonce = url.searchParams.get('nonce');

    if (!videoId || videoId.length !== 11) {
        return error(400, 'Bad YouTube video ID!');
    }

    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        // 使用统一的视频总结生成服务
        const result = await generateVideoSummary(videoId);
        
        if (!result.success) {
            if (result.errorType === 'CHANNEL_BLOCKED') {
                return error(403, 'CHANNEL_BLOCKED');
            }
            if (result.errorType === 'NO_SUBTITLES') {
                return error(404, 'NO_SUBTITLES_AVAILABLE');
            }
            return error(500, result.error);
        }

        return json(result.summaryData);
    } catch (e) {
        console.error('Failed to process video:', e);
        console.error('Error details:', {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
            name: e instanceof Error ? e.name : 'Unknown'
        });

        // 处理无字幕情况：创建占位记录
        if (e instanceof Error && e.message === 'NO_SUBTITLES_AVAILABLE') {
            try {
                const basic = await getVideoDataWithoutTranscript(videoId);
                
                // 检查频道是否被阻止
                const { isChannelBlocked } = await import('$lib/server/database.js');
                const isBlocked = await isChannelBlocked(basic.channelId);
                if (isBlocked) {
                    console.log(`Channel ${basic.channelId} (${basic.author}) is blocked, refusing to process video ${videoId}`);
                    return error(403, 'CHANNEL_BLOCKED');
                }
                
                const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
                const existing = await databases.listDocuments<SummaryData>('main', 'summaries', [
                    Query.equal('videoId', videoId),
                    Query.limit(1)
                ]);
                
                if (existing.total > 0) {
                    const doc = existing.documents[0];
                    await databases.updateDocument<SummaryData>('main', 'summaries', doc.$id, {
                        title: clamp(basic.title, 100),
                        description: clamp(basic.description, 5000),
                        author: clamp(basic.author, 100),
                        channelId: basic.channelId,
                        summary: '',
                        keyPoints: [],
                        keyTakeaway: '',
                        coreTerms: [],
                        hasSubtitles: false,
                        publishedAt: basic.publishedAt
                    });
                } else {
                    await databases.createDocument<SummaryData>('main', 'summaries', ID.unique(), {
                        videoId,
                        title: clamp(basic.title, 100),
                        description: clamp(basic.description, 5000),
                        author: clamp(basic.author, 100),
                        channelId: basic.channelId,
                        summary: '',
                        keyPoints: [],
                        keyTakeaway: '',
                        coreTerms: [],
                        hasSubtitles: false,
                        publishedAt: basic.publishedAt,
                        hits: 0
                    });
                }
            } catch (persistErr) {
                console.warn('Failed to persist no-subtitles placeholder:', persistErr);
            }
            return error(404, 'NO_SUBTITLES_AVAILABLE');
        }

        // 可能的临时性失败：第三方接口错误、网络错误、速率限制等
        if (e instanceof Error) {
            const msg = e.message || '';
            if (
                msg.includes('Transcript API error') ||
                msg.includes('Failed to get transcript') ||
                msg.includes('All transcript methods failed') ||
                msg.includes('Failed to get video data')
            ) {
                return error(503, 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE');
            }
        }

        return error(500, 'Failed to process video. Please try again later.');
    }
};