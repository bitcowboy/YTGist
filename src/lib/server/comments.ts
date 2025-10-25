import { YOUTUBE_DATA_API_KEY } from "$env/static/private";

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


export const getComments = async (videoId: string, maxResults: number = 50): Promise<CommentsData> => {
    if (!YOUTUBE_DATA_API_KEY) {
        console.warn('YouTube Data API key not available, returning empty comments');
        return { comments: [], totalCount: 0 };
    }

    try {
        return await getCommentsWithYouTubeAPI(videoId, maxResults);
    } catch (error) {
        console.error('Failed to get comments:', error);
        return { comments: [], totalCount: 0 };
    }
};
