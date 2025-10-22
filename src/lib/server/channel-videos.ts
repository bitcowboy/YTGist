import { Innertube, Platform, UniversalCache } from "youtubei.js";
import { ProxyAgent } from 'undici';
import { PROXY_URI } from "$env/static/private";

export interface ChannelVideo {
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailUrl?: string;
    duration?: string;
}

export const getChannelVideos = async (channelId: string, days: number = 7): Promise<ChannelVideo[]> => {
    try {
        console.log(`Fetching videos for channel ${channelId} from last ${days} days`);
        
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
        
        // Get channel info
        const channel = await innertube.getChannel(channelId);
        if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
        }

        // Get channel videos
        const videos = await channel.getVideos();
        if (!videos || !videos.videos) {
            console.log(`No videos found for channel ${channelId}`);
            return [];
        }

        // Calculate date threshold
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - days);

        const collected: ChannelVideo[] = [];

        for (const video of videos.videos) {
            try {
                const basicInfo = await innertube.getInfo(video.id);
                const date = new Date(basicInfo.primary_info?.published?.text + " 00:00:00 UTC" || '');
                let iso = date.toISOString();

                // Include the video even if we can't get exact published date
                // We'll use relative ordering from the channel feed
                collected.push({
                    videoId: video.id,
                    title: video.title?.text || 'Untitled',
                    publishedAt: iso || new Date().toISOString(), // Use current time as fallback
                    thumbnailUrl: video.thumbnails?.[0]?.url,
                    duration: video.duration?.text
                });
            } catch (error) {
                console.warn(`Failed to process video ${video?.id}:`, error);
            }
        }

        // Sort by publishedAt desc and cap to 10 to avoid over-collecting when dates are unknown
        collected.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        const recentVideos = collected.slice(0, 10);

        console.log(`Found ${recentVideos.length} recent videos for channel ${channelId}`);
        return recentVideos;
        
    } catch (error) {
        console.error(`Failed to get videos for channel ${channelId}:`, error);
        throw error;
    }
};

export const getChannelInfo = async (channelId: string) => {
    try {
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
        const channel = await innertube.getChannel(channelId);
        
        if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
        }

        return {
            channelId,
            channelName: channel.header?.title?.text || 'Unknown Channel',
            channelUrl: `https://www.youtube.com/channel/${channelId}`,
            thumbnailUrl: channel.header?.avatar?.thumbnails?.[0]?.url
        };
    } catch (error) {
        console.error(`Failed to get channel info for ${channelId}:`, error);
        throw error;
    }
};
