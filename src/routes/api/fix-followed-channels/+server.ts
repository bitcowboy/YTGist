import { json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { FollowedChannel } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async () => {
    try {
        console.log('Fixing followed channels isActive status...');
        
        // 获取所有 followed_channels 记录（包括 isActive 为 false 的）
        const { documents } = await databases.listDocuments<FollowedChannel>(
            'main',
            'followed_channels',
            [Query.orderDesc('$createdAt')]
        );
        
        console.log(`Found ${documents.length} total followed channels`);
        
        let fixedCount = 0;
        const results = [];
        
        for (const channel of documents) {
            try {
                // 如果 isActive 不是 true，则更新为 true
                if (channel.isActive !== true) {
                    await databases.updateDocument<FollowedChannel>(
                        'main',
                        'followed_channels',
                        channel.$id,
                        { isActive: true }
                    );
                    fixedCount++;
                    results.push({
                        channelId: channel.channelId,
                        channelName: channel.channelName,
                        action: 'activated'
                    });
                    console.log(`Fixed channel: ${channel.channelName} (${channel.channelId})`);
                } else {
                    results.push({
                        channelId: channel.channelId,
                        channelName: channel.channelName,
                        action: 'already_active'
                    });
                }
            } catch (error) {
                console.error(`Failed to fix channel ${channel.channelName}:`, error);
                results.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    action: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        
        return json({
            success: true,
            message: `Fixed ${fixedCount} channels`,
            totalChannels: documents.length,
            fixedCount,
            results
        });
        
    } catch (error) {
        console.error('Failed to fix followed channels:', error);
        return json({
            success: false,
            error: 'Failed to fix followed channels',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};

