import { json, error } from '@sveltejs/kit';
import type { ChatRequest, ChatResponse } from '$lib/types.js';
import { validateNonce } from '$lib/server/nonce.js';
import { generateChatResponse, generateChatResponseStream } from '$lib/server/chat.js';

export const POST = async ({ request, url }: { request: Request; url: URL }) => {
	const nonce = url.searchParams.get('nonce');
	const stream = url.searchParams.get('stream') === 'true';

	if (!nonce || !validateNonce(nonce)) {
		return error(401, 'Invalid or expired nonce!');
	}

	try {
		const body: ChatRequest = await request.json();
		const { message, videoId, videoTitle, summaryData, conversationHistory } = body;

		if (!message || !videoId || videoId.trim() === '' || !videoTitle || !summaryData) {
			return error(400, 'Missing required fields');
		}

		// 如果请求流式响应
		if (stream) {
			const streamResponse = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					
					const safeEnqueue = (data: string) => {
						try {
							controller.enqueue(encoder.encode(data));
						} catch (e) {
							console.warn('Failed to enqueue stream data:', e);
						}
					};

					const send = (event: string, data: any) => {
						safeEnqueue(`event: ${event}\n`);
						safeEnqueue(`data: ${JSON.stringify(data)}\n\n`);
					};

					// 使用流式生成
					generateChatResponseStream(
						message,
						videoId,
						videoTitle,
						summaryData,
						conversationHistory,
						{
							onDelta: (delta) => {
								send('chat-delta', { delta });
							},
							onComplete: (fullResponse) => {
								send('chat-complete', { response: fullResponse });
								controller.close();
							},
							onError: (error) => {
								send('error', { error });
								controller.close();
							}
						}
					).catch((error) => {
						console.error('Streaming chat error:', error);
						send('error', { error: 'Streaming failed' });
						controller.close();
					});
				}
			});

			return new Response(streamResponse as any, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': 'Cache-Control'
				}
			});
		}

		// 非流式响应（原有逻辑）
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
