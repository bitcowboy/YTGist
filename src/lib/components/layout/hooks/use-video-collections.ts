import { page } from '$app/state';
import { fetchVideoCollections } from '$lib/client/collections';
import type { Collection } from '$lib/types';

export function useVideoCollections() {
	let videoCollections = $state<Collection[]>([]);
	let lastCheckedVideoId: string | null = null;
	let isCheckingCollections = false;
	let effectRunCount = 0;

	// Use $derived to extract videoId and platform
	const derivedVideoId = $derived(page.url.searchParams.get('v'));
	const derivedPathname = $derived(page.url.pathname);
	const derivedPlatform = $derived(page.url.searchParams.get('platform') || undefined);
	const isVideoPage = $derived(derivedPathname === '/watch' && derivedVideoId !== null);

	// Check collections when video page loads or video changes
	$effect(() => {
		effectRunCount++;
		const runId = effectRunCount;

		const videoId = derivedVideoId;
		const pathname = derivedPathname;
		const platform = derivedPlatform;
		const isVideo = isVideoPage;

		console.log(`[useVideoCollections] $effect triggered #${runId}:`, {
			videoId,
			pathname,
			platform,
			isVideoPage: isVideo,
			lastCheckedVideoId,
			isCheckingCollections
		});

		// Skip if we already checked this videoId
		if (isVideo && videoId && videoId === lastCheckedVideoId) {
			console.log(`[useVideoCollections] #${runId} Skipping duplicate check for videoId:`, videoId);
			return;
		}

		// Prevent concurrent checks
		if (isCheckingCollections) {
			console.log(`[useVideoCollections] #${runId} Check already in progress, skipping`);
			return;
		}

		if (isVideo && videoId) {
			const previousVideoId = lastCheckedVideoId;
			lastCheckedVideoId = videoId;
			isCheckingCollections = true;

			let cancelled = false;
			const currentVideoIdForCheck = videoId;

			const timeoutId = setTimeout(() => {
				if (!cancelled) {
					fetchVideoCollections(currentVideoIdForCheck, platform)
						.then((collections) => {
							if (!cancelled && lastCheckedVideoId === currentVideoIdForCheck) {
								videoCollections = collections;
							}
						})
						.catch((error) => {
							if (!cancelled) {
								console.error(
									`[useVideoCollections] #${runId} Failed to check video collections:`,
									error
								);
								if (lastCheckedVideoId === currentVideoIdForCheck) {
									videoCollections = [];
								}
							}
						})
						.finally(() => {
							if (!cancelled) {
								isCheckingCollections = false;
							}
						});
				} else {
					isCheckingCollections = false;
				}
			}, 100);

			return () => {
				console.log(
					`[useVideoCollections] #${runId} Cleaning up effect for videoId:`,
					currentVideoIdForCheck
				);
				cancelled = true;
				isCheckingCollections = false;
				clearTimeout(timeoutId);
			};
		} else {
			if (pathname !== '/watch' && lastCheckedVideoId !== null) {
				console.log(`[useVideoCollections] #${runId} Left video page, resetting collections`);
				lastCheckedVideoId = null;
				isCheckingCollections = false;
				videoCollections = [];
			}
		}
	});

	const refreshCollections = async (videoId: string, platform?: string) => {
		videoCollections = await fetchVideoCollections(videoId, platform);
	};

	return {
		get videoCollections() {
			return videoCollections;
		},
		refreshCollections
	};
}
