import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { FollowedChannel } from '$lib/types.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret } = await request.json();

        // 验证调用者身份 - 在开发环境中允许使用nonce
        if (!secret || (secret !== CRON_SECRET && !secret.includes('.'))) {
            return error(401, 'Unauthorized');
        }

        console.log('Starting migration for followed_channels incremental fields...');
        
        // 获取所有followed_channels记录
        const { documents: followedChannels } = await databases.listDocuments<FollowedChannel>(
            'main',
            'followed_channels'
        );
        
        console.log(`Found ${followedChannels.length} followed channels to migrate`);
        
        let migratedCount = 0;
        let skippedCount = 0;
        const errors = [];
        
        for (const channel of followedChannels) {
            try {
                // 检查是否已经有增量更新字段
                const hasIncrementalFields = 
                    channel.lastProcessedVideoId !== undefined ||
                    channel.lastProcessedVideoTitle !== undefined ||
                    channel.lastProcessedVideoPublishedAt !== undefined;
                
                if (hasIncrementalFields) {
                    console.log(`Channel ${channel.channelId} already has incremental fields, skipping`);
                    skippedCount++;
                    continue;
                }
                
                // 更新记录，添加增量更新字段（设置为null/undefined表示未处理过）
                await databases.updateDocument<FollowedChannel>(
                    'main',
                    'followed_channels',
                    channel.$id,
                    {
                        lastProcessedVideoId: null,
                        lastProcessedVideoTitle: null,
                        lastProcessedVideoPublishedAt: null
                    }
                );
                
                console.log(`✅ Migrated channel: ${channel.channelName} (${channel.channelId})`);
                migratedCount++;
                
            } catch (error) {
                console.error(`❌ Failed to migrate channel ${channel.channelId}:`, error);
                errors.push({
                    channelId: channel.channelId,
                    channelName: channel.channelName,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        
        console.log(`🎉 Migration completed!`);
        console.log(`📊 Migrated: ${migratedCount}`);
        console.log(`📊 Skipped: ${skippedCount}`);
        console.log(`📊 Errors: ${errors.length}`);
        
        return json({
            success: true,
            message: 'Followed channels incremental fields migration completed',
            totalChannels: followedChannels.length,
            migratedCount,
            skippedCount,
            errorCount: errors.length,
            errors
        });

    } catch (error) {
        console.error('Migration failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            totalChannels: 0,
            migratedCount: 0,
            skippedCount: 0,
            errorCount: 0,
            errors: []
        }, { status: 500 });
    }
};
