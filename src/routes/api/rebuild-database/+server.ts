import { json, error } from '@sveltejs/kit';
import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import type { RequestHandler } from './$types.js';

const ALL_COLLECTIONS = [
    'summaries',
    'video_summaries',
    'video_key_insights',
    'video_comments_analysis',
    'transcripts',
    'blocked_channels'
];

export const POST: RequestHandler = async () => {
    try {
        console.log('🔄 Starting complete database rebuild process...');
        await ensureAdminAuth();

        const results: any[] = [];
        const allCollections = await pb.collections.getFullList();
        const collectionMap = new Map(allCollections.map((c) => [c.name, c]));

        for (const collectionName of ALL_COLLECTIONS) {
            try {
                console.log(`\n📦 Processing collection: ${collectionName}`);

                const collection = collectionMap.get(collectionName);
                if (!collection) {
                    console.log(`  ⚠️ Collection '${collectionName}' not found, skipping...`);
                    results.push({
                        collection: collectionName,
                        status: 'skipped',
                        message: 'Collection not found - may already be deleted'
                    });
                    continue;
                }

                const { totalItems } = await pb.collection(collection.id).getList(1, 1);
                console.log(`  📊 Found ${totalItems} record(s)`);

                await pb.collections.delete(collection.id);
                console.log(`  ✅ Collection deleted`);

                results.push({
                    collection: collectionName,
                    status: 'deleted',
                    message: totalItems > 0
                        ? `Collection deleted with ${totalItems} record(s)`
                        : 'Empty collection deleted',
                    documentCount: totalItems,
                    warning: totalItems > 0 ? 'All data has been removed' : undefined
                });
            } catch (err: any) {
                console.error(`  ❌ Failed to process ${collectionName}:`, err);
                results.push({
                    collection: collectionName,
                    status: 'error',
                    message: err?.message || 'Unknown error'
                });
            }
        }

        const deletedCount = results.filter((r) => r.status === 'deleted').length;
        const skippedCount = results.filter((r) => r.status === 'skipped').length;
        const errorCount = results.filter((r) => r.status === 'error').length;
        const totalDocsDeleted = results.reduce((sum, r) => sum + (r.documentCount || 0), 0);

        console.log('\n✅ Database rebuild completed');

        return json({
            success: true,
            message: 'Database rebuild completed. Please run migration script to recreate collections.',
            summary: {
                total: ALL_COLLECTIONS.length,
                deleted: deletedCount,
                skipped: skippedCount,
                errors: errorCount,
                totalDocumentsDeleted: totalDocsDeleted
            },
            results,
            nextSteps: [
                'Run migration script: curl -X POST http://localhost:5173/api/init-database',
                'Verify collections are created correctly',
                'Re-import data if needed'
            ]
        });
    } catch (err) {
        console.error('Database rebuild failed:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to rebuild database');
    }
};
