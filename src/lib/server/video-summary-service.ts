import { databases } from '$lib/server/appwrite.js';
import { upsertTranscript, isChannelBlocked } from '$lib/server/database.js';
import { getSummary } from '$lib/server/summary.js';
import { getVideoData } from '$lib/server/videoData.js';
import type { SummaryData } from '$lib/types.js';
import { ID, Query } from 'node-appwrite';
import OpenAI from 'openai';
import * as undici from 'undici';
import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import prompt from '$lib/server/prompt.md?raw';
import { createApiRequestOptions, parseJsonResponse } from './ai-compatibility.js';
import StreamJson from 'stream-json';

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
        console.log(`[video-summary-stream] step1 getVideoData ${Date.now() - step1Start}ms`, { videoId, channelId: videoData.channelId });
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

// Streaming support
const proxyAgent = PROXY_URI ? new undici.ProxyAgent(PROXY_URI) : null;
const openai = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
        'HTTP-Referer': 'https://gisttube.com',
        'X-Title': 'gisttube',
    },
    fetchOptions: {
        dispatcher: proxyAgent ? proxyAgent : undefined,
    },
});

export type StreamEmitters = {
    onDelta?: (delta: string) => void;
    onComplete?: (fullSummary: string) => void;
    onPartial?: (partial: Partial<SummaryData>) => void;
};

/**
 * Generate video summary with streaming of the long-form summary text.
 * Emits incremental tokens via onDelta, then onComplete with the full text.
 * Returns the final persisted SummaryData (same as generateVideoSummary).
 */
