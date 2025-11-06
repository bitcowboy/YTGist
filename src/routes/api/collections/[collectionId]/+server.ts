import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getCollection, updateCollection, deleteCollection } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ params }) => {
    try {
        const { collectionId } = params;
        
        if (!collectionId) {
            return error(400, 'Collection ID is required');
        }
        
        const collection = await getCollection(collectionId);
        
        if (!collection) {
            return error(404, 'Collection not found');
        }
        
        return json({ collection });
    } catch (err) {
        console.error('Failed to get collection:', err);
        return error(500, 'Failed to get collection');
    }
};

export const PUT: RequestHandler = async ({ params, request }) => {
    try {
        const { collectionId } = params;
        const { name, description } = await request.json();
        
        if (!collectionId) {
            return error(400, 'Collection ID is required');
        }
        
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return error(400, 'Collection name is required');
        }
        
        const collection = await updateCollection(collectionId, name.trim(), description);
        
        return json({
            success: true,
            collection
        });
    } catch (err) {
        console.error('Failed to update collection:', err);
        
        if (err instanceof Error) {
            return error(500, err.message);
        }
        
        return error(500, 'Failed to update collection');
    }
};

export const DELETE: RequestHandler = async ({ params }) => {
    try {
        const { collectionId } = params;
        
        if (!collectionId) {
            return error(400, 'Collection ID is required');
        }
        
        await deleteCollection(collectionId);
        
        return json({
            success: true,
            message: 'Collection deleted successfully'
        });
    } catch (err) {
        console.error('Failed to delete collection:', err);
        
        if (err instanceof Error) {
            return error(500, err.message);
        }
        
        return error(500, 'Failed to delete collection');
    }
};

