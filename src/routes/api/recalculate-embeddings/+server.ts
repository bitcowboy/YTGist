import { error, json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { generateEmbedding } from '$lib/server/embedding.js';
import { Query } from 'node-appwrite';
import type { SummaryData } from '$lib/types.js';

export const POST = async ({ request }) => {
    try {
        const { batchSize = 10 } = await request.json();

        console.log('[recalculate-embeddings] Starting batch embedding recalculation...');

        // Get all summaries with pagination
        const allSummaries: SummaryData[] = [];
        let lastId: string | undefined = undefined;
        const pageSize = 100;
        
        while (true) {
            const queries = [Query.limit(pageSize), Query.orderAsc('$id')];
            if (lastId) {
                queries.push(Query.cursorAfter(lastId));
            }
            
            const { documents, total } = await databases.listDocuments<SummaryData>(
                'main',
                'summaries',
                queries
            );
            
            allSummaries.push(...documents);
            
            if (documents.length < pageSize || allSummaries.length >= total) {
                break;
            }
            
            lastId = documents[documents.length - 1].$id;
        }

        console.log(`[recalculate-embeddings] Found ${allSummaries.length} total summaries`);

        // Filter summaries that have both title and summary
        const summariesToProcess = allSummaries.filter(doc => {
            return doc.title && doc.title.trim() !== '' && 
                   doc.summary && doc.summary.trim() !== '';
        });

        if (summariesToProcess.length === 0) {
            return json({
                success: true,
                message: 'No summaries with title and summary found',
                processed: 0,
                failed: 0,
                total: 0
            });
        }

        console.log(`[recalculate-embeddings] Found ${summariesToProcess.length} summaries with title and summary to process`);

        // Process in batches
        const batches = [];
        for (let i = 0; i < summariesToProcess.length; i += batchSize) {
            batches.push(summariesToProcess.slice(i, i + batchSize));
        }

        let processed = 0;
        let failed = 0;
        const errors: Array<{ videoId: string; error: string }> = [];

        for (const batch of batches) {
            console.log(`[recalculate-embeddings] Processing batch: ${batch.length} summaries`);
            
            const batchPromises = batch.map(async (summary) => {
                try {
                    // Combine title and summary for embedding generation
                    // const combinedText = `${summary.title}\n\n${summary.summary}`;
                    
                    // Generate new embedding using title + summary
                    const embedding = await generateEmbedding(summary.summary);
                    
                    // Update the document with new embedding (store as array directly)
                    await databases.updateDocument<SummaryData>(
                        'main',
                        'summaries',
                        summary.$id,
                        { embedding: embedding }
                    );
                    
                    processed++;
                    console.log(`[recalculate-embeddings] ✅ Recalculated embedding for video ${summary.videoId} (${embedding.length} dimensions)`);
                    return { videoId: summary.videoId, success: true };
                } catch (err) {
                    failed++;
                    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                    console.error(`[recalculate-embeddings] ❌ Failed for video ${summary.videoId}: ${errorMsg}`);
                    errors.push({ videoId: summary.videoId, error: errorMsg });
                    return { videoId: summary.videoId, success: false, error: errorMsg };
                }
            });

            await Promise.all(batchPromises);
            
            // Add delay between batches to avoid rate limiting
            if (batches.indexOf(batch) < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`[recalculate-embeddings] Completed: ${processed} processed, ${failed} failed`);

        return json({
            success: true,
            message: `Processed ${processed} summaries, ${failed} failed`,
            processed,
            failed,
            total: summariesToProcess.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error('[recalculate-embeddings] Error:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to recalculate embeddings');
    }
};

