<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
	import type { SummaryData } from '$lib/types';
	import { fetchWithNonce } from '$lib/client/nonce';

	import Tags from '$lib/components/summary/tags.svelte';
	import KeyTakeaway from '$lib/components/summary/key-takeway.svelte';
	import Divider from '$lib/components/shared/divider.svelte';
	import KeyPoints from '$lib/components/summary/key-points.svelte';
	import CoreTerms from '$lib/components/summary/tags.svelte';
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
import { openSummaryStream } from '$lib/client/summary-stream';

	const { data } = $props();

	let summaryData = $state<SummaryData | null>(data.summaryData);
	let error = $state<string | null>(null);
	let isNoSubtitlesError = $state<boolean>(false);
	let videoTitle = $state<string | null>(null);
	let videoId = $state<string | null>(null);

    let loading = $derived(!summaryData && !error);
    // Pure server-driven per-char streaming display
    let streamingText = $state<string>('');
    let partialKeyTakeaway = $state<string>('');
    let partialKeyPoints = $state<string[]>([]);
    let partialCoreTerms = $state<string[]>([]);
    let partialCommentsSummary = $state<string>('');
    let partialCommentsKeyPoints = $state<string[]>([]);
    let kpExpectNew = $state<boolean>(false);
    let ctExpectNew = $state<boolean>(false);
    let ckpExpectNew = $state<boolean>(false);
    let streamFinalized = $state<boolean>(false);
    let streamController: { close: () => void } | null = null;

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

            // 使用SSE进行流式获取
            (async () => {
            streamController = await openSummaryStream(urlVideoId, {
                onDelta: (delta) => {
                    if (streamFinalized) return;
                    streamingText += delta;
                },
                onComplete: (full) => {
                    if (streamFinalized) return;
                    streamingText = full;
                },
                onPartial: (partial: any) => {
                    if (streamFinalized) return;
                    const field = partial?._field;
                    const isFinal = partial?._final === true;

                    if (field === 'keyTakeaway' && typeof partial.keyTakeaway === 'string') {
                        // overwrite, finalization not needed for array logic
                        partialKeyTakeaway = partial.keyTakeaway;
                        return;
                    }

                    if (field === 'keyPoints' && Array.isArray(partial.keyPoints)) {
                        const text = partial.keyPoints[0] || '';
                        if (kpExpectNew || partialKeyPoints.length === 0) {
                            partialKeyPoints = [...partialKeyPoints, text];
                            kpExpectNew = false;
                        } else {
                            partialKeyPoints = [...partialKeyPoints.slice(0, -1), text];
                        }
                        if (isFinal) kpExpectNew = true;
                        return;
                    }

                    if (field === 'coreTerms' && Array.isArray(partial.coreTerms)) {
                        const text = partial.coreTerms[0] || '';
                        if (ctExpectNew || partialCoreTerms.length === 0) {
                            partialCoreTerms = [...partialCoreTerms, text];
                            ctExpectNew = false;
                        } else {
                            partialCoreTerms = [...partialCoreTerms.slice(0, -1), text];
                        }
                        if (isFinal) ctExpectNew = true;
                        return;
                    }

                    if (field === 'commentsSummary' && typeof partial.commentsSummary === 'string') {
                        // overwrite, finalization not needed for string logic
                        partialCommentsSummary = partial.commentsSummary;
                        return;
                    }

                    if (field === 'commentsKeyPoints' && Array.isArray(partial.commentsKeyPoints)) {
                        const text = partial.commentsKeyPoints[0] || '';
                        if (ckpExpectNew || partialCommentsKeyPoints.length === 0) {
                            partialCommentsKeyPoints = [...partialCommentsKeyPoints, text];
                            ckpExpectNew = false;
                        } else {
                            partialCommentsKeyPoints = [...partialCommentsKeyPoints.slice(0, -1), text];
                        }
                        if (isFinal) ckpExpectNew = true;
                        return;
                    }

                    // Fallback for old payloads without flags
                    if (partial.keyTakeaway) partialKeyTakeaway = partial.keyTakeaway as string;
                    if (partial.keyPoints && Array.isArray(partial.keyPoints)) partialKeyPoints = [...partialKeyPoints, ...partial.keyPoints as string[]];
                    if (partial.coreTerms && Array.isArray(partial.coreTerms)) partialCoreTerms = [...partialCoreTerms, ...partial.coreTerms as string[]];
                    if (partial.commentsSummary) partialCommentsSummary = partial.commentsSummary as string;
                    if (partial.commentsKeyPoints && Array.isArray(partial.commentsKeyPoints)) partialCommentsKeyPoints = [...partialCommentsKeyPoints, ...partial.commentsKeyPoints as string[]];
                },
                onFinal: (data) => {
                    streamFinalized = true;
                    summaryData = data;
                    error = null;
                    isNoSubtitlesError = false;
                    window.dispatchEvent(new CustomEvent('yg:hasSubtitles', { detail: { hasSubtitles: data.hasSubtitles === true } }));
                    window.dispatchEvent(new CustomEvent('yg:channelInfo', { detail: { channelId: data.channelId, channelName: data.author } }));
                    addTodayHistoryEntry(data);
                    // set streaming states to final payload to avoid flicker/blanking
                    streamingText = '';
                    partialKeyTakeaway = data.keyTakeaway || '';
                    partialKeyPoints = data.keyPoints || [];
                    partialCoreTerms = data.coreTerms || [];
                    partialCommentsSummary = data.commentsSummary || '';
                    partialCommentsKeyPoints = data.commentsKeyPoints || [];
                    kpExpectNew = false;
                    ctExpectNew = false;
                    ckpExpectNew = false;
                },
                onError: async (msg) => {
                    // 与现有错误语义对齐
                    if (msg === 'CHANNEL_BLOCKED') {
                        error = 'CHANNEL_BLOCKED';
                        videoId = urlVideoId;
                        try {
                            const videoDataRes = await fetch(`/api/get-video-data?v=${urlVideoId}`);
                            if (videoDataRes.ok) {
                                const videoData = await videoDataRes.json();
                                videoTitle = videoData.title;
                                if (videoData.author && videoData.channelId) {
                                    window.dispatchEvent(new CustomEvent('yg:channelInfo', { 
                                        detail: { channelId: videoData.channelId, channelName: videoData.author } 
                                    }));
                                }
                            }
                        } catch {}
                        return;
                    }
                    if (msg === 'NO_SUBTITLES_AVAILABLE') {
                        isNoSubtitlesError = true;
                        error = 'NO_SUBTITLES_AVAILABLE';
                        try {
                            const videoDataRes = await fetch(`/api/get-video-data?v=${urlVideoId}`);
                            if (videoDataRes.ok) {
                                const videoData = await videoDataRes.json();
                                videoTitle = videoData.title;
                                if (videoData.author && videoData.channelId) {
                                    window.dispatchEvent(new CustomEvent('yg:channelInfo', { 
                                        detail: { channelId: videoData.channelId, channelName: videoData.author } 
                                    }));
                                }
                            }
                        } catch {}
                        return;
                    }
                    if (msg === 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE') {
                        isNoSubtitlesError = false;
                        error = 'TRANSCRIPT_TEMPORARILY_UNAVAILABLE';
                        return;
                    }
                    error = msg || 'An unknown error occurred. The video might be private or the summary could not be generated.';
                    isNoSubtitlesError = false;
                    window.dispatchEvent(new CustomEvent('yg:hasSubtitles', { detail: { hasSubtitles: false } }));
                }
            });
            })();
            /* Previous non-streaming fallback retained (commented for reference)
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
            */
        }

	if (summaryData) {
		// 通知导航栏频道信息
		window.dispatchEvent(new CustomEvent('yg:channelInfo', { detail: { channelId: summaryData.channelId, channelName: summaryData.author } }));
		addTodayHistoryEntry(summaryData);
	}
	});

