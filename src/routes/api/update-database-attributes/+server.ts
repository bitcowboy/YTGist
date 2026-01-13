import { json, error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import type { RequestHandler } from './$types.js';

// 需要更新的字段配置：字段名 -> 新大小
const ATTRIBUTE_UPDATES = {
    summaries: {
        keyPoints: 3000,
        coreTerms: 3000,
        description: 3000,
        commentsKeyPoints: 3000
    }
};

export const POST: RequestHandler = async () => {
    try {
        console.log('🔄 Starting database attribute update process...');
        
        const results: any[] = [];
        
        // 获取所有集合
        const allCollections = await databases.listCollections('main');
        const collectionMap = new Map(allCollections.collections.map((c) => [c.name, c]));
        
        for (const [collectionName, updates] of Object.entries(ATTRIBUTE_UPDATES)) {
            try {
                console.log(`\n📦 Processing collection: ${collectionName}`);
                
                const collection = collectionMap.get(collectionName);
                if (!collection) {
                    console.log(`  ⚠️ Collection '${collectionName}' not found, skipping...`);
                    results.push({
                        collection: collectionName,
                        status: 'skipped',
                        message: 'Collection not found'
                    });
                    continue;
                }
                
                // 获取现有属性
                const existingAttributes = await databases.listAttributes('main', collection.$id);
                const attrMap = new Map(
                    existingAttributes.attributes.map((attr: any) => [attr.key, attr])
                );
                
                const collectionResults: any[] = [];
                
                for (const [attrName, newSize] of Object.entries(updates)) {
                    try {
                        const existingAttr = attrMap.get(attrName);
                        
                        if (!existingAttr) {
                            console.log(`  ⚠️ Attribute '${attrName}' not found, will be created by init-database`);
                            collectionResults.push({
                                attribute: attrName,
                                status: 'not_found',
                                message: 'Attribute not found, will be created by init-database'
                            });
                            continue;
                        }
                        
                        // 检查当前大小
                        const currentSize = existingAttr.size || existingAttr.maxLength;
                        
                        if (currentSize === newSize) {
                            console.log(`  ✅ Attribute '${attrName}' already has correct size: ${newSize}`);
                            collectionResults.push({
                                attribute: attrName,
                                status: 'ok',
                                message: `Already correct size: ${newSize}`,
                                currentSize,
                                newSize
                            });
                            continue;
                        }
                        
                        console.log(`  🔄 Attribute '${attrName}' needs update: ${currentSize} -> ${newSize}`);
                        
                        // 警告：删除属性会丢失该字段的所有数据
                        console.log(`  ⚠️ WARNING: Deleting attribute '${attrName}' will remove all data in this field!`);
                        
                        // 删除旧属性
                        try {
                            await databases.deleteAttribute('main', collection.$id, attrName);
                            console.log(`  ✅ Deleted attribute '${attrName}'`);
                            
                            // 等待一下，确保删除完成
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // 重新创建属性
                            await databases.createStringAttribute(
                                'main',
                                collection.$id,
                                attrName,
                                newSize,
                                existingAttr.required || false
                            );
                            console.log(`  ✅ Created attribute '${attrName}' with size ${newSize}`);
                            
                            collectionResults.push({
                                attribute: attrName,
                                status: 'updated',
                                message: `Updated from ${currentSize} to ${newSize}`,
                                currentSize,
                                newSize,
                                warning: 'Data in this field has been removed'
                            });
                        } catch (deleteError: any) {
                            // 如果删除失败（可能是因为有数据），记录错误
                            console.error(`  ❌ Failed to update attribute '${attrName}':`, deleteError);
                            collectionResults.push({
                                attribute: attrName,
                                status: 'error',
                                message: deleteError?.message || 'Failed to update attribute',
                                currentSize,
                                newSize,
                                error: deleteError?.code || 'UNKNOWN',
                                note: 'If collection has data, you may need to manually delete and recreate the attribute in Appwrite console'
                            });
                        }
                    } catch (attrError: any) {
                        console.error(`  ❌ Error processing attribute '${attrName}':`, attrError);
                        collectionResults.push({
                            attribute: attrName,
                            status: 'error',
                            message: attrError?.message || 'Unknown error',
                            error: attrError?.code || 'UNKNOWN'
                        });
                    }
                }
                
                results.push({
                    collection: collectionName,
                    status: 'processed',
                    attributes: collectionResults
                });
                
            } catch (err: any) {
                console.error(`  ❌ Failed to process collection ${collectionName}:`, err);
                results.push({
                    collection: collectionName,
                    status: 'error',
                    message: err?.message || 'Unknown error',
                    error: err?.code || 'UNKNOWN'
                });
            }
        }
        
        console.log('\n✅ Database attribute update completed');
        
        return json({
            success: true,
            message: 'Database attribute update completed',
            results,
            warnings: [
                '⚠️ Deleting attributes removes all data in those fields',
                '⚠️ If attributes cannot be deleted (due to data), you may need to manually update them in Appwrite console',
                '⚠️ After updating, run /api/init-database to ensure all attributes are correct'
            ]
        });
        
    } catch (err) {
        console.error('Database attribute update failed:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to update database attributes');
    }
};
