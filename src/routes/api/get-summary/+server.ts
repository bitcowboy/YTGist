import { databases } from '$lib/server/appwrite.js';
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
        const videoData = await getVideoData(videoId);

        const unsavedSummaryData = await getSummary(videoData);

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
                description: clamp(videoData.description, 500),
                author: clamp(videoData.author, 100),
                summary: clamp(unsavedSummaryData.summary, 1000),
                keyPoints: unsavedSummaryData.keyPoints,
                keyTakeaway: clamp(unsavedSummaryData.keyTakeaway, 200),
                coreTerms: unsavedSummaryData.coreTerms,
                hasSubtitles: true
            });
        } else {
            summaryData = await databases.createDocument<SummaryData>(
                'main',
                'summaries',
                ID.unique(),
                {
                    videoId,
                    title: clamp(videoData.title, 100),
                    description: clamp(videoData.description, 500),
                    author: clamp(videoData.author, 100),
                    summary: clamp(unsavedSummaryData.summary, 1000),
                    keyPoints: unsavedSummaryData.keyPoints,
                    keyTakeaway: clamp(unsavedSummaryData.keyTakeaway, 200),
                    coreTerms: unsavedSummaryData.coreTerms,
                    hasSubtitles: true
                }
            );
        }

        return json(summaryData);
    } catch (e) {
        console.error('Failed to process video:', e);

        // 明确区分：没有字幕 vs 暂时获取失败
        if (e instanceof Error) {
            // 明确无字幕：创建占位记录，避免后续重复尝试
            if (e.message === 'NO_SUBTITLES_AVAILABLE') {
                try {
                    const basic = await getVideoDataWithoutTranscript(videoId);
                    const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
                    const existing = await databases.listDocuments<SummaryData>('main', 'summaries', [
                        Query.equal('videoId', videoId),
                        Query.limit(1)
                    ]);
                    if (existing.total > 0) {
                        const doc = existing.documents[0];
                        await databases.updateDocument<SummaryData>('main', 'summaries', doc.$id, {
                            title: clamp(basic.title, 100),
                            description: clamp(basic.description, 500),
                            author: clamp(basic.author, 100),
                            summary: '',
                            keyPoints: [],
                            keyTakeaway: '',
                            coreTerms: [],
                            hasSubtitles: false
                        });
                    } else {
                        await databases.createDocument<SummaryData>('main', 'summaries', ID.unique(), {
                            videoId,
                            title: clamp(basic.title, 100),
                            description: clamp(basic.description, 500),
                            author: clamp(basic.author, 100),
                            summary: '',
                            keyPoints: [],
                            keyTakeaway: '',
                            coreTerms: [],
                            hasSubtitles: false,
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