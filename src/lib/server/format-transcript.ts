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

const formatPrompt = `你是一个专业的文本格式化助手。请将YouTube视频字幕文本进行格式化，使其更易读。

## 任务
将原始字幕文本格式化为结构清晰、标点符号正确的Markdown格式文本。

## 格式化规则
1. **添加标点符号**：在适当位置添加句号、逗号、问号、感叹号等标点符号
2. **分段处理**：将相关内容组织成段落
3. **保持原意**：不改变原文的意思，只改善格式和可读性
4. **自然流畅**：确保文本读起来自然流畅
5. **保持时间顺序**：按照原始字幕的时间顺序组织内容
6. **Markdown格式**：使用Markdown格式输出，包括标题、段落等

## 输出要求
- 使用Markdown格式输出
- 段落之间用空行分隔
- 保持原始内容的完整性
- 在内容前添加视频标题作为一级标题

## 额外任务
除了格式化文本外，请提供一个精简的文件名建议（最多50个字符，去除特殊字符，适合作为文件名）。

请按以下格式返回：
文件名:[精简的文件名]

内容:[格式化后的Markdown文本]`;

export const formatTranscript = async (transcript: string, videoTitle?: string) => {
	try {
		const userContent = videoTitle 
			? `请格式化以下视频的字幕文本：\n\n视频标题：${videoTitle}\n\n字幕内容：\n${transcript}`
			: `请格式化以下字幕文本：\n\n${transcript}`;

		const response = await openai.chat.completions.create({
			model: OPENROUTER_MODEL,
			messages: [
				{
					role: "system",
					content: formatPrompt
				},
				{
					role: "user",
					content: userContent
				}
			],
		});

		const formattedText = response.choices[0].message.content;
		if (!formattedText) {
			throw new Error('No formatted content received from AI');
		}

		// Parse the response to extract filename and content
		const filenameMatch = formattedText.match(/文件名:(.+)/);
		const contentMatch = formattedText.match(/内容:([\s\S]+)/);
		
		if (!filenameMatch || !contentMatch) {
			// Fallback if parsing fails
			return { content: formattedText, filename: 'formatted-transcript' };
		}

		const filename = filenameMatch[1].trim();
		const content = contentMatch[1].trim();

		return { content, filename };
	} catch (error) {
		console.error('Failed to format transcript:', error);
		throw new Error('Failed to format transcript with AI.');
	}
};
