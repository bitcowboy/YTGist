import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import prompt from "$lib/server/prompt.md?raw";
import type { SummaryData, VideoMeta } from '$lib/types';
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

const responseSchema = {
	type: "object",
	required: ["keyTakeaway", "summary", "keyPoints", "coreTerms"],
	properties: {
		keyTakeaway: {
			type: "string",
		},
		summary: {
			type: "string",
		},
		keyPoints: {
			type: "array",
			items: {
				type: "string",
			},
		},
		coreTerms: {
			type: "array",
			items: {
				type: "string",
			},
		},
	},
	additionalProperties: false,
};

export const getSummary = async (videoData: VideoMeta) => {
	try {
		// 检查是否有字幕，如果没有字幕则抛出错误
		if (!videoData.hasSubtitles || !videoData.transcript || videoData.transcript.trim() === '') {
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		const data = {
			title: videoData.title,
			description: videoData.description,
			author: videoData.author,
			transcript: videoData.transcript
		};

		const response = await openai.chat.completions.create(
			createApiRequestOptions([
				{
					role: "system",
					content: prompt
				},
				{
					role: "user",
					content: JSON.stringify(data)
				}
			], responseSchema, {
				keyTakeaway: "无法生成关键要点",
				summary: "无法生成视频总结",
				keyPoints: ["无法生成关键点"],
				coreTerms: ["无法生成核心术语"]
			})
		);

		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from OpenRouter');
		}

		return parseJsonResponse(content, {
			keyTakeaway: "无法生成关键要点",
			summary: "无法生成视频总结",
			keyPoints: ["无法生成关键点"],
			coreTerms: ["无法生成核心术语"]
		}) as SummaryData;
	} catch (error) {
		console.error('Failed to generate summary:', error);
		throw new Error('Failed to generate summary.');
	}
};