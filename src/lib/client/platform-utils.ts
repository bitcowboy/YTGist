import type { VideoPlatform } from '$lib/types';

/**
 * 客户端平台工具函数
 * 用于前端组件生成平台相关的URL
 */

const PLATFORM_URLS: Record<
	VideoPlatform,
	{
		getVideoUrl: (videoId: string) => string;
		getChannelUrl: (channelId: string) => string;
		getThumbnailUrl: (videoId: string) => string;
		getDisplayName: () => string;
	}
> = {
	youtube: {
		getVideoUrl: (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`,
		getChannelUrl: (channelId: string) => `https://www.youtube.com/channel/${channelId}`,
		getThumbnailUrl: (videoId: string) => `https://i.ytimg.com/vi/${videoId}/0.jpg`,
		getDisplayName: () => 'YouTube'
	},
	bilibili: {
		getVideoUrl: (videoId: string) => {
			// 确保BV号格式正确
			const bvid = videoId.startsWith('BV') ? videoId : videoId;
			return `https://www.bilibili.com/video/${bvid}`;
		},
		getChannelUrl: (channelId: string) => `https://space.bilibili.com/${channelId}`,
		getThumbnailUrl: (videoId: string) => {
			// Bilibili缩略图URL格式：https://i0.hdslb.com/bfs/archive/{pic}.jpg
			// 实际pic需要从视频信息API获取，这里返回空字符串
			// 前端组件会处理空字符串的情况
			return '';
		},
		getDisplayName: () => 'Bilibili'
	},
	vimeo: {
		getVideoUrl: (videoId: string) => `https://vimeo.com/${videoId}`,
		getChannelUrl: (channelId: string) => `https://vimeo.com/user/${channelId}`,
		getThumbnailUrl: (videoId: string) => '', // Vimeo缩略图URL需要从API获取
		getDisplayName: () => 'Vimeo'
	},
	dailymotion: {
		getVideoUrl: (videoId: string) => `https://www.dailymotion.com/video/${videoId}`,
		getChannelUrl: (channelId: string) => `https://www.dailymotion.com/${channelId}`,
		getThumbnailUrl: (videoId: string) => `https://www.dailymotion.com/thumbnail/video/${videoId}`,
		getDisplayName: () => 'Dailymotion'
	}
};

/**
 * 获取视频观看URL
 */
export function getVideoUrl(videoId: string, platform: VideoPlatform = 'youtube'): string {
	return (
		PLATFORM_URLS[platform]?.getVideoUrl(videoId) || PLATFORM_URLS.youtube.getVideoUrl(videoId)
	);
}

/**
 * 获取频道URL
 */
export function getChannelUrl(channelId: string, platform: VideoPlatform = 'youtube'): string {
	return (
		PLATFORM_URLS[platform]?.getChannelUrl(channelId) ||
		PLATFORM_URLS.youtube.getChannelUrl(channelId)
	);
}

/**
 * 获取视频缩略图URL
 */
export function getThumbnailUrl(videoId: string, platform: VideoPlatform = 'youtube'): string {
	return (
		PLATFORM_URLS[platform]?.getThumbnailUrl(videoId) ||
		PLATFORM_URLS.youtube.getThumbnailUrl(videoId)
	);
}

/**
 * 获取平台显示名称
 */
export function getPlatformDisplayName(platform: VideoPlatform = 'youtube'): string {
	return PLATFORM_URLS[platform]?.getDisplayName() || 'YouTube';
}
