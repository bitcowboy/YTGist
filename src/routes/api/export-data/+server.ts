import { json, error } from '@sveltejs/kit';
import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import type { RequestHandler } from './$types.js';
import * as fs from 'fs';
import * as path from 'path';

export const POST: RequestHandler = async () => {
    try {
        console.log('📤 Starting data export...');
        await ensureAdminAuth();

        const collectionsToExport = [
            'transcripts',
            'summaries',
            'video_summaries',
            'video_key_insights',
            'video_comments_analysis',
            'blocked_channels'
        ];

        const exportDir = path.join(process.cwd(), 'data-export');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const results: any[] = [];

        for (const collectionName of collectionsToExport) {
            try {
                console.log(`\n📦 Exporting collection: ${collectionName}`);

                let exists = true;
                try {
                    await pb.collections.getOne(collectionName);
                } catch (err: any) {
                    if (err?.status === 404) {
                        exists = false;
                    } else {
                        throw err;
                    }
                }

                if (!exists) {
                    console.log(`  ⚠️ Collection '${collectionName}' not found, skipping...`);
                    results.push({
                        collection: collectionName,
                        status: 'skipped',
                        message: 'Collection not found'
                    });
                    continue;
                }

                const allDocuments = await pb.collection(collectionName).getFullList({
                    batch: 200,
                    sort: '+id'
                });

                const filename = path.join(exportDir, `${collectionName}-${Date.now()}.json`);
                fs.writeFileSync(filename, JSON.stringify(allDocuments, null, 2), 'utf-8');

                console.log(`  💾 Exported ${allDocuments.length} records to ${filename}`);

                results.push({
                    collection: collectionName,
                    status: 'exported',
                    documentCount: allDocuments.length,
                    filename: path.basename(filename)
                });
            } catch (err: any) {
                console.error(`  ❌ Failed to export ${collectionName}:`, err);
                results.push({
                    collection: collectionName,
                    status: 'error',
                    message: err?.message || 'Unknown error'
                });
            }
        }

        console.log('\n✅ Data export completed');

        return json({
            success: true,
            message: 'Data export completed',
            exportDirectory: exportDir,
            results
        });
    } catch (err) {
        console.error('Data export failed:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to export data');
    }
};
