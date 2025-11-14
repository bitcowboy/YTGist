import type { PageServerLoad } from './$types.js';
import { getClusters, getAllSummariesWithEmbeddings } from '$lib/server/database.js';

export const load: PageServerLoad = async () => {
    try {
        const clusters = await getClusters();
        
        // Get all video summaries for title mapping
        const summaries = await getAllSummariesWithEmbeddings();
        const videoTitles: Record<string, string> = {};
        summaries.forEach(summary => {
            videoTitles[summary.videoId] = summary.title || summary.videoId;
        });
        
        return {
            clusters,
            videoTitles
        };
    } catch (error) {
        console.error('Failed to load clusters:', error);
        return {
            clusters: [],
            videoTitles: {}
        };
    }
};

