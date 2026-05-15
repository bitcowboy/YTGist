import { json, error } from '@sveltejs/kit';
import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import type { RequestHandler } from './$types.js';

// 需要更新的字段配置：字段名 -> 新大小
const ATTRIBUTE_UPDATES: Record<string, Record<string, number>> = {
    summaries: {
        description: 3000
    },
    video_key_insights: {
        keyPoints: 4000,
        coreTerms: 3000
    },
    video_comments_analysis: {
        commentsKeyPoints: 3000
    }
};

export const POST: RequestHandler = async () => {
    try {
        console.log('🔄 Starting database attribute update process...');
        await ensureAdminAuth();

        const results: any[] = [];

        for (const [collectionName, updates] of Object.entries(ATTRIBUTE_UPDATES)) {
            try {
                console.log(`\n📦 Processing collection: ${collectionName}`);

                let collection;
                try {
                    collection = await pb.collections.getOne(collectionName);
                } catch (err: any) {
                    if (err?.status === 404) {
                        console.log(`  ⚠️ Collection '${collectionName}' not found, skipping...`);
                        results.push({
                            collection: collectionName,
                            status: 'skipped',
                            message: 'Collection not found'
                        });
                        continue;
                    }
                    throw err;
                }

                const schema = [...((collection.schema as any[]) || [])];
                const collectionResults: any[] = [];
                let dirty = false;

                for (const [attrName, newSize] of Object.entries(updates)) {
                    const field = schema.find((f) => f.name === attrName);
                    if (!field) {
                        collectionResults.push({
                            attribute: attrName,
                            status: 'not_found',
                            message: 'Field not found, will be created by init-database'
                        });
                        continue;
                    }

                    const currentSize = field.options?.max;
                    if (currentSize === newSize) {
                        collectionResults.push({
                            attribute: attrName,
                            status: 'ok',
                            message: `Already correct size: ${newSize}`,
                            currentSize,
                            newSize
                        });
                        continue;
                    }

                    field.options = { ...(field.options || {}), max: newSize };
                    dirty = true;
                    collectionResults.push({
                        attribute: attrName,
                        status: 'updated',
                        message: `Updated from ${currentSize ?? 'unset'} to ${newSize}`,
                        currentSize,
                        newSize
                    });
                }

                if (dirty) {
                    await pb.collections.update(collection.id, { schema });
                    console.log(`  ✅ Schema updated for ${collectionName}`);
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
                    message: err?.message || 'Unknown error'
                });
            }
        }

        console.log('\n✅ Database attribute update completed');

        return json({
            success: true,
            message: 'Database attribute update completed',
            results
        });
    } catch (err) {
        console.error('Database attribute update failed:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to update database attributes');
    }
};
