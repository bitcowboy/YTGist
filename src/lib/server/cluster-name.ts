import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import * as undici from 'undici';

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

/**
 * Generate cluster name based on video titles using LLM
 * @param videoTitles Array of video titles in the cluster
 * @returns Generated cluster name
 */
export const generateClusterName = async (videoTitles: string[]): Promise<string> => {
	if (!videoTitles || videoTitles.length === 0) {
		return '未命名聚类';
	}

	try {
		const titlesList = videoTitles.map((title, index) => `${index + 1}. ${title}`).join('\n');
		
		const prompt = `你是一个专业的视频分类助手。请根据以下视频标题，生成一个简洁、准确的聚类名称。

要求：
1. 名称应该概括这些视频的共同主题或内容
2. 名称应该简洁（不超过20个字符）
3. 使用中文
4. 只返回名称，不要添加任何解释或前缀

视频标题列表：
${titlesList}

聚类名称：`;

		const response = await openai.chat.completions.create({
			model: OPENROUTER_MODEL,
			messages: [
				{ role: 'system', content: '你是一个专业的视频分类助手，擅长根据视频标题生成简洁准确的聚类名称。' },
				{ role: 'user', content: prompt }
			],
			temperature: 0.7,
			max_tokens: 50
		});

		const generatedName = response.choices[0]?.message?.content?.trim();
		
		if (!generatedName) {
			throw new Error('No content received from LLM');
		}

		// Clean up the response (remove quotes, extra whitespace, etc.)
		const cleanedName = generatedName
			.replace(/^["']|["']$/g, '') // Remove surrounding quotes
			.replace(/^聚类名称[：:]\s*/i, '') // Remove "聚类名称：" prefix
			.trim();

		return cleanedName || '未命名聚类';
	} catch (error) {
		console.error('Failed to generate cluster name:', error);
		// Fallback to a default name based on video count
		return `聚类（${videoTitles.length}个视频）`;
	}
};

