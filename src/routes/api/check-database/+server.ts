import { json } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import type { RequestHandler } from './$types.js';

// 预期的集合结构
const expectedCollections = {
	summaries: {
		attributes: [
			'videoId',
			'platform',
			'title',
			'summary',
			'keyTakeaway',
			'keyPoints',
			'channelId',
			'publishedAt',
			'author',
			'hasSubtitles',
			'embedding',
			'coreTerms',
			'description',
			'commentsSummary',
			'commentsKeyPoints',
			'commentsCount',
			'hits'
		],
		requiredAttributes: ['videoId', 'platform', 'title', 'summary', 'keyTakeaway', 'keyPoints']
	},
	followed_channels: {
		attributes: [
			'channelId',
			'channelName',
			'channelUrl',
			'thumbnailUrl',
			'followedAt',
			'isActive',
			'lastProcessedVideoId',
			'lastProcessedVideoTitle',
			'lastProcessedVideoPublishedAt'
		],
		requiredAttributes: ['channelId', 'channelName', 'followedAt', 'isActive']
	},
	transcripts: {
		attributes: ['videoId', 'platform', 'transcript', 'language'],
		requiredAttributes: ['videoId', 'transcript']
	},
	blocked_channels: {
		attributes: ['channelId', 'channelName', 'blockedAt'],
		requiredAttributes: ['channelId', 'channelName', 'blockedAt']
	},
	'daily-summaries': {
		attributes: ['date', 'summary', 'videoCount', 'channelCount'],
		requiredAttributes: ['date', 'summary', 'videoCount', 'channelCount']
	},
	projects: {
		attributes: ['name', 'createdAt'],
		requiredAttributes: ['name', 'createdAt']
	},
	project_videos: {
		attributes: ['projectId', 'videoId', 'addedAt', 'order'],
		requiredAttributes: ['projectId', 'videoId', 'addedAt', 'order']
	},
	project_summaries: {
		attributes: ['projectId', 'title', 'body', 'keyTakeaway', 'videoIds', 'generatedAt', 'isStale'],
		requiredAttributes: ['projectId', 'title', 'body', 'keyTakeaway', 'videoIds', 'generatedAt']
	},
	collections: {
		attributes: ['name', 'description', 'createdAt'],
		requiredAttributes: ['name', 'createdAt']
	},
	collection_videos: {
		attributes: ['collectionId', 'videoId', 'addedAt'],
		requiredAttributes: ['collectionId', 'videoId', 'addedAt']
	},
	collection_summaries: {
		attributes: [
			'collectionId',
			'title',
			'body',
			'keyTakeaway',
			'videoIds',
			'generatedAt',
			'isStale'
		],
		requiredAttributes: ['collectionId', 'title', 'body', 'keyTakeaway', 'videoIds', 'generatedAt']
	},
	clusters: {
		attributes: ['name', 'description', 'videoCount', 'createdAt'],
		requiredAttributes: ['name', 'videoCount', 'createdAt']
	},
	video_clusters: {
		attributes: ['videoId', 'clusterId', 'createdAt'],
		requiredAttributes: ['videoId', 'clusterId', 'createdAt']
	}
};

export const GET: RequestHandler = async () => {
	try {
		const collections = await databases.listCollections('main');
		const results: any[] = [];
		const issues: string[] = [];

		for (const collection of collections.collections) {
			const collectionName = collection.name;
			const expected = expectedCollections[collectionName as keyof typeof expectedCollections];

			if (!expected) {
				results.push({
					name: collectionName,
					status: 'unknown',
					message: '集合不在预期列表中',
					attributes: []
				});
				continue;
			}

			try {
				// 获取集合的所有属性
				const attributes = await databases.listAttributes('main', collection.$id);
				const attributeNames = attributes.attributes.map((attr: any) => attr.key);
				const attributeMap = new Map(attributes.attributes.map((attr: any) => [attr.key, attr]));

				// 检查缺失的属性
				const missingAttributes = expected.attributes.filter(
					(attr) => !attributeNames.includes(attr)
				);

				// 检查多余的属性（不在预期列表中）
				const extraAttributes = attributeNames.filter(
					(attr) => !expected.attributes.includes(attr) && !attr.startsWith('$')
				);

				// 检查必需属性是否存在
				const missingRequired = expected.requiredAttributes.filter(
					(attr) => !attributeNames.includes(attr)
				);

				// 检查属性数量（Appwrite 限制是 100 个属性/集合）
				const attributeCount = attributeNames.length;
				const isNearLimit = attributeCount >= 90;
				const isOverLimit = attributeCount > 100;

				// 检查 summaries 集合的特殊情况
				if (collectionName === 'summaries') {
					// 检查已废弃的 tags 字段（应该删除）
					if (attributeNames.includes('tags')) {
						issues.push(`⚠️ summaries 集合包含已废弃的 'tags' 字段，建议删除以节省空间`);
					}
					// 检查必要字段
					if (!attributeNames.includes('coreTerms')) {
						issues.push(`❌ summaries 集合缺少 'coreTerms' 字段`);
					}
					if (!attributeNames.includes('description')) {
						issues.push(`❌ summaries 集合缺少 'description' 字段`);
					}
					if (!attributeNames.includes('hits')) {
						issues.push(`⚠️ summaries 集合缺少 'hits' 字段`);
					}
				}

				const status =
					missingRequired.length > 0 ? 'error' : missingAttributes.length > 0 ? 'warning' : 'ok';

				if (status !== 'ok') {
					issues.push(
						`集合 '${collectionName}': ${missingRequired.length > 0 ? '缺少必需属性' : '缺少可选属性'}`
					);
				}

				if (isOverLimit) {
					issues.push(
						`⚠️ 集合 '${collectionName}' 属性数量 (${attributeCount}) 超过 Appwrite 限制 (32)`
					);
				} else if (isNearLimit) {
					issues.push(`⚠️ 集合 '${collectionName}' 属性数量 (${attributeCount}) 接近限制 (32)`);
				}

				results.push({
					name: collectionName,
					status,
					attributeCount,
					isNearLimit,
					isOverLimit,
					expectedAttributes: expected.attributes.length,
					missingAttributes,
					missingRequired,
					extraAttributes,
					attributes: attributes.attributes.map((attr: any) => ({
						key: attr.key,
						type: attr.type,
						size: attr.size,
						required: attr.required,
						array: attr.array,
						status: expected.attributes.includes(attr.key) ? 'expected' : 'extra'
					}))
				});
			} catch (error) {
				results.push({
					name: collectionName,
					status: 'error',
					message: `无法获取属性: ${error instanceof Error ? error.message : String(error)}`,
					attributes: []
				});
				issues.push(
					`❌ 无法检查集合 '${collectionName}': ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// 检查是否有预期集合缺失
		const existingNames = new Set(collections.collections.map((c) => c.name));
		const missingCollections = Object.keys(expectedCollections).filter(
			(name) => !existingNames.has(name)
		);

		if (missingCollections.length > 0) {
			issues.push(`❌ 缺少以下集合: ${missingCollections.join(', ')}`);
		}

		const summary = {
			totalCollections: collections.collections.length,
			expectedCollections: Object.keys(expectedCollections).length,
			missingCollections: missingCollections.length,
			ok: results.filter((r) => r.status === 'ok').length,
			warnings: results.filter((r) => r.status === 'warning').length,
			errors: results.filter((r) => r.status === 'error').length,
			issues: issues.length
		};

		return json({
			success: true,
			summary,
			issues,
			collections: results,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
