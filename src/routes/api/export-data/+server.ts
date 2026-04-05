import { json, error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { RequestHandler } from './$types.js';
import * as fs from 'fs';
import * as path from 'path';

export const POST: RequestHandler = async () => {
	try {
		console.log('📤 Starting data export...');

		const collectionsToExport = ['transcripts', 'summaries'];

		const exportDir = path.join(process.cwd(), 'data-export');
		if (!fs.existsSync(exportDir)) {
			fs.mkdirSync(exportDir, { recursive: true });
		}

		const results: any[] = [];

		for (const collectionName of collectionsToExport) {
			try {
				console.log(`\n📦 Exporting collection: ${collectionName}`);

				// 获取集合
				const collections = await databases.listCollections('main');
				const collection = collections.collections.find((c) => c.name === collectionName);

				if (!collection) {
					console.log(`  ⚠️ Collection '${collectionName}' not found, skipping...`);
					results.push({
						collection: collectionName,
						status: 'skipped',
						message: 'Collection not found'
					});
					continue;
				}

				// 分页获取所有文档
				const allDocuments: any[] = [];
				let lastId: string | undefined = undefined;
				const pageSize = 100;
				let pageCount = 0;

				while (true) {
					const queries = [Query.limit(pageSize), Query.orderAsc('$id')];
					if (lastId) {
						queries.push(Query.cursorAfter(lastId));
					}

					pageCount++;
					console.log(`  📄 Fetching page ${pageCount}...`);

					const { documents, total } = await databases.listDocuments(
						'main',
						collection.$id,
						queries
					);

					allDocuments.push(...documents);
					console.log(
						`  ✅ Page ${pageCount}: ${documents.length} documents (total: ${allDocuments.length}/${total})`
					);

					if (documents.length < pageSize || allDocuments.length >= total) {
						break;
					}

					lastId = documents[documents.length - 1].$id;

					// 避免速率限制
					await new Promise((resolve) => setTimeout(resolve, 100));
				}

				// 保存到文件
				const filename = path.join(exportDir, `${collectionName}-${Date.now()}.json`);
				fs.writeFileSync(filename, JSON.stringify(allDocuments, null, 2), 'utf-8');

				console.log(`  💾 Exported ${allDocuments.length} documents to ${filename}`);

				results.push({
					collection: collectionName,
					status: 'exported',
					documentCount: allDocuments.length,
					filename: path.basename(filename)
				});
			} catch (err: any) {
				console.error(`  ❌ Failed to export ${collectionName}:`, err);
				results.push({
					collection: collectionName,
					status: 'error',
					message: err?.message || 'Unknown error'
				});
			}
		}

		console.log('\n✅ Data export completed');

		return json({
			success: true,
			message: 'Data export completed',
			exportDirectory: exportDir,
			results
		});
	} catch (err) {
		console.error('Data export failed:', err);
		return error(500, err instanceof Error ? err.message : 'Failed to export data');
	}
};
