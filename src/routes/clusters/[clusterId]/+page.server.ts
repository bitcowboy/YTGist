import type { PageServerLoad } from './$types.js';
import { databases } from '$lib/server/appwrite.js';
import { getVideosByCluster } from '$lib/server/database.js';
import type { Cluster, SummaryData } from '$lib/types.js';

export const load: PageServerLoad = async ({ params }) => {
	const clusterId = params.clusterId;
	
	try {
		// Get cluster details
		const clusterDoc = await databases.getDocument<Cluster>('main', 'clusters', clusterId);
		if (!clusterDoc) {
			return {
				cluster: null,
				videos: [],
				error: 'Cluster not found'
			};
		}

		// Get videos in this cluster
		const videos = await getVideosByCluster(clusterId);

		return {
			cluster: clusterDoc,
			videos: videos as SummaryData[]
		};
	} catch (error) {
		console.error('Failed to load cluster:', error);
		return {
			cluster: null,
			videos: [],
			error: 'Failed to load cluster'
		};
	}
};

