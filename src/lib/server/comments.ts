import { YOUTUBE_DATA_API_KEY, PROXY_URI } from "$env/static/private";
import { Innertube, Platform, UniversalCache } from "youtubei.js";
import { ProxyAgent } from 'undici';

export interface Comment {
    id: string;
    text: string;
    author: string;
    likeCount: number;
    publishedAt: string;
    replyCount?: number;
}

export interface CommentsData {
    comments: Comment[];
    totalCount: number;
}

// Only create proxy agent if PROXY_URI is available
const proxyAgent = PROXY_URI ? new ProxyAgent(PROXY_URI) : null;

const getCommentsWithYouTubeAPI = async (videoId: string, maxResults: number = 50): Promise<CommentsData> => {
    if (!YOUTUBE_DATA_API_KEY) {
        throw new Error('YouTube Data API key not available');
    }

    const response = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${YOUTUBE_DATA_API_KEY}`
    );

    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        return { comments: [], totalCount: 0 };
    }

    const comments: Comment[] = data.items.map((item: any) => ({
        id: item.id,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        likeCount: item.snippet.topLevelComment.snippet.likeCount || 0,
        publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
        replyCount: item.snippet.totalReplyCount || 0
    }));

    return {
        comments,
        totalCount: data.pageInfo?.totalResults || comments.length
    };
};

const getCommentsWithInnertube = async (videoId: string, maxResults: number = 50): Promise<CommentsData> => {
    // Innertube comments API is complex and may not be reliable
    // For now, we'll return empty results and rely on YouTube Data API
    console.warn('Innertube comments not implemented, returning empty results');
    return { comments: [], totalCount: 0 };
};

export const getComments = async (videoId: string, maxResults: number = 50): Promise<CommentsData> => {
    try {
        // Try YouTube Data API first if API key is available
        if (YOUTUBE_DATA_API_KEY) {
            try {
                return await getCommentsWithYouTubeAPI(videoId, maxResults);
            } catch (error) {
                console.warn('YouTube Data API failed for comments, falling back to Innertube:', error);
            }
        }

        // Fallback to Innertube
        return await getCommentsWithInnertube(videoId, maxResults);
    } catch (error) {
        console.error('Failed to get comments:', error);
        return { comments: [], totalCount: 0 };
    }
};
