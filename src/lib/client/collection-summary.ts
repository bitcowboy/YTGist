export interface CollectionSummary {
	title: string;
	body: string;
	keyTakeaway: string;
}

export interface CollectionSummaryResponse {
	success: boolean;
	summary: CollectionSummary;
	cached?: boolean;
	generatedAt?: string;
	isStale?: boolean;
	videoCount: number;
	totalVideos?: number;
}

export type CollectionSummaryStreamHandlers = {
	onDelta?: (delta: string) => void;
	onComplete?: (fullText: string) => void;
	onFinal?: (payload: CollectionSummaryResponse) => void;
	onPartial?: (partial: Partial<CollectionSummary>) => void;
	onError?: (message: string) => void;
};

export type CollectionSummaryStreamController = {
	close: () => void;
};

const safeParse = <T>(value: string): T | null => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};

export const openCollectionSummaryStream = async (
	collectionId: string,
	forceRegenerate: boolean = false,
	handlers: CollectionSummaryStreamHandlers = {}
): Promise<CollectionSummaryStreamController> => {
	const url = new URL(`/api/collections/${collectionId}/summary`, window.location.origin);
	
	// Use POST with stream parameter
	const response = await fetch(url.toString(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ forceRegenerate, stream: true }),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
		handlers.onError?.(errorData.message || `HTTP ${response.status}`);
		return { close: () => {} };
	}

	// Read the stream
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();

	if (!reader) {
		handlers.onError?.('No reader available');
		return { close: () => {} };
	}

	let buffer = '';
	let currentEvent = '';

	const processStream = async () => {
		try {
			let receivedFinal = false;
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					// Stream ended, if we haven't received final event, ensure onFinal is called
					if (!receivedFinal) {
						handlers.onFinal?.({ success: true, summary: null } as any);
					}
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('event: ')) {
						currentEvent = line.slice(7).trim();
					} else if (line.startsWith('data: ')) {
						const data = line.slice(6);
						try {
							const parsed = JSON.parse(data);
							
							if (currentEvent === 'summary-delta') {
								handlers.onDelta?.(parsed.delta || '');
							} else if (currentEvent === 'summary-complete') {
								// summary-complete contains { summary: bodyText }
								handlers.onComplete?.(parsed.summary || '');
							} else if (currentEvent === 'summary-partial') {
								// summary-partial contains partial summary fields
								handlers.onPartial?.(parsed);
							} else if (currentEvent === 'summary-final') {
								receivedFinal = true;
								handlers.onFinal?.(parsed);
								return;
							} else if (currentEvent === 'error') {
								handlers.onError?.(parsed.error || 'Unknown error');
								return;
							}
						} catch (e) {
							// Skip invalid JSON
						}
						// Don't reset currentEvent here - it should persist until next event or empty line
					} else if (line.trim() === '') {
						// Empty line marks end of event, reset for next event
						currentEvent = '';
					}
				}
			}
		} catch (error) {
			handlers.onError?.(error instanceof Error ? error.message : 'Stream error');
		} finally {
			reader.releaseLock();
		}
	};

	processStream();

	return {
		close: () => {
			try {
				reader.cancel();
			} catch {}
		}
	};
};

export const generateCollectionSummary = async (collectionId: string, forceRegenerate = false): Promise<CollectionSummaryResponse> => {
	try {
		const response = await fetch(`/api/collections/${collectionId}/summary`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ forceRegenerate }),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(errorData.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Failed to generate collection summary:', error);
		throw error;
	}
};

export const getCachedCollectionSummary = async (collectionId: string): Promise<CollectionSummaryResponse> => {
	try {
		const response = await fetch(`/api/collections/${collectionId}/summary`, {
			method: 'GET',
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(errorData.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Failed to get cached collection summary:', error);
		throw error;
	}
};

