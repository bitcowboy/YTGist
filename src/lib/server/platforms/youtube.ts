import { YOUTUBE_DATA_API_KEY } from '$env/static/private';
import type { VideoMeta, Comment, CommentsData, VideoPlatform } from '$lib/types';
import type { VideoPlatformInterface } from './base';
import { getTranscript as getYouTubeTranscript } from '../transcript';
import { getComments as getYouTubeComments } from '../comments';
import {
	getYouTubeRSSUrl,
	parseRSSFeed,
	getChannelInfoFromRSS,
	extractChannelIdFromUrl as extractYouTubeChannelId
} from '../rss-monitor';
import type { RSSVideo, RSSChannelInfo } from '../rss-monitor';

/**
 * YouTube平台实现
 */
export class YouTubePlatform implements VideoPlatformInterface {
	readonly name = 'YouTube';
	readonly platform: VideoPlatform = 'youtube';

	extractVideoId(url: string): string | null {
		// 支持 http:// 和 https:// 两种协议
		// URL格式示例：
		// http://www.youtube.com/watch?v=VIDEO_ID
		// https://www.youtube.com/watch?v=VIDEO_ID
		// http://youtu.be/VIDEO_ID
		// https://youtu.be/VIDEO_ID
		const patterns = [
			/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
			/youtube\.com\/watch\?.*v=([^&\n?#]+)/
		];

		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match) return match[1];
		}
		return null;
	}

	validateVideoId(videoId: string): boolean {
		// YouTube视频ID是11个字符的字母数字和连字符/下划线
		return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
	}

	async getVideoData(videoId: string, subtitleUrl?: string): Promise<VideoMeta> {
		// YouTube平台不使用subtitleUrl参数，忽略它
		if (!YOUTUBE_DATA_API_KEY) {
			throw new Error('YouTube Data API key is required but not configured');
		}

		const startTime = Date.now();
		console.log(`[YouTube] Starting parallel fetch for video ${videoId}`);

		// Parallel fetch: video info, transcript, and comments
		const [videoInfoResult, transcriptResult, commentsResult] = await Promise.allSettled([
			// 1. Get video basic info
			(async () => {
				const stepStart = Date.now();
				try {
					const response = await fetch(
						`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${YOUTUBE_DATA_API_KEY}`
					);
					if (!response.ok) {
						throw new Error(`YouTube API error: ${response.status}`);
					}
					const data = await response.json();
					if (!data.items || data.items.length === 0) {
						throw new Error('Video not found');
					}
					const elapsed = Date.now() - stepStart;
					console.log(`[YouTube] ✅ Video basic info fetched in ${elapsed}ms`);
					return data.items[0];
				} catch (error) {
					const elapsed = Date.now() - stepStart;
					console.log(`[YouTube] ❌ Video basic info failed in ${elapsed}ms:`, error);
					throw error;
				}
			})(),

			// 2. Get transcript
			(async () => {
				const stepStart = Date.now();
				try {
					const transcript = await getYouTubeTranscript(videoId);
					const elapsed = Date.now() - stepStart;
					console.log(`[YouTube] ✅ Transcript fetched in ${elapsed}ms`);
					return transcript;
				} catch (error) {
					const elapsed = Date.now() - stepStart;
					if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
						console.log(`[YouTube] ⚠️ Video ${videoId} has no subtitles (${elapsed}ms)`);
						return { transcript: '', hasSubtitles: false };
					}
					console.log(`[YouTube] ❌ Transcript failed in ${elapsed}ms:`, error);
					throw error;
				}
			})(),

			// 3. Get comments
			(async () => {
				const stepStart = Date.now();
				try {
					const comments = await getYouTubeComments(videoId, 50);
					const elapsed = Date.now() - stepStart;
					console.log(
						`[YouTube] ✅ Comments fetched in ${elapsed}ms (${comments.totalCount} total)`
					);
					return comments;
				} catch (error) {
					const elapsed = Date.now() - stepStart;
					console.log(`[YouTube] ❌ Comments failed in ${elapsed}ms:`, error);
					return { comments: [], totalCount: 0 };
				}
			})()
		]);

