import { PlatformFactory } from './platform-factory';
import type { VideoPlatform } from '$lib/types';

/**
 * 验证视频ID是否有效
 * @param videoId 视频ID
 * @param platform 可选的平台标识符，如果不提供则尝试自动识别
 * @returns 如果有效返回平台标识符，否则返回null
 */
export function validateVideoId(videoId: string, platform?: VideoPlatform): VideoPlatform | null {
	if (!videoId || videoId.trim() === '') {
		return null;
	}

	// 如果指定了平台，直接验证
	if (platform) {
		const platformImpl = PlatformFactory.getPlatform(platform);
		if (platformImpl && platformImpl.validateVideoId(videoId)) {
			return platform;
		}
		return null;
	}

	// 否则尝试自动识别平台
	return PlatformFactory.identifyPlatformByVideoId(videoId);
}

/**
 * 从URL参数中提取并验证视频ID和平台
 * @param url URL对象
 * @returns 包含videoId和platform的对象，如果无效则返回null
 */
export function extractAndValidateVideoId(
	url: URL
): { videoId: string; platform: VideoPlatform } | null {
	const videoId = url.searchParams.get('v');
	const platformParam = url.searchParams.get('platform') as VideoPlatform | null;

	if (!videoId) {
		return null;
	}

	const platform = validateVideoId(videoId, platformParam || undefined);
	if (!platform) {
		return null;
	}

	return { videoId, platform };
}
