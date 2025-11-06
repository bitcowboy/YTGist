import type { PageServerLoad } from './$types.js';
import { getCollection, getCollectionVideos, getSummary, getCollectionSummary, checkCollectionSummaryCacheValidity } from '$lib/server/database.js';
import type { CollectionVideo, SummaryData } from '$lib/types.js';

export const load: PageServerLoad = async ({ params }) => {
	const collectionId = params.collectionId;
	
	try {
		// Get collection details
		const collection = await getCollection(collectionId);
		if (!collection) {
			return {
				collection: null,
				videos: [],
				summaryCacheStatus: null,
				error: 'Collection not found'
			};
		}

		// Get collection videos
		const collectionVideos = await getCollectionVideos(collectionId);
		
		// Enrich videos with summary data
		const videosWithSummary: (CollectionVideo & { summary?: SummaryData })[] = [];
		
		for (const collectionVideo of collectionVideos) {
			try {
				const summary = await getSummary(collectionVideo.videoId);
				videosWithSummary.push({
					...collectionVideo,
					summary: summary || undefined
				});
			} catch (error) {
				console.error(`Failed to fetch summary for video ${collectionVideo.videoId}:`, error);
				// Add video without summary data
				videosWithSummary.push(collectionVideo);
			}
		}

		// Check collection summary cache validity
		let summaryCacheStatus = null;
		try {
			const currentVideoIds = collectionVideos.map(v => v.videoId);
			const isCacheValid = await checkCollectionSummaryCacheValidity(collectionId, currentVideoIds);
			const cachedSummary = await getCollectionSummary(collectionId);
			
			summaryCacheStatus = {
				hasCache: !!cachedSummary,
				isValid: isCacheValid,
				isStale: cachedSummary?.isStale || false,
				generatedAt: cachedSummary?.generatedAt
			};
		} catch (error) {
			console.error('Failed to check summary cache status:', error);
			// Continue without cache status
		}

		return {
			collection,
			videos: videosWithSummary,
			summaryCacheStatus
		};
	} catch (error) {
		console.error('Failed to load collection:', error);
		return {
			collection: null,
			videos: [],
			summaryCacheStatus: null,
			error: 'Failed to load collection'
		};
	}
};

