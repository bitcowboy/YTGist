import { databases } from '$lib/server/appwrite.js';
import { getFullSummary, COLLECTIONS } from '$lib/server/database.js';
import type { FullSummaryData, VideoPlatform } from '$lib/types.js';
import { PlatformFactory } from '$lib/server/platforms/platform-factory';
import { error } from '@sveltejs/kit';
import { Query } from 'node-appwrite';

export const load = async ({ url }) => {
	const videoId = url.searchParams.get('v');
	const platformParam = url.searchParams.get('platform') as VideoPlatform | null;

	if (!videoId) {
		return error(400, 'Video ID is required');
	}

	// 如果没有指定平台，尝试从视频ID识别平台
	let platform: VideoPlatform = platformParam || 'youtube';
	if (!platformParam) {
		const identifiedPlatform = PlatformFactory.identifyPlatformByVideoId(videoId);
		if (identifiedPlatform) {
			platform = identifiedPlatform;
		}
	}

	// 验证视频ID格式
	const platformInstance = PlatformFactory.getPlatform(platform);
	if (!platformInstance) {
		return error(400, `Unsupported platform: ${platform}`);
	}

	if (!platformInstance.validateVideoId(videoId)) {
		return error(400, `Invalid video ID format for platform ${platform}`);
	}

	try {
		// 使用新的分表查询函数获取完整数据
		const summaryData = await getFullSummary(videoId, platform);

		if (summaryData) {
			// 更新访问次数
			const updateHits = databases.incrementDocumentAttribute('main', COLLECTIONS.SUMMARIES, summaryData.$id, 'hits', 1);

			return { summaryData, updateHits, platform };
		}

		return { summaryData: null, platform };
	} catch (e) {
		console.error('Failed to check if summary was cached:', e);
		return { summaryData: null, platform };
	}
};