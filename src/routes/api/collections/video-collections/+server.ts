import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getVideoCollections } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ url }) => {
    try {
        const videoId = url.searchParams.get('videoId');
        
        if (!videoId) {
            return error(400, 'Video ID is required');
        }
        
        const collections = await getVideoCollections(videoId);
        
        return json({
            collections
        });
    } catch (err) {
        console.error('Failed to get video collections:', err);
        return error(500, 'Failed to get video collections');
    }
};

