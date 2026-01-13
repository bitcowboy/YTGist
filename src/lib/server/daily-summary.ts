import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import type { FullSummaryData } from '$lib/types.js';
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

const dailySummarySchema = {
	type: "object",
	required: ["overview", "themes", "keyInsights"],
	properties: {
		overview: {
			type: "string",
		},
		themes: {
			type: "array",
			items: {
				type: "object",
				required: ["theme", "videos", "summary"],
				properties: {
					theme: {
						type: "string",
					},
					videos: {
						type: "array",
						items: {
							type: "object",
							required: ["title", "keyTakeaway", "videoId"],
							properties: {
								title: {
									type: "string",
								},
								keyTakeaway: {
									type: "string",
								},
								videoId: {
									type: "string",
								},
							},
						},
					},
					summary: {
						type: "string",
					},
				},
			},
		},
		keyInsights: {
			type: "array",
			items: {
				type: "string",
			},
		},
	},
	additionalProperties: false,
};

export const generateDailySummary = async (summaries: FullSummaryData[]) => {
	try {
		if (!summaries || summaries.length === 0) {
			return {
				overview: "No videos were summarized today.",
				themes: [],
				keyInsights: []
			};
		}

		// Prepare data for AI analysis
		const videoData = summaries.map((summary: FullSummaryData) => ({
			title: summary.title,
			keyTakeaway: summary.keyTakeaway,
			summary: summary.summary,
			keyPoints: summary.keyPoints,
			author: summary.author,
			videoId: summary.videoId
		}));

		const prompt = `Analyze the following videos that were summarized today and create a comprehensive daily summary. Group related videos by theme and provide insights.

Videos:
${JSON.stringify(videoData, null, 2)}

Please analyze these videos and:
1. Create an overall overview of the day's content
2. Group related videos by theme/topic
3. For each theme, provide a summary and list the relevant videos
4. Extract key insights that connect across different videos

Focus on finding connections, patterns, and overarching themes across the videos. Output should be in Simplified Chinese.`;

		const response = await openai.chat.completions.create(
			createApiRequestOptions([
				{
					role: "system",
					content: "You are an AI assistant that analyzes video content and creates insightful daily summaries. Group related videos by theme and identify connections between different topics."
				},
				{
					role: "user",
					content: prompt
				}
			], dailySummarySchema, {
				overview: "今日无视频内容可总结",
				themes: [],
				keyInsights: []
			})
		);

		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from OpenRouter');
		}

		return parseJsonResponse(content, {
			overview: "今日无视频内容可总结",
			themes: [],
			keyInsights: []
		});
	} catch (error) {
		console.error('Failed to generate daily summary:', error);
		throw new Error('Failed to generate daily summary');
	}
};
