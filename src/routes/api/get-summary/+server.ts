import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { validateNonce } from '$lib/server/nonce.js';
import { generateVideoSummary, generateVideoSummaryStream } from '$lib/server/video-summary-service.js';
import { PlatformFactory } from '$lib/server/platforms/platform-factory';
import type { VideoPlatform, SummaryData, FullSummaryData } from '$lib/types';
import { error, json } from '@sveltejs/kit';
import { pb, ensureAdminAuth, escapeFilterValue, withCreatedTimestamps, withUpdatedTimestamp } from '$lib/server/pocketbase.js';
import { getFullSummary, COLLECTIONS } from '$lib/server/database.js';

export const GET = async ({ url }) => {
    const videoId = url.searchParams.get('v');
    const nonce = url.searchParams.get('nonce');
    const platformParam = url.searchParams.get('platform') as VideoPlatform | null;
    let subtitleUrl = url.searchParams.get('subtitle_url') || undefined;
    
    // 解码 subtitle_url：先 URL 解码，再 base64 解码
    if (subtitleUrl) {
        try {
            // 1. URL 解码
            const urlDecoded = decodeURIComponent(subtitleUrl);
            // 2. Base64 解码
            subtitleUrl = Buffer.from(urlDecoded, 'base64').toString('utf-8');
            console.log(`[get-summary] ✅ 解码 subtitle_url 成功，长度: ${subtitleUrl.length}`);
        } catch (decodeError) {
            console.warn(`[get-summary] ⚠️ subtitle_url 解码失败，使用原始值:`, decodeError);
            // 如果解码失败，使用原始值（可能是未编码的）
        }
    }

    if (!videoId) {
        return error(400, 'Video ID is required');
    }

    // 如果没有指定平台，尝试从视频ID识别平台
    let platform: VideoPlatform = platformParam || 'youtube';
    if (!platformParam) {
        const identifiedPlatform = PlatformFactory.identifyPlatformByVideoId(videoId);
        if (identifiedPlatform) {
            platform = identifiedPlatform;
        }
    }

    // 验证视频ID格式
    const platformInstance = PlatformFactory.getPlatform(platform);
    if (!platformInstance) {
        return error(400, `Unsupported platform: ${platform}`);
    }

    if (!platformInstance.validateVideoId(videoId)) {
        return error(400, `Invalid video ID format for platform ${platform}`);
    }

    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        const reqStart = Date.now();
        console.log(`[get-summary] ▶️ request start v=${videoId}`);
        // 首先检查缓存（使用新的分表查询函数）
        try {
            const cached = await getFullSummary(videoId, platform);
            if (cached) {
                const elapsed = Date.now() - reqStart;
                console.log(`[get-summary] ✅ cache hit v=${videoId} in ${elapsed}ms`);
                return json(cached);
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
                console.log(`[get-summary] 🚀 start streaming generation v=${videoId} platform=${platform}${subtitleUrl ? ' with subtitleUrl' : ''}`);
                generateVideoSummaryStream(videoId, platform, {
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
                }, subtitleUrl)
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

        // 处理无字幕情况：创建占位记录（使用分表结构）
        if (e instanceof Error && e.message === 'NO_SUBTITLES_AVAILABLE') {
            try {
                const basic = await getVideoDataWithoutTranscript(videoId, platform);
                
                // 检查频道是否被阻止
                const { isChannelBlocked } = await import('$lib/server/database.js');
                const isBlocked = await isChannelBlocked(basic.channelId);
                if (isBlocked) {
                    console.log(`Channel ${basic.channelId} (${basic.author}) is blocked, refusing to process video ${videoId}`);
                    return error(403, 'CHANNEL_BLOCKED');
                }
                
                const clamp = (v: string | undefined | null, max: number) => (v ?? '').slice(0, max);
                const safeVideoId = clamp(videoId, 50);

                await ensureAdminAuth();
                const filter = `videoId = "${escapeFilterValue(safeVideoId)}" && platform = "${escapeFilterValue(platform)}"`;

                // 主表数据
                const mainData = {
                    videoId: safeVideoId,
                    platform: platform,
                    channelId: clamp(basic.channelId, 50),
                    title: clamp(basic.title, 200),
                    author: clamp(basic.author, 150),
                    publishedAt: basic.publishedAt,
                    hasSubtitles: false,
                    description: clamp(basic.description, 2000),
                    hits: 0
                };

                const existingMain = await pb.collection(COLLECTIONS.SUMMARIES).getList<SummaryData>(1, 1, { filter });
                if (existingMain.totalItems > 0) {
                    await pb.collection(COLLECTIONS.SUMMARIES).update<SummaryData>(existingMain.items[0].id, withUpdatedTimestamp(mainData));
                } else {
                    await pb.collection(COLLECTIONS.SUMMARIES).create<SummaryData>(withCreatedTimestamps(mainData));
                }

                // 创建空的摘要内容子表
                const existingSummary = await pb.collection(COLLECTIONS.VIDEO_SUMMARIES).getList(1, 1, { filter });
                if (existingSummary.totalItems === 0) {
                    await pb.collection(COLLECTIONS.VIDEO_SUMMARIES).create(withCreatedTimestamps({
                        videoId: safeVideoId,
                        platform: platform,
                        summary: ''
                    }));
                }

                // 创建空的关键要点子表
                const existingInsights = await pb.collection(COLLECTIONS.VIDEO_KEY_INSIGHTS).getList(1, 1, { filter });
                if (existingInsights.totalItems === 0) {
                    await pb.collection(COLLECTIONS.VIDEO_KEY_INSIGHTS).create(withCreatedTimestamps({
                        videoId: safeVideoId,
                        platform: platform,
                        keyTakeaway: '',
                        keyPoints: '[]',  // JSON 字符串格式
                        coreTerms: '[]'   // JSON 字符串格式
                    }));
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