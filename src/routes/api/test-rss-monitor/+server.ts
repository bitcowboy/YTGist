import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { getFollowedChannels } from '$lib/server/database.js';
import { getMultipleChannelsRSSVideos, getChannelInfoFromRSS } from '$lib/server/rss-monitor.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret, channelId } = await request.json();

        // 验证调用者身份 - 在开发环境中允许使用nonce
        if (!secret || (secret !== CRON_SECRET && !secret.includes('.'))) {
            return error(401, 'Unauthorized');
        }

        console.log('Testing RSS monitor...');
        
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
                console.log(`Testing RSS for channel: ${channel.channelId}`);
                
                // 获取频道信息
                const channelInfo = await getChannelInfoFromRSS(channel.channelId);
                if (!channelInfo) {
                    results.push({
                        channelId: channel.channelId,
                        success: false,
                        error: 'Failed to get channel info from RSS'
                    });
                    continue;
                }

                // 获取RSS视频
                const rssResults = await getMultipleChannelsRSSVideos([channel.channelId], 7);
                const rssResult = rssResults[0];

                if (rssResult.error) {
                    results.push({
                        channelId: channel.channelId,
                        channelName: channelInfo.channelName,
                        success: false,
                        error: rssResult.error,
                        rssUrl: channelInfo.rssUrl
                    });
                    continue;
                }

                results.push({
                    channelId: channel.channelId,
                    channelName: channelInfo.channelName,
                    channelUrl: channelInfo.channelUrl,
                    rssUrl: channelInfo.rssUrl,
                    thumbnailUrl: channelInfo.thumbnailUrl,
                    success: true,
                    videoCount: rssResult.videos.length,
                    videos: rssResult.videos.slice(0, 5).map(video => ({
                        videoId: video.videoId,
                        title: video.title,
                        publishedAt: video.publishedAt,
                        thumbnailUrl: video.thumbnailUrl,
                        link: video.link
                    }))
                });

                console.log(`✅ RSS test successful for channel ${channelInfo.channelName}: ${rssResult.videos.length} videos found`);

            } catch (error) {
                console.error(`RSS test failed for channel ${channel.channelId}:`, error);
                results.push({
                    channelId: channel.channelId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        console.log(`🎉 RSS monitor test completed!`);

        return json({
            success: true,
            message: 'RSS monitor test completed',
            totalChannels: testChannels.length,
            results
        });

    } catch (error) {
        console.error('RSS monitor test failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            results: []
        }, { status: 500 });
    }
};
