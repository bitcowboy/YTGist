import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { classifyVideo } from '$lib/server/collection-classifier.js';
import { addVideoToCollection } from '$lib/server/database.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { videoId } = await request.json();
        
        if (!videoId || typeof videoId !== 'string') {
            return error(400, 'Video ID is required');
        }
        
        // Use AI to classify the video
        const collectionIds = await classifyVideo(videoId);
        
        if (collectionIds.length === 0) {
            return error(500, 'Failed to classify video');
        }
        
        // Add video to all determined collections
        const addedToCollections = [];
        for (const collectionId of collectionIds) {
            try {
                await addVideoToCollection(collectionId, videoId);
                addedToCollections.push(collectionId);
            } catch (err) {
                console.error(`Failed to add video to collection ${collectionId}:`, err);
                // Continue with other collections even if one fails
            }
        }
        
        return json({
            success: true,
            collectionIds: addedToCollections,
            message: `Video added to ${addedToCollections.length} collection(s)`
        });
    } catch (err) {
        console.error('Failed to classify and collect video:', err);
        
        if (err instanceof Error) {
            return error(500, err.message);
        }
        
        return error(500, 'Failed to classify and collect video');
    }
};

