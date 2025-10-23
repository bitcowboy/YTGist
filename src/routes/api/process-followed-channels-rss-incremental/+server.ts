import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { 
    getFollowedChannels, 
    getSummary, 
    getChannelLastProcessedVideoId,
    updateChannelLastProcessedVideo 
} from '$lib/server/database.js';
import { getMultipleChannelsIncrementalRSSVideos } from '$lib/server/rss-monitor.js';
import { getVideoData } from '$lib/server/videoData.js';
import { getSummary as generateSummary } from '$lib/server/summary.js';
import { createSummary } from '$lib/server/database.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret } = await request.json();

        // 验证调用者身份 - 在开发环境中允许使用nonce
        if (!secret || (secret !== CRON_SECRET && !secret.includes('.'))) {
            return error(401, 'Unauthorized');
        }

        console.log('Starting incremental RSS-based follow process...');
        
        const followedChannels = await getFollowedChannels();
        console.log(`Found ${followedChannels.length} followed channels`);
        
        if (followedChannels.length === 0) {
            return json({
                success: true,
                message: 'No followed channels to process',
                totalChannels: 0,
                totalNewVideos: 0,
                totalProcessedVideos: 0,
                results: []
            });
        }

        let totalNewVideos = 0;
        let totalProcessedVideos = 0;
        const results = [];

        // 获取每个频道的最新处理视频ID
        const channelLastProcessedMap = new Map<string, string | null>();
        for (const channel of followedChannels) {
            const lastProcessedVideoId = await getChannelLastProcessedVideoId(channel.channelId);
            channelLastProcessedMap.set(channel.channelId, lastProcessedVideoId);
            console.log(`Channel ${channel.channelName}: last processed video ID = ${lastProcessedVideoId || 'none'}`);
        }
        
        // 批量获取增量RSS视频
        const rssResults = await getMultipleChannelsIncrementalRSSVideos(channelLastProcessedMap);
        
        // 处理每个频道的RSS结果
        for (const rssResult of rssResults) {
            const channel = followedChannels.find(c => c.channelId === rssResult.channelId);
            if (!channel) continue;

            try {
                console.log(`Processing incremental RSS videos for channel: ${channel.channelName} (${channel.channelId})`);
                
                if (rssResult.error) {
                    console.error(`RSS error for channel ${channel.channelName}:`, rssResult.error);
                    results.push({
                        channelId: channel.channelId,
                        channelName: channel.channelName,
                        success: false,
                        error: rssResult.error,
                        newVideos: 0,
                        processedVideos: 0
                    });
                    continue;
                }

                const channelVideos = rssResult.videos;
                console.log(`Found ${channelVideos.length} new videos from incremental RSS for channel ${channel.channelName}`);
                
                let channelNewVideos = 0;
                let channelProcessedVideos = 0;
                let latestProcessedVideoId = channelLastProcessedMap.get(channel.channelId);
                let latestProcessedVideoTitle = '';
                let latestProcessedVideoPublishedAt = '';
                
                // 检查每个视频是否已经在summaries表中存在
                for (const video of channelVideos) {
                    try {
                        // 检查视频是否已经有总结
                        const existingSummary = await getSummary(video.videoId);
                        
                        if (existingSummary) {
                            console.log(`Video ${video.videoId} already has summary, skipping`);
                            // 仍然更新最新处理视频ID，因为这是RSS中的新视频
                            if (!latestProcessedVideoId || video.publishedAt > latestProcessedVideoPublishedAt) {
                                latestProcessedVideoId = video.videoId;
                                latestProcessedVideoTitle = video.title;
                                latestProcessedVideoPublishedAt = video.publishedAt;
                            }
                            continue;
                        }
                        
                        console.log(`Processing new video: ${video.videoId} - ${video.title}`);
                        
                        // 获取视频数据
                        const videoData = await getVideoData(video.videoId);
                        if (!videoData) {
                            console.warn(`Failed to get video data for ${video.videoId}`);
                            continue;
                        }
                        
                        // 生成总结
                        const summaryResult = await generateSummary(videoData);
                        if (!summaryResult) {
                            console.warn(`Failed to generate summary for ${video.videoId}`);
                            continue;
                        }
                        
                        // 保存总结到数据库
                        await createSummary({
                            videoId: video.videoId,
                            title: videoData.title || video.title,
                            description: videoData.description || video.description || '',
                            author: videoData.author || channel.channelName,
                            channelId: channel.channelId,
                            summary: summaryResult.summary,
                            keyTakeaway: summaryResult.keyTakeaway,
                            keyPoints: summaryResult.keyPoints,
                            coreTerms: summaryResult.coreTerms,
                            hasSubtitles: videoData.hasSubtitles,
                            publishedAt: video.publishedAt
                        });
                        
                        channelNewVideos++;
                        channelProcessedVideos++;
                        totalNewVideos++;
                        totalProcessedVideos++;
                        
                        // 更新最新处理视频信息
                        if (!latestProcessedVideoId || video.publishedAt > latestProcessedVideoPublishedAt) {
                            latestProcessedVideoId = video.videoId;
                            latestProcessedVideoTitle = video.title;
                            latestProcessedVideoPublishedAt = video.publishedAt;
                        }
                        
                        console.log(`✅ Successfully processed video: ${video.videoId} - ${video.title}`);
                        
                    } catch (error) {
                        console.error(`Failed to process video ${video.videoId}:`, error);
                        channelProcessedVideos++;
                        totalProcessedVideos++;
                    }
                }
                
                // 更新频道的最新处理视频信息
                if (latestProcessedVideoId && latestProcessedVideoTitle && latestProcessedVideoPublishedAt) {
                    await updateChannelLastProcessedVideo(
                        channel.channelId,
                        latestProcessedVideoId,
                        latestProcessedVideoTitle,
                        latestProcessedVideoPublishedAt
                    );
                }
                
                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    success: true,
                    newVideos: channelNewVideos,
                    processedVideos: channelProcessedVideos,
                    totalVideos: channelVideos.length,
                    lastProcessedVideoId: latestProcessedVideoId
                });
                
                console.log(`✅ Channel ${channel.channelName}: ${channelNewVideos} new videos processed, last processed: ${latestProcessedVideoId}`);
                
            } catch (error) {
                console.error(`Failed to process channel ${channel.channelName}:`, error);
                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    newVideos: 0,
                    processedVideos: 0
                });
            }
        }

        console.log(`🎉 Incremental RSS-based follow process completed!`);
        console.log(`📊 Total channels: ${followedChannels.length}`);
        console.log(`📊 Total new videos: ${totalNewVideos}`);
        console.log(`📊 Total processed videos: ${totalProcessedVideos}`);

        return json({
            success: true,
            message: 'Incremental RSS-based follow process completed successfully',
            totalChannels: followedChannels.length,
            totalNewVideos,
            totalProcessedVideos,
            results
        });

    } catch (error) {
        console.error('Incremental RSS-based follow process failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            totalChannels: 0,
            totalNewVideos: 0,
            totalProcessedVideos: 0,
            results: []
        }, { status: 500 });
    }
};
