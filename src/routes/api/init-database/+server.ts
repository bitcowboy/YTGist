import { json, error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Permission, Role } from "node-appwrite";
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async () => {
    try {
        console.log('Initializing database collections...');
        
        const collections = [
            // ============ 分表设计 ============
            // 主表：summaries - 存储视频基础信息和元数据
            {
                name: 'summaries',
                attributes: [
                    // 标识字段 - 精简到实际需要的大小
                    { name: 'videoId', type: 'string', size: 50, required: true },      // YouTube 11字符, Bilibili BV12字符
                    { name: 'platform', type: 'string', size: 20, required: true },     // youtube/bilibili 最长8字符
                    { name: 'channelId', type: 'string', size: 50, required: false },   // 频道ID
                    
                    // 元数据字段
                    { name: 'title', type: 'string', size: 200, required: true },       // 代码限制100，留余量
                    { name: 'author', type: 'string', size: 150, required: false },     // 代码限制100，留余量
                    { name: 'publishedAt', type: 'string', size: 30, required: false }, // ISO日期格式
                    { name: 'hasSubtitles', type: 'boolean', required: false },
                    
                    // 原始视频描述 - 来自视频平台
                    { name: 'description', type: 'string', size: 2000, required: false }, // 精简，通常不需要太长
                    
                    // 统计字段
                    { name: 'hits', type: 'integer', required: false },                 // 访问次数
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'videoId_platform', type: 'unique', attributes: ['videoId', 'platform'] },
                    { key: 'channelId', type: 'key', attributes: ['channelId'] },
                    { key: 'publishedAt', type: 'key', attributes: ['publishedAt'] },
                    { key: 'platform', type: 'key', attributes: ['platform'] }
                ]
            },
            // 子表：video_summaries - 存储视频摘要内容
            {
                name: 'video_summaries',
                attributes: [
                    { name: 'videoId', type: 'string', size: 50, required: true },
                    { name: 'platform', type: 'string', size: 20, required: true },
                    { name: 'summary', type: 'string', size: 5000, required: true },    // 主摘要内容
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'videoId_platform', type: 'unique', attributes: ['videoId', 'platform'] }
                ]
            },
            // 子表：video_key_insights - 存储关键要点
            {
                name: 'video_key_insights',
                attributes: [
                    { name: 'videoId', type: 'string', size: 50, required: true },
                    { name: 'platform', type: 'string', size: 20, required: true },
                    { name: 'keyTakeaway', type: 'string', size: 600, required: true }, // 核心要点
                    { name: 'keyPoints', type: 'string', size: 4000, required: true },  // JSON数组，每项200×15
                    { name: 'coreTerms', type: 'string', size: 2000, required: false }, // JSON数组，每项100×15
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'videoId_platform', type: 'unique', attributes: ['videoId', 'platform'] }
                ]
            },
            // 子表：video_comments_analysis - 存储评论分析
            {
                name: 'video_comments_analysis',
                attributes: [
                    { name: 'videoId', type: 'string', size: 50, required: true },
                    { name: 'platform', type: 'string', size: 20, required: true },
                    { name: 'commentsSummary', type: 'string', size: 1000, required: false },   // 评论总结
                    { name: 'commentsKeyPoints', type: 'string', size: 2000, required: false }, // 评论要点JSON数组
                    { name: 'commentsCount', type: 'integer', required: false },                // 评论数量
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'videoId_platform', type: 'unique', attributes: ['videoId', 'platform'] }
                ]
            },
            // 子表：video_embeddings - 存储向量嵌入
            {
                name: 'video_embeddings',
                attributes: [
                    { name: 'videoId', type: 'string', size: 50, required: true },
                    { name: 'platform', type: 'string', size: 20, required: true },
                    { name: 'embedding', type: 'double', size: 0, required: false, array: true }, // 1536维向量
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'videoId_platform', type: 'unique', attributes: ['videoId', 'platform'] }
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
                    { name: 'platform', type: 'string', size: 50, required: false },
                    { name: 'transcript', type: 'string', size: 50000, required: true },
                    { name: 'language', type: 'string', size: 10, required: false }
                ],
                indexes: [
                    { key: 'videoId', type: 'unique', attributes: ['videoId'] },
                    { key: 'videoId_platform', type: 'unique', attributes: ['videoId', 'platform'] }
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
                    { name: 'createdAt', type: 'datetime', required: true }
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
            },
            {
                name: 'collections',
                attributes: [
                    { name: 'name', type: 'string', size: 500, required: true },
                    { name: 'description', type: 'string', size: 2000, required: false },
                    { name: 'createdAt', type: 'datetime', required: true }
                ],
                indexes: [
                    { key: 'createdAt', type: 'key', attributes: ['createdAt'] }
                ]
            },
            {
                name: 'collection_videos',
                attributes: [
                    { name: 'collectionId', type: 'string', size: 255, required: true },
                    { name: 'videoId', type: 'string', size: 255, required: true },
                    { name: 'addedAt', type: 'datetime', required: true }
                ],
                indexes: [
                    { key: 'collectionId', type: 'key', attributes: ['collectionId'] },
                    { key: 'collectionId_videoId', type: 'key', attributes: ['collectionId', 'videoId'] }
                ]
            },
            {
                name: 'collection_summaries',
                attributes: [
                    { name: 'collectionId', type: 'string', size: 255, required: true },
                    { name: 'title', type: 'string', size: 500, required: true },
                    { name: 'body', type: 'string', size: 20000, required: true },
                    { name: 'keyTakeaway', type: 'string', size: 2000, required: true },
                    { name: 'videoIds', type: 'string', size: 5000, required: true },
                    { name: 'generatedAt', type: 'datetime', required: true },
                    { name: 'isStale', type: 'boolean', required: false }
                ],
                indexes: [
                    { key: 'collectionId', type: 'unique', attributes: ['collectionId'] }
                ]
            },
            {
                name: 'clusters',
                attributes: [
                    { name: 'name', type: 'string', size: 500, required: true },
                    { name: 'description', type: 'string', size: 2000, required: false },
                    { name: 'videoCount', type: 'integer', required: true },
                    { name: 'createdAt', type: 'datetime', required: true }
                ],
                indexes: [
                    { key: 'createdAt', type: 'key', attributes: ['createdAt'] }
                ]
            },
            {
                name: 'video_clusters',
                attributes: [
                    { name: 'videoId', type: 'string', size: 255, required: true },
                    { name: 'clusterId', type: 'string', size: 255, required: true },
                    { name: 'createdAt', type: 'datetime', required: true }
                ],
                indexes: [
                    { key: 'videoId', type: 'key', attributes: ['videoId'] },
                    { key: 'clusterId', type: 'key', attributes: ['clusterId'] },
                    { key: 'videoId_clusterId', type: 'key', attributes: ['videoId', 'clusterId'] }
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
                                    } else if (attr.type === 'double') {
                                        await (databases.createFloatAttribute as any)(
                                            'main', 
                                            existingCollection.$id, 
                                            attr.name, 
                                            attr.required,
                                            undefined,
                                            undefined,
                                            undefined,
                                            attr.array
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
                        } else if (attr.type === 'double') {
                            await databases.createFloatAttribute(
                                'main',
                                createdCollection.$id,
                                attr.name,
                                attr.required,
                                undefined,
                                undefined,
                                undefined,
                                attr.array
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
