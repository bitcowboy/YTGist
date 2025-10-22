import { json, error } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { getFollowedChannels, addFollowedVideo, getUnprocessedFollowedVideos, markVideoAsProcessed, getSummary as getSummaryByVideoId } from '$lib/server/database.js';
import { getChannelVideos } from '$lib/server/channel-videos.js';
import { getVideoData } from '$lib/server/videoData.js';
import { getSummary } from '$lib/server/summary.js';
import { createSummary } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret } = await request.json();

        // 验证调用者身份
        if (!secret || secret !== CRON_SECRET) {
            return error(401, 'Unauthorized');
        }

        console.log('Starting to process followed channels...');
        
        const followedChannels = await getFollowedChannels();
        console.log(`Found ${followedChannels.length} followed channels`);
        
        let totalNewVideos = 0;
        let totalProcessedVideos = 0;
        const results = [];

        // 处理每个关注的频道
        for (const channel of followedChannels) {
            try {
                console.log(`Processing channel: ${channel.channelName} (${channel.channelId})`);
                
                // 获取频道最新视频（最近7天）
                const channelVideos = await getChannelVideos(channel.channelId, 7);
                console.log(`Found ${channelVideos.length} recent videos for channel ${channel.channelName}`);
                
                let channelNewVideos = 0;
                
                // 添加新视频到数据库
                for (const video of channelVideos) {
                    try {
                        await addFollowedVideo(channel.channelId, video.videoId, video.title, video.publishedAt);
                        channelNewVideos++;
                        totalNewVideos++;
                    } catch (error) {
                        console.warn(`Failed to add video ${video.videoId} for channel ${channel.channelName}:`, error);
                    }
                }
                
                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    newVideos: channelNewVideos
                });
                
            } catch (error) {
                console.error(`Failed to process channel ${channel.channelName}:`, error);
                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // 处理未处理的视频
        console.log('Processing unprocessed videos...');
        const unprocessedVideos = await getUnprocessedFollowedVideos();
        console.log(`Found ${unprocessedVideos.length} unprocessed videos`);
        
        for (const video of unprocessedVideos) {
            try {
                console.log(`Processing video: ${video.title}`);
                
                // 如果该视频已存在总结，直接复用
                const existing = await getSummaryByVideoId(video.videoId);
                let savedSummary = existing;

                if (!existing) {
                    // 获取视频数据并生成总结
                    const videoData = await getVideoData(video.videoId);
                    
                    // 如果视频没有字幕，跳过处理（不生成总结也不标记为已处理）
                    if (!videoData.hasSubtitles) {
                        console.log(`Skipping video without subtitles: ${video.title}`);
                        continue;
                    }
                    
                    const summaryData = await getSummary(videoData);

                    // 选择发布时间（优先使用 videoData.publishedAt），并过滤未来时间
                    const now = Date.now();
                    const candidateDates: Array<{ source: string; value?: string }> = [
                        { source: 'videoData.publishedAt', value: videoData.publishedAt },
                        { source: 'followedVideos.publishedAt', value: video.publishedAt },
                        { source: 'followedVideos.$createdAt', value: video.$createdAt }
                    ];

                    let finalPublishedAt: string | undefined;
                    for (const candidate of candidateDates) {
                        if (!candidate.value) continue;
                        const ts = Date.parse(candidate.value);
                        if (!Number.isFinite(ts)) {
                            console.warn(`[Processing] Ignoring invalid published date (${candidate.source}) for video ${video.videoId}:`, candidate.value);
                            continue;
                        }
                        if (ts - now > 60 * 60 * 1000) {
                            console.warn(`[Processing] Ignoring future published date (${candidate.source}) for video ${video.videoId}: ${candidate.value}`);
                            continue;
                        }
                        finalPublishedAt = new Date(ts).toISOString();
                        console.log(`[Processing] Using published date from ${candidate.source} for video ${video.videoId}: ${finalPublishedAt}`);
                        break;
                    }

                    if (!finalPublishedAt) {
                        finalPublishedAt = new Date().toISOString();
                        console.warn(`[Processing] No reliable published date found for video ${video.videoId}; defaulting to current time ${finalPublishedAt}`);
                    }

                    // 保存总结（使用过滤后的发布时间）
                    savedSummary = await createSummary({
                        videoId: video.videoId,
                        title: videoData.title,
                        description: videoData.description,
                        author: videoData.author,
                        channelId: videoData.channelId,
                        summary: summaryData.summary,
                        keyTakeaway: summaryData.keyTakeaway,
                        keyPoints: summaryData.keyPoints,
                        coreTerms: summaryData.coreTerms,
                        hasSubtitles: videoData.hasSubtitles,
                        publishedAt: finalPublishedAt
                    });
                }
                
                // 标记视频为已处理
                await markVideoAsProcessed(video.videoId, savedSummary.$id);
                totalProcessedVideos++;
                
                console.log(`Successfully processed video: ${video.title}`);
            } catch (error) {
                console.error(`Failed to process video ${video.title}:`, error);
            }
        }

        console.log(`Processing completed. New videos: ${totalNewVideos}, Processed videos: ${totalProcessedVideos}`);
        
        return json({ 
            success: true, 
            message: 'Followed channels processed successfully',
            stats: {
                followedChannels: followedChannels.length,
                newVideos: totalNewVideos,
                processedVideos: totalProcessedVideos
            },
            results
        });
        
    } catch (error) {
        console.error('Failed to process followed channels:', error);
        return json({ 
            success: false, 
            error: 'Failed to process followed channels',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};
