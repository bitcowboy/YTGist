import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getCollection, getCollectionVideos, getTranscriptByVideoId, getCollectionSummary, createCollectionSummary, updateCollectionSummary, checkCollectionSummaryCacheValidity, getSummary } from '$lib/server/database.js';
import type { CollectionSummary } from '$lib/types.js';
import { OPENROUTER_BASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, PROXY_URI } from '$env/static/private';
import OpenAI from 'openai';
import * as undici from 'undici';
import { createApiRequestOptions, parseJsonResponse } from '$lib/server/ai-compatibility.js';
import StreamJson from 'stream-json';

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

const multiDocumentAnalysisSystemPrompt = `
You are an expert research analyst skilled in synthesizing information from multiple complex documents.
Your goal is to produce a coherent, insightful, and well-organized synthesis review — not a simple summary.

When analyzing documents:

Identify and extract the core ideas, findings, and arguments from each source.

Compare perspectives to reveal points of convergence, contradiction, or evolution.

Integrate information by themes or conceptual connections, not by document order.

Provide critical insights, implications, and limitations based on the collective evidence.

Maintain a neutral, analytical tone unless otherwise specified.

Your final output should read as a seamless, well-reasoned synthesis rather than a list of summaries. Use clear logic, thematic transitions, and concise academic language.
`;

