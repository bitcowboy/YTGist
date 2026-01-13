import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import * as undici from 'undici';
import { createApiRequestOptions, parseJsonResponse } from './ai-compatibility.js';
import { getFullSummary, getCollections, getOrCreateDefaultCollection } from './database.js';
import type { FullSummaryData, Collection } from '$lib/types.js';

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

const classificationSchema = {
	type: "object",
	required: ["collectionIds"],
	properties: {
		collectionIds: {
			type: "array",
			items: {
				type: "string",
			},
			description: "Array of collection IDs that this video belongs to. Can be empty if no good match found."
		},
	},
	additionalProperties: false,
};

const systemPrompt = `你是一个智能视频分类助手。你的任务是根据视频的内容、标题和关键信息，将其归类到最合适的分类中。

规则：
1. 仔细分析视频的内容和主题
2. 从提供的分类列表中选择最匹配的一个或多个分类
3. 一个视频可以属于多个分类（如果内容确实跨越多个主题）
4. 如果视频内容与任何现有分类都不匹配，返回空数组（空数组表示无法分类，系统会将视频放入"未分类"分类）
5. 只返回分类的ID，不要返回分类名称

请基于视频的实际内容进行分类，而不是仅仅基于标题。`;

/**
 * Classify a video into appropriate collections using AI
 * @param videoId The video ID to classify
 * @returns Array of collection IDs that the video belongs to, or empty array if no match
 */
export async function classifyVideo(videoId: string): Promise<string[]> {
	try {
		// Get video summary data (using full summary from split tables)
		const summaryData = await getFullSummary(videoId);
		if (!summaryData) {
			console.warn(`No summary found for video ${videoId}, using default collection`);
			const defaultCollection = await getOrCreateDefaultCollection();
			return [defaultCollection.$id];
		}

		// Get all existing collections
		const collections = await getCollections();
		if (collections.length === 0) {
			// No collections exist, create default and return it
			const defaultCollection = await getOrCreateDefaultCollection();
			return [defaultCollection.$id];
		}

		// Build user prompt with video info and collections
		const videoInfo = {
			title: summaryData.title,
			keyTakeaway: summaryData.keyTakeaway,
			summary: summaryData.summary,
			keyPoints: summaryData.keyPoints || [],
			description: summaryData.description
		};

		const collectionsList = collections.map(c => ({
			id: c.$id,
			name: c.name,
			description: c.description || ''
		}));

		const userPrompt = `请分析以下视频信息，并将其分类到最合适的分类中：

视频信息：
${JSON.stringify(videoInfo, null, 2)}

可用分类列表：
${JSON.stringify(collectionsList, null, 2)}

请返回该视频应该归属的分类ID数组。如果视频与任何分类都不匹配，返回空数组。`;

		const response = await openai.chat.completions.create(
			createApiRequestOptions([
				{
					role: "system",
					content: systemPrompt
				},
				{
					role: "user",
					content: userPrompt
				}
			], classificationSchema, {
				collectionIds: []
			})
		);

		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from AI');
		}

		const result = parseJsonResponse(content, { collectionIds: [] });
		const collectionIds: string[] = result.collectionIds || [];

		// Validate collection IDs exist
		const validCollectionIds: string[] = [];
		for (const id of collectionIds) {
			const exists = collections.some(c => c.$id === id);
			if (exists) {
				validCollectionIds.push(id);
			} else {
				console.warn(`Collection ID ${id} does not exist, skipping`);
			}
		}

		// If no valid collections found or empty array, use default collection
		if (validCollectionIds.length === 0) {
			console.log(`No valid collections found for video ${videoId}, using default collection`);
			const defaultCollection = await getOrCreateDefaultCollection();
			return [defaultCollection.$id];
		}

		return validCollectionIds;
	} catch (error) {
		console.error('Failed to classify video:', error);
		// On error, fall back to default collection
		try {
			const defaultCollection = await getOrCreateDefaultCollection();
			return [defaultCollection.$id];
		} catch (fallbackError) {
			console.error('Failed to get default collection:', fallbackError);
			return [];
		}
	}
}

