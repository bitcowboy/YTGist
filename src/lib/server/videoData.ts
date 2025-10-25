import { YOUTUBE_DATA_API_KEY } from "$env/static/private";
import type { VideoMeta } from "$lib/types";
import { getTranscript } from "$lib/server/transcript";
import { getComments } from "$lib/server/comments";
import { generateCommentsSummary } from "$lib/server/comments-summary";

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
	let publishedAt = video.snippet.publishedAt; // ISO 8601 format from YouTube API
	
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

    let transcript = '';
    let hasSubtitles = false;
    
    try {
        transcript = await getTranscript(videoId);
        hasSubtitles = true;
    } catch (error) {
        if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
            console.info(`Video ${videoId} has no subtitles`);
            hasSubtitles = false;
        } else {
            throw error;
        }
    }

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
        hasSubtitles,
        publishedAt,
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

    return { title, channelId, description, author, hasSubtitles: false };
};


export const getVideoData = async (videoId: string): Promise<VideoMeta> => {
	if (!YOUTUBE_DATA_API_KEY) {
		throw new Error('YouTube Data API key is required but not configured');
	}

	try {
		return await getVideoDataWithYouTubeAPI(videoId);
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
	if (!YOUTUBE_DATA_API_KEY) {
		throw new Error('YouTube Data API key is required but not configured');
	}

	try {
		return await getVideoDataWithYouTubeAPIWithoutTranscript(videoId);
	} catch (error) {
		console.error('Failed to get video data:', error);
		throw new Error(`Failed to get video data. ${error}`);
	}
};