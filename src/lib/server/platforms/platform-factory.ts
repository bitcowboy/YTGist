import type { VideoPlatform, VideoPlatformInfo } from '$lib/types';
import type { VideoPlatformInterface } from './base';
import { YouTubePlatform } from './youtube';
import { BilibiliPlatform } from './bilibili';

/**
 * 平台工厂类
 * 负责根据URL或平台标识符创建对应的平台实例
 */
export class PlatformFactory {
	private static platforms: Map<VideoPlatform, VideoPlatformInterface> = new Map();

	/**
	 * 注册平台实现
	 */
	static registerPlatform(platform: VideoPlatform, implementation: VideoPlatformInterface): void {
		this.platforms.set(platform, implementation);
	}

	/**
	 * 初始化默认平台
	 */
	static initialize(): void {
		// 注册YouTube平台
		this.registerPlatform('youtube', new YouTubePlatform());

		// 注册Bilibili平台
		this.registerPlatform('bilibili', new BilibiliPlatform());

		// 未来可以在这里注册其他平台
		// this.registerPlatform('vimeo', new VimeoPlatform());
	}

	/**
	 * 根据平台标识符获取平台实例
	 */
	static getPlatform(platform: VideoPlatform): VideoPlatformInterface | null {
		if (this.platforms.size === 0) {
			this.initialize();
		}
		return this.platforms.get(platform) || null;
	}

	/**
	 * 从URL中识别平台并提取视频信息
	 */
	static extractVideoInfo(url: string): VideoPlatformInfo | null {
		if (this.platforms.size === 0) {
			this.initialize();
		}

		// 遍历所有已注册的平台，尝试提取视频ID
		for (const [platform, implementation] of this.platforms.entries()) {
			const videoId = implementation.extractVideoId(url);
			if (videoId) {
				return { platform, videoId };
			}
		}

		return null;
	}

	/**
	 * 根据视频ID识别平台
	 * 注意：这个方法可能不够准确，因为不同平台的ID格式可能重叠
	 * 优先使用 extractVideoInfo(url) 方法
	 */
	static identifyPlatformByVideoId(videoId: string): VideoPlatform | null {
		if (this.platforms.size === 0) {
			this.initialize();
		}

		// 遍历所有已注册的平台，尝试验证视频ID
		for (const [platform, implementation] of this.platforms.entries()) {
			if (implementation.validateVideoId(videoId)) {
				return platform;
			}
		}

		return null;
	}

	/**
	 * 获取所有已注册的平台
	 */
	static getAllPlatforms(): VideoPlatform[] {
		if (this.platforms.size === 0) {
			this.initialize();
		}
		return Array.from(this.platforms.keys());
	}
}

// 初始化默认平台
PlatformFactory.initialize();
