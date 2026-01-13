import { error, json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { generateEmbedding } from '$lib/server/embedding.js';
import { COLLECTIONS, upsertVideoEmbedding, getVideoSummaryContent } from '$lib/server/database.js';
import { Query } from 'node-appwrite';
import type { SummaryData, VideoSummaryContent, VideoPlatform } from '$lib/types.js';

export const POST = async ({ request }) => {
    try {
        const { batchSize = 10 } = await request.json();

        console.log('[recalculate-embeddings] Starting batch embedding recalculation...');

        // Get all summaries from main table with pagination
        const allMainSummaries: SummaryData[] = [];
        let lastId: string | undefined = undefined;
        const pageSize = 100;
        
        while (true) {
            const queries = [Query.limit(pageSize), Query.orderAsc('$id')];
            if (lastId) {
                queries.push(Query.cursorAfter(lastId));
            }
            
            const { documents, total } = await databases.listDocuments<SummaryData>(
                'main',
                COLLECTIONS.SUMMARIES,
                queries
            );
            
            allMainSummaries.push(...documents);
            
            if (documents.length < pageSize || allMainSummaries.length >= total) {
                break;
            }
            
            lastId = documents[documents.length - 1].$id;
        }

        console.log(`[recalculate-embeddings] Found ${allMainSummaries.length} total summaries in main table`);

        // Filter summaries that have title
        const summariesToProcess = allMainSummaries.filter(doc => {
            return doc.title && doc.title.trim() !== '';
        });

        if (summariesToProcess.length === 0) {
            return json({
                success: true,
                message: 'No summaries found',
                processed: 0,
                failed: 0,
                total: 0
            });
        }

        console.log(`[recalculate-embeddings] Found ${summariesToProcess.length} summaries to process`);

        // Process in batches
        const batches = [];
        for (let i = 0; i < summariesToProcess.length; i += batchSize) {
            batches.push(summariesToProcess.slice(i, i + batchSize));
        }

        let processed = 0;
        let failed = 0;
        let skipped = 0;
        const errors: Array<{ videoId: string; error: string }> = [];

        for (const batch of batches) {
            console.log(`[recalculate-embeddings] Processing batch: ${batch.length} summaries`);
            
            const batchPromises = batch.map(async (mainSummary) => {
                try {
                    // Get summary content from video_summaries table
                    const summaryContent = await getVideoSummaryContent(mainSummary.videoId, mainSummary.platform as VideoPlatform);
                    
                    if (!summaryContent || !summaryContent.summary || summaryContent.summary.trim() === '') {
                        skipped++;
                        console.log(`[recalculate-embeddings] ⏭️ Skipped video ${mainSummary.videoId} - no summary content`);
                        return { videoId: mainSummary.videoId, success: true, skipped: true };
                    }
                    
                    // Generate new embedding using summary
                    const embedding = await generateEmbedding(summaryContent.summary);
                    
                    // Save to video_embeddings table
                    await upsertVideoEmbedding(mainSummary.videoId, mainSummary.platform as VideoPlatform, embedding);
                    
                    processed++;
                    console.log(`[recalculate-embeddings] ✅ Recalculated embedding for video ${mainSummary.videoId} (${embedding.length} dimensions)`);
                    return { videoId: mainSummary.videoId, success: true };
                } catch (err) {
                    failed++;
                    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                    console.error(`[recalculate-embeddings] ❌ Failed for video ${mainSummary.videoId}: ${errorMsg}`);
                    errors.push({ videoId: mainSummary.videoId, error: errorMsg });
                    return { videoId: mainSummary.videoId, success: false, error: errorMsg };
                }
            });

            await Promise.all(batchPromises);
            
            // Add delay between batches to avoid rate limiting
            if (batches.indexOf(batch) < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`[recalculate-embeddings] Completed: ${processed} processed, ${skipped} skipped, ${failed} failed`);

        return json({
            success: true,
            message: `Processed ${processed} summaries, ${skipped} skipped, ${failed} failed`,
            processed,
            skipped,
            failed,
            total: summariesToProcess.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error('[recalculate-embeddings] Error:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to recalculate embeddings');
    }
};