onDestroy(() => {
    if (streamController) {
        try { streamController.close(); } catch {}
        streamController = null;
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
    {#if streamingText && streamingText.length > 0}
        <div class="container mx-auto max-w-3xl px-4 py-4">
            <div class="space-y-4">
                <KeyTakeaway summaryData={{ ...(summaryData || {} as any), keyTakeaway: partialKeyTakeaway || '' } as any} />
                <Summary summaryData={{ ...(summaryData || {} as any) }} streamingText={streamingText} />
                {#if partialKeyPoints.length > 0}
                    <KeyPoints summaryData={{ ...(summaryData || {} as any), keyPoints: partialKeyPoints } as any} />
                {/if}
                {#if partialCoreTerms.length > 0}
                    <CoreTerms summaryData={{ ...(summaryData || {} as any), coreTerms: partialCoreTerms } as any} />
                {/if}
                {#if partialCommentsSummary && partialCommentsSummary.trim() !== ''}
                    <CommentsSummary summaryData={{ ...(summaryData || {} as any) }} streamingCommentsSummary={partialCommentsSummary} />
                {/if}
                {#if partialCommentsKeyPoints.length > 0}
                    <CommentsKeyPoints summaryData={{ ...(summaryData || {} as any) }} streamingCommentsKeyPoints={partialCommentsKeyPoints} />
                {/if}
            </div>
        </div>
    {:else}
        <FloatingLoadingIndicator />
        <Skeletons />
    {/if}
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
            <Summary {summaryData} streamingText={streamingText} />
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
