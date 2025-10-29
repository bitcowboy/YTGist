import type { ChatRequest } from '$lib/types.js';
import { fetchNonce } from '$lib/client/nonce.js';

export interface ChatStreamCallbacks {
	onDelta?: (delta: string) => void;
	onComplete?: (fullResponse: string) => void;
	onError?: (error: string) => void;
}

/**
 * 打开流式聊天连接
 * @param request 聊天请求数据
 * @param callbacks 事件回调函数
 * @returns AbortController实例，用于取消请求
 */
export async function openChatStream(
	request: ChatRequest,
	callbacks: ChatStreamCallbacks = {}
): Promise<AbortController> {
	const nonce = await fetchNonce();
	const url = new URL('/api/chat', window.location.origin);
	url.searchParams.set('nonce', nonce);
	url.searchParams.set('stream', 'true');

	const abortController = new AbortController();

	try {
		const response = await fetch(url.toString(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
			signal: abortController.signal
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		if (!response.body) {
			throw new Error('No response body');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				
				// 处理SSE格式的数据
				const lines = buffer.split('\n');
				buffer = lines.pop() || ''; // 保留最后一个不完整的行

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (line.trim() === '') continue;
					
					if (line.startsWith('event: ')) {
						const eventType = line.slice(7);
						
						// 查找下一个data行
						for (let j = i + 1; j < lines.length; j++) {
							const dataLine = lines[j];
							if (dataLine.startsWith('data: ')) {
								const data = dataLine.slice(6);
								
								try {
									const parsedData = JSON.parse(data);
									
									switch (eventType) {
										case 'chat-delta':
											callbacks.onDelta?.(parsedData.delta);
											break;
										case 'chat-complete':
											callbacks.onComplete?.(parsedData.response);
											return abortController;
										case 'error':
											callbacks.onError?.(parsedData.error);
											return abortController;
									}
								} catch (parseError) {
									console.error('Failed to parse SSE data:', parseError);
								}
								break;
							}
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			console.log('Chat stream aborted');
		} else {
			console.error('Chat stream error:', error);
			callbacks.onError?.((error as Error)?.message || 'Connection error occurred');
		}
	}

	return abortController;
}

/**
 * 发送流式聊天消息的便捷函数
 * @param message 用户消息
 * @param videoId 视频ID
 * @param videoTitle 视频标题
 * @param summaryData 视频总结数据
 * @param conversationHistory 对话历史
 * @param callbacks 事件回调函数
 * @returns AbortController实例，用于取消请求
 */
export async function sendStreamingChatMessage(
	message: string,
	videoId: string,
	videoTitle: string,
	summaryData: any,
	conversationHistory?: any[],
	callbacks: ChatStreamCallbacks = {}
): Promise<AbortController> {
	const request: ChatRequest = {
		message,
		videoId,
		videoTitle,
		summaryData,
		conversationHistory
	};

	return await openChatStream(request, callbacks);
}
