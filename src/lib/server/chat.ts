import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import type { SummaryData, ChatMessage } from '$lib/types';
import * as undici from 'undici';
import { getTranscriptByVideoId } from './database.js';

// Only create proxy agent if PROXY_URI is available
const proxyAgent = PROXY_URI ? new undici.ProxyAgent(PROXY_URI) : null;

const openai = new OpenAI({
	baseURL: OPENROUTER_BASE_URL,
	apiKey: OPENROUTER_API_KEY,
	defaultHeaders: {
		'HTTP-Referer': 'https://gisttube.com',
		'X-Title': 'gisttube',
	},
	fetchOptions: {
		dispatcher: proxyAgent ? proxyAgent : undefined,
	},
});

const chatSystemPrompt = `你是一个专业的视频内容分析助手。你的任务是基于用户提供的视频信息，回答用户关于视频内容的问题。

## 你的能力
- 分析视频标题、描述、总结和关键点
- 基于原始字幕内容进行深入分析
- 回答关于视频内容的具体问题
- 提供深入的解释和分析
- 提取视频中的重要信息
- 引用视频中的具体内容

## 可用信息
你将获得以下信息：
1. **视频基本信息**: 标题、作者、描述
2. **AI生成的总结**: 视频总结、关键要点、关键点列表、核心术语
3. **原始字幕内容**: 视频的完整字幕文本（如果可用）

## 回答原则
1. **基于视频内容**: 只回答与视频内容相关的问题
2. **准确可靠**: 基于提供的视频信息进行回答，不要编造信息
3. **引用原文**: 可以引用原始字幕中的具体内容来支持你的回答
4. **简洁明了**: 回答要清晰、有条理
5. **中文回答**: 使用简体中文回答
6. **诚实**: 如果视频中没有相关信息，请诚实说明

## 回答格式
- 使用自然的中文表达
- 可以适当使用**粗体**强调重要内容
- 如果涉及多个要点，使用列表形式
- 可以引用视频中的具体内容
- 保持友好和专业的语调`;

export const generateChatResponse = async (
	userMessage: string,
	videoId: string,
	videoTitle: string,
	summaryData: SummaryData,
	conversationHistory?: ChatMessage[]
): Promise<string> => {
	try {
		// 从数据库获取原始字幕
		const transcript = await getTranscriptByVideoId(videoId);
		
		// 构建视频上下文信息
		const videoContext = `
视频标题: ${videoTitle}
视频ID: ${videoId}
视频作者: ${summaryData.author}
视频描述: ${summaryData.description}

视频总结:
${summaryData.summary}

关键要点:
${summaryData.keyTakeaway}

关键点列表:
${summaryData.keyPoints?.join('\n') || '无'}

核心术语:
${summaryData.coreTerms?.join(', ') || '无'}

${transcript ? `原始字幕内容:
${transcript}` : '注意: 该视频没有可用的字幕内容'}
		`.trim();

		// 构建消息数组，包含对话历史
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: chatSystemPrompt
			}
		];

		// 如果有对话历史，添加到消息数组中
		if (conversationHistory && conversationHistory.length > 0) {
			// 添加对话历史（限制最近10轮对话以避免token过多）
			const recentHistory = conversationHistory.slice(-10);
			for (const msg of recentHistory) {
				messages.push({
					role: msg.role as "user" | "assistant",
					content: msg.content
				});
			}
		}

		// 添加当前用户消息
		messages.push({
			role: "user",
			content: `基于以下视频信息，请回答用户的问题：

视频信息:
${videoContext}

用户问题: ${userMessage}

请基于视频内容回答用户的问题。如果问题与视频内容无关，请礼貌地说明你只能回答关于这个视频的问题。`
		});

		const response = await openai.chat.completions.create({
			model: OPENROUTER_MODEL,
			messages,
		});

		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from AI');
		}

		return content;
	} catch (error) {
		console.error('Failed to generate chat response:', error);
		throw new Error('Failed to generate AI response.');
	}
};
