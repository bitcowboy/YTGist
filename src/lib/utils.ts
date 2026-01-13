import type { VideoPlatformInfo } from '$lib/types';

/**
 * 从URL中提取视频ID（仅支持YouTube，向后兼容）
 * @deprecated 使用 extractVideoInfo 代替，支持多平台
 */
export const extractVideoId = (url: string) => {
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

/**
 * 从URL中提取视频信息（支持多平台）
 * 客户端版本，不依赖服务器端代码
 * @param url 视频URL
 * @returns 平台信息和视频ID，如果无法识别则返回null
 */
export const extractVideoInfo = (url: string): VideoPlatformInfo | null => {
    // YouTube URL 模式
    const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];

    for (const pattern of youtubePatterns) {
        const match = url.match(pattern);
        if (match) {
            return { platform: 'youtube', videoId: match[1] };
        }
    }

    // Bilibili URL 模式
    const bilibiliPatterns = [
        /bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i,
        /bilibili\.com\/video\/(av\d+)/i,
        /b23\.tv\/([a-zA-Z0-9]+)/i
    ];

    for (const pattern of bilibiliPatterns) {
        const match = url.match(pattern);
        if (match) {
            const id = match[1];
            // 如果是BV号，直接返回
            if (id.startsWith('BV')) {
                return { platform: 'bilibili', videoId: id };
            }
            // 如果是av号或短链接，也返回（后续可能需要转换）
            return { platform: 'bilibili', videoId: id };
        }
    }

    return null;
}

export const timeAgo = (dateString: string): string => {
    const now = new Date().getTime();
    const date = new Date(dateString).getTime();
    const diff = now - date;

    const minute = 60 * 1000;
    const hour = minute * 60;
    const day = hour * 24;
    const week = day * 7;
    const month = day * 30;
    const year = day * 365;

    if (diff < minute) {
        return 'just now';
    } else if (diff < hour) {
        const minutes = Math.floor(diff / minute);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diff < day) {
        const hours = Math.floor(diff / hour);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diff < week) {
        const days = Math.floor(diff / day);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (diff < month) {
        const weeks = Math.floor(diff / week);
        return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    } else if (diff < year) {
        const months = Math.floor(diff / month);
        return `${months} month${months !== 1 ? 's' : ''} ago`;
    } else {
        const years = Math.floor(diff / year);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    }
}
