<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchWithNonce } from '$lib/client/nonce';
	import type { ChatMessage } from '$lib/types';
	import Divider from '$lib/components/shared/divider.svelte';

	interface Props {
		videoId: string;
		videoTitle: string;
		summaryData: any;
	}

	const { videoId, videoTitle, summaryData }: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let currentMessage = $state('');
	let isLoading = $state(false);
	let chatContainer: HTMLDivElement;

	// 初始化欢迎消息
	onMount(() => {
		messages = [
			{
				id: '1',
				role: 'assistant',
				content: `你好！我是AI助手，可以帮你分析这个视频"${videoTitle}"。你可以问我关于视频内容的问题，比如：\n\n• 视频的主要观点是什么？\n• 能详细解释某个概念吗？\n• 视频中提到了哪些重要信息？\n\n请随时提问！`,
				timestamp: new Date()
			}
		];
	});

	async function sendMessage() {
		if (!currentMessage.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: currentMessage.trim(),
			timestamp: new Date()
		};

		messages = [...messages, userMessage];
		const messageToSend = currentMessage.trim();
		currentMessage = '';
		isLoading = true;

		try {
			const response = await fetchWithNonce('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					message: messageToSend,
					videoId,
					videoTitle,
					summaryData,
					conversationHistory: messages.slice(0, -1) // 排除刚添加的用户消息
				})
			});

			if (!response.ok) {
				throw new Error('Failed to get AI response');
			}

			const data = await response.json();
			
			const assistantMessage: ChatMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				content: data.response,
				timestamp: new Date()
			};

			messages = [...messages, assistantMessage];
		} catch (error) {
			console.error('Chat error:', error);
			const errorMessage: ChatMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				content: '抱歉，我暂时无法回复。请稍后再试。',
				timestamp: new Date()
			};
			messages = [...messages, errorMessage];
		} finally {
			isLoading = false;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	// 自动滚动到底部
	$effect(() => {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	});
</script>

<div class="bg-white rounded-lg border border-gray-200 shadow-sm">
	<div class="p-4 border-b border-gray-200">
		<h3 class="text-lg font-semibold text-gray-900">AI 聊天助手</h3>
		<p class="text-sm text-gray-600">基于视频内容进行智能对话</p>
	</div>

	<!-- 聊天消息区域 -->
	<div 
		bind:this={chatContainer}
		class="h-96 overflow-y-auto p-4 space-y-4"
	>
		{#each messages as message (message.id)}
			<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="max-w-xs lg:max-w-md">
					<div class="flex {message.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start space-x-2">
						<!-- 头像 -->
						<div class="flex-shrink-0 w-8 h-8 rounded-full {message.role === 'user' ? 'bg-blue-500' : 'bg-gray-500'} flex items-center justify-center">
							{#if message.role === 'user'}
								<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
								</svg>
							{:else}
								<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
									<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
							{/if}
						</div>
						
						<!-- 消息气泡 -->
						<div class="px-4 py-2 rounded-lg {message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'}">
							<p class="text-sm whitespace-pre-wrap">{message.content}</p>
							<p class="text-xs mt-1 opacity-70">
								{message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
							</p>
						</div>
					</div>
				</div>
			</div>
		{/each}

		<!-- 加载指示器 -->
		{#if isLoading}
			<div class="flex justify-start">
				<div class="max-w-xs lg:max-w-md">
					<div class="flex items-start space-x-2">
						<div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center">
							<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
								<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
						</div>
						<div class="px-4 py-2 rounded-lg bg-gray-100">
							<div class="flex space-x-1">
								<div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
								<div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
								<div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- 输入区域 -->
	<div class="p-4 border-t border-gray-200">
		<div class="flex space-x-2">
			<textarea
				bind:value={currentMessage}
				onkeypress={handleKeyPress}
				placeholder="输入你的问题..."
				disabled={isLoading}
				class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
				rows="2"
			></textarea>
			<button
				onclick={sendMessage}
				disabled={!currentMessage.trim() || isLoading}
				class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
			>
				{#if isLoading}
					<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
				{:else}
					发送
				{/if}
			</button>
		</div>
	</div>
</div>
