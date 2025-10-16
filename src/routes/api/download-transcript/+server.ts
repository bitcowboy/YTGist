import { getTranscript } from '$lib/server/transcript.js';
import { getTranscriptByVideoId } from '$lib/server/database.js';
import { formatTranscript } from '$lib/server/format-transcript';
import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { getSummary } from '$lib/server/database.js';
import { error } from '@sveltejs/kit';

export const GET = async ({ url }) => {
	const videoId = url.searchParams.get('v');
	const format = url.searchParams.get('format'); // 'formatted' or 'raw'

	if (!videoId || videoId.length !== 11) {
		return error(400, 'Bad YouTube video ID!');
	}

    try {
		// Prefer transcript from database; fallback to fetching
		let transcript = await getTranscriptByVideoId(videoId);
		if (transcript) {
			console.log('[api/download-transcript] using transcript from DB for', videoId, `(length=${transcript.length})`);
		}
        if (!transcript) {
			console.log('[api/download-transcript] DB miss, fetching from YouTube for', videoId);
            transcript = await getTranscript(videoId);
			console.log('[api/download-transcript] fetched from YouTube for', videoId, `(length=${transcript.length})`);
        }
		
		if (!transcript || transcript.trim() === '') {
			return error(404, 'No transcript available for this video');
		}

		let finalTranscript = transcript;
		let filename = `transcript-${videoId}.txt`;

		// If format=formatted is requested, use AI to format the transcript
		if (format === 'formatted') {
			try {
				// Prefer title from DB summary
				const existing = await getSummary(videoId);
				const title = existing?.title && existing.title.trim() !== ''
					? existing.title
					: (await getVideoDataWithoutTranscript(videoId)).title;
				const formatResult = await formatTranscript(transcript, title);
				finalTranscript = formatResult.content;
				// Use AI-generated filename with video ID suffix
				// Remove invalid filename characters but keep Chinese characters
				const cleanFilename = formatResult.filename.replace(/[<>:"/\\|?*]/g, ''); // Remove invalid filename characters
				filename = `${cleanFilename}-${videoId}.md`;
			} catch (formatError) {
				console.warn('Failed to format transcript, returning raw transcript:', formatError);
				// Continue with raw transcript if formatting fails
			}
		}

		// Return the transcript as a text file
		const contentType = format === 'formatted' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8';
		
		// Create ASCII-safe fallback filename for the basic filename parameter
		const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_');
		const encodedFilename = encodeURIComponent(filename);
		const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
		
		console.log('[api/download-transcript] returning', format === 'formatted' ? 'formatted' : 'raw', 'transcript for', videoId, `(length=${finalTranscript.length})`);
		return new Response(finalTranscript, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': contentDisposition
			}
		});
	} catch (e) {
		console.error('Failed to get transcript:', e);
		
		// Check if it's a no subtitles error
		if (e instanceof Error && e.message === 'NO_SUBTITLES_AVAILABLE') {
			return error(404, 'This video does not have subtitles or closed captions available.');
		}
		
		return error(500, 'Failed to get transcript. Please try again later.');
	}
};
