import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { PlatformFactory } from '$lib/server/platforms/platform-factory';
import type { VideoPlatform } from '$lib/types';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ url }) => {
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
		const videoData = await getVideoDataWithoutTranscript(videoId, platform);
		return json(videoData);
	} catch (e) {
		console.error('Failed to get video data:', e);
		return error(500, 'Failed to get video data. Please try again later.');
	}
};