export const generateVideoSummaryStream = async (
    videoId: string,
    emitters: StreamEmitters = {}
): Promise<VideoSummaryResult> => {
    const startTime = Date.now();
    try {
        // 1. 获取视频数据（包含评论总结）
        const videoData = await getVideoData(videoId);

        // 2. 频道阻止检查
        const step2Start = Date.now();
        const blocked = await isChannelBlocked(videoData.channelId);
        console.log(`[video-summary-stream] step2 channelCheck ${Date.now() - step2Start}ms blocked=${blocked}`);
        if (blocked) {
            return { success: false, error: 'Channel is blocked', errorType: 'CHANNEL_BLOCKED' };
        }

        // 3. 流式生成完整的JSON响应
        const userPayload = {
            title: videoData.title,
            description: videoData.description,
            author: videoData.author,
            transcript: videoData.transcript,
        };

        if (!videoData.hasSubtitles || !videoData.transcript || videoData.transcript.trim() === '') {
            return { success: false, error: 'No subtitles available', errorType: 'NO_SUBTITLES' };
        }

        let streamedContent = '';
        let parsedResult: any = null;
        // Accumulators for finalize when streaming produced partials but no full JSON
        let summaryText: string = '';
        let keyTakeaway: string = '';
        let keyPoints: string[] = [];
        let coreTerms: string[] = [];
        let hasStreamActivity: boolean = false;
        try {
            // 使用标准JSON格式，让AI返回完整的结构化数据
            const systemInstruction = `${prompt}\n\n请按照标准JSON格式返回结果，包含以下字段：\n` +
                `{\n` +
                `  "summary": "完整的视频总结内容",\n` +
                `  "keyTakeaway": "关键要点",\n` +
                `  "keyPoints": ["要点1", "要点2", "要点3"],\n` +
                `  "coreTerms": ["术语1", "术语2"]\n` +
                `}\n\n` +
                `请确保返回的是有效的JSON格式，不要包含任何其他文本或解释。`;

            const step3Start = Date.now();
            const stream = await openai.chat.completions.create({
                model: OPENROUTER_MODEL,
                stream: true,
                messages: [
                    { role: 'system', content: systemInstruction },
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
                let pendingArrayFor: 'none' | 'keyPoints' | 'coreTerms' = 'none';
                let inKeyPoints = false;
                let inCoreTerms = false;
                let keyTakeawayText = '';
                let currentKeyPointText = '';
                let currentCoreTermText = '';

                p.on('data', (chunk: any) => {
                    // Token-level streaming for summary/keyPoints/coreTerms
                    try {
                        const name = chunk?.name;
                        const value = chunk?.value;

                        if (name === 'keyValue') {
                            if (value === 'summary') {
                                expectSummaryString = true;
                            } else if (value === 'keyTakeaway') {
                                expectKeyTakeawayString = true;
                            } else if (value === 'keyPoints') {
                                pendingArrayFor = 'keyPoints';
                            } else if (value === 'coreTerms') {
                                pendingArrayFor = 'coreTerms';
                            }
                        } else if (name === 'startString') {
                            if (expectSummaryString) {
                                inSummaryString = true;
                                expectSummaryString = false;
                            } else if (expectKeyTakeawayString) {
                                inKeyTakeawayString = true;
                                expectKeyTakeawayString = false;
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
                            } else if (inKeyPoints && typeof value === 'string' && value.length > 0) {
                                // incremental per-character/chunk for current keyPoint item
                                currentKeyPointText += value;
                                emitters.onPartial?.({ keyPoints: [currentKeyPointText], _field: 'keyPoints', _final: false } as any);
                                hasStreamActivity = true;
                            } else if (inCoreTerms && typeof value === 'string' && value.length > 0) {
                                currentCoreTermText += value;
                                emitters.onPartial?.({ coreTerms: [currentCoreTermText], _field: 'coreTerms', _final: false } as any);
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
                            } else if ((inKeyPoints || inCoreTerms) && typeof value === 'string') {
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
                            }
                        } else if (name === 'endArray') {
                            inKeyPoints = false;
                            inCoreTerms = false;
                            currentKeyPointText = '';
                            currentCoreTermText = '';
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
                        if (parsed.summary && parsed.keyTakeaway && parsed.keyPoints && parsed.coreTerms) {
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

                        // 如果所有字段都完整了，标记完成
                        if (parsed.summary && parsed.keyTakeaway && parsed.keyPoints && parsed.coreTerms) {
                            emitters.onComplete?.(parsed.summary);
                            parsedResult = parsed;
                            console.log(`[video-summary-stream] JSON complete len=${parsed.summary.length} elapsed=${Date.now() - step3Start}ms`);
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
        const step4Start = Date.now();
        try { await upsertTranscript(videoId, videoData.transcript); } catch {}
        console.log(`[video-summary-stream] step4 saveTranscript ${Date.now() - step4Start}ms`);

        // 6. 组装并保存数据库记录
        const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
        const summaryData = {
            videoId,
            title: clamp(videoData.title, 100),
            description: clamp(videoData.description, 5000),
            author: clamp(videoData.author, 100),
            channelId: videoData.channelId,
            summary: clamp(structured.summary, 5000),
            keyTakeaway: clamp(structured.keyTakeaway, 500),
            keyPoints: structured.keyPoints,
            coreTerms: structured.coreTerms,
            hasSubtitles: videoData.hasSubtitles,
            publishedAt: videoData.publishedAt,
            hits: 0,
            commentsSummary: clamp(videoData.commentsSummary || '', 1000),
            commentsKeyPoints: videoData.commentsKeyPoints || [],
            commentsCount: videoData.commentsCount || 0,
        };

        const step5Start = Date.now();
        const existing = await databases.listDocuments<SummaryData>('main', 'summaries', [
            Query.equal('videoId', videoId),
            Query.limit(1),
        ]);

        let finalSummaryData: SummaryData;
        if (existing.total > 0) {
            const doc = existing.documents[0];
            finalSummaryData = await databases.updateDocument<SummaryData>('main', 'summaries', doc.$id, summaryData);
        } else {
            finalSummaryData = await databases.createDocument<SummaryData>('main', 'summaries', ID.unique(), summaryData);
        }
        console.log(`[video-summary-stream] step5 saveToDB ${Date.now() - step5Start}ms`);

        const totalTime = Date.now() - startTime;
        console.log(`✅ Stream pipeline done for ${videoId} in ${totalTime}ms`);
        return { success: true, summaryData: finalSummaryData };
    } catch (error) {
        if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
            return { success: false, error: 'No subtitles available', errorType: 'NO_SUBTITLES' };
        }
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error', errorType: 'PROCESSING_ERROR' };
    }
};
