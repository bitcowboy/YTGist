import { databases } from '$lib/server/appwrite.js';
import { getSummary } from '$lib/server/summary.js';
import { getVideoData } from '$lib/server/videoData.js';
import { validateNonce } from '$lib/server/nonce.js';
import type { SummaryData } from '$lib/types.js';
import { error, json } from '@sveltejs/kit';
import { Query } from 'node-appwrite';

export const GET = async ({ url }) => {
    const videoId = url.searchParams.get('v');
    const nonce = url.searchParams.get('nonce');

    if (!videoId || videoId.length !== 11) {
        return error(400, 'Bad YouTube video ID!');
    }

    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        // Get fresh video data
        const videoData = await getVideoData(videoId);

        // Generate new summary
        const unsavedSummaryData = await getSummary(videoData);

        // Check if summary already exists in database
        const { documents } = await databases.listDocuments<SummaryData>('main', 'summaries', [
            Query.equal('videoId', videoId)
        ]);

        let summaryData: SummaryData;

        if (documents.length > 0) {
            // Update existing document
            const existingDoc = documents[0];
            summaryData = await databases.updateDocument<SummaryData>(
                'main',
                'summaries',
                existingDoc.$id,
                {
                    title: videoData.title,
                    summary: unsavedSummaryData.summary,
                    keyPoints: unsavedSummaryData.keyPoints,
                    keyTakeaway: unsavedSummaryData.keyTakeaway,
                    coreTerms: unsavedSummaryData.coreTerms,
                    meta: JSON.stringify({
                        channelId: videoData.channelId,
                        author: videoData.author
                    }),
                    // Reset hits counter since this is a regeneration
                    hits: 0
                }
            );
        } else {
            // Create new document if none exists
            summaryData = await databases.createDocument<SummaryData>(
                'main',
                'summaries',
                crypto.randomUUID(),
                {
                    videoId,
                    title: videoData.title,
                    summary: unsavedSummaryData.summary,
                    keyPoints: unsavedSummaryData.keyPoints,
                    keyTakeaway: unsavedSummaryData.keyTakeaway,
                    coreTerms: unsavedSummaryData.coreTerms,
                    meta: JSON.stringify({
                        channelId: videoData.channelId,
                        author: videoData.author
                    }),
                    hits: 0
                }
            );
        }

        return json(summaryData);
    } catch (e) {
        console.error('Failed to regenerate summary:', e);
        return error(500, 'Failed to regenerate summary. Please try again later.');
    }
};
