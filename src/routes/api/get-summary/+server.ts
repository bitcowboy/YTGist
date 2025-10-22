import { databases } from '$lib/server/appwrite.js';
import { upsertTranscript, isChannelBlocked } from '$lib/server/database.js';
import { getSummary } from '$lib/server/summary.js';
import { getVideoData, getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { validateNonce } from '$lib/server/nonce.js';
import type { SummaryData } from '$lib/types.js';
import { error, json } from '@sveltejs/kit';
import { ID, Query } from 'node-appwrite';

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
        // 正常流程
        console.log(`Processing video ${videoId}`);
        
        // First, let's check if there are any blocked channels at all
        try {
            const { getBlockedChannels } = await import('$lib/server/database.js');
            const blockedChannels = await getBlockedChannels();
            console.log(`Total blocked channels in database: ${blockedChannels.length}`);
            if (blockedChannels.length > 0) {
                console.log('Blocked channels:', blockedChannels.map(bc => ({ channelId: bc.channelId, channelName: bc.channelName })));
            }
        } catch (dbError) {
            console.warn('Failed to check blocked channels:', dbError);
        }
        
        const videoData = await getVideoData(videoId);
        console.log(`Got video data for ${videoId}:`, { channelId: videoData.channelId, author: videoData.author });

        // 检查频道是否被阻止
        const isBlocked = await isChannelBlocked(videoData.channelId);
        console.log(`Channel ${videoData.channelId} blocked status:`, isBlocked);
        if (isBlocked) {
            console.log(`Channel ${videoData.channelId} (${videoData.author}) is blocked, refusing to process video ${videoId}`);
            console.log('Returning 403 error with CHANNEL_BLOCKED message');
            return error(403, 'CHANNEL_BLOCKED');
        }

        const unsavedSummaryData = await getSummary(videoData);

        // 保存原始字幕
        try { await upsertTranscript(videoId, videoData.transcript); } catch (e) { console.warn('persist transcript failed:', e); }

        const clamp = (v: string | undefined | null, max: number) =>
            (v ?? '').slice(0, max);

        // Upsert by videoId to avoid duplicate-ID races
        const existing = await databases.listDocuments<SummaryData>('main', 'summaries', [
            Query.equal('videoId', videoId),
            Query.limit(1)
        ]);

        let summaryData: SummaryData;
        if (existing.total > 0) {
            const doc = existing.documents[0];
            summaryData = await databases.updateDocument<SummaryData>('main', 'summaries', doc.$id, {
                title: clamp(videoData.title, 100),
                description: clamp(videoData.description, 5000),
                author: clamp(videoData.author, 100),
                channelId: videoData.channelId,
                summary: clamp(unsavedSummaryData.summary, 5000),
                keyPoints: unsavedSummaryData.keyPoints,
                keyTakeaway: clamp(unsavedSummaryData.keyTakeaway, 500),
                coreTerms: unsavedSummaryData.coreTerms,
                hasSubtitles: true,
                publishedAt: videoData.publishedAt,
                commentsSummary: clamp(videoData.commentsSummary || '', 1000),
                commentsKeyPoints: videoData.commentsKeyPoints || [],
                commentsCount: videoData.commentsCount || 0
            });
        } else {
            summaryData = await databases.createDocument<SummaryData>(
                'main',
                'summaries',
                ID.unique(),
                {
                    videoId,
                    title: clamp(videoData.title, 100),
                    description: clamp(videoData.description, 5000),
                    author: clamp(videoData.author, 100),
                    channelId: videoData.channelId,
                    summary: clamp(unsavedSummaryData.summary, 5000),
                    keyPoints: unsavedSummaryData.keyPoints,
                    keyTakeaway: clamp(unsavedSummaryData.keyTakeaway, 500),
                    coreTerms: unsavedSummaryData.coreTerms,
                    hasSubtitles: true,
                    publishedAt: videoData.publishedAt,
                    commentsSummary: clamp(videoData.commentsSummary || '', 1000),
                    commentsKeyPoints: videoData.commentsKeyPoints || [],
                    commentsCount: videoData.commentsCount || 0
                }
            );
        }

        return json(summaryData);
    } catch (e) {
        console.error('Failed to process video:', e);
        console.error('Error details:', {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
            name: e instanceof Error ? e.name : 'Unknown'
        });

        // First, try to get basic video data to check if channel is blocked
        let channelBlocked = false;
        try {
            console.log(`Attempting to get basic video data for ${videoId} to check block status`);
            const basicVideoData = await getVideoDataWithoutTranscript(videoId);
            console.log(`Got basic video data:`, { channelId: basicVideoData.channelId, author: basicVideoData.author });
            
            const isBlocked = await isChannelBlocked(basicVideoData.channelId);
            console.log(`Channel ${basicVideoData.channelId} blocked status (from catch block):`, isBlocked);
            if (isBlocked) {
                console.log(`Channel ${basicVideoData.channelId} (${basicVideoData.author}) is blocked, refusing to process video ${videoId}`);
                console.log('Setting channelBlocked flag to true');
                channelBlocked = true;
            }
        } catch (basicDataError) {
            console.warn('Failed to get basic video data for block check:', basicDataError);
            console.warn('Basic data error details:', {
                message: basicDataError instanceof Error ? basicDataError.message : String(basicDataError),
                stack: basicDataError instanceof Error ? basicDataError.stack : undefined
            });
            
            // If the basic data error is a 403 CHANNEL_BLOCKED error, set the flag
            if (basicDataError instanceof Error && basicDataError.message.includes('CHANNEL_BLOCKED')) {
                console.log('Detected CHANNEL_BLOCKED in basic data error, setting channelBlocked flag');
                channelBlocked = true;
            }
        }
        
        // If channel is blocked, return 403 immediately
        if (channelBlocked) {
            console.log('Channel is blocked, returning 403 error with CHANNEL_BLOCKED message');
            return error(403, 'CHANNEL_BLOCKED');
        }

        // 明确区分：没有字幕 vs 暂时获取失败
        if (e instanceof Error) {
            // 明确无字幕：创建占位记录，避免后续重复尝试
            if (e.message === 'NO_SUBTITLES_AVAILABLE') {
                try {
                    const basic = await getVideoDataWithoutTranscript(videoId);
                    
                    // 检查频道是否被阻止
                    const isBlocked = await isChannelBlocked(basic.channelId);
                    if (isBlocked) {
                        console.log(`Channel ${basic.channelId} (${basic.author}) is blocked, refusing to process video ${videoId}`);
                        console.log('Returning 403 error with CHANNEL_BLOCKED message (no subtitles case)');
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