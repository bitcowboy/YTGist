import { getTranscript } from '$lib/server/transcript.js';
import { formatTranscript } from '$lib/server/format-transcript';
import { getVideoData } from '$lib/server/videoData.js';
import { error } from '@sveltejs/kit';

export const GET = async ({ url }) => {
	const videoId = url.searchParams.get('v');

	if (!videoId || videoId.length !== 11) {
		return error(400, 'Bad YouTube video ID!');
	}

	try {
		const transcript = await getTranscript(videoId);
		
		if (!transcript || transcript.trim() === '') {
			return error(404, 'No transcript available for this video');
		}

		// Get video data to extract title
		const videoData = await getVideoData(videoId);
		
		// Format the transcript with AI
		const formatResult = await formatTranscript(transcript, videoData.title);
		
		// Use AI-generated filename with video ID suffix
		// Remove invalid filename characters but keep Chinese characters
		const cleanFilename = formatResult.filename.replace(/[<>:"/\\|?*]/g, ''); // Remove invalid filename characters
		const filename = `${cleanFilename}-${videoId}.md`;

		// Create ASCII-safe fallback filename for the basic filename parameter
		const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_');
		const encodedFilename = encodeURIComponent(filename);
		const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

		// Return the formatted transcript as a markdown file
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
