import type { VideoMeta, Comment, CommentsData, VideoPlatform } from '$lib/types';
import type { VideoPlatformInterface } from './base';
import type { RSSVideo, RSSChannelInfo } from '../rss-monitor';

/**
 * Bilibili平台实现
 *
 * Bilibili API参考：
 * - 视频详情: https://api.bilibili.com/x/web-interface/view?bvid={bvid}
 * - 评论: https://api.bilibili.com/x/v2/reply?oid={aid}&type=1
 * - 字幕(新版，支持AI字幕): https://api.bilibili.com/x/player/wbi/v2?aid={aid}&cid={cid}
 *   - 注意：AI字幕可能需要客户端登录才能获取（响应中包含 login_mid 字段）
 * - 用户信息: https://api.bilibili.com/x/space/acc/info?mid={mid}
 */
export class BilibiliPlatform implements VideoPlatformInterface {
	readonly name = 'Bilibili';
	readonly platform: VideoPlatform = 'bilibili';

	extractVideoId(url: string): string | null {
		// Bilibili URL格式（支持 http:// 和 https:// 两种协议）：
		// http://www.bilibili.com/video/BVxxxxx
		// https://www.bilibili.com/video/BVxxxxx
		// http://www.bilibili.com/video/BVxxxxx?p=1
		// https://www.bilibili.com/video/BVxxxxx?p=1
		// http://b23.tv/xxxxx (短链接，需要解析)
		// https://b23.tv/xxxxx (短链接，需要解析)
		const patterns = [
			/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i,
			/bilibili\.com\/video\/(av\d+)/i,
			/b23\.tv\/([a-zA-Z0-9]+)/i
		];

		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match) {
				const id = match[1];
				// 如果是BV号，直接返回
				if (id.startsWith('BV')) {
					return id;
				}
				// 如果是av号，需要转换为BV号（这里先返回av号，后续可能需要转换）
				// 如果是短链接，需要先解析获取真实BV号
				return id;
			}
		}
		return null;
	}

	validateVideoId(videoId: string): boolean {
		// Bilibili视频ID格式：
		// BV号：BV + 10个字符（字母数字）
		// AV号：av + 数字（已废弃，但可能仍存在）
		return /^BV[a-zA-Z0-9]{10}$/.test(videoId) || /^av\d+$/i.test(videoId);
	}

	async getVideoData(videoId: string, subtitleUrl?: string): Promise<VideoMeta> {
		// 如果提供了subtitleUrl，使用专门的方法
		if (subtitleUrl) {
			return await this.getVideoDataWithSubtitleUrl(videoId, subtitleUrl);
		}

		// 确保是BV格式
		const bvid = videoId.startsWith('BV') ? videoId : await this.convertToBvid(videoId);

		// 获取视频详情
		const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
		const videoInfoResponse = await fetch(videoInfoUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer: 'https://www.bilibili.com/'
			}
		});

		if (!videoInfoResponse.ok) {
			throw new Error(`Bilibili API error: ${videoInfoResponse.status}`);
		}

		const videoInfoData = await videoInfoResponse.json();

		if (videoInfoData.code !== 0 || !videoInfoData.data) {
			throw new Error('Video not found');
		}

		const data = videoInfoData.data;
		const aid = data.aid;
		const cid = data.pages?.[0]?.cid || data.cid; // 获取第一个分P的cid

		// 并行获取字幕和评论
		const [transcriptResult, commentsResult] = await Promise.allSettled([
			this.fetchTranscriptByAidCid(aid, cid),
			this.fetchCommentsByAid(aid, 50)
		]);

		// 处理字幕结果
		let transcript = '';
		let hasSubtitles = false;
		if (transcriptResult.status === 'fulfilled') {
			transcript = transcriptResult.value;
			hasSubtitles = transcript.length > 0;
		}

		// 处理评论结果
		let comments: Comment[] = [];
		let commentsCount = 0;
		if (commentsResult.status === 'fulfilled') {
			const commentsData = commentsResult.value;
			comments = commentsData.comments;
			commentsCount = commentsData.totalCount;
		}

		// 处理缩略图URL
		let thumbnailUrl = '';
		if (data.pic) {
			const pic = data.pic;
			if (pic.startsWith('http')) {
				thumbnailUrl = pic;
			} else if (pic.startsWith('//')) {
				thumbnailUrl = `https:${pic}`;
			} else {
				thumbnailUrl = `https://i0.hdslb.com/bfs/archive/${pic}`;
			}
		}

		return {
			title: data.title || '',
			description: data.desc || '',
			channelId: data.owner?.mid?.toString() || '',
			author: data.owner?.name || '',
			transcript,
			hasSubtitles,
			publishedAt: new Date(data.pubdate * 1000).toISOString(),
			comments,
			commentsCount,
			platform: 'bilibili',
			thumbnailUrl
		};
	}

	/**
	 * 使用外部提供的subtitle_url获取视频数据
	 * 当客户端主动提供subtitle_url时使用此方法
	 */
	async getVideoDataWithSubtitleUrl(videoId: string, subtitleUrl: string): Promise<VideoMeta> {
		console.log(
			`[Bilibili] getVideoDataWithSubtitleUrl 调用 - videoId: ${videoId}, subtitleUrl 长度: ${subtitleUrl.length}`
		);
		console.log(`[Bilibili]   - subtitleUrl:`, subtitleUrl);

		// 确保是BV格式
		const bvid = videoId.startsWith('BV') ? videoId : await this.convertToBvid(videoId);

		// 获取视频详情
		const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
		const videoInfoResponse = await fetch(videoInfoUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer: 'https://www.bilibili.com/'
			}
		});

		if (!videoInfoResponse.ok) {
			throw new Error(`Bilibili API error: ${videoInfoResponse.status}`);
		}

		const videoInfoData = await videoInfoResponse.json();

		if (videoInfoData.code !== 0 || !videoInfoData.data) {
			throw new Error('Video not found');
		}

		const data = videoInfoData.data;
		const aid = data.aid;

		// 优先使用外部提供的subtitle_url获取字幕
		let transcript = '';
		let hasSubtitles = false;
		let useExternalSubtitle = false;

		try {
			// subtitleUrl 应该已经是解码后的原始 URL
			// （在 API 路由中已经进行了 URL 解码和 base64 解码）

			// 验证 URL 格式
			if (!subtitleUrl || typeof subtitleUrl !== 'string' || subtitleUrl.trim() === '') {
				throw new Error('subtitleUrl 为空或无效');
			}

			// 清理 URL：移除控制字符和无效字符
			const cleanedUrl = subtitleUrl
				.replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
				.trim();

			// 确保URL是完整的（添加协议和域名如果是相对路径）
			let fullSubtitleUrl: string;
			if (cleanedUrl.startsWith('http://') || cleanedUrl.startsWith('https://')) {
				fullSubtitleUrl = cleanedUrl;
			} else if (cleanedUrl.startsWith('//')) {
				fullSubtitleUrl = `https:${cleanedUrl}`;
			} else {
				fullSubtitleUrl = `https://${cleanedUrl}`;
			}

			// 验证 URL 是否有效
			try {
				const urlObj = new URL(fullSubtitleUrl);
				if (!urlObj.hostname || !urlObj.hostname.includes('bilibili.com')) {
					console.warn(`[Bilibili] ⚠️ URL 主机名不是 bilibili.com: ${urlObj.hostname}`);
				}
			} catch (urlError) {
				throw new Error(`URL 格式无效: ${fullSubtitleUrl.substring(0, 100)}...`);
			}

			console.log(`[Bilibili] 📥 使用外部 subtitle_url 获取字幕`);
			console.log(`[Bilibili]   - 解码后 URL:`, subtitleUrl);
			console.log(`[Bilibili]   - 清理后 URL:`, cleanedUrl);
			console.log(`[Bilibili]   - 完整 URL:`, fullSubtitleUrl);

			// 创建 AbortController 用于超时控制
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

			try {
				// 获取字幕内容
				const contentResponse = await fetch(fullSubtitleUrl, {
					headers: {
						'User-Agent':
							'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						Referer: 'https://www.bilibili.com/',
						Origin: 'https://www.bilibili.com'
					},
					signal: controller.signal
				});

				clearTimeout(timeoutId);
				console.log(`[Bilibili] 📡 请求字幕 URL，状态码: ${contentResponse.status}`);

				if (contentResponse.ok) {
					const subtitleContent = await contentResponse.json();
					console.log(
						`[Bilibili] 📄 收到字幕响应，body 数组长度: ${subtitleContent.body?.length || 0}`
					);

					// Bilibili字幕格式：{ body: [{ from: number, to: number, content: string }] }
					if (subtitleContent.body && Array.isArray(subtitleContent.body)) {
						// 将字幕转换为文本
						transcript = subtitleContent.body
							.map((item: any) => item.content || '')
							.filter((text: string) => text.trim() !== '')
							.join('\n');

						if (transcript && transcript.trim() !== '') {
							hasSubtitles = true;
							useExternalSubtitle = true;
							console.log(`[Bilibili] ✅ 成功从外部 subtitle_url 获取字幕`);
							console.log(`[Bilibili]   - 字幕条目数: ${subtitleContent.body.length}`);
							console.log(`[Bilibili]   - 转录文本长度: ${transcript.length} 字符`);
							console.log(`[Bilibili]   - 前100字符: ${transcript.substring(0, 100)}...`);
						} else {
							console.log(`[Bilibili] ⚠️ 字幕内容为空，body 数组存在但无有效内容`);
						}
					} else {
						console.log(`[Bilibili] ⚠️ 字幕响应格式不正确，body 不是数组或不存在`);
					}
				} else {
					const errorText = await contentResponse.text().catch(() => '无法读取错误内容');
					console.log(`[Bilibili] ⚠️ 外部 subtitle_url 下载失败`);
					console.log(`[Bilibili]   - HTTP 状态码:`, contentResponse.status);
					console.log(`[Bilibili]   - 完整错误内容:`, errorText);
					console.log(`[Bilibili]   - 将回退到默认方法获取字幕`);
				}
			} catch (fetchError) {
				clearTimeout(timeoutId);

				// 检查是否是超时错误
				if (fetchError instanceof Error && fetchError.name === 'AbortError') {
					throw new Error('请求超时（10秒）');
				}

				// 检查是否是网络错误
				if (fetchError instanceof TypeError && fetchError.message.includes('fetch failed')) {
					// 提供更详细的错误信息
					const errorDetails = {
						message: fetchError.message,
						url: fullSubtitleUrl.substring(0, 150),
						possibleCauses: [
							'URL 可能包含无效字符或编码错误',
							'网络连接问题',
							'SSL/TLS 证书问题',
							'Bilibili 服务器拒绝连接'
						]
					};
					console.warn(`[Bilibili] ⚠️ 网络请求失败:`, errorDetails);
					throw new Error(`网络请求失败: ${fetchError.message}。URL: ${fullSubtitleUrl}`);
				}

				throw fetchError;
			}
		} catch (error) {
			console.warn(`[Bilibili] ⚠️ 使用外部 subtitle_url 获取字幕失败`);
			console.warn(
				`[Bilibili]   - 错误类型:`,
				error instanceof Error ? error.constructor.name : typeof error
			);
			console.warn(
				`[Bilibili]   - 错误消息:`,
				error instanceof Error ? error.message : String(error)
			);

			// 如果是 URL 相关错误，提供更多信息
			if (error instanceof Error) {
				if (error.message.includes('URL')) {
					console.warn(`[Bilibili]   - 原始 subtitleUrl:`, subtitleUrl);
				}
				if (error.stack) {
					console.warn(`[Bilibili]   - 完整堆栈:`, error.stack);
				}
			}

			console.warn(`[Bilibili]   - 将回退到默认方法获取字幕`);
		}

		// 如果外部subtitle_url获取失败，回退到使用默认方法获取字幕
		if (!useExternalSubtitle) {
			console.log(`[Bilibili] 回退到使用默认方法获取字幕`);
			const cid = data.pages?.[0]?.cid || data.cid;
			try {
				const defaultTranscript = await this.fetchTranscriptByAidCid(aid, cid);
				transcript = defaultTranscript;
				hasSubtitles = transcript.length > 0;
				console.log(`[Bilibili] ✅ 使用默认方法成功获取字幕，长度: ${transcript.length}字符`);
			} catch (defaultError) {
				console.warn(`[Bilibili] 默认方法获取字幕也失败:`, defaultError);
			}
		}

		// 并行获取评论
		const commentsResult = await Promise.allSettled([this.fetchCommentsByAid(aid, 50)]);

		// 处理评论结果
		let comments: Comment[] = [];
		let commentsCount = 0;
		if (commentsResult[0].status === 'fulfilled') {
			const commentsData = commentsResult[0].value;
			comments = commentsData.comments;
			commentsCount = commentsData.totalCount;
		}

		// 处理缩略图URL
		let thumbnailUrl = '';
		if (data.pic) {
			const pic = data.pic;
			if (pic.startsWith('http')) {
				thumbnailUrl = pic;
			} else if (pic.startsWith('//')) {
				thumbnailUrl = `https:${pic}`;
			} else {
				thumbnailUrl = `https://i0.hdslb.com/bfs/archive/${pic}`;
			}
		}

		return {
			title: data.title || '',
			description: data.desc || '',
			channelId: data.owner?.mid?.toString() || '',
			author: data.owner?.name || '',
			transcript,
			hasSubtitles,
			publishedAt: new Date(data.pubdate * 1000).toISOString(),
			comments,
			commentsCount,
			platform: 'bilibili',
			thumbnailUrl
		};
	}

	async getVideoDataWithoutTranscript(videoId: string): Promise<Omit<VideoMeta, 'transcript'>> {
		const bvid = videoId.startsWith('BV') ? videoId : await this.convertToBvid(videoId);

		const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
		const videoInfoResponse = await fetch(videoInfoUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer: 'https://www.bilibili.com/'
			}
		});

		if (!videoInfoResponse.ok) {
			throw new Error(`Bilibili API error: ${videoInfoResponse.status}`);
		}

		const videoInfoData = await videoInfoResponse.json();

		if (videoInfoData.code !== 0 || !videoInfoData.data) {
			throw new Error('Video not found');
		}

		const data = videoInfoData.data;
		const aid = data.aid;
		const cid = data.pages?.[0]?.cid || data.cid;

		// 检查是否有字幕（不获取字幕内容）- 使用新版API支持AI字幕
		let hasSubtitles = false;
		try {
			const subtitleUrl = `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`;
			const subtitleResponse = await fetch(subtitleUrl, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Referer: 'https://www.bilibili.com/'
				}
			});

			if (subtitleResponse.ok) {
				const subtitleData = await subtitleResponse.json();
				// 检查字幕（AI字幕和普通字幕都在 data.subtitle.subtitles 中）
				// AI字幕通过 lan 字段（如 "ai-zh"）或 ai_type 字段标识
				hasSubtitles =
					subtitleData.code === 0 &&
					subtitleData.data?.subtitle?.subtitles &&
					subtitleData.data.subtitle.subtitles.length > 0;
			}
		} catch {
			// 如果检查失败，默认为false
			hasSubtitles = false;
		}

		// 处理缩略图URL
		let thumbnailUrl = '';
		if (data.pic) {
			const pic = data.pic;
			if (pic.startsWith('http')) {
				thumbnailUrl = pic;
			} else if (pic.startsWith('//')) {
				thumbnailUrl = `https:${pic}`;
			} else {
				thumbnailUrl = `https://i0.hdslb.com/bfs/archive/${pic}`;
			}
		}

		return {
			title: data.title || '',
			description: data.desc || '',
			channelId: data.owner?.mid?.toString() || '',
			author: data.owner?.name || '',
			hasSubtitles,
			publishedAt: new Date(data.pubdate * 1000).toISOString(),
			platform: 'bilibili',
			thumbnailUrl
		};
	}

	async getTranscript(videoId: string): Promise<string> {
		const bvid = videoId.startsWith('BV') ? videoId : await this.convertToBvid(videoId);

		// 先获取视频信息以获取aid和cid
		const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
		const videoInfoResponse = await fetch(videoInfoUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer: 'https://www.bilibili.com/'
			}
		});

		if (!videoInfoResponse.ok) {
			throw new Error(`Bilibili API error: ${videoInfoResponse.status}`);
		}

		const videoInfoData = await videoInfoResponse.json();

		if (videoInfoData.code !== 0 || !videoInfoData.data) {
			throw new Error('Video not found');
		}

		const data = videoInfoData.data;
		const aid = data.aid;
		const cid = data.pages?.[0]?.cid || data.cid;

		return await this.fetchTranscriptByAidCid(aid, cid);
	}

	/**
	 * 使用新版API获取字幕（支持AI字幕）
	 * API: https://api.bilibili.com/x/player/wbi/v2?aid={aid}&cid={cid}
	 *
	 * 注意：
	 * - AI字幕和普通字幕都在 data.subtitle.subtitles 数组中
	 * - AI字幕通过 lan 字段标识（如 "ai-zh", "ai-en"）或 ai_type 字段（1表示AI字幕）
	 * - 可能需要客户端登录才能获取AI字幕（响应中包含 login_mid 字段时表示已登录）
	 * - 未登录状态下可能只能获取普通字幕，无法获取AI字幕
	 */
	private async fetchTranscriptByAidCid(aid: number, cid: number): Promise<string> {
		// 使用新版wbi/v2接口获取字幕信息（支持AI字幕）
		const subtitleUrl = `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`;
		console.log(`[Bilibili] 请求字幕API: ${subtitleUrl}`);

		const subtitleResponse = await fetch(subtitleUrl, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Referer: 'https://www.bilibili.com/',
				Origin: 'https://www.bilibili.com'
			}
		});

		if (!subtitleResponse.ok) {
			console.log(`[Bilibili] 字幕API请求失败: ${subtitleResponse.status}`);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		const subtitleData = await subtitleResponse.json();
		console.log(`[Bilibili] 字幕API响应码: ${subtitleData.code}`);

		// 检查是否登录（响应中包含 login_mid 字段表示已登录）
		if (subtitleData.data?.login_mid) {
			console.log(`[Bilibili] 检测到登录状态 (login_mid: ${subtitleData.data.login_mid})`);
		} else {
			console.log(`[Bilibili] 未检测到登录状态 - AI字幕可能需要登录才能获取`);
		}

		if (subtitleData.code !== 0) {
			console.log(`[Bilibili] API返回错误: ${subtitleData.message || 'unknown error'}`);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		// 收集所有可用字幕（包括普通字幕和AI字幕）
		// 注意：AI字幕和普通字幕都在 data.subtitle.subtitles 数组中
		// AI字幕通过 lan 字段标识（如 "ai-zh", "ai-en" 等）或 ai_type 字段（1表示AI字幕）
		// 可能需要登录才能获取AI字幕（响应中包含 login_mid 字段）
		const allSubtitles: any[] = [];

		// 检查字幕列表 (data.subtitle.subtitles) - 包含普通字幕和AI字幕
		if (subtitleData.data?.subtitle?.subtitles && subtitleData.data.subtitle.subtitles.length > 0) {
			console.log(`[Bilibili] 找到字幕: ${subtitleData.data.subtitle.subtitles.length}个`);

			// 处理每个字幕，标记AI字幕
			const processedSubtitles = subtitleData.data.subtitle.subtitles.map((sub: any) => {
				// 判断是否为AI字幕：
				// 1. lan 字段以 "ai-" 开头（如 "ai-zh", "ai-en"）
				// 2. ai_type 字段为 1
				const isAI = (sub.lan && sub.lan.startsWith('ai-')) || sub.ai_type === 1;

				return {
					...sub,
					is_ai: isAI,
					// 如果是AI字幕，确保 type 字段为 1
					type: isAI ? 1 : sub.type || 0
				};
			});

			allSubtitles.push(...processedSubtitles);

			// 统计AI字幕和普通字幕数量
			const aiCount = processedSubtitles.filter((s: any) => s.is_ai).length;
			const normalCount = processedSubtitles.length - aiCount;
			console.log(`[Bilibili] 其中AI字幕: ${aiCount}个, 普通字幕: ${normalCount}个`);
		}

		if (allSubtitles.length === 0) {
			console.log(`[Bilibili] 未找到任何字幕`);
			console.log(
				`[Bilibili] 响应数据结构: ${JSON.stringify(Object.keys(subtitleData.data || {}))}`
			);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		console.log(`[Bilibili] 总共找到字幕: ${allSubtitles.length}个`);
		allSubtitles.forEach((sub, idx) => {
			console.log(
				`[Bilibili] 字幕${idx + 1}: lan=${sub.lan}, lan_doc=${sub.lan_doc}, is_ai=${sub.is_ai || false}`
			);
		});

		// 智能选择最佳字幕（优先级：中文AI字幕 > 中文普通字幕 > 英文字幕 > 其他）
		const subtitle = this.selectBestSubtitle(allSubtitles);
		const subtitleContentUrl = subtitle.subtitle_url;

		if (!subtitleContentUrl) {
			console.log(`[Bilibili] 选中的字幕没有URL`);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		// 如果subtitle_url是相对路径，需要添加协议和域名
		const fullSubtitleUrl = subtitleContentUrl.startsWith('http')
			? subtitleContentUrl
			: `https:${subtitleContentUrl}`;

		console.log(`[Bilibili] 下载字幕文件: ${fullSubtitleUrl}`);

		// 获取字幕内容
		const contentResponse = await fetch(fullSubtitleUrl, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Referer: 'https://www.bilibili.com/',
				Origin: 'https://www.bilibili.com'
			}
		});

		if (!contentResponse.ok) {
			console.log(`[Bilibili] 字幕文件下载失败: ${contentResponse.status}`);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		const subtitleContent = await contentResponse.json();

		// Bilibili字幕格式：{ body: [{ from: number, to: number, content: string }] }
		if (!subtitleContent.body || !Array.isArray(subtitleContent.body)) {
			console.log(`[Bilibili] 字幕文件格式错误，无body字段`);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		// 将字幕转换为文本
		const transcript = subtitleContent.body
			.map((item: any) => item.content || '')
			.filter((text: string) => text.trim() !== '')
			.join('\n');

		if (!transcript || transcript.trim() === '') {
			console.log(`[Bilibili] 字幕内容为空`);
			throw new Error('NO_SUBTITLES_AVAILABLE');
		}

		console.log(`[Bilibili] 成功获取字幕，长度: ${transcript.length}字符`);
		return transcript;
	}

	/**
	 * 智能选择最佳字幕
	 * 优先级顺序：
	 * 1. 中文AI字幕 (is_ai=true 或 ai-zh 或 type=1)
	 * 2. 中文普通字幕 (zh-CN, zh-Hans, zh)
	 * 3. 英文字幕 (en, en-US)
	 * 4. 第一个可用字幕
	 */
	private selectBestSubtitle(subtitles: any[]): any {
		if (subtitles.length === 1) {
			console.log(`[Bilibili] 只有一个字幕，直接使用: ${subtitles[0].lan_doc || subtitles[0].lan}`);
			return subtitles[0];
		}

		// 优先级1：中文AI字幕（自动生成）
		const aiChineseSubtitle = subtitles.find((sub) => {
			const lan = sub.lan?.toLowerCase() || '';
			const lanDoc = sub.lan_doc || '';
			const isAi = sub.is_ai === true || sub.type === 1;
			const isChinese = lan.includes('zh') || lan.includes('cn') || lanDoc.includes('中文');

			return (
				lan.startsWith('ai-zh') ||
				lan === 'zh-ai' ||
				(isAi && isChinese) ||
				lanDoc.includes('自动生成') ||
				lanDoc.includes('AI')
			);
		});
		if (aiChineseSubtitle) {
			console.log(
				`[Bilibili] ✓ 选择AI中文字幕: ${aiChineseSubtitle.lan_doc || aiChineseSubtitle.lan}`
			);
			return aiChineseSubtitle;
		}

		// 优先级2：普通中文字幕
		const chineseSubtitle = subtitles.find((sub) => {
			const lan = sub.lan?.toLowerCase() || '';
			const lanDoc = sub.lan_doc || '';
			return lan.startsWith('zh') || lan === 'cn' || lanDoc.includes('中文');
		});
		if (chineseSubtitle) {
			console.log(`[Bilibili] ✓ 选择中文字幕: ${chineseSubtitle.lan_doc || chineseSubtitle.lan}`);
			return chineseSubtitle;
		}

		// 优先级3：英文字幕
		const englishSubtitle = subtitles.find((sub) => {
			const lan = sub.lan?.toLowerCase() || '';
			return lan.startsWith('en');
		});
		if (englishSubtitle) {
			console.log(`[Bilibili] ✓ 选择英文字幕: ${englishSubtitle.lan_doc || englishSubtitle.lan}`);
			return englishSubtitle;
		}

		// 优先级4：返回第一个字幕
		console.log(`[Bilibili] ✓ 使用默认字幕: ${subtitles[0].lan_doc || subtitles[0].lan}`);
		return subtitles[0];
	}

	async getComments(videoId: string, maxResults: number): Promise<CommentsData> {
		const bvid = videoId.startsWith('BV') ? videoId : await this.convertToBvid(videoId);

		// 先获取视频信息以获取aid
		const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
		const videoInfoResponse = await fetch(videoInfoUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer: 'https://www.bilibili.com/'
			}
		});

		if (!videoInfoResponse.ok) {
			throw new Error(`Bilibili API error: ${videoInfoResponse.status}`);
		}

		const videoInfoData = await videoInfoResponse.json();

		if (videoInfoData.code !== 0 || !videoInfoData.data) {
			return { comments: [], totalCount: 0 };
		}

		const aid = videoInfoData.data.aid;
		return await this.fetchCommentsByAid(aid, maxResults);
	}

	private async fetchCommentsByAid(aid: number, maxResults: number): Promise<CommentsData> {
		const commentsUrl = `https://api.bilibili.com/x/v2/reply?oid=${aid}&type=1&sort=2&pn=1&ps=${Math.min(maxResults, 20)}`;
		const commentsResponse = await fetch(commentsUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer: 'https://www.bilibili.com/'
			}
		});

		if (!commentsResponse.ok) {
			return { comments: [], totalCount: 0 };
		}

		const commentsData = await commentsResponse.json();

		if (commentsData.code !== 0 || !commentsData.data?.replies) {
			return { comments: [], totalCount: 0 };
		}

		const replies = commentsData.data.replies || [];
		const comments: Comment[] = replies.slice(0, maxResults).map((reply: any) => ({
			id: reply.rpid?.toString() || '',
			text: reply.content?.message || '',
			author: reply.member?.uname || 'Unknown',
			likeCount: reply.like || 0,
			publishedAt: new Date(reply.ctime * 1000).toISOString(),
			replyCount: reply.rcount || 0
		}));

		return {
			comments,
			totalCount: commentsData.data.page?.count || comments.length
		};
	}

	getRSSUrl(channelId: string): string | null {
		// Bilibili不提供标准的RSS feed
		// 可以使用用户空间的视频列表API
		// https://api.bilibili.com/x/space/wbi/arc/search?mid={mid}
		return null; // Bilibili不支持RSS
	}

	extractChannelId(url: string): string | null {
		// Bilibili用户空间URL格式：
		// https://space.bilibili.com/{mid}
		// https://www.bilibili.com/video/BVxxxxx (从视频页获取UP主)
		const patterns = [
			/space\.bilibili\.com\/(\d+)/i,
			/bilibili\.com\/\d+\/(\d+)/i // 旧格式
		];

		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match) {
				return match[1];
			}
		}
		return null;
	}

	getVideoUrl(videoId: string): string {
		const bvid = videoId.startsWith('BV') ? videoId : videoId;
		return `https://www.bilibili.com/video/${bvid}`;
	}

	getChannelUrl(channelId: string): string {
		return `https://space.bilibili.com/${channelId}`;
	}

	getThumbnailUrl(videoId: string): string {
		// Bilibili缩略图URL需要从视频信息API获取pic字段
		// 由于接口要求返回string而不是Promise，这里返回空字符串
		// 实际缩略图URL应该在getVideoData中获取并缓存，或前端组件中动态获取
		// 格式：https://i0.hdslb.com/bfs/archive/{pic}.jpg
		return '';
	}

	async parseRSSFeed(rssUrl: string, days: number, maxVideos: number): Promise<RSSVideo[]> {
		// Bilibili不支持RSS，返回空数组
		return [];
	}

	async getChannelInfoFromRSS(channelId: string): Promise<RSSChannelInfo | null> {
		// Bilibili不支持RSS
		return null;
	}

	/**
	 * 将AV号转换为BV号（如果需要）
	 * 注意：Bilibili已经废弃AV号，但为了兼容性保留此方法
	 */
	private async convertToBvid(avId: string): Promise<string> {
		// 如果已经是BV号，直接返回
		if (avId.startsWith('BV')) {
			return avId;
		}

		// 如果是av号，尝试通过API转换
		if (avId.startsWith('av') || avId.startsWith('AV')) {
			const aid = avId.replace(/^av/i, '');
			const videoInfoUrl = `https://api.bilibili.com/x/web-interface/view?aid=${aid}`;
			const response = await fetch(videoInfoUrl, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					Referer: 'https://www.bilibili.com/'
				}
			});

			if (response.ok) {
				const data = await response.json();
				if (data.code === 0 && data.data?.bvid) {
					return data.data.bvid;
				}
			}
		}

		// 如果转换失败，返回原值
		return avId;
	}
}
