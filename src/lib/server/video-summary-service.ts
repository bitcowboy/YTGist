import { databases } from '$lib/server/appwrite.js';
import { 
    upsertTranscript, 
    isChannelBlocked, 
    COLLECTIONS,
    getSummary as getMainSummary,
    getVideoSummaryContent,
    getVideoKeyInsights,
    getVideoCommentsAnalysis,
    getFullSummary,
    upsertVideoEmbedding
} from '$lib/server/database.js';
import { getSummary } from '$lib/server/summary.js';
import { getVideoData } from '$lib/server/videoData.js';
import { generateEmbedding } from '$lib/server/embedding.js';
import type { SummaryData, FullSummaryData, VideoPlatform, VideoSummaryContent, VideoKeyInsights, VideoCommentsAnalysis } from '$lib/types.js';
import { ID, Query } from 'node-appwrite';
import OpenAI from 'openai';
import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL } from '$env/static/private';
import prompt from '$lib/server/prompt.md?raw';
import { createApiRequestOptions, parseJsonResponse } from './ai-compatibility.js';
import StreamJson from 'stream-json';

/**
 * 打印数据库集合的实际结构
 */
async function printDatabaseStructure(collectionName: string = 'summaries') {
    try {
        const collections = await databases.listCollections('main');
        const collection = collections.collections.find(c => c.name === collectionName);
        
        if (!collection) {
            console.log(`[DB Structure] Collection '${collectionName}' not found`);
            return;
        }
        
        const attributes = await databases.listAttributes('main', collection.$id);
        
        console.log(`\n📋 [DB Structure] Collection '${collectionName}' (ID: ${collection.$id})`);
        console.log('='.repeat(80));
        console.log('Attributes:');
        
        const attrList = attributes.attributes.map((attr: any) => {
            const info: any = {
                key: attr.key,
                type: attr.type,
                size: attr.size || attr.maxLength || 'N/A',
                required: attr.required || false,
                array: attr.array || false
            };
            return info;
        });
        
        // 按字段名排序
        attrList.sort((a: any, b: any) => a.key.localeCompare(b.key));
        
        attrList.forEach((attr: any) => {
            const required = attr.required ? '✓' : '✗';
            const array = attr.array ? '[array]' : '';
            console.log(`  ${required} ${attr.key.padEnd(25)} | ${attr.type.padEnd(10)} | size: ${String(attr.size).padStart(6)} ${array}`);
        });
        
        console.log('='.repeat(80));
        console.log(`Total attributes: ${attrList.length}\n`);
        
        return attrList;
    } catch (error) {
        console.error(`[DB Structure] Failed to print structure:`, error);
        return null;
    }
}

export interface VideoSummaryResult {
    success: boolean;
    summaryData?: FullSummaryData;
    error?: string;
    errorType?: 'CHANNEL_BLOCKED' | 'NO_SUBTITLES' | 'PROCESSING_ERROR';
}

/**
 * 统一的视频总结生成服务
 * 所有视频总结都包含：频道检查、字幕保存、评论总结
 */
