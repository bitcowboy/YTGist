import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getCollection, getCollectionVideos, removeVideoFromCollection } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ params }) => {
    try {
        const { collectionId } = params;
        
        if (!collectionId) {
            return error(400, 'Collection ID is required');
        }
        
        // Check if collection exists
        const collection = await getCollection(collectionId);
        if (!collection) {
            return error(404, 'Collection not found');
        }
        
        const collectionVideos = await getCollectionVideos(collectionId);
        
        return json({
            videos: collectionVideos
        });
    } catch (err) {
        console.error('Failed to get collection videos:', err);
        return error(500, 'Failed to get collection videos');
    }
};

export const DELETE: RequestHandler = async ({ params, request }) => {
    try {
        const { collectionId } = params;
        const { videoId } = await request.json();
        
        if (!collectionId) {
            return error(400, 'Collection ID is required');
        }
        
        if (!videoId || typeof videoId !== 'string') {
            return error(400, 'Video ID is required');
        }
        
        // Check if collection exists
        const collection = await getCollection(collectionId);
        if (!collection) {
            return error(404, 'Collection not found');
        }
        
        await removeVideoFromCollection(collectionId, videoId);
        
        return json({
            success: true,
            message: 'Video removed from collection successfully'
        });
    } catch (err) {
        console.error('Failed to remove video from collection:', err);
        
        if (err instanceof Error) {
            return error(500, err.message);
        }
        
        return error(500, 'Failed to remove video from collection');
    }
};