const responseSchema = {
	type: "object",
	required: ["title", "body", "keyTakeaway"],
	properties: {
		title: {
			type: "string",
		},
		body: {
			type: "string",
		},
		keyTakeaway: {
			type: "string",
		},
	},
	additionalProperties: false,
};

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { collectionId } = params;
		
		if (!collectionId) {
			return error(400, 'Collection ID is required');
		}
		
		// Check if collection exists
		const collection = await getCollection(collectionId);
		if (!collection) {
			return error(404, 'Collection not found');
		}
		
		// Get cached summary
		const cachedSummary = await getCollectionSummary(collectionId);
		if (!cachedSummary) {
			return json({
				success: true,
				summary: null,
				cached: false,
				message: 'No cached summary found'
			});
		}
		
		// Get current video list to check cache validity
		const collectionVideos = await getCollectionVideos(collectionId);
		const currentVideoIds = collectionVideos.map(v => v.videoId);
		const isCacheValid = await checkCollectionSummaryCacheValidity(collectionId, currentVideoIds);
		
		return json({
			success: true,
			summary: {
				title: cachedSummary.title,
				body: cachedSummary.body,
				keyTakeaway: cachedSummary.keyTakeaway
			},
			cached: true,
			generatedAt: cachedSummary.generatedAt,
			isStale: cachedSummary.isStale || !isCacheValid,
			videoCount: currentVideoIds.length
		});
		
	} catch (err) {
		console.error('Failed to get cached collection summary:', err);
		return error(500, 'Failed to get cached collection summary');
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { collectionId } = params;
		const body = await request.json().catch(() => ({}));
		const { forceRegenerate = false, stream: streamMode = false } = body;
		
		if (!collectionId) {
			return error(400, 'Collection ID is required');
		}
		
		// Check if collection exists
		const collection = await getCollection(collectionId);
		if (!collection) {
			return error(404, 'Collection not found');
		}
		
		// Get collection videos
		const collectionVideos = await getCollectionVideos(collectionId);
		if (collectionVideos.length === 0) {
			return error(400, 'No videos in this collection');
		}
		
		// Check if we should use cached summary (only if not streaming)
		if (!forceRegenerate && !streamMode) {
			const currentVideoIds = collectionVideos.map(v => v.videoId);
			const isCacheValid = await checkCollectionSummaryCacheValidity(collectionId, currentVideoIds);
			
			if (isCacheValid) {
				const cachedSummary = await getCollectionSummary(collectionId);
				if (cachedSummary) {
					return json({
						success: true,
						summary: {
							title: cachedSummary.title,
							body: cachedSummary.body,
							keyTakeaway: cachedSummary.keyTakeaway
						},
						cached: true,
						generatedAt: cachedSummary.generatedAt,
						isStale: false,
						videoCount: currentVideoIds.length
					});
				}
			}
		}
		
		// Fetch transcripts and video metadata for all videos
		const videoData = [];
		for (const collectionVideo of collectionVideos) {
			try {
				const transcript = await getTranscriptByVideoId(collectionVideo.videoId);
				if (transcript && transcript.trim() !== '') {
					// Get video metadata from summaries table
					const summary = await getSummary(collectionVideo.videoId);
					
					videoData.push({
						videoId: collectionVideo.videoId,
						title: summary?.title || `Video ${collectionVideo.videoId}`,
						author: summary?.author || 'Unknown',
						transcript: transcript
					});
				}
			} catch (error) {
				console.error(`Failed to fetch transcript for video ${collectionVideo.videoId}:`, error);
				// Continue with other videos even if one fails
			}
		}
		
		if (videoData.length === 0) {
			return error(400, 'No transcripts available for any videos in this collection');
		}
		
		// Prepare data for AI analysis
		const documentsData = videoData.map(video => ({
			title: video.title,
			author: video.author,
			videoId: video.videoId,
			content: video.transcript
		}));

		// Use default system prompt
		const systemPrompt = multiDocumentAnalysisSystemPrompt;

		const userPrompt = `
Please synthesize the following documents into a comprehensive review.

Tasks:

Identify main ideas and findings across all documents.

Compare and contrast perspectives and highlight significant patterns or contradictions.

Organize the review around key themes or conceptual dimensions.

Provide analytical insights and, where relevant, note implications or future directions.

Output Requirements:

Style: Neutral, academic, and analytical.

Format: Continuous prose (no bullet points unless absolutely necessary).

Length: 1000-3000 words is recommended.

Cite sources simply using shortened titles when specific references are useful.

Please ensure the output is in Simplified Chinese. Format the output using markdown syntax.

Output Format (JSON):
You must return a JSON object with the following structure:
{
  "title": "string - A concise title for the review (required)",
  "keyTakeaway": "string - The most important insights from the review (required)",
  "body": "string - The main body content in markdown format (required)"
}

Important: 
- The "title" field should ONLY contain the title text, nothing else.
- The "body" field should NOT include the title - it should start directly with the main content.
- The "keyTakeaway" field should contain the most important insights separately.
- All fields are required and must be strings. The body should be formatted using markdown syntax.

Documents(in JSON format):
${JSON.stringify(documentsData, null, 2)}
`;
		
		// If streaming mode, use SSE
		if (streamMode) {
			const stream = new ReadableStream({
				async start(controller) {
					const encoder = new TextEncoder();
					
					const safeEnqueue = (data: string) => {
						try {
							controller.enqueue(encoder.encode(data));
						} catch (e) {
							console.warn('Failed to enqueue stream data:', e);
						}
					};
					
					const send = (event: string, data: any) => {
						safeEnqueue(`event: ${event}\n`);
						safeEnqueue(`data: ${JSON.stringify(data)}\n\n`);
					};
					
					try {
						let streamedContent = '';
						let partialSummary: Partial<CollectionSummary> = {};
						let lastTitle = '';
						let lastBody = '';
						let lastKeyTakeaway = '';
						let completeSent = false;
						
						const aiStream = await openai.chat.completions.create({
							model: OPENROUTER_MODEL,
							messages: [
								{ role: 'system', content: systemPrompt },
								{ role: 'user', content: userPrompt }
							],
							stream: true,
							response_format: { type: 'json_object' }
						} as any);

						let buffer = '';

						// Optional: try stream-json for robust streaming parse (same as watch page)
						let useStreamJson = false;
						let writer: any = null;
						let jsonStarted: boolean = false;
						let leadBuffer: string = '';
						let feedRing: string = '';
						let parsedResult: any = null;
						
						// Accumulators for finalize when streaming produced partials but no full JSON
						let summaryText: string = '';
						let titleText: string = '';
						let keyTakeawayText: string = '';
						let hasStreamActivity: boolean = false;
						
						try {
							const { PassThrough } = await import('node:stream');
							// @ts-ignore - optional runtime dependency
							const { parser } = await import(/* @vite-ignore */ 'stream-json');
							// @ts-ignore - optional runtime dependency
							const AssemblerModule: any = await import(/* @vite-ignore */ 'stream-json/Assembler');
							const Assembler = AssemblerModule.default || AssemblerModule;

							const pass = new PassThrough();
							const p = StreamJson.parser();
							const asm = new Assembler();
							p.on('error', (err: any) => {
								if (parsedResult) {
									try { pass.unpipe(p); } catch {}
									try { p.removeAllListeners(); } catch {}
									useStreamJson = false;
									writer = null;
									return;
								}
								console.warn('[collection-summary-stream] stream-json parser error, fallback to best-effort:', err?.message || err);
								if (feedRing) {
									console.warn('[collection-summary-stream] ring buffer (last 200 chars) =>\n' + feedRing);
								}
								try { pass.unpipe(p); } catch {}
								try { p.removeAllListeners(); } catch {}
								useStreamJson = false;
								writer = null;
							});
							
							// Incremental emit using token-level parsing
							let expectTitleString = false;
							let inTitleString = false;
							let expectBodyString = false;
							let inBodyString = false;
							let expectKeyTakeawayString = false;
							let inKeyTakeawayString = false;

							p.on('data', (chunk: any) => {
								try {
									const name = chunk?.name;
									const value = chunk?.value;

									if (name === 'keyValue') {
										if (value === 'title') {
											expectTitleString = true;
										} else if (value === 'body') {
											expectBodyString = true;
										} else if (value === 'keyTakeaway') {
											expectKeyTakeawayString = true;
										}
									} else if (name === 'startString') {
										if (expectTitleString) {
											inTitleString = true;
											expectTitleString = false;
										} else if (expectBodyString) {
											inBodyString = true;
											expectBodyString = false;
										} else if (expectKeyTakeawayString) {
											inKeyTakeawayString = true;
											expectKeyTakeawayString = false;
										}
									} else if (name === 'stringChunk') {
										if (inBodyString && typeof value === 'string' && value.length > 0) {
											summaryText += value;
											send('summary-delta', { delta: value });
											hasStreamActivity = true;
										} else if (inTitleString && typeof value === 'string' && value.length > 0) {
											titleText += value;
											lastTitle = titleText;
											partialSummary.title = titleText;
											send('summary-partial', { ...partialSummary, _field: 'title', _final: false } as any);
											hasStreamActivity = true;
										} else if (inKeyTakeawayString && typeof value === 'string' && value.length > 0) {
											keyTakeawayText += value;
											lastKeyTakeaway = keyTakeawayText;
											partialSummary.keyTakeaway = keyTakeawayText;
											send('summary-partial', { ...partialSummary, _field: 'keyTakeaway', _final: false } as any);
											hasStreamActivity = true;
										}
									} else if (name === 'stringValue') {
										if (inBodyString && typeof value === 'string') {
											const extra = value.slice(summaryText.length);
											if (extra) send('summary-delta', { delta: extra });
											summaryText = value;
											lastBody = value;
											partialSummary.body = value;
											inBodyString = false;
											hasStreamActivity = true;
										} else if (inTitleString && typeof value === 'string') {
											titleText = value;
											lastTitle = value;
											partialSummary.title = value;
											send('summary-partial', { ...partialSummary, _field: 'title', _final: true } as any);
											inTitleString = false;
											hasStreamActivity = true;
										} else if (inKeyTakeawayString && typeof value === 'string') {
											keyTakeawayText = value;
											lastKeyTakeaway = value;
											partialSummary.keyTakeaway = value;
											send('summary-partial', { ...partialSummary, _field: 'keyTakeaway', _final: true } as any);
											inKeyTakeawayString = false;
											hasStreamActivity = true;
										}
									}
									
									if (asm.current && typeof asm.current === 'object') {
										const parsed = asm.current as any;
										if (parsed.title && parsed.body && parsed.keyTakeaway) {
											if (!completeSent) {
												send('summary-complete', { summary: parsed.body });
												completeSent = true;
												parsedResult = parsed;
											}
										}
									}
								} catch (e) {
									console.warn('[collection-summary-stream] stream-json chunk processing error:', e);
								}
							});
							
							pass.pipe(p);
							writer = pass;
							useStreamJson = true;
						} catch (e) {
							// stream-json not available, fallback to best-effort parser
						}
						
						for await (const chunk of aiStream as any) {
							const raw = chunk?.choices?.[0]?.delta?.content ?? '';
							const part = raw.replace(/```(?:json)?\s*|```/gi, '').replace(/^\uFEFF/, '');
							if (!part) continue;
							buffer += part;
							streamedContent += raw;
							
							if (parsedResult) {
								// already complete, ignore further chunks
							} else if (useStreamJson && writer) {
								if (!jsonStarted) {
									leadBuffer += part;
									// Find first JSON object start
									let idx = -1;
									for (let i = 0; i < leadBuffer.length; i++) {
										const c = leadBuffer[i];
										if (c === '{' || c === '[') { idx = i; break; }
									}
									if (idx !== -1) {
										jsonStarted = true;
										const slice = leadBuffer.slice(idx);
										feedRing = (feedRing + slice).slice(-200);
										writer.write(slice);
										leadBuffer = '';
									}
								} else {
									feedRing = (feedRing + part).slice(-200);
									writer.write(part);
								}
							} else {
								// Best-effort：尝试整体解析
								let parsed: any = null;
								try { parsed = JSON.parse(buffer); } catch {}
								if (parsed && typeof parsed === 'object') {
									// JSON解析成功，提取各个字段
									if (parsed.body && parsed.body !== lastBody) {
										const newText = parsed.body.slice(lastBody.length);
										if (newText) {
											send('summary-delta', { delta: newText });
											hasStreamActivity = true;
										}
										lastBody = parsed.body;
										partialSummary.body = parsed.body;
									}
									
									if (parsed.title && parsed.title !== lastTitle) {
										lastTitle = parsed.title;
										partialSummary.title = parsed.title;
										send('summary-partial', { ...partialSummary });
										hasStreamActivity = true;
									}
									
									if (parsed.keyTakeaway && parsed.keyTakeaway !== lastKeyTakeaway) {
										lastKeyTakeaway = parsed.keyTakeaway;
										partialSummary.keyTakeaway = parsed.keyTakeaway;
										send('summary-partial', { ...partialSummary });
										hasStreamActivity = true;
									}

									// If all required fields are complete
									if (parsed.title && parsed.body && parsed.keyTakeaway) {
										if (!completeSent) {
											send('summary-complete', { summary: parsed.body });
											completeSent = true;
											parsedResult = parsed;
										}
									}
								}
							}
						}

						if (useStreamJson && writer) {
							try { writer.end(); } catch {}
						}
						
						// Wait a bit for stream-json to finalize parsing
						if (useStreamJson) {
							await new Promise(resolve => setTimeout(resolve, 100));
						}
						
						// Parse final result
						const summaryData = parsedResult || parseJsonResponse(streamedContent, {
							title: "分类分析报告",
							body: "无法生成正文内容",
							keyTakeaway: "无法生成关键要点"
						});
						
						// Ensure summaryData has all required fields
						const finalSummaryData = {
							title: summaryData?.title || partialSummary.title || "分类分析报告",
							body: summaryData?.body || partialSummary.body || lastBody || "无法生成正文内容",
							keyTakeaway: summaryData?.keyTakeaway || partialSummary.keyTakeaway || lastKeyTakeaway || "无法生成关键要点"
						};
						
						send('summary-complete', { summary: finalSummaryData.body || '' });
						
						// Save to cache
						const currentVideoIds = collectionVideos.map(v => v.videoId);
						const videoIdsString = currentVideoIds.join(',');
						
						try {
							const existingSummary = await getCollectionSummary(collectionId);
							if (existingSummary) {
								await updateCollectionSummary(collectionId, {
									title: finalSummaryData.title,
									body: finalSummaryData.body,
									keyTakeaway: finalSummaryData.keyTakeaway,
									videoIds: videoIdsString,
									isStale: false
								});
							} else {
								await createCollectionSummary({
									collectionId,
									title: finalSummaryData.title,
									body: finalSummaryData.body,
									keyTakeaway: finalSummaryData.keyTakeaway,
									videoIds: videoIdsString,
									isStale: false
								});
							}
						} catch (cacheError) {
							console.error('Failed to save summary to cache:', cacheError);
						}
						
						// Send final response - ensure this is always sent
						send('summary-final', {
							success: true,
							summary: {
								title: finalSummaryData.title,
								body: finalSummaryData.body,
								keyTakeaway: finalSummaryData.keyTakeaway
							},
							cached: false,
							generatedAt: new Date().toISOString(),
							isStale: false,
							videoCount: videoData.length,
							totalVideos: collectionVideos.length
						});
						
						// Ensure the final event is flushed before closing
						await new Promise(resolve => setTimeout(resolve, 200));
						
						// Send a keepalive to ensure the event is received
						safeEnqueue('\n');
						
						controller.close();
					} catch (err) {
						console.error('Streaming error:', err);
						send('error', { error: err instanceof Error ? err.message : 'Failed to generate summary' });
						controller.close();
					}
				}
			});
			
			return new Response(stream as any, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': 'Cache-Control'
				}
			});
		}
		
		// Non-streaming mode (original implementation)
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
			], responseSchema, {
				title: "分类分析报告",
				body: "无法生成正文内容",
				keyTakeaway: "无法生成关键要点"
			})
		);
		
		const content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content received from AI');
		}
		
		const summaryData = parseJsonResponse(content, {
			title: "分类分析报告",
			body: "无法生成正文内容",
			keyTakeaway: "无法生成关键要点"
		});
		
		// Save to cache
		const currentVideoIds = collectionVideos.map(v => v.videoId);
		const videoIdsString = currentVideoIds.join(',');
		
		try {
			// Check if summary already exists
			const existingSummary = await getCollectionSummary(collectionId);
			if (existingSummary) {
				// Update existing summary
				await updateCollectionSummary(collectionId, {
					title: summaryData.title,
					body: summaryData.body,
					keyTakeaway: summaryData.keyTakeaway,
					videoIds: videoIdsString,
					isStale: false
				});
			} else {
				// Create new summary
				await createCollectionSummary({
					collectionId,
					title: summaryData.title,
					body: summaryData.body,
					keyTakeaway: summaryData.keyTakeaway,
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
			summary: {
				title: summaryData.title,
				body: summaryData.body,
				keyTakeaway: summaryData.keyTakeaway
			},
			cached: true,
			generatedAt: new Date().toISOString(),
			isStale: false,
			videoCount: videoData.length,
			totalVideos: collectionVideos.length
		});
		
	} catch (err) {
		console.error('Failed to generate collection summary:', err);
		
		if (err instanceof Error && err.message.includes('No content received')) {
			return error(500, 'AI service returned empty response');
		}
		
		return error(500, 'Failed to generate collection summary');
	}
};

