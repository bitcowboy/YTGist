import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getCollections, createCollection } from '$lib/server/database.js';

export const GET: RequestHandler = async () => {
    try {
        const collections = await getCollections();
        return json({ collections });
    } catch (err) {
        console.error('Failed to get collections:', err);
        return error(500, 'Failed to get collections');
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { name, description } = await request.json();
        
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return error(400, 'Collection name is required');
        }
        
        const collection = await createCollection(name.trim(), description);
        
        return json({
            success: true,
            collection
        });
    } catch (err) {
        console.error('Failed to create collection:', err);
        
        if (err instanceof Error) {
            return error(500, err.message);
        }
        
        return error(500, 'Failed to create collection');
    }
};

