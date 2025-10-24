import { json, error } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { getFollowedChannels, getSummary } from '$lib/server/database.js';
import { getChannelVideos } from '$lib/server/channel-videos.js';
import { generateVideoSummary } from '$lib/server/video-summary-service.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret } = await request.json();

        // 验证调用者身份
        if (!secret || secret !== CRON_SECRET) {
            return error(401, 'Unauthorized');
        }

        console.log('Starting simplified follow process...');
        
        const followedChannels = await getFollowedChannels();
        console.log(`Found ${followedChannels.length} followed channels`);
        
        let totalNewVideos = 0;
        let totalProcessedVideos = 0;
        const results = [];

        // 处理每个关注的频道
        for (const channel of followedChannels) {
            try {
                console.log(`Processing channel: ${channel.channelName} (${channel.channelId})`);
                
                // 获取频道最新视频（只取最新10个）
                const channelVideos = await getChannelVideos(channel.channelId, 7);
                console.log(`Found ${channelVideos.length} recent videos for channel ${channel.channelName}`);
                
                let channelNewVideos = 0;
                let channelProcessedVideos = 0;
                
                // 检查每个视频是否已经在summaries表中存在
                for (const video of channelVideos) {
                    try {
                        // 检查视频是否已经有总结
                        const existingSummary = await getSummary(video.videoId);
                        
                        if (existingSummary) {
                            console.log(`Video ${video.videoId} already has summary, skipping`);
                            continue;
                        }
                        
                        console.log(`Processing new video: ${video.videoId} - ${video.title}`);
                        
                        // 使用统一的视频总结生成服务
                        const result = await generateVideoSummary(video.videoId);
                        
                        if (result.success) {
                            channelNewVideos++;
                            channelProcessedVideos++;
                            totalNewVideos++;
                            totalProcessedVideos++;
                            
                            console.log(`✅ Successfully processed video: ${video.videoId}`);
                        } else {
                            console.warn(`❌ Failed to process video ${video.videoId}: ${result.error}`);
                        }
                        
                    } catch (error) {
                        console.error(`Failed to process video ${video.videoId}:`, error);
                    }
                }
                
                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    newVideos: channelNewVideos,
                    processedVideos: channelProcessedVideos
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

        console.log(`Follow process completed. Total new videos: ${totalNewVideos}, Total processed: ${totalProcessedVideos}`);

        return json({
            success: true,
            message: 'Follow process completed successfully',
            stats: {
                followedChannels: followedChannels.length,
                newVideos: totalNewVideos,
                processedVideos: totalProcessedVideos
            },
            results
        });

    } catch (error) {
        console.error('Follow process failed:', error);
        return error(500, `Follow process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};
