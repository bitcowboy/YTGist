import { json, error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { RequestHandler } from './$types.js';

// 所有需要重建的集合（与 init-database 中定义的集合一致）
const ALL_COLLECTIONS = [
	'summaries',
	'video_summaries',
	'video_key_insights',
	'video_comments_analysis',
	'video_embeddings',
	'transcripts',
	'blocked_channels',
	'daily-summaries',
	'projects',
	'project_videos',
	'project_summaries',
	'collections',
	'collection_videos',
	'collection_summaries',
	'clusters',
	'video_clusters'
];

export const POST: RequestHandler = async () => {
	try {
		console.log('🔄 Starting complete database rebuild process...');
		console.log(`📋 Will rebuild ${ALL_COLLECTIONS.length} collections`);

		const results: any[] = [];

		// 获取所有现有集合
		const allCollections = await databases.listCollections('main');
		const collectionMap = new Map(allCollections.collections.map((c) => [c.name, c]));

		// 先删除所有需要重建的集合
		for (const collectionName of ALL_COLLECTIONS) {
			try {
				console.log(`\n📦 Processing collection: ${collectionName}`);

				// 1. 查找集合（先按名称，再按 ID）
				let collection = collectionMap.get(collectionName);
				if (!collection) {
					// 尝试按 ID 查找
					collection = allCollections.collections.find((c) => c.$id === collectionName);
				}

				if (!collection) {
					console.log(`  ⚠️ Collection '${collectionName}' not found, skipping...`);
					results.push({
						collection: collectionName,
						status: 'skipped',
						message: 'Collection not found - may already be deleted'
					});
					continue;
				}

				// 2. 获取文档数量
				const { total: docCount } = await databases.listDocuments('main', collection.$id, [
					Query.limit(1)
				]);

				console.log(`  📊 Found ${docCount} document(s)`);

				if (docCount === 0) {
					// 集合为空，直接删除
					console.log(`  🗑️ Deleting empty collection...`);
					await databases.deleteCollection('main', collection.$id);
					console.log(`  ✅ Collection deleted`);
					results.push({
						collection: collectionName,
						status: 'deleted',
						message: 'Empty collection deleted',
						documentCount: 0
					});
				} else {
					// 集合有数据，警告用户
					console.log(`  ⚠️ Collection contains ${docCount} document(s)`);
					console.log(`  ⚠️ WARNING: Deleting collection will remove all data!`);

					// 删除集合（这会删除所有数据）
					console.log(`  🗑️ Deleting collection with data...`);
					await databases.deleteCollection('main', collection.$id);
					console.log(`  ✅ Collection deleted`);

					results.push({
						collection: collectionName,
						status: 'deleted',
						message: `Collection deleted with ${docCount} document(s)`,
						documentCount: docCount,
						warning: 'All data has been removed'
					});
				}
			} catch (err: any) {
				console.error(`  ❌ Failed to process ${collectionName}:`, err);
				results.push({
					collection: collectionName,
					status: 'error',
					message: err?.message || 'Unknown error',
					error: err?.code || 'UNKNOWN'
				});
			}
		}

		// 统计结果
		const deletedCount = results.filter(r => r.status === 'deleted').length;
		const skippedCount = results.filter(r => r.status === 'skipped').length;
		const errorCount = results.filter(r => r.status === 'error').length;
		const totalDocsDeleted = results.reduce((sum, r) => sum + (r.documentCount || 0), 0);

		console.log('\n✅ Database rebuild completed');
		console.log(`\n📊 Summary:`);
		console.log(`   - Collections deleted: ${deletedCount}`);
		console.log(`   - Collections skipped: ${skippedCount}`);
		console.log(`   - Errors: ${errorCount}`);
		console.log(`   - Total documents deleted: ${totalDocsDeleted}`);
		console.log('\n📋 Next steps:');
		console.log('1. Run the migration script to recreate collections:');
		console.log('   curl -X POST http://localhost:5173/api/init-database');
		console.log('2. Verify collections are created with correct attribute sizes');

		return json({
			success: true,
			message: 'Database rebuild completed. Please run migration script to recreate collections.',
			summary: {
				total: ALL_COLLECTIONS.length,
				deleted: deletedCount,
				skipped: skippedCount,
				errors: errorCount,
				totalDocumentsDeleted: totalDocsDeleted
			},
			results,
			nextSteps: [
				'Run migration script: curl -X POST http://localhost:5173/api/init-database',
				'Verify collections are created correctly',
				'Re-import data if needed'
			]
		});
	} catch (err) {
		console.error('Database rebuild failed:', err);
		return error(500, err instanceof Error ? err.message : 'Failed to rebuild database');
	}
};
