import { json, error } from '@sveltejs/kit';
import { getFollowedChannels, getSummary } from '$lib/server/database.js';
import { getChannelVideos } from '$lib/server/channel-videos.js';
import { generateVideoSummary } from '$lib/server/video-summary-service.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async () => {
    try {
        console.log('Starting simplified follow process (manual test)...');
        
        const followedChannels = await getFollowedChannels();
        console.log(`Found ${followedChannels.length} followed channels`);
        
        if (followedChannels.length === 0) {
            return json({ 
                success: true, 
                message: 'No followed channels found. Please follow some channels first.',
                stats: {
                    followedChannels: 0,
                    newVideos: 0,
                    processedVideos: 0
                }
            });
        }
        
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
            message: 'Simplified follow process completed successfully',
            stats: {
                followedChannels: followedChannels.length,
                newVideos: totalNewVideos,
                processedVideos: totalProcessedVideos
            },
            results
        });

    } catch (error) {
        console.error('Simplified follow process failed:', error);
        return error(500, `Simplified follow process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};
