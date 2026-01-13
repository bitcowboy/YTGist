import { json, error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const collectionName = url.searchParams.get('collection');

		if (!collectionName) {
			return error(400, 'Collection name is required');
		}

		// 获取集合列表
		const collections = await databases.listCollections('main');
		const collection = collections.collections.find((c) => c.name === collectionName);

		if (!collection) {
			return error(404, `Collection '${collectionName}' not found`);
		}

		// 获取属性列表
		const attributes = await databases.listAttributes('main', collection.$id);

		// 获取文档数量
		const { total: docCount } = await databases.listDocuments('main', collection.$id, [
			Query.limit(1)
		]);

		// 计算属性总大小
		let totalAttributeSize = 0;
		const attributeDetails = attributes.attributes.map((attr: any) => {
			const size = attr.size || 0;
			totalAttributeSize += size;
			return {
				key: attr.key,
				type: attr.type,
				size: size,
				required: attr.required || false,
				array: attr.array || false
			};
		});

		return json({
			collection: collectionName,
			collectionId: collection.$id,
			documentCount: docCount,
			attributes: attributeDetails,
			totalAttributeSize: totalAttributeSize,
			attributeCount: attributes.attributes.length,
			// Appwrite 免费版限制：总属性大小约 100KB
			attributeLimit: 100 * 1024, // 100KB
			attributeUsagePercent: Math.round((totalAttributeSize / (100 * 1024)) * 100)
		});
	} catch (err) {
		console.error('Failed to check collection status:', err);
		return error(500, err instanceof Error ? err.message : 'Failed to check collection status');
	}
};
