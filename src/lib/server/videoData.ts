import { YOUTUBE_DATA_API_KEY } from "$env/static/private";
import type { VideoMeta, Comment, VideoPlatform } from "$lib/types";
import { PlatformFactory } from "./platforms/platform-factory";

const getVideoDataWithYouTubeAPI = async (videoId: string): Promise<VideoMeta> => {
	const startTime = Date.now();
	console.log(`[videoData] Starting parallel fetch for video ${videoId}`);
	
	// Parallel fetch: video info, transcript, and comments
	const [videoInfoResult, transcriptResult, commentsResult] = await Promise.allSettled([
		// 1. Get video basic info
		(async () => {
			const stepStart = Date.now();
			try {
				const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${YOUTUBE_DATA_API_KEY}`);
				if (!response.ok) {
					throw new Error(`YouTube API error: ${response.status}`);
				}
				const data = await response.json();
				if (!data.items || data.items.length === 0) {
					throw new Error('Video not found');
				}
				const elapsed = Date.now() - stepStart;
				console.log(`[videoData] ✅ Video basic info fetched in ${elapsed}ms`);
				return data.items[0];
			} catch (error) {
				const elapsed = Date.now() - stepStart;
				console.log(`[videoData] ❌ Video basic info failed in ${elapsed}ms:`, error);
				throw error;
			}
		})(),
		
		// 2. Get transcript
		(async () => {
			const stepStart = Date.now();
			try {
				const transcript = await getTranscript(videoId);
				const elapsed = Date.now() - stepStart;
				console.log(`[videoData] ✅ Transcript fetched in ${elapsed}ms`);
				return transcript;
			} catch (error) {
				const elapsed = Date.now() - stepStart;
				if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
					console.log(`[videoData] ⚠️ Video ${videoId} has no subtitles (${elapsed}ms)`);
					return { transcript: '', hasSubtitles: false };
				}
				console.log(`[videoData] ❌ Transcript failed in ${elapsed}ms:`, error);
				throw error;
			}
		})(),
		
		// 3. Get comments
		(async () => {
			const stepStart = Date.now();
			try {
				const comments = await getComments(videoId, 50);
				const elapsed = Date.now() - stepStart;
				console.log(`[videoData] ✅ Comments fetched in ${elapsed}ms (${comments.totalCount} total)`);
				return comments;
			} catch (error) {
				const elapsed = Date.now() - stepStart;
				console.log(`[videoData] ❌ Comments failed in ${elapsed}ms:`, error);
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
	
	console.log(`[YouTube Data API] Video ${videoId}:`, {
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
				console.warn(`[YouTube Data API] Ignoring future publishedAt for video ${videoId}: ${publishedAt}`);
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
		console.log(`[videoData] ✅ Comments data prepared for unified summary (${comments.length} comments)`);
	}

	const totalElapsed = Date.now() - startTime;
	console.log(`[videoData] 🎉 All data fetched for video ${videoId} in ${totalElapsed}ms`);

    return { 
        title, 
        channelId, 
        description, 
        author, 
        transcript,
        hasSubtitles,
        publishedAt,
        comments,
        commentsCount
    };
};


const getVideoDataWithYouTubeAPIWithoutTranscript = async (videoId: string): Promise<Omit<VideoMeta, 'transcript'>> => {
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

    return { title, channelId, description, author, hasSubtitles: false };
};


export const getVideoData = async (videoId: string, platform: VideoPlatform = 'youtube', subtitleUrl?: string): Promise<VideoMeta> => {
	const platformInstance = PlatformFactory.getPlatform(platform);
	if (!platformInstance) {
		throw new Error(`Unsupported platform: ${platform}`);
	}

	try {
		return await platformInstance.getVideoData(videoId, subtitleUrl);
	} catch (error) {
		console.error(`Failed to get video data for ${platform}:`, error);
		
		// If it's a no subtitles error, preserve it
		if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
			throw error;
		}
		
		throw new Error(`Failed to get video data. ${error}`);
	}
};

export const getVideoDataWithoutTranscript = async (videoId: string, platform: VideoPlatform = 'youtube'): Promise<Omit<VideoMeta, 'transcript'>> => {
	const platformInstance = PlatformFactory.getPlatform(platform);
	if (!platformInstance) {
		throw new Error(`Unsupported platform: ${platform}`);
	}

	try {
		return await platformInstance.getVideoDataWithoutTranscript(videoId);
	} catch (error) {
		console.error(`Failed to get video data for ${platform}:`, error);
		throw new Error(`Failed to get video data. ${error}`);
	}
};