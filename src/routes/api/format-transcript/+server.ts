import { getTranscript } from '$lib/server/transcript.js';
import { getTranscriptByVideoId } from '$lib/server/database.js';
import { formatTranscript } from '$lib/server/format-transcript';
import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { getSummary } from '$lib/server/database.js';
import { PlatformFactory } from '$lib/server/platforms/platform-factory';
import type { VideoPlatform } from '$lib/types';
import { error } from '@sveltejs/kit';

export const GET = async ({ url }) => {
	const videoId = url.searchParams.get('v');
	const platformParam = url.searchParams.get('platform') as VideoPlatform | null;

	if (!videoId) {
		return error(400, 'Video ID is required');
	}

	// 如果没有指定平台，尝试从视频ID识别平台
	let platform: VideoPlatform = platformParam || 'youtube';
	if (!platformParam) {
		const identifiedPlatform = PlatformFactory.identifyPlatformByVideoId(videoId);
		if (identifiedPlatform) {
			platform = identifiedPlatform;
		}
	}

	// 验证视频ID格式
	const platformInstance = PlatformFactory.getPlatform(platform);
	if (!platformInstance) {
		return error(400, `Unsupported platform: ${platform}`);
	}

	if (!platformInstance.validateVideoId(videoId)) {
		return error(400, `Invalid video ID format for platform ${platform}`);
	}

	try {
		// Prefer transcript from database; fallback to fetching
		let transcript = await getTranscriptByVideoId(videoId);
		if (transcript) {
			console.log('[api/format-transcript] using transcript from DB for', videoId, `(length=${transcript.length})`);
		}
		if (!transcript) {
			console.log(`[api/format-transcript] DB miss, fetching from ${platform} for`, videoId);
			transcript = await platformInstance.getTranscript(videoId);
			console.log(`[api/format-transcript] fetched from ${platform} for`, videoId, `(length=${transcript.length})`);
		}
		
		if (!transcript || transcript.trim() === '') {
			return error(404, 'No transcript available for this video');
		}

		// Prefer title from DB summary; fallback to lightweight metadata
		const existing = await getSummary(videoId, platform);
		const title = existing?.title && existing.title.trim() !== ''
			? existing.title
			: (await getVideoDataWithoutTranscript(videoId, platform)).title;
		
		// Format the transcript with AI
		const formatResult = await formatTranscript(transcript, title);
		
		// Use AI-generated filename with video ID suffix
		// Remove invalid filename characters but keep Chinese characters
		const cleanFilename = formatResult.filename.replace(/[<>:"/\\|?*]/g, ''); // Remove invalid filename characters
		const filename = `${cleanFilename}-${videoId}.md`;

		// Create ASCII-safe fallback filename for the basic filename parameter
		const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_');
		const encodedFilename = encodeURIComponent(filename);
		const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

		// Return the formatted transcript as a markdown file
		console.log('[api/format-transcript] returning formatted transcript for', videoId, `(length=${formatResult.content.length})`);
		return new Response(formatResult.content, {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'Content-Disposition': contentDisposition
			}
		});
	} catch (e) {
		console.error('Failed to format transcript:', e);
		return error(500, 'Failed to format transcript. Please try again later.');
	}
};
