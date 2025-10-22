import { json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import { getFollowedChannels } from '$lib/server/database.js';
import type { SummaryData } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
    try {
        const days = parseInt(url.searchParams.get('days') || '7');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        
        // 首先获取用户关注的频道
        const followedChannels = await getFollowedChannels();
        if (followedChannels.length === 0) {
            return json({ 
                success: true, 
                summaries: [],
                totalVideos: 0
            });
        }
        
        // 获取关注频道的 channelId 列表
        const followedChannelIds = followedChannels.map(channel => channel.channelId);
        
        // 计算日期范围
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // 只获取关注频道的视频总结
        // 由于 Appwrite 不支持数组查询，我们需要分别查询每个频道
        let allSummaries: SummaryData[] = [];
        
        for (const channelId of followedChannelIds) {
            try {
                const filters = [
                    Query.equal('channelId', channelId),
                    Query.orderDesc('publishedAt'),
                    Query.limit(limit)
                ];

                if (startDate) filters.push(Query.greaterThanEqual('publishedAt', startDate.toISOString()));
                if (endDate) filters.push(Query.lessThanEqual('publishedAt', endDate.toISOString()));

                const channelSummaries = await databases.listDocuments<SummaryData>(
                    'main',
                    'summaries',
                    filters
                );
                allSummaries = allSummaries.concat(channelSummaries.documents);
            } catch (error) {
                console.warn(`Failed to get summaries for channel ${channelId}:`, error);
            }
        }
        
        // 按发布时间排序并限制数量
        allSummaries = allSummaries
            .sort((a, b) => {
                const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : new Date(a.$createdAt).getTime();
                const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : new Date(b.$createdAt).getTime();
                return dateB - dateA;
            })
            .slice(0, limit);

        // 按频道分组
        const summariesByChannel = allSummaries.reduce((acc, summary) => {
            const channelId = summary.channelId || 'unknown';
            if (!acc[channelId]) {
                acc[channelId] = {
                    channelId,
                    channelName: summary.author,
                    videos: []
                };
            }
            acc[channelId].videos.push(summary);
            return acc;
        }, {} as Record<string, { channelId: string; channelName: string; videos: SummaryData[] }>);

        return json({ 
            success: true, 
            summaries: Object.values(summariesByChannel),
            totalVideos: allSummaries.length
        });
    } catch (error) {
        console.error('Failed to get followed summary:', error);
        return json({ success: false, error: 'Failed to get followed summary' }, { status: 500 });
    }
};
