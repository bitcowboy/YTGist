import { json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	try {
		const collections = await databases.listCollections('main');

		const collectionInfo = collections.collections.map((c) => ({
			id: c.$id,
			name: c.name,
			createdAt: c.$createdAt
		}));

		return json({
			success: true,
			collections: collectionInfo,
			total: collectionInfo.length
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
