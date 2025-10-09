import { getVideoDataWithoutTranscript } from '$lib/server/videoData.js';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ url }) => {
	const videoId = url.searchParams.get('v');

	if (!videoId || videoId.length !== 11) {
		return error(400, 'Bad YouTube video ID!');
	}

	try {
		const videoData = await getVideoDataWithoutTranscript(videoId);
		return json(videoData);
	} catch (e) {
		console.error('Failed to get video data:', e);
		return error(500, 'Failed to get video data. Please try again later.');
	}
};
