import { fetchNonce } from '$lib/client/nonce';
import type { SummaryData } from '$lib/types';

export type SummaryStreamHandlers = {
	onDelta?: (delta: string) => void;
	onComplete?: (fullSummary: string) => void;
	onFinal?: (payload: SummaryData) => void;
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
	handlers: SummaryStreamHandlers = {}
): Promise<SummaryStreamController> => {
	const nonce = await fetchNonce();
	const url = new URL('/api/get-summary', window.location.origin);
	url.searchParams.set('v', videoId);
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
		const payload = safeParse<SummaryData>(message.data ?? '');
		if (payload) {
			handlers.onFinal?.(payload);
		}
		close();
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



