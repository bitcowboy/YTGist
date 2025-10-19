import { json, error } from '@sveltejs/kit';
import type { ChatRequest, ChatResponse } from '$lib/types.js';
import { validateNonce } from '$lib/server/nonce.js';
import { generateChatResponse } from '$lib/server/chat.js';

export const POST = async ({ request, url }: { request: Request; url: URL }) => {
	const nonce = url.searchParams.get('nonce');

	if (!nonce || !validateNonce(nonce)) {
		return error(401, 'Invalid or expired nonce!');
	}

	try {
		const body: ChatRequest = await request.json();
		const { message, videoId, videoTitle, summaryData, conversationHistory } = body;

		if (!message || !videoId || videoId.trim() === '' || !videoTitle || !summaryData) {
			return error(400, 'Missing required fields');
		}

		// 使用OpenAI生成真实的AI回复，包含对话历史
		const aiResponse = await generateChatResponse(message, videoId, videoTitle, summaryData, conversationHistory);

		const response: ChatResponse = {
			response: aiResponse
		};

		return json(response);
	} catch (e) {
		console.error('Chat API error:', e);
		return error(500, 'Internal server error');
	}
};
