/**
 * Bilibili字幕自动获取工具
 * 在B站视频页面执行此脚本，可以自动获取字幕API响应
 */

export interface BilibiliSubtitleFetcherOptions {
	/** 视频ID（BV号） */
	videoId?: string;
	/** 平台标识 */
	platform?: string;
	/** 回调函数，当获取到字幕时调用 */
	onSuccess?: (data: any) => void;
	/** 回调函数，当出错时调用 */
	onError?: (error: string) => void;
}

/**
 * 从当前B站视频页面获取aid和cid
 */
function getAidAndCid(): { aid: number; cid: number } | null {
	try {
		// 方法1: 从window.__INITIAL_STATE__获取（B站页面全局变量）
		if (typeof window !== 'undefined' && (window as any).__INITIAL_STATE__) {
			const state = (window as any).__INITIAL_STATE__;
			if (state.videoData?.aid && state.videoData?.cid) {
				return {
					aid: state.videoData.aid,
					cid: state.videoData.cid
				};
			}
		}

		// 方法2: 从URL参数获取
		const urlParams = new URLSearchParams(window.location.search);
		const aidParam = urlParams.get('aid');
		const cidParam = urlParams.get('cid');
		if (aidParam && cidParam) {
			return {
				aid: parseInt(aidParam),
				cid: parseInt(cidParam)
			};
		}

		// 方法3: 从页面中的script标签查找
		const scripts = document.querySelectorAll('script');
		for (const script of scripts) {
			const text = script.textContent || '';
			// 查找包含aid和cid的脚本
			const aidMatch = text.match(/aid["\s:=]+(\d+)/);
			const cidMatch = text.match(/cid["\s:=]+(\d+)/);
			if (aidMatch && cidMatch) {
				return {
					aid: parseInt(aidMatch[1]),
					cid: parseInt(cidMatch[1])
				};
			}
		}

		return null;
	} catch (error) {
		console.error('[BilibiliSubtitleFetcher] 获取aid和cid失败:', error);
		return null;
	}
}

/**
 * 获取字幕API响应
 */
async function fetchSubtitleApi(aid: number, cid: number): Promise<any> {
	const apiUrl = `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`;

	console.log(`[BilibiliSubtitleFetcher] 请求字幕API: ${apiUrl}`);

	const response = await fetch(apiUrl, {
		headers: {
			'User-Agent': navigator.userAgent,
			Referer: window.location.href,
			Origin: 'https://www.bilibili.com'
		}
	});

	if (!response.ok) {
		throw new Error(`字幕API请求失败: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();

	if (data.code !== 0) {
		throw new Error(`API返回错误: ${data.message || 'unknown error'}`);
	}

	return data;
}

/**
 * 主函数：自动获取B站字幕
 */
export async function fetchAndReportBilibiliSubtitle(
	options: BilibiliSubtitleFetcherOptions = {}
): Promise<any> {
	try {
		// 1. 获取aid和cid
		const aidCid = getAidAndCid();
		if (!aidCid) {
			throw new Error('无法从当前页面获取aid和cid，请确保在B站视频页面执行此脚本');
		}

		console.log(`[BilibiliSubtitleFetcher] 找到aid=${aidCid.aid}, cid=${aidCid.cid}`);

		// 2. 获取字幕API响应
		const subtitleApiResponse = await fetchSubtitleApi(aidCid.aid, aidCid.cid);

		// 检查是否有字幕
		const subtitles = subtitleApiResponse.data?.subtitle?.subtitles || [];
		if (subtitles.length === 0) {
			throw new Error('该视频没有可用的字幕');
		}

		console.log(`[BilibiliSubtitleFetcher] 找到${subtitles.length}个字幕`);
		subtitles.forEach((sub: any, idx: number) => {
			console.log(`  字幕${idx + 1}: ${sub.lan_doc || sub.lan} (${sub.lan})`);
		});

		// 返回字幕数据
		options.onSuccess?.(subtitleApiResponse);
		return subtitleApiResponse;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : '未知错误';
		console.error('[BilibiliSubtitleFetcher] 错误:', errorMessage);
		options.onError?.(errorMessage);
		throw error;
	}
}
