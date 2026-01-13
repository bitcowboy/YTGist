import type { VideoMeta, Comment, CommentsData, VideoPlatform } from '$lib/types';
import type { RSSVideo, RSSChannelInfo } from '../rss-monitor';

/**
 * 视频平台抽象接口
 * 所有视频平台实现都需要实现此接口
 */
export interface VideoPlatformInterface {
	/** 平台名称 */
	readonly name: string;

	/** 平台标识符 */
	readonly platform: VideoPlatform;

	/**
	 * 从URL中提取视频ID
	 * @param url 视频URL
	 * @returns 视频ID，如果无法提取则返回null
	 */
	extractVideoId(url: string): string | null;

	/**
	 * 验证视频ID格式是否正确
	 * @param videoId 视频ID
	 * @returns 是否有效
	 */
	validateVideoId(videoId: string): boolean;

	/**
	 * 获取视频元数据（包括字幕）
	 * @param videoId 视频ID
	 * @param subtitleUrl 可选的字幕URL（用于B站等需要客户端获取字幕URL的平台）
	 * @returns 视频元数据
	 */
	getVideoData(videoId: string, subtitleUrl?: string): Promise<VideoMeta>;

	/**
	 * 获取视频元数据（不包括字幕）
	 * @param videoId 视频ID
	 * @returns 视频元数据（不包含transcript字段）
	 */
	getVideoDataWithoutTranscript(videoId: string): Promise<Omit<VideoMeta, 'transcript'>>;

	/**
	 * 获取视频字幕/转录
	 * @param videoId 视频ID
	 * @returns 字幕文本
	 * @throws {Error} 如果视频没有字幕，抛出 'NO_SUBTITLES_AVAILABLE' 错误
	 */
	getTranscript(videoId: string): Promise<string>;

	/**
	 * 获取视频评论
	 * @param videoId 视频ID
	 * @param maxResults 最大返回数量
	 * @returns 评论数据
	 */
	getComments(videoId: string, maxResults: number): Promise<CommentsData>;

	/**
	 * 获取频道的RSS URL
	 * @param channelId 频道ID
	 * @returns RSS URL，如果不支持RSS则返回null
	 */
	getRSSUrl(channelId: string): string | null;

	/**
	 * 从频道URL提取频道ID
	 * @param url 频道URL
	 * @returns 频道ID，如果无法提取则返回null
	 */
	extractChannelId(url: string): string | null;

	/**
	 * 生成视频观看URL
	 * @param videoId 视频ID
	 * @returns 视频URL
	 */
	getVideoUrl(videoId: string): string;

	/**
	 * 生成频道URL
	 * @param channelId 频道ID
	 * @returns 频道URL
	 */
	getChannelUrl(channelId: string): string;

	/**
	 * 生成视频缩略图URL
	 * @param videoId 视频ID
	 * @returns 缩略图URL
	 */
	getThumbnailUrl(videoId: string): string;

	/**
	 * 解析RSS feed获取视频列表
	 * @param rssUrl RSS URL
	 * @param days 获取最近几天的视频
	 * @param maxVideos 最大视频数量
	 * @returns 视频列表
	 */
	parseRSSFeed?(rssUrl: string, days: number, maxVideos: number): Promise<RSSVideo[]>;

	/**
	 * 获取频道信息（从RSS feed）
	 * @param channelId 频道ID
	 * @returns 频道信息
	 */
	getChannelInfoFromRSS?(channelId: string): Promise<RSSChannelInfo | null>;
}