		// Handle video info result
		if (videoInfoResult.status === 'rejected') {
			throw videoInfoResult.reason;
		}
		const video = videoInfoResult.value;
		const title = video.snippet.title;
		const description = video.snippet.description;
		const author = video.snippet.channelTitle;
		const channelId = video.snippet.channelId;
		let publishedAt = video.snippet.publishedAt;

		console.log(`[YouTube] Video ${videoId}:`, {
			title,
			publishedAt,
			publishedAt_type: typeof publishedAt
		});

		if (publishedAt) {
			const publishedTime = Date.parse(publishedAt);
			if (Number.isFinite(publishedTime)) {
				const now = Date.now();
				// YouTube sometimes returns future times for scheduled premieres; ignore if farther than 1 hour ahead
				if (publishedTime - now > 60 * 60 * 1000) {
					console.warn(
						`[YouTube] Ignoring future publishedAt for video ${videoId}: ${publishedAt}`
					);
					publishedAt = undefined;
				}
			}
		}

		// Handle transcript result
		let transcript = '';
		let hasSubtitles = false;
		if (transcriptResult.status === 'fulfilled') {
			if (typeof transcriptResult.value === 'string') {
				transcript = transcriptResult.value;
				hasSubtitles = true;
			} else {
				transcript = transcriptResult.value.transcript;
				hasSubtitles = transcriptResult.value.hasSubtitles;
			}
		} else {
			console.warn('Transcript fetch failed:', transcriptResult.reason);
		}

		// Handle comments result
		let comments: Comment[] = [];
		let commentsCount = 0;

		if (commentsResult.status === 'fulfilled') {
			const commentsData = commentsResult.value;
			comments = commentsData.comments;
			commentsCount = commentsData.totalCount;
			console.log(`[YouTube] ✅ Comments data prepared (${comments.length} comments)`);
		}

		const totalElapsed = Date.now() - startTime;
		console.log(`[YouTube] 🎉 All data fetched for video ${videoId} in ${totalElapsed}ms`);

		return {
			title,
			channelId,
			description,
			author,
			transcript,
			hasSubtitles,
			publishedAt,
			comments,
			commentsCount,
			platform: 'youtube'
		};
	}

	async getVideoDataWithoutTranscript(videoId: string): Promise<Omit<VideoMeta, 'transcript'>> {
		if (!YOUTUBE_DATA_API_KEY) {
			throw new Error('YouTube Data API key is required but not configured');
		}

		const response = await fetch(
			`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${YOUTUBE_DATA_API_KEY}`
		);

		if (!response.ok) {
			throw new Error(`YouTube API error: ${response.status}`);
		}

		const data = await response.json();

		if (!data.items || data.items.length === 0) {
			throw new Error('Video not found');
		}

		const video = data.items[0];
		const title = video.snippet.title;
		const description = video.snippet.description;
		const author = video.snippet.channelTitle;
		const channelId = video.snippet.channelId;

		return {
			title,
			channelId,
			description,
			author,
			hasSubtitles: false,
			platform: 'youtube'
		};
	}

	async getTranscript(videoId: string): Promise<string> {
		return await getYouTubeTranscript(videoId);
	}

	async getComments(videoId: string, maxResults: number): Promise<CommentsData> {
		return await getYouTubeComments(videoId, maxResults);
	}

	getRSSUrl(channelId: string): string | null {
		return getYouTubeRSSUrl(channelId);
	}

	extractChannelId(url: string): string | null {
		return extractYouTubeChannelId(url);
	}

	getVideoUrl(videoId: string): string {
		return `https://www.youtube.com/watch?v=${videoId}`;
	}

	getChannelUrl(channelId: string): string {
		return `https://www.youtube.com/channel/${channelId}`;
	}

	getThumbnailUrl(videoId: string): string {
		return `https://i.ytimg.com/vi/${videoId}/0.jpg`;
	}

	async parseRSSFeed(rssUrl: string, days: number, maxVideos: number): Promise<RSSVideo[]> {
		const videos = await parseRSSFeed(rssUrl, days, maxVideos);
		return videos.map((v) => ({ ...v, platform: 'youtube' as VideoPlatform }));
	}

	async getChannelInfoFromRSS(channelId: string): Promise<RSSChannelInfo | null> {
		return await getChannelInfoFromRSS(channelId);
	}
}
