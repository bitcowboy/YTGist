<script lang="ts">
	import { onMount } from 'svelte';
	import type { SummaryData } from '$lib/types';
	import { fetchWithNonce } from '$lib/client/nonce';

	import Tags from '$lib/components/summary/tags.svelte';
	import KeyTakeaway from '$lib/components/summary/key-takeway.svelte';
	import Divider from '$lib/components/shared/divider.svelte';
	import KeyPoints from '$lib/components/summary/key-points.svelte';
	import Summary from '$lib/components/summary/summary.svelte';
	import VideoInfo from '$lib/components/summary/video-info.svelte';
	import Skeletons from '$lib/components/summary/skeletons.svelte';
	import ErrorAndRefresh from '$lib/components/summary/error-and-refresh.svelte';
	import NoSubtitles from '$lib/components/summary/no-subtitles.svelte';
	import FloatingLoadingIndicator from '$lib/components/summary/floating-loading-indicator.svelte';

	const { data } = $props();

	let summaryData = $state<SummaryData | null>(data.summaryData);
	let error = $state<string | null>(null);
	let isNoSubtitlesError = $state<boolean>(false);
	let videoTitle = $state<string | null>(null);
	let videoId = $state<string | null>(null);

	let loading = $derived(!summaryData && !error);

	onMount(() => {
		if (!summaryData) {
			const urlVideoId = new URLSearchParams(window.location.search).get('v');
			if (!urlVideoId) {
				error = 'No video ID found in the URL. Please make sure the URL is correct.';
				return;
			}
			
			// Store videoId for use in components
			videoId = urlVideoId;

			fetchWithNonce(`/api/get-summary?v=${urlVideoId}`)
				.then(async (res) => {
					if (!res.ok) {
						// Try to get a more specific error message from the API response
						const errorData = await res.json().catch(() => ({ error: res.text() }));
						const errorText = errorData?.error;
						
						// Check if it's a no subtitles error
						if (res.status === 404 && errorText === 'NO_SUBTITLES_AVAILABLE') {
							isNoSubtitlesError = true;
							error = 'NO_SUBTITLES_AVAILABLE';
							// Try to get video title for better UX
							try {
								const videoDataRes = await fetch(`/api/get-video-data?v=${urlVideoId}`);
								if (videoDataRes.ok) {
									const videoData = await videoDataRes.json();
									videoTitle = videoData.title;
								}
							} catch (e) {
								console.warn('Failed to get video title:', e);
							}
							return;
						}
						
						throw new Error(
							errorText || `The server responded with status ${res.status}. Please try again.`
						);
					}
					return res.json();
				})
				.then((data: SummaryData) => {
					if (data) {
						summaryData = data;
						error = null; // Clear previous errors on success
						isNoSubtitlesError = false;
					}
				})
				.catch((err: Error) => {
					console.error('Failed to fetch summary:', err);
					
					// Check if it's a no subtitles error
					if (err.message === 'NO_SUBTITLES_AVAILABLE') {
						isNoSubtitlesError = true;
						error = 'NO_SUBTITLES_AVAILABLE';
					} else {
						error =
							err.message ||
							'An unknown error occurred. The video might be private or the summary could not be generated.';
						isNoSubtitlesError = false;
					}
				});
		}
	});
</script>

<svelte:head>
	{#if summaryData}
		<title>{summaryData.title} - youtubegist</title>
		<meta name="title" content={`${summaryData.title} - youtubegist`} />
		<meta name="og:title" content={`${summaryData.title} - youtubegist`} />
	{/if}
</svelte:head>

{#if loading}
	<FloatingLoadingIndicator />
	<Skeletons />
{:else if error && isNoSubtitlesError}
	<NoSubtitles videoTitle={videoTitle} videoId={videoId} />
{:else if error}
	<ErrorAndRefresh {error} />
{:else if summaryData}
	<div class="container mx-auto max-w-3xl px-4 py-4">
		<div class="space-y-4">
			<!-- VideoInfo {summaryData} -->
			<KeyTakeaway {summaryData} />
			<!-- <Divider /> -->
			<Summary {summaryData} />
			<!-- <Divider /> -->
			<KeyPoints {summaryData} />
			<!-- <Divider /> -->
			<!-- <Tags {summaryData} /> -->
		</div>
	</div>
{/if}
