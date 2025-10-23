import Parser from 'rss-parser';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { PROXY_URI } from "$env/static/private";

export interface RSSVideo {
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailUrl?: string;
    link: string;
}

export interface RSSChannelInfo {
    channelId: string;
    channelName: string;
    channelUrl: string;
    thumbnailUrl?: string;
    rssUrl: string;
}

/**
 * 获取YouTube频道的RSS URL
 * YouTube频道RSS格式: https://www.youtube.com/feeds/videos.xml?channel_id={channelId}
 */
export const getYouTubeRSSUrl = (channelId: string): string => {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
};

/**
 * 从YouTube频道URL提取频道ID
 * 支持多种YouTube频道URL格式
 */
export const extractChannelIdFromUrl = (url: string): string | null => {
    // 匹配各种YouTube频道URL格式
    const patterns = [
        /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/user\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/@([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=.*&list=([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
};

/**
 * 创建RSS解析器实例
 */
const createRSSParser = (): Parser => {
    const parserConfig: any = {
        customFields: {
            item: [
                ['media:group', 'mediaGroup', { keepArray: true }],
                ['yt:videoId', 'videoId'],
                ['yt:channelId', 'channelId'],
                ['media:thumbnail', 'thumbnail', { keepArray: true }],
                ['media:description', 'description'],
            ]
        },
        timeout: 3000, // 3秒超时
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    };

    // 如果配置了代理，设置代理
    if (PROXY_URI) {
        const proxyAgent = new HttpsProxyAgent(PROXY_URI);
        parserConfig.requestOptions = {
            agent: proxyAgent
        };
        console.log(`RSS parser using proxy: ${PROXY_URI}`);
    }

    const parser = new Parser(parserConfig);
    return parser;
};

/**
 * 解析RSS feed获取视频列表
 */
export const parseRSSFeed = async (rssUrl: string, days: number = 7, maxVideos: number = 10): Promise<RSSVideo[]> => {
    const maxRetries = 2;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Parsing RSS feed (attempt ${attempt}/${maxRetries}): ${rssUrl}`);
            
            const parser = createRSSParser();
            const feed = await parser.parseURL(rssUrl);
            
            if (!feed.items || feed.items.length === 0) {
                console.log('No items found in RSS feed');
                return [];
            }

            // 计算日期阈值
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - days);

            const videos: RSSVideo[] = [];

            for (const item of feed.items.slice(0, maxVideos)) {
                try {
                    // 检查是否为YouTube Shorts
                    if (isYouTubeShorts(item)) {
                        console.log(`Skipping YouTube Shorts: ${item.title}`);
                        continue;
                    }

                    // 解析发布日期
                    const publishedDate = item.isoDate ? new Date(item.isoDate) : new Date();

                    // 只处理指定天数内的视频
                    if (publishedDate < thresholdDate) {
                        continue;
                    }

                    // 获取缩略图URL
                    const thumbnailUrl = getThumbnailFromItem(item);

                    videos.push({
                        videoId: item.videoId ?? '',
                        title: item.title ?? 'Untitled',
                        publishedAt: item.isoDate ?? '',
                        thumbnailUrl,
                        link: item.link ?? '',
                    });

                } catch (error) {
                    console.warn(`Failed to process RSS item:`, error);
                }
            }

            console.log(`Found ${videos.length} recent videos from RSS feed`);
            return videos;

        } catch (error) {
            lastError = error as Error;
            console.warn(`RSS feed parse attempt ${attempt} failed for ${rssUrl}:`, error);
            
            if (attempt < maxRetries) {
                console.log(`Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    // 所有重试都失败了
    console.error(`Failed to parse RSS feed ${rssUrl} after ${maxRetries} attempts:`, lastError);
    throw lastError || new Error('RSS feed parsing failed');
};

/**
 * 从YouTube视频URL提取视频ID
 */
const extractVideoIdFromUrl = (url: string): string | null => {
    const patterns = [
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
};

/**
 * 检查是否为YouTube Shorts
 */
const isYouTubeShorts = (item: any): boolean => {
    // 检查URL是否包含shorts路径
    if (item.link && item.link.includes('/shorts/')) {
        return true;
    }
    
    return false;
};

/**
 * 从RSS项目获取缩略图URL
 */
const getThumbnailFromItem = (item: any): string | undefined => {
    // 尝试从media:group获取缩略图
    if (item.mediaGroup) {
        for (const group of item.mediaGroup) {
            if (group['media:thumbnail']) {
                const thumbnails = Array.isArray(group['media:thumbnail']) 
                    ? group['media:thumbnail'] 
                    : [group['media:thumbnail']];
                
                for (const thumb of thumbnails) {
                    if (thumb.$ && thumb.$.url) {
                        return thumb.$.url;
                    }
                }
            }
        }
    }

    // 尝试从enclosure获取缩略图
    if (item.enclosure && item.enclosure.url) {
        return item.enclosure.url;
    }

    return undefined;
};

/**
 * 格式化时长（秒转换为HH:MM:SS格式）
 */
const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
};

/**
 * 获取频道信息（从RSS feed）
 */
export const getChannelInfoFromRSS = async (channelId: string): Promise<RSSChannelInfo | null> => {
    try {
        const rssUrl = getYouTubeRSSUrl(channelId);
        const parser = createRSSParser();
        const feed = await parser.parseURL(rssUrl);

        if (!feed) {
            return null;
        }

        return {
            channelId,
            channelName: feed.title || 'Unknown Channel',
            channelUrl: `https://www.youtube.com/channel/${channelId}`,
            thumbnailUrl: feed.image?.url,
            rssUrl
        };

    } catch (error) {
        console.error(`Failed to get channel info from RSS for ${channelId}:`, error);
        return null;
    }
};

/**
 * 批量获取多个频道的RSS视频
 */
export const getMultipleChannelsRSSVideos = async (
    channelIds: string[], 
    days: number = 7
): Promise<{ channelId: string; videos: RSSVideo[]; error?: string }[]> => {
    const results = [];
    const maxConcurrent = 3; // 限制并发数，避免过多请求

    // 分批处理，避免同时请求太多频道
    for (let i = 0; i < channelIds.length; i += maxConcurrent) {
        const batch = channelIds.slice(i, i + maxConcurrent);
        
        const batchPromises = batch.map(async (channelId) => {
            try {
                const rssUrl = getYouTubeRSSUrl(channelId);
                const videos = await parseRSSFeed(rssUrl, days);
                return { channelId, videos };
            } catch (error) {
                console.error(`Failed to get RSS videos for channel ${channelId}:`, error);
                return { 
                    channelId, 
                    videos: [], 
                    error: error instanceof Error ? error.message : 'Unknown error' 
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 批次间稍作延迟，避免过于频繁的请求
        if (i + maxConcurrent < channelIds.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
};

/**
 * 获取频道的增量RSS视频（只获取比上次处理更新的视频）
 */
export const getIncrementalRSSVideos = async (
    channelId: string,
    lastProcessedVideoId: string | null,
    days: number = 7
): Promise<{ videos: RSSVideo[]; error?: string }> => {
    try {
        const rssUrl = getYouTubeRSSUrl(channelId);
        const allVideos = await parseRSSFeed(rssUrl, days);
        
        // 如果没有记录上次处理的视频ID，返回所有视频
        if (!lastProcessedVideoId) {
            console.log(`No last processed video ID for channel ${channelId}, returning all ${allVideos.length} videos`);
            return { videos: allVideos };
        }
        
        // 找到上次处理的视频在列表中的位置
        const lastProcessedIndex = allVideos.findIndex(video => video.videoId === lastProcessedVideoId);
        
        if (lastProcessedIndex === -1) {
            // 如果找不到上次处理的视频，可能频道有新的视频，返回所有视频
            console.log(`Last processed video ${lastProcessedVideoId} not found in RSS feed for channel ${channelId}, returning all ${allVideos.length} videos`);
            return { videos: allVideos };
        }
        
        // 返回比上次处理更新的视频（在列表前面的视频）
        const newVideos = allVideos.slice(0, lastProcessedIndex);
        console.log(`Found ${newVideos.length} new videos for channel ${channelId} (last processed: ${lastProcessedVideoId})`);
        
        return { videos: newVideos };
        
    } catch (error) {
        console.error(`Failed to get incremental RSS videos for channel ${channelId}:`, error);
        return { 
            videos: [], 
            error: error instanceof Error ? error.message : 'Unknown error' 
        };
    }
};

/**
 * 批量获取多个频道的增量RSS视频
 */
export const getMultipleChannelsIncrementalRSSVideos = async (
    channelLastProcessedMap: Map<string, string | null>,
    days: number = 7
): Promise<{ channelId: string; videos: RSSVideo[]; error?: string }[]> => {
    const results = [];
    const maxConcurrent = 3; // 限制并发数，避免过多请求
    const channelEntries = Array.from(channelLastProcessedMap.entries());

    // 分批处理，避免同时请求太多频道
    for (let i = 0; i < channelEntries.length; i += maxConcurrent) {
        const batch = channelEntries.slice(i, i + maxConcurrent);
        
        const batchPromises = batch.map(async ([channelId, lastProcessedVideoId]) => {
            try {
                const result = await getIncrementalRSSVideos(channelId, lastProcessedVideoId, days);
                return { 
                    channelId, 
                    videos: result.videos, 
                    error: result.error 
                };
            } catch (error) {
                console.error(`Failed to get incremental RSS videos for channel ${channelId}:`, error);
                return { 
                    channelId, 
                    videos: [], 
                    error: error instanceof Error ? error.message : 'Unknown error' 
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 批次间稍作延迟，避免过于频繁的请求
        if (i + maxConcurrent < channelEntries.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
};
