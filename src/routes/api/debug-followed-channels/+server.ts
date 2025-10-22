import { json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { FollowedChannel } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
    try {
        console.log('Debug: Checking followed channels in database...');
        
        // 获取所有 followed_channels 记录（包括 isActive 为 false 的）
        const { documents, total } = await databases.listDocuments<FollowedChannel>(
            'main',
            'followed_channels',
            [Query.orderDesc('$createdAt')]
        );
        
        console.log(`Found ${total} followed channels in database`);
        
        const results = documents.map(doc => ({
            id: doc.$id,
            channelId: doc.channelId,
            channelName: doc.channelName,
            isActive: doc.isActive,
            followedAt: doc.followedAt,
            createdAt: doc.$createdAt,
            updatedAt: doc.$updatedAt
        }));
        
        return json({
            success: true,
            total,
            channels: results,
            message: `Found ${total} followed channels in database`
        });
    } catch (error) {
        console.error('Failed to debug followed channels:', error);
        return json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to check followed channels in database'
        }, { status: 500 });
    }
};
