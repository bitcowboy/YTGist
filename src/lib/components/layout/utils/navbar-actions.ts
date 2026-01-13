import { addToBlockList, removeFromBlockList } from '$lib/client/block-list';

/**
 * Download formatted transcript
 */
export async function downloadTranscript(videoId: string): Promise<void> {
	const response = await fetch(`/api/download-transcript?v=${videoId}&format=formatted`);
	if (!response.ok) {
		throw new Error('Failed to download transcript');
	}

	const contentDisposition = response.headers.get('Content-Disposition');
	let filename = `formatted-transcript-${videoId}.md`;

	if (contentDisposition) {
		const utf8FilenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
		if (utf8FilenameMatch) {
			try {
				filename = decodeURIComponent(utf8FilenameMatch[1]);
			} catch (e) {
				console.warn('Failed to decode UTF-8 filename, using fallback');
			}
		} else {
			const filenameMatch = contentDisposition.match(/filename="(.+)"/);
			if (filenameMatch) {
				filename = filenameMatch[1];
			}
		}
	}

	const blob = await response.blob();
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	window.URL.revokeObjectURL(url);
	document.body.removeChild(a);
}

/**
 * Regenerate summary for a video
 */
export async function regenerateSummary(videoId: string): Promise<void> {
	const nonceResponse = await fetch('/api/generate-nonce');
	if (!nonceResponse.ok) {
		throw new Error('Failed to generate nonce');
	}
	const { nonce } = await nonceResponse.json();

	const response = await fetch(`/api/regenerate-summary?v=${videoId}&nonce=${nonce}`);
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
		throw new Error(errorData.error || 'Failed to regenerate summary');
	}

	window.location.reload();
}

/**
 * Regenerate daily summary
 */
export async function regenerateDailySummary(date?: string): Promise<void> {
	const nonceResponse = await fetch('/api/generate-nonce');
	if (!nonceResponse.ok) {
		throw new Error('Failed to generate nonce');
	}
	const { nonce } = await nonceResponse.json();

	const response = await fetch(`/api/regenerate-daily-summary`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ nonce, ...(date && { date }) })
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
		throw new Error(errorData.error || 'Failed to regenerate daily summary');
	}

	window.location.reload();
}

/**
 * Block or unblock a channel
 */
export async function toggleBlockChannel(
	channelId: string,
	channelName: string,
	isBlocked: boolean
): Promise<void> {
	if (isBlocked) {
		await removeFromBlockList(channelId);
		alert(
			`Channel "${channelName}" has been unblocked. Videos from this channel will now be processed again.`
		);
	} else {
		await addToBlockList(channelId, channelName);
		alert(
			`Channel "${channelName}" has been blocked. Videos from this channel will no longer be processed.`
		);
	}
}

/**
 * Follow or unfollow a channel
 */
export async function toggleFollowChannel(
	channelId: string,
	channelName: string,
	isFollowed: boolean,
	onSuccess?: () => void
): Promise<void> {
	const nonceResp = await fetch('/api/generate-nonce');
	if (!nonceResp.ok) throw new Error('Failed to generate nonce');
	const { nonce } = await nonceResp.json();

	const resp = await fetch('/api/follow-channel', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			nonce,
			action: isFollowed ? 'unfollow' : 'follow',
			channelId,
			channelName
		})
	});

	if (!resp.ok) {
		const err = await resp.json().catch(() => ({}));
		throw new Error(err?.error || `API error: ${resp.status}`);
	}

	onSuccess?.();
}

/**
 * Generate daily report
 */
export function generateDailyReport(date: string): void {
	const dateParam = encodeURIComponent(date);
	const url = `/daily-report?date=${dateParam}`;
	const fullUrl = window.location.origin + url;
	window.open(fullUrl, '_blank', 'noopener,noreferrer');
}
