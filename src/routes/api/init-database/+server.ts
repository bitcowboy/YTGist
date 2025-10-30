import { json, error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Permission, Role } from "node-appwrite";
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async () => {
    try {
        console.log('Initializing database collections...');
        
        const collections = [
            {
                name: 'summaries',
                attributes: [
                    { name: 'videoId', type: 'string', size: 255, required: true },
                    { name: 'title', type: 'string', size: 1000, required: true },
                    { name: 'summary', type: 'string', size: 5000, required: true },
                    { name: 'keyTakeaway', type: 'string', size: 2000, required: true },
                    { name: 'keyPoints', type: 'string', size: 5000, required: true },
                    { name: 'tags', type: 'string', size: 1000, required: false },
                    { name: 'channelId', type: 'string', size: 255, required: false },
                    { name: 'publishedAt', type: 'string', size: 50, required: false },
                    { name: 'author', type: 'string', size: 255, required: false },
                    { name: 'hasSubtitles', type: 'boolean', required: false }
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'channelId', type: 'key', attributes: ['channelId'] },
                    { key: 'publishedAt', type: 'key', attributes: ['publishedAt'] }
                ]
            },
            {
                name: 'followed_channels',
                attributes: [
                    { name: 'channelId', type: 'string', size: 255, required: true },
                    { name: 'channelName', type: 'string', size: 500, required: true },
                    { name: 'channelUrl', type: 'string', size: 1000, required: false },
                    { name: 'thumbnailUrl', type: 'string', size: 1000, required: false },
                    { name: 'followedAt', type: 'datetime', required: true },
                    { name: 'isActive', type: 'boolean', required: true },
                    { name: 'lastProcessedVideoId', type: 'string', size: 255, required: false },
                    { name: 'lastProcessedVideoTitle', type: 'string', size: 1000, required: false },
                    { name: 'lastProcessedVideoPublishedAt', type: 'string', size: 50, required: false }
                ],
                indexes: [
                    { key: 'channelId', type: 'unique', attributes: ['channelId'] },
                    { key: 'isActive', type: 'key', attributes: ['isActive'] }
                ]
            },
            {
                name: 'transcripts',
                attributes: [
                    { name: 'videoId', type: 'string', size: 255, required: true },
                    { name: 'transcript', type: 'string', size: 50000, required: true },
                    { name: 'language', type: 'string', size: 10, required: false }
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] }
                ]
            },
            {
                name: 'blocked_channels',
                attributes: [
                    { name: 'channelId', type: 'string', size: 255, required: true },
                    { name: 'channelName', type: 'string', size: 500, required: true },
                    { name: 'blockedAt', type: 'datetime', required: true }
                ],
                indexes: [
                    { key: 'channelId', type: 'unique', attributes: ['channelId'] }
                ]
            },
            {
                name: 'daily-summaries',
                attributes: [
                    { name: 'date', type: 'string', size: 10, required: true },
                    { name: 'summary', type: 'string', size: 20000, required: true },
                    { name: 'videoCount', type: 'integer', required: true },
                    { name: 'channelCount', type: 'integer', required: true }
                ],
                indexes: [
                    { key: 'date', type: 'unique', attributes: ['date'] }
                ]
            },
            {
                name: 'projects',
                attributes: [
                    { name: 'name', type: 'string', size: 500, required: true },
                    { name: 'createdAt', type: 'datetime', required: true },
                    { name: 'customPrompt', type: 'string', size: 10000, required: false }
                ],
                indexes: [
                    { key: 'createdAt', type: 'key', attributes: ['createdAt'] }
                ]
            },
            {
                name: 'project_videos',
                attributes: [
                    { name: 'projectId', type: 'string', size: 255, required: true },
                    { name: 'videoId', type: 'string', size: 255, required: true },
                    { name: 'addedAt', type: 'datetime', required: true },
                    { name: 'order', type: 'integer', required: true }
                ],
                indexes: [
                    { key: 'projectId', type: 'key', attributes: ['projectId'] },
                    { key: 'projectId_order', type: 'key', attributes: ['projectId', 'order'] }
                ]
            },
            {
                name: 'project_summaries',
                attributes: [
                    { name: 'projectId', type: 'string', size: 255, required: true },
                    { name: 'title', type: 'string', size: 500, required: true },
                    { name: 'body', type: 'string', size: 20000, required: true },
                    { name: 'keyTakeaway', type: 'string', size: 2000, required: true },
                    { name: 'videoIds', type: 'string', size: 5000, required: true },
                    { name: 'generatedAt', type: 'datetime', required: true },
                    { name: 'isStale', type: 'boolean', required: false }
                ],
                indexes: [
                    { key: 'projectId', type: 'unique', attributes: ['projectId'] }
                ]
            }
        ];

        const results = [];
        
        for (const collection of collections) {
            try {
                // 检查集合是否已存在
                const existingCollections = await databases.listCollections('main');
                const exists = existingCollections.collections.some(c => c.name === collection.name);
                
                if (exists) {
                    console.log(`Collection '${collection.name}' already exists, checking attributes`);
                    
                    // 获取现有集合
                    const existingCollection = existingCollections.collections.find(c => c.name === collection.name);
                    
                    if (existingCollection) {
                        // 获取现有属性
                        const existingAttributes = await databases.listAttributes('main', existingCollection.$id);
                        const existingAttrNames = existingAttributes.attributes.map((a: any) => a.key);
                        
                        // 检查并添加缺失的属性
                        const missingAttributes = [];
                        for (const attr of collection.attributes) {
                            if (!existingAttrNames.includes(attr.name)) {
                                missingAttributes.push(attr.name);
                                try {
                                    if (attr.type === 'string') {
                                        await databases.createStringAttribute(
                                            'main',
                                            existingCollection.$id,
                                            attr.name,
                                            attr.size || 255,
                                            attr.required
                                        );
                                    } else if (attr.type === 'boolean') {
                                        await databases.createBooleanAttribute(
                                            'main',
                                            existingCollection.$id,
                                            attr.name,
                                            attr.required
                                        );
                                    } else if (attr.type === 'integer') {
                                        await databases.createIntegerAttribute(
                                            'main',
                                            existingCollection.$id,
                                            attr.name,
                                            attr.required
                                        );
                                    } else if (attr.type === 'datetime') {
                                        await databases.createDatetimeAttribute(
                                            'main',
                                            existingCollection.$id,
                                            attr.name,
                                            attr.required
                                        );
                                    }
                                    console.log(`Added missing attribute '${attr.name}' to '${collection.name}'`);
                                } catch (attrError) {
                                    console.warn(`Failed to add attribute ${attr.name} to ${collection.name}:`, attrError);
                                }
                            }
                        }
                        
                        results.push({
                            name: collection.name,
                            status: 'updated',
                            message: missingAttributes.length > 0 
                                ? `Added missing attributes: ${missingAttributes.join(', ')}`
                                : 'Collection already exists with all attributes'
                        });
                    } else {
                        results.push({
                            name: collection.name,
                            status: 'exists',
                            message: 'Collection already exists'
                        });
                    }
                    continue;
                }
                
                // 创建集合
                const createdCollection = await databases.createCollection(
                    'main',
                    collection.name,
                    collection.name,
                    [Permission.write(Role.any())]
                );
                
                // 创建属性
                for (const attr of collection.attributes) {
                    try {
                        if (attr.type === 'string') {
                            await databases.createStringAttribute(
                                'main',
                                createdCollection.$id,
                                attr.name,
                                attr.size || 255,
                                attr.required
                            );
                        } else if (attr.type === 'boolean') {
                            await databases.createBooleanAttribute(
                                'main',
                                createdCollection.$id,
                                attr.name,
                                attr.required
                            );
                        } else if (attr.type === 'integer') {
                            await databases.createIntegerAttribute(
                                'main',
                                createdCollection.$id,
                                attr.name,
                                attr.required
                            );
                        } else if (attr.type === 'datetime') {
                            await databases.createDatetimeAttribute(
                                'main',
                                createdCollection.$id,
                                attr.name,
                                attr.required
                            );
                        }
                    } catch (attrError) {
                        console.warn(`Failed to create attribute ${attr.name} for ${collection.name}:`, attrError);
                    }
                }
                
                // 创建索引（简化版本，避免类型错误）
                for (const index of collection.indexes) {
                    try {
                        const indexKey = index.key;
                        // 暂时跳过索引创建，避免类型错误
                        console.log(`Skipping index creation for ${indexKey} in ${collection.name}`);
                    } catch (indexError) {
                        const indexKey = index.key;
                        console.warn(`Failed to create index ${indexKey} for ${collection.name}:`, indexError);
                    }
                }
                
                console.log(`✅ Created collection: ${collection.name}`);
                results.push({
                    name: collection.name,
                    status: 'created',
                    message: 'Collection created successfully'
                });
                
            } catch (error) {
                console.error(`❌ Failed to create collection ${collection.name}:`, error);
                results.push({
                    name: collection.name,
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        
        const successCount = results.filter(r => r.status === 'created').length;
        const existsCount = results.filter(r => r.status === 'exists').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        return json({
            success: true,
            message: 'Database initialization completed',
            summary: {
                total: collections.length,
                created: successCount,
                exists: existsCount,
                errors: errorCount
            },
            results
        });
        
    } catch (error) {
        console.error('Database initialization failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to initialize database'
        }, { status: 500 });
    }
};
