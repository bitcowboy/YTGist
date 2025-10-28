import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import type { Comment } from './comments.js';
import * as undici from 'undici';
import { createApiRequestOptions, parseJsonResponse } from './ai-compatibility.js';

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

const commentsSummarySchema = {
	type: "object",
	required: ["commentsSummary", "commentsKeyPoints"],
	properties: {
		commentsSummary: {
			type: "string",
		},
		commentsKeyPoints: {
			type: "array",
			items: {
				type: "string",
			},
		},
	},
	additionalProperties: false,
};

export interface CommentsSummaryData {
	commentsSummary: string;
	commentsKeyPoints: string[];
}

export const generateCommentsSummary = async (comments: Comment[], videoTitle: string): Promise<CommentsSummaryData> => {
	try {
		if (!comments || comments.length === 0) {
			return {
				commentsSummary: "暂无观众评论数据。",
				commentsKeyPoints: []
			};
		}

		// 准备评论数据，限制长度以避免token过多
		const commentsText = comments
			.slice(0, 30) // 限制最多30条评论
			.map(comment => `作者: ${comment.author}\n内容: ${comment.text}\n点赞数: ${comment.likeCount}`)
			.join('\n\n');

		const prompt = `你是一个专业的视频评论分析助手。请分析以下YouTube视频的观众评论，生成简洁的评论总结。

视频标题: ${videoTitle}

观众评论:
${commentsText}

请分析这些评论并生成：
1. 一个简洁的评论总结，概括观众的主要观点和情感
2. 3-5个关键要点，突出观众最关心的话题

要求：
- 使用简体中文
- 总结要客观，反映观众的真实观点
- 关键要点要具体，避免泛泛而谈
- 如果评论较少或内容重复，请如实说明
- 重点关注高点赞数的评论

请以JSON格式返回结果。`;

		const response = await openai.chat.completions.create(
			createApiRequestOptions([
				{
					role: "system",
					content: "你是一个专业的视频评论分析助手，擅长从观众评论中提取关键信息和观点。"
				},
				{
					role: "user",
					content: prompt
				}
			], commentsSummarySchema, {
				commentsSummary: "评论分析暂时不可用。",
				commentsKeyPoints: []
			})
		);

		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from OpenRouter');
		}

		return parseJsonResponse(content, {
			commentsSummary: "评论分析暂时不可用。",
			commentsKeyPoints: []
		}) as CommentsSummaryData;
	} catch (error) {
		console.error('Failed to generate comments summary:', error);
		return {
			commentsSummary: "评论分析暂时不可用。",
			commentsKeyPoints: []
		};
	}
};
