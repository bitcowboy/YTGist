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
	import ChannelBlocked from '$lib/components/summary/channel-blocked.svelte';
	import FloatingLoadingIndicator from '$lib/components/summary/floating-loading-indicator.svelte';
	import InlineChat from '$lib/components/chat/inline-chat.svelte';
	import CommentsSummary from '$lib/components/summary/comments-summary.svelte';
	import CommentsKeyPoints from '$lib/components/summary/comments-key-points.svelte';
import { addTodayHistoryEntry } from '$lib/client/today-history';

	const { data } = $props();

	let summaryData = $state<SummaryData | null>(data.summaryData);
	let error = $state<string | null>(null);
	let isNoSubtitlesError = $state<boolean>(false);
	let videoTitle = $state<string | null>(null);
	let videoId = $state<string | null>(null);

	let loading = $derived(!summaryData && !error);

onMount(() => {
    // 如果服务端已返回占位记录且标记为无字幕，直接显示无字幕页
    if (summaryData && (summaryData as any).hasSubtitles === false) {
        isNoSubtitlesError = true;
        error = 'NO_SUBTITLES_AVAILABLE';
        videoTitle = summaryData.title;
        const urlVideoId = new URLSearchParams(window.location.search).get('v');
        if (urlVideoId) {
            videoId = urlVideoId;
        }
        
        // 发送频道信息给navbar，即使没有字幕
        if (summaryData.author && summaryData.channelId) {
            window.dispatchEvent(new CustomEvent('yg:channelInfo', { 
                detail: { channelId: summaryData.channelId, channelName: summaryData.author } 
            }));
        }
        return;
    }

    // 服务端已经处理了block检查，这里不需要客户端检查


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
						let errorText;
						let responseText;
						try {
							responseText = await res.text();
							console.log('Raw response text:', responseText);
							
							// Try to parse as JSON
							try {
								const errorData = JSON.parse(responseText);
								errorText = errorData?.error || errorData?.message || errorData;
								console.log('API Error (JSON):', {
									status: res.status,
									errorText: errorText,
									errorData: errorData
								});
							} catch (jsonError) {
								// If JSON parsing fails, use the text directly
								errorText = responseText;
								console.log('API Error (Text):', {
									status: res.status,
									errorText: errorText
								});
							}
						} catch (textError) {
							errorText = `HTTP ${res.status}`;
							console.log('API Error (Status only):', {
								status: res.status,
								errorText: errorText
							});
						}
						
						// Check if it's a channel blocked error
						if (res.status === 403 && (errorText === 'CHANNEL_BLOCKED' || responseText === 'CHANNEL_BLOCKED')) {
							console.log('Channel blocked detected, setting error state');
							error = 'CHANNEL_BLOCKED';
							videoId = urlVideoId;
							// Try to get video data for better UX
							try {
								const videoDataRes = await fetch(`/api/get-video-data?v=${urlVideoId}`);
								if (videoDataRes.ok) {
									const videoData = await videoDataRes.json();
									videoTitle = videoData.title;
									// 发送频道信息给navbar
									if (videoData.author && videoData.channelId) {
										window.dispatchEvent(new CustomEvent('yg:channelInfo', { 
											detail: { channelId: videoData.channelId, channelName: videoData.author } 
										}));
									}
								}
							} catch (e) {
								console.warn('Failed to get video data:', e);
							}
							// Don't throw an error, just return to prevent the catch block from executing
							return;
						}

						// Check if it's a no subtitles error
						if (res.status === 404 && errorText === 'NO_SUBTITLES_AVAILABLE') {
							isNoSubtitlesError = true;
							error = 'NO_SUBTITLES_AVAILABLE';
							// Try to get video data for better UX
							try {
								const videoDataRes = await fetch(`/api/get-video-data?v=${urlVideoId}`);
								if (videoDataRes.ok) {
									const videoData = await videoDataRes.json();
									videoTitle = videoData.title;
									// 发送频道信息给navbar，即使没有字幕
									if (videoData.author && videoData.channelId) {
										window.dispatchEvent(new CustomEvent('yg:channelInfo', { 
											detail: { channelId: videoData.channelId, channelName: videoData.author } 
										}));
									}
								}
							} catch (e) {
								console.warn('Failed to get video data:', e);
							}
							return;
						}

						// Temporary transcript failure (rate limit / network etc.)
						if (res.status === 503 && errorText === 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE') {
							isNoSubtitlesError = false;
							error = 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE';
							return;
						}
						
						// Only throw an error if we haven't handled it above
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
				// 通知导航栏按钮状态
				window.dispatchEvent(new CustomEvent('yg:hasSubtitles', { detail: { hasSubtitles: data.hasSubtitles === true } }));
				// 通知导航栏频道信息
				window.dispatchEvent(new CustomEvent('yg:channelInfo', { detail: { channelId: data.channelId, channelName: data.author } }));
				addTodayHistoryEntry(data);
			}
		})
				.catch((err: Error) => {
					console.error('Failed to fetch summary:', err);
					
					// Check if it's a channel blocked error
					if (err.message === 'CHANNEL_BLOCKED' || err.message?.includes('CHANNEL_BLOCKED')) {
						error = 'CHANNEL_BLOCKED';
						videoId = urlVideoId;
						// Try to get video data for better UX
						fetch(`/api/get-video-data?v=${urlVideoId}`)
							.then(videoDataRes => {
								if (videoDataRes.ok) {
									return videoDataRes.json();
								}
								return null;
							})
							.then(videoData => {
								if (videoData) {
									videoTitle = videoData.title;
									// 发送频道信息给navbar
									if (videoData.author && videoData.channelId) {
										window.dispatchEvent(new CustomEvent('yg:channelInfo', { 
											detail: { channelId: videoData.channelId, channelName: videoData.author } 
										}));
									}
								}
							})
							.catch(e => {
								console.warn('Failed to get video data:', e);
							});
					} else if (err.message === 'NO_SUBTITLES_AVAILABLE') {
						isNoSubtitlesError = true;
						error = 'NO_SUBTITLES_AVAILABLE';
						window.dispatchEvent(new CustomEvent('yg:hasSubtitles', { detail: { hasSubtitles: false } }));
					} else if (err.message === 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE') {
						isNoSubtitlesError = false;
						error = 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE';
						window.dispatchEvent(new CustomEvent('yg:hasSubtitles', { detail: { hasSubtitles: false } }));
					} else {
			error =
				err.message ||
				'An unknown error occurred. The video might be private or the summary could not be generated.';
			isNoSubtitlesError = false;
			window.dispatchEvent(new CustomEvent('yg:hasSubtitles', { detail: { hasSubtitles: false } }));
		}
				});
		}

	if (summaryData) {
		// 通知导航栏频道信息
		window.dispatchEvent(new CustomEvent('yg:channelInfo', { detail: { channelId: summaryData.channelId, channelName: summaryData.author } }));
		addTodayHistoryEntry(summaryData);
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
{:else if error === 'CHANNEL_BLOCKED'}
	<ChannelBlocked videoTitle={videoTitle} videoId={videoId} />
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
			<CommentsSummary {summaryData} />
			<CommentsKeyPoints {summaryData} />
			<!-- <Divider /> -->
			<!-- <Tags {summaryData} /> -->
		</div>
		
		<!-- AI Chat Section -->
		<div class="mt-8">
			<Divider />
			<div class="mt-6">
				<InlineChat 
					videoId={videoId || summaryData.videoId} 
					videoTitle={summaryData.title} 
					{summaryData} 
				/>
			</div>
		</div>
	</div>
{/if}