export const generateVideoSummary = async (videoId: string, platform: VideoPlatform = 'youtube', subtitleUrl?: string): Promise<VideoSummaryResult> => {
    const startTime = Date.now();
    try {
        console.log(`[video-summary] 🚀 Starting unified summary generation for video ${videoId} platform=${platform}${subtitleUrl ? ' with subtitleUrl' : ''}`);
        
        // 1. 获取视频数据（包含评论数据）
        const step1Start = Date.now();
        const videoData = await getVideoData(videoId, platform, subtitleUrl);
        const step1Time = Date.now() - step1Start;
        console.log(`📊 Video ${videoId} - Step 1 (Get video data): ${step1Time}ms`, { 
            channelId: videoData.channelId, 
            author: videoData.author,
            hasComments: videoData.comments?.length || 0,
            commentsCount: videoData.commentsCount || 0
        });

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

        // 3. 统一AI生成（视频总结 + 评论总结）
        const step3Start = Date.now();
        const summaryResult = await getSummary(videoData);
        const step3Time = Date.now() - step3Start;
        console.log(`📊 Video ${videoId} - Step 3 (Unified AI generation): ${step3Time}ms`, {
            summaryLength: summaryResult.summary.length,
            keyTakeawayLength: summaryResult.keyTakeaway.length,
            keyPointsCount: summaryResult.keyPoints.length,
            coreTermsCount: summaryResult.coreTerms.length,
            commentsSummaryLength: summaryResult.commentsSummary?.length || 0,
            commentsKeyPointsCount: summaryResult.commentsKeyPoints?.length || 0
        });

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

        // 5. 准备数据库数据（分表结构）
        const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
        
        // 确保数组序列化后不超过指定大小，并返回 JSON 字符串（数据库存储格式）
        const limitArraySize = (arr: string[], maxSize: number): string => {
            if (!arr || arr.length === 0) return '[]';
            let result: string[] = [];
            for (const item of arr) {
                const testResult = [...result, item];
                const jsonSize = JSON.stringify(testResult).length;
                if (jsonSize <= maxSize) {
                    result.push(item);
                } else {
                    break;
                }
            }
            return JSON.stringify(result);
        };
        
        // 解析 JSON 字符串回数组（用于返回数据）
        const parseJsonArray = (jsonStr: string | string[]): string[] => {
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

        const safeVideoId = clamp(videoId, 50);

        // 主表数据
        const mainData = {
            videoId: safeVideoId,
            platform: platform,
            channelId: clamp(videoData.channelId, 50),
            title: clamp(videoData.title, 200),
            author: clamp(videoData.author, 150),
            publishedAt: videoData.publishedAt,
            hasSubtitles: videoData.hasSubtitles,
            description: clamp(videoData.description, 2000),
            hits: 0
        };

        // 摘要内容子表数据
        const summaryContentData = {
            videoId: safeVideoId,
            platform: platform,
            summary: clamp(summaryResult.summary, 5000)
        };

        // 关键要点子表数据（keyPoints 和 coreTerms 需要存储为 JSON 字符串）
        const keyInsightsData = {
            videoId: safeVideoId,
            platform: platform,
            keyTakeaway: clamp(summaryResult.keyTakeaway, 600),
            keyPoints: limitArraySize(summaryResult.keyPoints || [], 4000), // JSON 字符串
            coreTerms: limitArraySize(summaryResult.coreTerms || [], 2000)  // JSON 字符串
        };

        // 评论分析子表数据（commentsKeyPoints 需要存储为 JSON 字符串）
        const commentsData = {
            videoId: safeVideoId,
            platform: platform,
            commentsSummary: clamp(summaryResult.commentsSummary || '', 1000),
            commentsKeyPoints: limitArraySize(summaryResult.commentsKeyPoints || [], 2000), // JSON 字符串
            commentsCount: videoData.commentsCount || 0
        };

        // 6. 保存到数据库（分表upsert逻辑）
        const step5Start = Date.now();
        await printDatabaseStructure('summaries');

        // 检查各表是否已存在数据
        const [existingMain, existingSummary, existingInsights, existingComments] = await Promise.all([
            databases.listDocuments<SummaryData>('main', COLLECTIONS.SUMMARIES, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ]),
            databases.listDocuments<VideoSummaryContent>('main', COLLECTIONS.VIDEO_SUMMARIES, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ]),
            databases.listDocuments<VideoKeyInsights>('main', COLLECTIONS.VIDEO_KEY_INSIGHTS, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ]),
            databases.listDocuments<VideoCommentsAnalysis>('main', COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ])
        ]);

        let mainDoc: SummaryData;

        // 保存主表
        if (existingMain.total > 0) {
            mainDoc = await databases.updateDocument<SummaryData>(
                'main', COLLECTIONS.SUMMARIES, existingMain.documents[0].$id, mainData
            );
        } else {
            mainDoc = await databases.createDocument<SummaryData>(
                'main', COLLECTIONS.SUMMARIES, ID.unique(), mainData
            );
        }

        // 保存摘要内容子表
        if (existingSummary.total > 0) {
            await databases.updateDocument<VideoSummaryContent>(
                'main', COLLECTIONS.VIDEO_SUMMARIES, existingSummary.documents[0].$id, summaryContentData
            );
        } else {
            await databases.createDocument<VideoSummaryContent>(
                'main', COLLECTIONS.VIDEO_SUMMARIES, ID.unique(), summaryContentData
            );
        }

        // 保存关键要点子表
        if (existingInsights.total > 0) {
            await databases.updateDocument<VideoKeyInsights>(
                'main', COLLECTIONS.VIDEO_KEY_INSIGHTS, existingInsights.documents[0].$id, keyInsightsData as any
            );
        } else {
            await databases.createDocument<VideoKeyInsights>(
                'main', COLLECTIONS.VIDEO_KEY_INSIGHTS, ID.unique(), keyInsightsData as any
            );
        }

        // 保存评论分析子表
        if (existingComments.total > 0) {
            await databases.updateDocument<VideoCommentsAnalysis>(
                'main', COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, existingComments.documents[0].$id, commentsData as any
            );
        } else {
            await databases.createDocument<VideoCommentsAnalysis>(
                'main', COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, ID.unique(), commentsData as any
            );
        }

        // 组合完整数据（需要将 JSON 字符串解析回数组）
        let finalSummaryData: FullSummaryData = {
            ...mainDoc,
            summary: summaryContentData.summary,
            keyTakeaway: keyInsightsData.keyTakeaway,
            keyPoints: parseJsonArray(keyInsightsData.keyPoints),
            coreTerms: parseJsonArray(keyInsightsData.coreTerms),
            commentsSummary: commentsData.commentsSummary,
            commentsKeyPoints: parseJsonArray(commentsData.commentsKeyPoints),
            commentsCount: commentsData.commentsCount
        };

        const step5Time = Date.now() - step5Start;
        console.log(`📊 Video ${videoId} - Step 5 (Save to database - split tables): ${step5Time}ms`, {
            operation: existingMain.total > 0 ? 'update' : 'create'
        });

        // 7. 生成embedding并保存到单独的子表
        const step6Start = Date.now();
        let step6Time = 0;
        try {
            const embedding = await generateEmbedding(summaryResult.summary);
            // 使用新的分表保存embedding
            await upsertVideoEmbedding(safeVideoId, platform, embedding);
            step6Time = Date.now() - step6Start;
            console.log(`📊 Video ${videoId} - Step 6 (Generate embedding): ${step6Time}ms`, {
                embeddingDimensions: embedding.length
            });
            finalSummaryData = { ...finalSummaryData, embedding };
        } catch (e) {
            step6Time = Date.now() - step6Start;
            console.warn(`📊 Video ${videoId} - Step 6 (Generate embedding) failed: ${step6Time}ms - ${e}`);
        }

        const totalTime = Date.now() - startTime;
        console.log(`🎉 Unified summary generation completed for ${videoId} in ${totalTime}ms`, {
            breakdown: {
                step1_getVideoData: step1Time,
                step2_channelCheck: step2Time,
                step3_unifiedAI: step3Time,
                step4_saveTranscript: step4Time,
                step5_saveToDB: step5Time,
                step6_generateEmbedding: step6Time,
                total: totalTime
            },
            performance: {
                hasComments: (videoData.comments?.length || 0) > 0,
                commentsCount: videoData.commentsCount || 0,
                transcriptLength: videoData.transcript.length,
                summaryLength: summaryResult.summary.length,
                commentsSummaryLength: summaryResult.commentsSummary?.length || 0
            }
        });
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

