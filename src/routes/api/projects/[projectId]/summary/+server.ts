import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getProject, getProjectVideos, getTranscriptByVideoId, getProjectSummary, createProjectSummary, updateProjectSummary, checkSummaryCacheValidity } from '$lib/server/database.js';
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

const multiDocumentAnalysisPrompt = `你是一个多文档整合分析专家，擅长从多个来源的文档中抽取信息、发现联系、对比差异，并在逻辑一致的框架下生成新的分析文档。
你的任务是综合用户提供的所有文档内容，基于用户的指令生成新的成果。
在整合时：
- 保持信息的真实性与可追溯性。
- 避免直接复制，而是进行结构化的归纳、总结与推理。
- 当多个来源信息冲突时，应明确指出冲突点并提供分析。
- 明确标注每个信息片段的来源。
- 保持学术性与条理性，但根据任务可切换为更自然、叙述性风格。
- 不臆造原文未出现的信息，但可以进行基于文档内容的合理推论。

在保持学术性的前提下，使用轻松有趣幽默的语言风格，避免死板老套的论调。使用markdown格式输出。

文档需要包含完整的结构：
- 标题
- 摘要
- 正文`;

const responseSchema = {
	type: "object",
	required: ["title", "abstract", "body"],
	properties: {
		title: {
			type: "string",
		},
		abstract: {
			type: "string",
		},
		body: {
			type: "string",
		},
	},
	additionalProperties: false,
};

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { projectId } = params;
		
		if (!projectId) {
			return error(400, 'Project ID is required');
		}
		
		// Check if project exists
		const project = await getProject(projectId);
		if (!project) {
			return error(404, 'Project not found');
		}
		
		// Get cached summary
		const cachedSummary = await getProjectSummary(projectId);
		if (!cachedSummary) {
			return json({
				success: true,
				summary: null,
				cached: false,
				message: 'No cached summary found'
			});
		}
		
		// Get current video list to check cache validity
		const projectVideos = await getProjectVideos(projectId);
		const currentVideoIds = projectVideos.map(v => v.videoId);
		const isCacheValid = await checkSummaryCacheValidity(projectId, currentVideoIds);
		
		return json({
			success: true,
			summary: {
				title: cachedSummary.title,
				abstract: cachedSummary.abstract,
				body: cachedSummary.body
			},
			cached: true,
			generatedAt: cachedSummary.generatedAt,
			isStale: cachedSummary.isStale || !isCacheValid,
			videoCount: currentVideoIds.length
		});
		
	} catch (err) {
		console.error('Failed to get cached project summary:', err);
		return error(500, 'Failed to get cached project summary');
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { projectId } = params;
		const { forceRegenerate = false } = await request.json().catch(() => ({}));
		
		if (!projectId) {
			return error(400, 'Project ID is required');
		}
		
		// Check if project exists
		const project = await getProject(projectId);
		if (!project) {
			return error(404, 'Project not found');
		}
		
		// Get project videos
		const projectVideos = await getProjectVideos(projectId);
		if (projectVideos.length === 0) {
			return error(400, 'No videos in this project');
		}
		
		// Check if we should use cached summary
		if (!forceRegenerate) {
			const currentVideoIds = projectVideos.map(v => v.videoId);
			const isCacheValid = await checkSummaryCacheValidity(projectId, currentVideoIds);
			
			if (isCacheValid) {
				const cachedSummary = await getProjectSummary(projectId);
				if (cachedSummary) {
					return json({
						success: true,
						summary: {
							title: cachedSummary.title,
							abstract: cachedSummary.abstract,
							body: cachedSummary.body
						},
						cached: true,
						generatedAt: cachedSummary.generatedAt,
						isStale: false,
						videoCount: currentVideoIds.length
					});
				}
			}
		}
		
		// Fetch transcripts for all videos
		const videoData = [];
		for (const projectVideo of projectVideos) {
			try {
				const transcript = await getTranscriptByVideoId(projectVideo.videoId);
				if (transcript && transcript.trim() !== '') {
					videoData.push({
						videoId: projectVideo.videoId,
						title: `Video ${projectVideo.videoId}`, // We'll get actual title from summary data if available
						transcript: transcript
					});
				}
			} catch (error) {
				console.error(`Failed to fetch transcript for video ${projectVideo.videoId}:`, error);
				// Continue with other videos even if one fails
			}
		}
		
		if (videoData.length === 0) {
			return error(400, 'No transcripts available for any videos in this project');
		}
		
		// Prepare data for AI analysis
		const documentsData = videoData.map(video => ({
			title: video.title,
			videoId: video.videoId,
			content: video.transcript
		}));
		
		const prompt = `请分析以下视频的字幕内容，生成一个综合性的分析报告：

视频数据：
${JSON.stringify(documentsData, null, 2)}

请基于这些视频的字幕内容，生成一个结构化的分析报告，包含标题、摘要、正文和参考资料。`;
		
		const response = await openai.chat.completions.create({
			model: OPENROUTER_MODEL,
			messages: [
				{
					role: "system",
					content: multiDocumentAnalysisPrompt
				},
				{
					role: "user",
					content: prompt
				}
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "project_summary",
					schema: responseSchema
				}
			},
		});
		
		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from AI');
		}
		
		const summaryData = JSON.parse(content);
		
		// Save to cache
		const currentVideoIds = projectVideos.map(v => v.videoId);
		const videoIdsString = currentVideoIds.join(',');
		
		try {
			// Check if summary already exists
			const existingSummary = await getProjectSummary(projectId);
			if (existingSummary) {
				// Update existing summary
				await updateProjectSummary(projectId, {
					title: summaryData.title,
					abstract: summaryData.abstract,
					body: summaryData.body,
					videoIds: videoIdsString,
					isStale: false
				});
			} else {
				// Create new summary
				await createProjectSummary({
					projectId,
					title: summaryData.title,
					abstract: summaryData.abstract,
					body: summaryData.body,
					videoIds: videoIdsString,
					isStale: false
				});
			}
		} catch (cacheError) {
			console.error('Failed to save summary to cache:', cacheError);
			// Continue without throwing error, as the summary was generated successfully
		}
		
		return json({
			success: true,
			summary: summaryData,
			cached: true,
			generatedAt: new Date().toISOString(),
			isStale: false,
			videoCount: videoData.length,
			totalVideos: projectVideos.length
		});
		
	} catch (err) {
		console.error('Failed to generate project summary:', err);
		
		if (err instanceof Error && err.message.includes('No content received')) {
			return error(500, 'AI service returned empty response');
		}
		
		return error(500, 'Failed to generate project summary');
	}
};
