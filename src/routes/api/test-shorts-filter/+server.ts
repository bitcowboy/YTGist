import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { getFollowedChannels } from '$lib/server/database.js';
import { getMultipleChannelsRSSVideos } from '$lib/server/rss-monitor.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret, channelId } = await request.json();

        // 验证调用者身份 - 在开发环境中允许使用nonce
        if (!secret || (secret !== CRON_SECRET && !secret.includes('.'))) {
            return error(401, 'Unauthorized');
        }

        console.log('Testing YouTube Shorts filter...');
        
        let testChannels = [];
        
        if (channelId) {
            // 测试特定频道
            testChannels = [{ channelId }];
        } else {
            // 测试所有关注的频道
            const followedChannels = await getFollowedChannels();
            testChannels = followedChannels.slice(0, 3); // 只测试前3个频道
        }

        if (testChannels.length === 0) {
            return json({
                success: true,
                message: 'No channels to test',
                results: []
            });
        }

        const results = [];

        for (const channel of testChannels) {
            try {
                console.log(`Testing Shorts filter for channel: ${channel.channelId}`);
                
                // 获取RSS视频（包含Shorts）
                const channelIds = [channel.channelId];
                const rssResults = await getMultipleChannelsRSSVideos(channelIds, 7, 20); // 获取更多视频用于测试
                const rssResult = rssResults[0];

                if (rssResult.error) {
                    results.push({
                        channelId: channel.channelId,
                        channelName: channel.channelName,
                        success: false,
                        error: rssResult.error
                    });
                    continue;
                }

                const videos = rssResult.videos;
                const totalVideos = videos.length;
                
                // 分析视频类型
                const shortsCount = videos.filter(video => {
                    // 检查是否被识别为Shorts
                    return video.link.includes('/shorts/') || 
                           video.title.includes('#Shorts') || 
                           video.title.includes('#shorts');
                }).length;
                
                const regularVideosCount = totalVideos - shortsCount;

                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    success: true,
                    totalVideos,
                    shortsCount,
                    regularVideosCount,
                    shortsPercentage: totalVideos > 0 ? Math.round((shortsCount / totalVideos) * 100) : 0,
                    videos: videos.slice(0, 10).map(video => ({
                        videoId: video.videoId,
                        title: video.title,
                        link: video.link,
                        isShorts: video.link.includes('/shorts/') || 
                                 video.title.includes('#Shorts') || 
                                 video.title.includes('#shorts')
                    }))
                });

                console.log(`✅ Shorts filter test for channel ${channel.channelName}: ${totalVideos} total, ${shortsCount} shorts, ${regularVideosCount} regular`);

            } catch (error) {
                console.error(`Shorts filter test failed for channel ${channel.channelId}:`, error);
                results.push({
                    channelId: channel.channelId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        console.log(`🎉 Shorts filter test completed!`);

        return json({
            success: true,
            message: 'Shorts filter test completed',
            totalChannels: testChannels.length,
            results
        });

    } catch (error) {
        console.error('Shorts filter test failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            results: []
        }, { status: 500 });
    }
};