// Streaming support
const openai = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
        'HTTP-Referer': 'https://gisttube.com',
        'X-Title': 'gisttube',
    },
});

export type StreamEmitters = {
    onDelta?: (delta: string) => void;
    onComplete?: (fullSummary: string) => void;
    onPartial?: (partial: Partial<FullSummaryData>) => void;
};

/**
 * Generate video summary with streaming of the long-form summary text.
 * Emits incremental tokens via onDelta, then onComplete with the full text.
 * Returns the final persisted SummaryData (same as generateVideoSummary).
 */
export const generateVideoSummaryStream = async (
    videoId: string,
    platform: VideoPlatform = 'youtube',
    emitters: StreamEmitters = {},
    subtitleUrl?: string
): Promise<VideoSummaryResult> => {
    const startTime = Date.now();
    try {
        console.log(`[video-summary-stream] 🚀 Starting unified summary generation for video ${videoId} platform=${platform}${subtitleUrl ? ' with subtitleUrl' : ''}`);

        // 1. 获取视频数据（包含评论数据）
        const step1Start = Date.now();
        const videoData = await getVideoData(videoId, platform, subtitleUrl);
        const step1Time = Date.now() - step1Start;
        console.log(`📊 Video ${videoId} - Step 1 (Get video data): ${step1Time}ms`, { 
            channelId: videoData.channelId, 
            author: videoData.author,
            hasComments: videoData.comments?.length || 0,
            commentsCount: videoData.commentsCount || 0
        });

        // 2. 频道阻止检查
        const step2Start = Date.now();
        const blocked = await isChannelBlocked(videoData.channelId);
        const step2Time = Date.now() - step2Start;
        console.log(`📊 Video ${videoId} - Step 2 (Channel check): ${step2Time}ms - blocked: ${blocked}`);
        if (blocked) {
            return { success: false, error: 'Channel is blocked', errorType: 'CHANNEL_BLOCKED' };
        }

        // 3. 准备评论数据
        const step3Start = Date.now();
        let commentsText = '';
        if (videoData.comments && videoData.comments.length > 0) {
            commentsText = videoData.comments
                .slice(0, 30) // 限制最多30条评论
                .map(comment => `作者: ${comment.author}\n内容: ${comment.text}\n点赞数: ${comment.likeCount}`)
                .join('\n\n');
        }
        const step3Time = Date.now() - step3Start;
        console.log(`📊 Video ${videoId} - Step 3 (Prepare comments data): ${step3Time}ms`, {
            commentsProcessed: videoData.comments?.slice(0, 30).length || 0,
            commentsTextLength: commentsText.length
        });

        const userPayload = {
            title: videoData.title,
            description: videoData.description,
            author: videoData.author,
            transcript: videoData.transcript,
            comments: commentsText,
            commentsCount: videoData.commentsCount || 0
        };

        if (!videoData.hasSubtitles || !videoData.transcript || videoData.transcript.trim() === '') {
            return { success: false, error: 'No subtitles available', errorType: 'NO_SUBTITLES' };
        }

        // 4. 统一AI流式生成（视频总结 + 评论总结）
        const step4Start = Date.now();
        let step4Time = 0;
        console.log(`📊 Video ${videoId} - Step 4 (Unified AI generation) starting...`, {
            transcriptLength: videoData.transcript.length,
            commentsLength: commentsText.length,
            totalPayloadSize: JSON.stringify(userPayload).length
        });

        let streamedContent = '';
        let parsedResult: any = null;
        // Accumulators for finalize when streaming produced partials but no full JSON
        let summaryText: string = '';
        let keyTakeaway: string = '';
        let keyPoints: string[] = [];
        let coreTerms: string[] = [];
        let commentsSummary: string = '';
        let commentsKeyPoints: string[] = [];
        let hasStreamActivity: boolean = false;
        
        // LLM响应时间统计
        let llmRequestStart: number = 0;
        let firstTokenTime: number = 0;
        let llmFirstResponseTime: number = 0;
        try {
            llmRequestStart = Date.now();
            console.log(`📊 Video ${videoId} - LLM request initiated at ${llmRequestStart}`);
            
            const stream = await openai.chat.completions.create({
                model: OPENROUTER_MODEL,
                stream: true,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: JSON.stringify(userPayload) }
                ],
            } as any);

            let buffer = '';

            // Optional: try stream-json for robust streaming parse
            let useStreamJson = false;
            let writer: any = null;
            let jsonStarted: boolean = false;
            let leadBuffer: string = '';
            // Keep a small ring buffer of the last fed characters for diagnostics
            let feedRing: string = '';
            try {
                const { PassThrough } = await import('node:stream');
                // @ts-ignore - optional runtime dependency
                const { parser } = await import(/* @vite-ignore */ 'stream-json');
                // @ts-ignore - optional runtime dependency
                const AssemblerModule: any = await import(/* @vite-ignore */ 'stream-json/Assembler');
                const Assembler = AssemblerModule.default || AssemblerModule;

                const pass = new PassThrough();
                const p = StreamJson.parser();
                const asm = new Assembler();
                p.on('error', (err: any) => {
                    // If we've already completed, suppress post-completion parser noise
                    if (parsedResult) {
                        try { pass.unpipe(p); } catch {}
                        try { p.removeAllListeners(); } catch {}
                        useStreamJson = false;
                        writer = null;
                        return;
                    }
                    console.warn('[video-summary-stream] stream-json parser error, fallback to best-effort:', err?.message || err);
                    if (feedRing) {
                        console.warn('[video-summary-stream] ring buffer (last 200 chars) =>\n' + feedRing);
                    }
                    try { pass.unpipe(p); } catch {}
                    try { p.removeAllListeners(); } catch {}
                    useStreamJson = false;
                    writer = null;
                });
                // Incremental emit using token-level parsing
                let expectSummaryString = false;
                let inSummaryString = false;
                let expectKeyTakeawayString = false;
                let inKeyTakeawayString = false;
                let expectCommentsSummaryString = false;
                let inCommentsSummaryString = false;
                let pendingArrayFor: 'none' | 'keyPoints' | 'coreTerms' | 'commentsKeyPoints' = 'none';
                let inKeyPoints = false;
                let inCoreTerms = false;
                let inCommentsKeyPoints = false;
                let keyTakeawayText = '';
                let currentKeyPointText = '';
                let currentCoreTermText = '';
                let currentCommentsKeyPointText = '';

                p.on('data', (chunk: any) => {
                    // 记录第一个token到达时间
                    if (firstTokenTime === 0) {
                        firstTokenTime = Date.now();
                        llmFirstResponseTime = firstTokenTime - llmRequestStart;
                        console.log(`📊 Video ${videoId} - First token received: ${llmFirstResponseTime}ms after request`);
                    }
                    
                    // Token-level streaming for summary/keyPoints/coreTerms
                    try {
                        const name = chunk?.name;
                        const value = chunk?.value;

                        if (name === 'keyValue') {
                            if (value === 'summary') {
                                expectSummaryString = true;
                            } else if (value === 'keyTakeaway') {
                                expectKeyTakeawayString = true;
                            } else if (value === 'commentsSummary') {
                                expectCommentsSummaryString = true;
                            } else if (value === 'keyPoints') {
                                pendingArrayFor = 'keyPoints';
                            } else if (value === 'coreTerms') {
                                pendingArrayFor = 'coreTerms';
                            } else if (value === 'commentsKeyPoints') {
                                pendingArrayFor = 'commentsKeyPoints';
                            }
                        } else if (name === 'startString') {
                            if (expectSummaryString) {
                                inSummaryString = true;
                                expectSummaryString = false;
                            } else if (expectKeyTakeawayString) {
                                inKeyTakeawayString = true;
                                expectKeyTakeawayString = false;
                            } else if (expectCommentsSummaryString) {
                                inCommentsSummaryString = true;
                                expectCommentsSummaryString = false;
                            }
                        } else if (name === 'stringChunk') {
                            if (inSummaryString && typeof value === 'string' && value.length > 0) {
                                summaryText += value;
                                emitters.onDelta?.(value);
                                hasStreamActivity = true;
                            } else if (inKeyTakeawayString && typeof value === 'string' && value.length > 0) {
                                keyTakeawayText += value;
                                keyTakeaway = keyTakeawayText;
                                // emit updated keyTakeaway incrementally
                                emitters.onPartial?.({ keyTakeaway: keyTakeawayText, _field: 'keyTakeaway', _final: false } as any);
                                hasStreamActivity = true;
                            } else if (inCommentsSummaryString && typeof value === 'string' && value.length > 0) {
                                commentsSummary += value;
                                emitters.onPartial?.({ commentsSummary, _field: 'commentsSummary', _final: false } as any);
                                hasStreamActivity = true;
                            } else if (inKeyPoints && typeof value === 'string' && value.length > 0) {
                                // incremental per-character/chunk for current keyPoint item
                                currentKeyPointText += value;
                                emitters.onPartial?.({ keyPoints: [currentKeyPointText], _field: 'keyPoints', _final: false } as any);
                                hasStreamActivity = true;
                            } else if (inCoreTerms && typeof value === 'string' && value.length > 0) {
                                currentCoreTermText += value;
                                emitters.onPartial?.({ coreTerms: [currentCoreTermText], _field: 'coreTerms', _final: false } as any);
                                hasStreamActivity = true;
                            } else if (inCommentsKeyPoints && typeof value === 'string' && value.length > 0) {
                                currentCommentsKeyPointText += value;
                                emitters.onPartial?.({ commentsKeyPoints: [currentCommentsKeyPointText], _field: 'commentsKeyPoints', _final: false } as any);
                                hasStreamActivity = true;
                            }
                        } else if (name === 'stringValue') {
                            if (inSummaryString && typeof value === 'string') {
                                // finalize summary string token
                                const extra = value.slice(summaryText.length);
                                if (extra) emitters.onDelta?.(extra);
                                inSummaryString = false;
                                hasStreamActivity = true;
                            } else if (inKeyTakeawayString && typeof value === 'string') {
                                keyTakeawayText = value;
                                keyTakeaway = value;
                                emitters.onPartial?.({ keyTakeaway: keyTakeawayText, _field: 'keyTakeaway', _final: true } as any);
                                inKeyTakeawayString = false;
                                hasStreamActivity = true;
                            } else if (inCommentsSummaryString && typeof value === 'string') {
                                commentsSummary = value;
                                emitters.onPartial?.({ commentsSummary, _field: 'commentsSummary', _final: true } as any);
                                inCommentsSummaryString = false;
                                hasStreamActivity = true;
                            } else if ((inKeyPoints || inCoreTerms || inCommentsKeyPoints) && typeof value === 'string') {
                                if (inKeyPoints) {
                                    currentKeyPointText = value; // ensure final
                                    keyPoints.push(currentKeyPointText);
                                    emitters.onPartial?.({ keyPoints: [currentKeyPointText], _field: 'keyPoints', _final: true } as any);
                                    currentKeyPointText = '';
                                    hasStreamActivity = true;
                                } else if (inCoreTerms) {
                                    currentCoreTermText = value;
                                    coreTerms.push(currentCoreTermText);
                                    emitters.onPartial?.({ coreTerms: [currentCoreTermText], _field: 'coreTerms', _final: true } as any);
                                    currentCoreTermText = '';
                                    hasStreamActivity = true;
                                } else if (inCommentsKeyPoints) {
                                    currentCommentsKeyPointText = value;
                                    commentsKeyPoints.push(currentCommentsKeyPointText);
                                    emitters.onPartial?.({ commentsKeyPoints: [currentCommentsKeyPointText], _field: 'commentsKeyPoints', _final: true } as any);
                                    currentCommentsKeyPointText = '';
                                    hasStreamActivity = true;
                                }
                            }
                        } else if (name === 'startArray') {
                            if (expectSummaryString) expectSummaryString = false;
                            if (pendingArrayFor === 'keyPoints') {
                                inKeyPoints = true;
                                pendingArrayFor = 'none';
                                currentKeyPointText = '';
                            } else if (pendingArrayFor === 'coreTerms') {
                                inCoreTerms = true;
                                pendingArrayFor = 'none';
                                currentCoreTermText = '';
                            } else if (pendingArrayFor === 'commentsKeyPoints') {
                                inCommentsKeyPoints = true;
                                pendingArrayFor = 'none';
                                currentCommentsKeyPointText = '';
                            }
                        } else if (name === 'endArray') {
                            inKeyPoints = false;
                            inCoreTerms = false;
                            inCommentsKeyPoints = false;
                            currentKeyPointText = '';
                            currentCoreTermText = '';
                            currentCommentsKeyPointText = '';
                        }
                    } catch {}

                    if (typeof asm[chunk.name] === 'function') {
                        asm[chunk.name](chunk);
                    }
                    if (asm.current && typeof asm.current === 'object') {
                        const parsed = asm.current as any;
                        if (parsed.summary && parsed.summary !== summaryText) {
                            const newText = parsed.summary.slice(summaryText.length);
                            if (newText) {
                                summaryText = parsed.summary;
                                emitters.onDelta?.(newText);
                                hasStreamActivity = true;
                            }
                        }
                        if (parsed.keyTakeaway && parsed.keyTakeaway !== keyTakeaway) {
                            keyTakeaway = parsed.keyTakeaway;
                            keyTakeawayText = keyTakeaway;
                            emitters.onPartial?.({ keyTakeaway });
                            hasStreamActivity = true;
                        }
                        if (parsed.keyPoints && Array.isArray(parsed.keyPoints)) {
                            const newPoints = parsed.keyPoints.slice(keyPoints.length);
                            if (newPoints.length > 0) {
                                keyPoints = [...parsed.keyPoints];
                                emitters.onPartial?.({ keyPoints: newPoints });
                                hasStreamActivity = true;
                            }
                        }
                        if (parsed.coreTerms && Array.isArray(parsed.coreTerms)) {
                            const newTerms = parsed.coreTerms.slice(coreTerms.length);
                            if (newTerms.length > 0) {
                                coreTerms = [...parsed.coreTerms];
                                emitters.onPartial?.({ coreTerms: newTerms });
                                hasStreamActivity = true;
                            }
                        }
                        if (parsed.commentsSummary && parsed.commentsSummary !== commentsSummary) {
                            commentsSummary = parsed.commentsSummary;
                            emitters.onPartial?.({ commentsSummary });
                            hasStreamActivity = true;
                        }
                        if (parsed.commentsKeyPoints && Array.isArray(parsed.commentsKeyPoints)) {
                            const newCommentsPoints = parsed.commentsKeyPoints.slice(commentsKeyPoints.length);
                            if (newCommentsPoints.length > 0) {
                                commentsKeyPoints = [...parsed.commentsKeyPoints];
                                emitters.onPartial?.({ commentsKeyPoints: newCommentsPoints });
                                hasStreamActivity = true;
                            }
                        }
                        if (parsed.summary && parsed.keyTakeaway && parsed.keyPoints && parsed.coreTerms && 
                            parsed.commentsSummary !== undefined && parsed.commentsKeyPoints !== undefined) {
                            emitters.onComplete?.(parsed.summary);
                            parsedResult = parsed;
                            // stop feeding the parser; we'll finalize downstream
                            try { pass.unpipe(p); } catch {}
                            try { p.removeAllListeners(); } catch {}
                            useStreamJson = false;
                            writer = null;
                        }
                    }
                });
                pass.pipe(p);
                writer = pass;
                useStreamJson = true;
                console.log('[video-summary-stream] stream-json enabled');
            } catch (e) {
                console.log('[video-summary-stream] stream-json not available, fallback to best-effort parser');
            }
            
            for await (const chunk of stream as any) {
                // 记录第一个token到达时间
                if (firstTokenTime === 0) {
                    firstTokenTime = Date.now();
                    llmFirstResponseTime = firstTokenTime - llmRequestStart;
                    console.log(`📊 Video ${videoId} - First token received: ${llmFirstResponseTime}ms after request`);
                }
                
                const raw = chunk?.choices?.[0]?.delta?.content ?? '';
                const part = raw.replace(/```(?:json)?\s*|```/gi, '').replace(/^\uFEFF/, '');
                if (!part) continue;
                buffer += part;
                if (parsedResult) {
                    // already complete, ignore further chunks
                } else if (useStreamJson && writer) {
                    if (!jsonStarted) {
                        leadBuffer += part;
                        // Find first JSON object start
                        let idx = -1;
                        for (let i = 0; i < leadBuffer.length; i++) {
                            const c = leadBuffer[i];
                            if (c === '{' || c === '[') { idx = i; break; }
                        }
                        if (idx !== -1) {
                            jsonStarted = true;
                            const slice = leadBuffer.slice(idx);
                            feedRing = (feedRing + slice).slice(-200);
                            writer.write(slice);
                            leadBuffer = '';
                        }
                    } else {
                        feedRing = (feedRing + part).slice(-200);
                        writer.write(part);
                    }
                } else {
                    // Best-effort：尝试整体解析
                    let parsed: any = null;
                    try { parsed = JSON.parse(buffer); } catch {}
                    if (parsed && typeof parsed === 'object') {
                        // JSON解析成功，提取各个字段
                        if (parsed.summary && parsed.summary !== summaryText) {
                            const newText = parsed.summary.slice(summaryText.length);
                            if (newText) {
                                summaryText = parsed.summary;
                                emitters.onDelta?.(newText);
                                hasStreamActivity = true;
                            }
                        }
                        
                        if (parsed.keyTakeaway && parsed.keyTakeaway !== keyTakeaway) {
                            keyTakeaway = parsed.keyTakeaway;
                            emitters.onPartial?.({ keyTakeaway });
                            hasStreamActivity = true;
                        }
                        
                        if (parsed.keyPoints && Array.isArray(parsed.keyPoints)) {
                            const newPoints = parsed.keyPoints.slice(keyPoints.length);
                            if (newPoints.length > 0) {
                                keyPoints = [...parsed.keyPoints];
                                emitters.onPartial?.({ keyPoints: newPoints });
                                hasStreamActivity = true;
                            }
                        }
                        
                        if (parsed.coreTerms && Array.isArray(parsed.coreTerms)) {
                            const newTerms = parsed.coreTerms.slice(coreTerms.length);
                            if (newTerms.length > 0) {
                                coreTerms = [...parsed.coreTerms];
                                emitters.onPartial?.({ coreTerms: newTerms });
                                hasStreamActivity = true;
                            }
                        }
                        
                        if (parsed.commentsSummary && parsed.commentsSummary !== commentsSummary) {
                            commentsSummary = parsed.commentsSummary;
                            emitters.onPartial?.({ commentsSummary });
                            hasStreamActivity = true;
                        }
                        
                        if (parsed.commentsKeyPoints && Array.isArray(parsed.commentsKeyPoints)) {
                            const newCommentsPoints = parsed.commentsKeyPoints.slice(commentsKeyPoints.length);
                            if (newCommentsPoints.length > 0) {
                                commentsKeyPoints = [...parsed.commentsKeyPoints];
                                emitters.onPartial?.({ commentsKeyPoints: newCommentsPoints });
                                hasStreamActivity = true;
                            }
                        }

                        // 如果所有字段都完整了，标记完成
                        if (parsed.summary && parsed.keyTakeaway && parsed.keyPoints && parsed.coreTerms && 
                            parsed.commentsSummary !== undefined && parsed.commentsKeyPoints !== undefined) {
                            emitters.onComplete?.(parsed.summary);
                            parsedResult = parsed;
                            step4Time = Date.now() - step4Start;
                            console.log(`📊 Video ${videoId} - Step 4 (Unified AI generation) completed: ${step4Time}ms`, {
                                summaryLength: parsed.summary.length,
                                keyTakeawayLength: parsed.keyTakeaway.length,
                                keyPointsCount: parsed.keyPoints.length,
                                coreTermsCount: parsed.coreTerms.length,
                                commentsSummaryLength: parsed.commentsSummary.length,
                                commentsKeyPointsCount: parsed.commentsKeyPoints.length
                            });
                            break;
                        }
                    }
                }
            }

            if (useStreamJson && writer) {
                try { writer.end(); } catch {}
            }
        } catch (e) {
            console.warn('Streaming summary failed, will fall back to non-streaming:', e);
        }

        // 4. 生成最终结构：优先使用流式解析结果；否则用累积器；最后才回退一次性生成
        let structured: any;
        if (parsedResult) {
            structured = parsedResult;
            console.log('[video-summary-stream] finalize source = parsedResult');
        } else if ((typeof hasStreamActivity !== 'undefined') && hasStreamActivity) {
            structured = {
                summary: summaryText || '',
                keyTakeaway: keyTakeaway || '',
                keyPoints: keyPoints || [],
                coreTerms: coreTerms || [],
                commentsSummary: commentsSummary || '',
                commentsKeyPoints: commentsKeyPoints || [],
            };
            console.log('[video-summary-stream] finalize source = accumulators');
        } else {
            console.log('[video-summary-stream] finalize source = fallback-getSummary');
            structured = await getSummary({
                ...videoData,
                transcript: videoData.transcript,
            });
        }

        // 5. 保存字幕
        const step5Start = Date.now();
        let step5Time = 0;
        try { 
            await upsertTranscript(videoId, videoData.transcript); 
            step5Time = Date.now() - step5Start;
            console.log(`📊 Video ${videoId} - Step 5 (Save transcript): ${step5Time}ms`);
        } catch (e) { 
            step5Time = Date.now() - step5Start;
            console.warn(`📊 Video ${videoId} - Step 5 (Save transcript) failed: ${step5Time}ms - ${e}`); 
        }

        // 6. 组装并保存数据库记录（分表结构）
        const step6Start = Date.now();
        const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
        
        // 确保数组序列化后不超过指定大小，并返回 JSON 字符串（数据库存储格式）
        const limitArraySize = (arr: string[], maxSize: number): string => {
            if (!arr || arr.length === 0) return '[]';
            let result: string[] = [];
            for (const item of arr) {
                const testResult = [...result, item];
                const jsonSize = JSON.stringify(testResult).length;
                if (jsonSize <= maxSize) {
                    result.push(item);
                } else {
                    break;
                }
            }
            return JSON.stringify(result);
        };
        
        // 解析 JSON 字符串回数组（用于返回数据）
        const parseJsonArray = (jsonStr: string | string[]): string[] => {
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
        
        const safeVideoId = clamp(videoId, 50);

        // 主表数据
        const mainData = {
            videoId: safeVideoId,
            platform: platform,
            channelId: clamp(videoData.channelId, 50),
            title: clamp(videoData.title, 200),
            author: clamp(videoData.author, 150),
            publishedAt: videoData.publishedAt,
            hasSubtitles: videoData.hasSubtitles,
            description: clamp(videoData.description, 2000),
            hits: 0
        };

        // 摘要内容子表数据
        const summaryContentData = {
            videoId: safeVideoId,
            platform: platform,
            summary: clamp(structured.summary, 5000)
        };

        // 关键要点子表数据（keyPoints 和 coreTerms 需要存储为 JSON 字符串）
        const keyInsightsData = {
            videoId: safeVideoId,
            platform: platform,
            keyTakeaway: clamp(structured.keyTakeaway, 600),
            keyPoints: limitArraySize(structured.keyPoints || [], 4000), // JSON 字符串
            coreTerms: limitArraySize(structured.coreTerms || [], 2000)  // JSON 字符串
        };

        // 评论分析子表数据（commentsKeyPoints 需要存储为 JSON 字符串）
        const commentsData = {
            videoId: safeVideoId,
            platform: platform,
            commentsSummary: clamp(structured.commentsSummary || '', 1000),
            commentsKeyPoints: limitArraySize(structured.commentsKeyPoints || [], 2000), // JSON 字符串
            commentsCount: videoData.commentsCount || 0
        };

        const step6DbStart = Date.now();
        await printDatabaseStructure('summaries');

        // 检查各表是否已存在数据
        const [existingMain, existingSummary, existingInsights, existingComments] = await Promise.all([
            databases.listDocuments<SummaryData>('main', COLLECTIONS.SUMMARIES, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ]),
            databases.listDocuments<VideoSummaryContent>('main', COLLECTIONS.VIDEO_SUMMARIES, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ]),
            databases.listDocuments<VideoKeyInsights>('main', COLLECTIONS.VIDEO_KEY_INSIGHTS, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ]),
            databases.listDocuments<VideoCommentsAnalysis>('main', COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, [
                Query.equal('videoId', safeVideoId),
                Query.equal('platform', platform),
                Query.limit(1)
            ])
        ]);

        let mainDoc: SummaryData;

        // 保存主表
        if (existingMain.total > 0) {
            mainDoc = await databases.updateDocument<SummaryData>(
                'main', COLLECTIONS.SUMMARIES, existingMain.documents[0].$id, mainData
            );
        } else {
            mainDoc = await databases.createDocument<SummaryData>(
                'main', COLLECTIONS.SUMMARIES, ID.unique(), mainData
            );
        }

        // 保存摘要内容子表
        if (existingSummary.total > 0) {
            await databases.updateDocument<VideoSummaryContent>(
                'main', COLLECTIONS.VIDEO_SUMMARIES, existingSummary.documents[0].$id, summaryContentData
            );
        } else {
            await databases.createDocument<VideoSummaryContent>(
                'main', COLLECTIONS.VIDEO_SUMMARIES, ID.unique(), summaryContentData
            );
        }

        // 保存关键要点子表
        if (existingInsights.total > 0) {
            await databases.updateDocument<VideoKeyInsights>(
                'main', COLLECTIONS.VIDEO_KEY_INSIGHTS, existingInsights.documents[0].$id, keyInsightsData as any
            );
        } else {
            await databases.createDocument<VideoKeyInsights>(
                'main', COLLECTIONS.VIDEO_KEY_INSIGHTS, ID.unique(), keyInsightsData as any
            );
        }

        // 保存评论分析子表
        if (existingComments.total > 0) {
            await databases.updateDocument<VideoCommentsAnalysis>(
                'main', COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, existingComments.documents[0].$id, commentsData as any
            );
        } else {
            await databases.createDocument<VideoCommentsAnalysis>(
                'main', COLLECTIONS.VIDEO_COMMENTS_ANALYSIS, ID.unique(), commentsData as any
            );
        }

        // 组合完整数据（需要将 JSON 字符串解析回数组）
        let finalSummaryData: FullSummaryData = {
            ...mainDoc,
            summary: summaryContentData.summary,
            keyTakeaway: keyInsightsData.keyTakeaway,
            keyPoints: parseJsonArray(keyInsightsData.keyPoints),
            coreTerms: parseJsonArray(keyInsightsData.coreTerms),
            commentsSummary: commentsData.commentsSummary,
            commentsKeyPoints: parseJsonArray(commentsData.commentsKeyPoints),
            commentsCount: commentsData.commentsCount
        };

        const step6Time = Date.now() - step6Start;
        const step6DbTime = Date.now() - step6DbStart;
        console.log(`📊 Video ${videoId} - Step 6 (Save to database - split tables): ${step6Time}ms`, {
            dbOperationTime: step6DbTime,
            operation: existingMain.total > 0 ? 'update' : 'create'
        });

        // 7. 生成embedding并保存到单独的子表
        const step7Start = Date.now();
        let step7Time = 0;
        try {
            const embedding = await generateEmbedding(structured.summary);
            // 使用新的分表保存embedding
            await upsertVideoEmbedding(safeVideoId, platform, embedding);
            step7Time = Date.now() - step7Start;
            console.log(`📊 Video ${videoId} - Step 7 (Generate embedding): ${step7Time}ms`, {
                embeddingDimensions: embedding.length
            });
            finalSummaryData = { ...finalSummaryData, embedding };
        } catch (e) {
            step7Time = Date.now() - step7Start;
            console.warn(`📊 Video ${videoId} - Step 7 (Generate embedding) failed: ${step7Time}ms - ${e}`);
        }

        const totalTime = Date.now() - startTime;
        console.log(`🎉 Unified summary pipeline completed for ${videoId} in ${totalTime}ms`, {
            breakdown: {
                step1_getVideoData: step1Time,
                step2_channelCheck: step2Time,
                step3_prepareComments: step3Time,
                step4_unifiedAI: step4Time,
                step5_saveTranscript: step5Time,
                step6_saveToDB: step6Time,
                step7_generateEmbedding: step7Time,
                total: totalTime
            },
            llmTiming: {
                requestToFirstToken: llmFirstResponseTime,
                totalGenerationTime: step4Time,
                tokensPerSecond: llmFirstResponseTime > 0 ? Math.round(1000 / llmFirstResponseTime * 100) / 100 : 0
            },
            performance: {
                hasComments: (videoData.comments?.length || 0) > 0,
                commentsCount: videoData.commentsCount || 0,
                transcriptLength: videoData.transcript.length,
                summaryLength: structured.summary.length,
                commentsSummaryLength: structured.commentsSummary?.length || 0
            }
        });
        return { success: true, summaryData: finalSummaryData };
    } catch (error) {
        if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
            return { success: false, error: 'No subtitles available', errorType: 'NO_SUBTITLES' };
        }
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error', errorType: 'PROCESSING_ERROR' };
    }
};
