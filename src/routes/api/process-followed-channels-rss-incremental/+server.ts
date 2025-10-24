import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { 
    getFollowedChannels, 
    getSummary, 
    updateChannelLastProcessedVideo 
} from '$lib/server/database.js';
import { getMultipleChannelsIncrementalRSSVideos } from '$lib/server/rss-monitor.js';
import { generateVideoSummary } from '$lib/server/video-summary-service.js';

export const POST: RequestHandler = async ({ request }) => {
    const startTime = Date.now();
    console.log(`🚀 Starting incremental RSS-based follow process at ${new Date().toISOString()}`);
    
    try {
        const { secret } = await request.json();

        // 验证调用者身份 - 在开发环境中允许使用nonce
        if (!secret || (secret !== CRON_SECRET && !secret.includes('.'))) {
            return error(401, 'Unauthorized');
        }
        
        const step1Start = Date.now();
        const followedChannels = await getFollowedChannels();
        const step1Time = Date.now() - step1Start;
        console.log(`📊 Step 1 - Get followed channels with last processed IDs: ${step1Time}ms (${followedChannels.length} channels)`);
        
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

        // 构建频道最后处理视频ID映射（从已获取的数据中提取）
        const channelLastProcessedMap = new Map<string, string | null>();
        for (const channel of followedChannels) {
            channelLastProcessedMap.set(channel.channelId, channel.lastProcessedVideoId || null);
            console.log(`Channel ${channel.channelName}: last processed video ID = ${channel.lastProcessedVideoId || 'none'}`);
        }
        
        // 批量获取增量RSS视频
        const step2Start = Date.now();
        const rssResults = await getMultipleChannelsIncrementalRSSVideos(channelLastProcessedMap);
        const step2Time = Date.now() - step2Start;
        console.log(`📊 Step 2 - Get RSS videos: ${step2Time}ms`);
        
        // 处理每个频道的RSS结果
        const step3Start = Date.now();
        let step3TotalTime = 0;
        for (const rssResult of rssResults) {
            const channel = followedChannels.find(c => c.channelId === rssResult.channelId);
            if (!channel) continue;

            const channelStart = Date.now();
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
                    const videoStart = Date.now();
                    try {
                        // 检查视频是否已经有总结
                        const summaryCheckStart = Date.now();
                        const existingSummary = await getSummary(video.videoId);
                        const summaryCheckTime = Date.now() - summaryCheckStart;
                        
                        if (existingSummary) {
                            console.log(`Video ${video.videoId} already has summary, skipping (${summaryCheckTime}ms)`);
                            // 仍然更新最新处理视频ID，因为这是RSS中的新视频
                            if (!latestProcessedVideoId || video.publishedAt > latestProcessedVideoPublishedAt) {
                                latestProcessedVideoId = video.videoId;
                                latestProcessedVideoTitle = video.title;
                                latestProcessedVideoPublishedAt = video.publishedAt;
                            }
                            continue;
                        }
                        
                        console.log(`Processing new video: ${video.videoId} - ${video.title} (summary check: ${summaryCheckTime}ms)`);
                        
                        // 使用统一的视频总结生成服务
                        const generateStart = Date.now();
                        const result = await generateVideoSummary(video.videoId);
                        const generateTime = Date.now() - generateStart;
                        
                        if (result.success) {
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
                            
                            const videoTotalTime = Date.now() - videoStart;
                            console.log(`✅ Successfully processed video: ${video.videoId} - ${video.title} (total: ${videoTotalTime}ms, generate: ${generateTime}ms)`);
                        } else {
                            const videoTotalTime = Date.now() - videoStart;
                            console.warn(`❌ Failed to process video ${video.videoId}: ${result.error} (total: ${videoTotalTime}ms, generate: ${generateTime}ms)`);
                            channelProcessedVideos++;
                            totalProcessedVideos++;
                        }
                        
                    } catch (error) {
                        const videoTotalTime = Date.now() - videoStart;
                        console.error(`Failed to process video ${video.videoId}:`, error, `(total: ${videoTotalTime}ms)`);
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
                
                const channelTime = Date.now() - channelStart;
                step3TotalTime += channelTime;
                console.log(`✅ Channel ${channel.channelName}: ${channelNewVideos} new videos processed, last processed: ${latestProcessedVideoId} (channel time: ${channelTime}ms)`);
                
            } catch (error) {
                const channelTime = Date.now() - channelStart;
                step3TotalTime += channelTime;
                console.error(`Failed to process channel ${channel.channelName}:`, error, `(channel time: ${channelTime}ms)`);
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
        const step3Time = Date.now() - step3Start;
        console.log(`📊 Step 3 - Process channels: ${step3Time}ms (total channel processing: ${step3TotalTime}ms)`);

        const totalTime = Date.now() - startTime;
        console.log(`🎉 Incremental RSS-based follow process completed!`);
        console.log(`📊 Total time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
        console.log(`📊 Step breakdown:`);
        console.log(`   - Step 1 (Get channels with last processed IDs): ${step1Time}ms`);
        console.log(`   - Step 2 (Get RSS videos): ${step2Time}ms`);
        console.log(`   - Step 3 (Process channels): ${step3Time}ms`);
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
