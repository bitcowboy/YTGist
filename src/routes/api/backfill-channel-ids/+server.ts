import { json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { SummaryData, FollowedChannelVideo } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async () => {
    try {
        console.log('Starting to backfill missing channelIds in summaries...');
        
        // 获取所有 summaries
        const { documents: allSummaries } = await databases.listDocuments<SummaryData>(
            'main',
            'summaries',
            [Query.limit(1000)] // 根据实际数据量调整
        );
        
        console.log(`Found ${allSummaries.length} total summaries`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let notFoundCount = 0;
        const results = [];
        
        for (const summary of allSummaries) {
            try {
                // 如果已有 channelId，跳过
                if (summary.channelId) {
                    skippedCount++;
                    continue;
                }
                
                // 从 followed_videos 表中查找对应的 channelId
                const { documents: followedVideos } = await databases.listDocuments<FollowedChannelVideo>(
                    'main',
                    'followed_videos',
                    [Query.equal('videoId', summary.videoId), Query.limit(1)]
                );
                
                if (followedVideos.length > 0) {
                    const channelId = followedVideos[0].channelId;
                    
                    // 更新 summary 的 channelId
                    await databases.updateDocument<SummaryData>(
                        'main',
                        'summaries',
                        summary.$id,
                        { channelId }
                    );
                    
                    updatedCount++;
                    results.push({
                        videoId: summary.videoId,
                        title: summary.title,
                        channelId,
                        action: 'updated'
                    });
                    
                    console.log(`Updated channelId for video: ${summary.title} (${summary.videoId})`);
                } else {
                    // 没有在 followed_videos 中找到对应记录
                    notFoundCount++;
                    results.push({
                        videoId: summary.videoId,
                        title: summary.title,
                        action: 'not_found'
                    });
                    
                    console.log(`No followed_video record found for: ${summary.title} (${summary.videoId})`);
                }
            } catch (error) {
                console.error(`Failed to process summary ${summary.videoId}:`, error);
                results.push({
                    videoId: summary.videoId,
                    title: summary.title,
                    action: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        
        console.log(`Backfill completed. Updated: ${updatedCount}, Skipped: ${skippedCount}, Not found: ${notFoundCount}`);
        
        return json({
            success: true,
            message: `Backfill completed successfully`,
            stats: {
                total: allSummaries.length,
                updated: updatedCount,
                skipped: skippedCount,
                notFound: notFoundCount
            },
            results: results.slice(0, 50) // 只返回前50个结果，避免响应过大
        });
        
    } catch (error) {
        console.error('Failed to backfill channelIds:', error);
        return json({
            success: false,
            error: 'Failed to backfill channelIds',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};
