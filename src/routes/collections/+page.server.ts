import type { PageServerLoad } from './$types.js';
import { getCollections, getCollectionVideos } from '$lib/server/database.js';

export const load: PageServerLoad = async () => {
    try {
        // Get all collections
        const collections = await getCollections();
        
        // For each collection, get video count
        const collectionsWithCounts = await Promise.all(
            collections.map(async (collection) => {
                const collectionVideos = await getCollectionVideos(collection.$id);
                
                return {
                    ...collection,
                    videoCount: collectionVideos.length
                };
            })
        );
        
        return {
            collections: collectionsWithCounts
        };
    } catch (error) {
        console.error('Failed to load collections:', error);
        return {
            collections: []
        };
    }
};

