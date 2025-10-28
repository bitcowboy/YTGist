import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { validateNonce } from '$lib/server/nonce.js';
import { generateVideoSummary, generateVideoSummaryStream } from '$lib/server/video-summary-service.js';
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
        const reqStart = Date.now();
        console.log(`[get-summary] ▶️ request start v=${videoId}`);
        // 首先检查缓存
        try {
            const cached = await databases.listDocuments<SummaryData>('main', 'summaries', [
                Query.equal('videoId', videoId),
                Query.limit(1)
            ]);
            if (cached.total > 0) {
                const elapsed = Date.now() - reqStart;
                console.log(`[get-summary] ✅ cache hit v=${videoId} in ${elapsed}ms`);
                return json(cached.documents[0]);
            }
        } catch (cacheErr) {
            console.warn('Cache check failed, continue with generation:', cacheErr);
        }

        // 未命中缓存：使用SSE进行流式生成
        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                let closed = false;

                const safeEnqueue = (text: string) => {
                    if (closed) return;
                    try {
                        controller.enqueue(encoder.encode(text));
                    } catch {
                        closed = true;
                        try { clearInterval(heartbeat); } catch {}
                    }
                };

                const send = (event: string, data: any) => {
                    const payload = typeof data === 'string' ? data : JSON.stringify(data);
                    const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
                    safeEnqueue(chunk);
                };

                // 心跳，避免代理超时
                const heartbeat = setInterval(() => {
                    safeEnqueue(': keep-alive\n\n');
                    // console.log('[get-summary] ❤️ heartbeat');
                }, 15000);

                const genStart = Date.now();
                console.log(`[get-summary] 🚀 start streaming generation v=${videoId}`);
                generateVideoSummaryStream(videoId, {
                    onDelta: (delta) => {
                        // per-char delta already split at service layer
                        safeEnqueue(`event: summary-delta\n` + `data: ${JSON.stringify({ delta })}\n\n`);
                    },
                    onComplete: (full) => {
                        const elapsed = Date.now() - genStart;
                        console.log(`[get-summary] 🧾 summary complete length=${full.length} elapsed=${elapsed}ms`);
                        send('summary-complete', { summary: full });
                    },
                    onPartial: (partial) => {
                        // // log partial types
                        // const keys = Object.keys(partial).join(',');
                        // console.log(`[get-summary] 🧩 partial fields=${keys}`);
                        send('summary-partial', partial);
                    }
                })
                .then((result) => {
                    if (!result.success) {
                        if (result.errorType === 'CHANNEL_BLOCKED') {
                            send('error', { message: 'CHANNEL_BLOCKED' });
                        } else if (result.errorType === 'NO_SUBTITLES') {
                            send('error', { message: 'NO_SUBTITLES_AVAILABLE' });
                        } else {
                            send('error', { message: result.error || 'STREAM_FAILED' });
                        }
                        try { clearInterval(heartbeat); } catch {}
                        const total = Date.now() - reqStart;
                        console.log(`[get-summary] ❌ failed v=${videoId} total=${total}ms type=${result.errorType} err=${result.error}`);
                        closed = true;
                        try { controller.close(); } catch {}
                        return;
                    }
                    // final payload: send exactly what was persisted
                    const total = Date.now() - reqStart;
                    console.log(`[get-summary] 🎉 final payload persisted v=${videoId} total=${total}ms`);
                    send('summary-final', result.summaryData);
                    try { clearInterval(heartbeat); } catch {}
                    closed = true;
                    try { controller.close(); } catch {}
                })
                .catch((err) => {
                    console.error('Streaming generation failed:', err);
                    send('error', { message: 'STREAM_FAILED' });
                    try { clearInterval(heartbeat); } catch {}
                    const total = Date.now() - reqStart;
                    console.log(`[get-summary] 💥 stream exception v=${videoId} total=${total}ms`);
                    closed = true;
                    try { controller.close(); } catch {}
                });
            },
            cancel() {
                // client disconnected
                // intervals/streams closed via safe guards
            }
        });

        return new Response(stream as any, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        });
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