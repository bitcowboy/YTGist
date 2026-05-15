import type { VideoMeta, VideoPlatform } from "$lib/types";
import { PlatformFactory } from "./platforms/platform-factory";

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
