import { YOUTUBE_DATA_API_KEY, PROXY_URI } from "$env/static/private";
import type { VideoMeta } from "$lib/types";
import { Innertube, Platform, UniversalCache } from "youtubei.js";
import { getTranscript } from "$lib/server/transcript";
import { getComments } from "$lib/server/comments";
import { generateCommentsSummary } from "$lib/server/comments-summary";
import { ProxyAgent } from 'undici';

const getVideoDataWithYouTubeAPI = async (videoId: string): Promise<VideoMeta> => {
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

    const transcript = await getTranscript(videoId);

    // 获取评论并生成评论总结
    let commentsSummary = '';
    let commentsKeyPoints: string[] = [];
    let commentsCount = 0;
    
    try {
        const commentsData = await getComments(videoId, 50);
        commentsCount = commentsData.totalCount;
        
        if (commentsData.comments.length > 0) {
            const commentsSummaryData = await generateCommentsSummary(commentsData.comments, title);
            commentsSummary = commentsSummaryData.commentsSummary;
            commentsKeyPoints = commentsSummaryData.commentsKeyPoints;
        }
    } catch (error) {
        console.warn('Failed to get comments summary:', error);
    }

    return { 
        title, 
        channelId, 
        description, 
        author, 
        transcript,
        commentsSummary,
        commentsKeyPoints,
        commentsCount
    };
};

const getVideoDataWithInnertube = async (videoId: string): Promise<VideoMeta> => {
	const innertubeConfig: any = {
		cache: new UniversalCache(false)
	};

	// Only use proxy if PROXY_URI is provided
	if (PROXY_URI) {
		const proxyAgent = new ProxyAgent(PROXY_URI);
		innertubeConfig.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
			return Platform.shim.fetch(input, { ...init, dispatcher: proxyAgent } as any)
		};
	}

	const innertube = await Innertube.create(innertubeConfig);

	const info = await innertube.getInfo(videoId);

	const title = info.basic_info.title as string;
	const author = info.basic_info.author as string;
	const channelId = info.basic_info.channel_id as string;
	const description = info.basic_info.short_description as string;

    const transcript = await getTranscript(videoId);

    // 获取评论并生成评论总结
    let commentsSummary = '';
    let commentsKeyPoints: string[] = [];
    let commentsCount = 0;
    
    try {
        const commentsData = await getComments(videoId, 50);
        commentsCount = commentsData.totalCount;
        
        if (commentsData.comments.length > 0) {
            const commentsSummaryData = await generateCommentsSummary(commentsData.comments, title);
            commentsSummary = commentsSummaryData.commentsSummary;
            commentsKeyPoints = commentsSummaryData.commentsKeyPoints;
        }
    } catch (error) {
        console.warn('Failed to get comments summary:', error);
    }

    return { 
        title, 
        channelId, 
        description, 
        author, 
        transcript,
        commentsSummary,
        commentsKeyPoints,
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

    return { title, channelId, description, author };
};

const getVideoDataWithInnertubeWithoutTranscript = async (videoId: string): Promise<Omit<VideoMeta, 'transcript'>> => {
	const innertubeConfig: any = {
		cache: new UniversalCache(false)
	};

	// Only use proxy if PROXY_URI is provided
	if (PROXY_URI) {
		const proxyAgent = new ProxyAgent(PROXY_URI);
		innertubeConfig.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
			return Platform.shim.fetch(input, { ...init, dispatcher: proxyAgent } as any)
		};
	}

	const innertube = await Innertube.create(innertubeConfig);

	const info = await innertube.getInfo(videoId);

	const title = info.basic_info.title as string;
	const author = info.basic_info.author as string;
	const channelId = info.basic_info.channel_id as string;
	const description = info.basic_info.short_description as string;

    return { title, channelId, description, author };
};

export const getVideoData = async (videoId: string): Promise<VideoMeta> => {
	try {
		// Try YouTube Data API first if API key is available
		if (YOUTUBE_DATA_API_KEY) {
			try {
				return await getVideoDataWithYouTubeAPI(videoId);
			} catch (error) {
				console.warn('YouTube Data API failed, falling back to Innertube:', error);
			}
		}

		// Fallback to Innertube
		return await getVideoDataWithInnertube(videoId);
	} catch (error) {
		console.error('Failed to get video data:', error);
		
		// If it's a no subtitles error, preserve it
		if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
			throw error;
		}
		
		throw new Error(`Failed to get video data. ${error}`);
	}
};

export const getVideoDataWithoutTranscript = async (videoId: string): Promise<Omit<VideoMeta, 'transcript'>> => {
	try {
		// Try YouTube Data API first if API key is available
		if (YOUTUBE_DATA_API_KEY) {
			try {
				return await getVideoDataWithYouTubeAPIWithoutTranscript(videoId);
			} catch (error) {
				console.warn('YouTube Data API failed, falling back to Innertube:', error);
			}
		}

		// Fallback to Innertube
		return await getVideoDataWithInnertubeWithoutTranscript(videoId);
	} catch (error) {
		console.error('Failed to get video data:', error);
		
		// If it's a no subtitles error, preserve it
		if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
			throw error;
		}
		
		throw new Error(`Failed to get video data. ${error}`);
	}
};