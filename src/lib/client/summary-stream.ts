import { fetchNonce } from '$lib/client/nonce';
import type { FullSummaryData, VideoPlatform } from '$lib/types';

export type SummaryStreamHandlers = {
	onDelta?: (delta: string) => void;
	onComplete?: (fullSummary: string) => void;
	onFinal?: (payload: FullSummaryData) => void;
	onPartial?: (partial: Partial<FullSummaryData>) => void;
	onError?: (message: string) => void;
};

export type SummaryStreamController = {
	close: () => void;
};

const safeParse = <T>(value: string): T | null => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};

export const openSummaryStream = async (
	videoId: string,
	platform: VideoPlatform = 'youtube',
	handlers: SummaryStreamHandlers = {},
	subtitleUrl?: string
): Promise<SummaryStreamController> => {
	const nonce = await fetchNonce();
	const url = new URL('/api/get-summary', window.location.origin);
	url.searchParams.set('v', videoId);
	if (platform !== 'youtube') {
		url.searchParams.set('platform', platform);
	}
	if (subtitleUrl) {
		url.searchParams.set('subtitle_url', subtitleUrl);
	}
	url.searchParams.set('nonce', nonce);

	const source = new EventSource(url.toString());

	const close = () => {
		source.close();
	};

	source.addEventListener('summary-delta', (event) => {
		const message = event as MessageEvent;
		const { delta } = safeParse<{ delta?: string }>(message.data ?? '') ?? {};
		if (delta) {
			handlers.onDelta?.(delta);
		}
	});

	source.addEventListener('summary-complete', (event) => {
		const message = event as MessageEvent;
		const { summary } = safeParse<{ summary?: string }>(message.data ?? '') ?? {};
		if (summary) {
			handlers.onComplete?.(summary);
		}
	});

	source.addEventListener('summary-final', (event) => {
		const message = event as MessageEvent;
		const payload = safeParse<FullSummaryData>(message.data ?? '');
		if (payload) {
			handlers.onFinal?.(payload);
		}
		close();
	});

	// Optional partial updates
	source.addEventListener('summary-partial', (event) => {
		const message = event as MessageEvent;
		const payload = safeParse<Partial<FullSummaryData>>(message.data ?? '');
		if (payload) {
			handlers.onPartial?.(payload);
		}
	});

	source.addEventListener('error', (event) => {
		const message = event as MessageEvent;
		if (typeof message.data === 'string' && message.data.length > 0) {
			const { message: errorMessage } = safeParse<{ message?: string }>(message.data) ?? {};
			handlers.onError?.(errorMessage ?? 'STREAM_FAILED');
		} else {
			handlers.onError?.('NETWORK_ERROR');
		}
		close();
	});

	return { close };
};



