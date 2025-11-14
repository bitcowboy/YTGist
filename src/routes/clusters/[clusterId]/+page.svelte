<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import type { Cluster, SummaryData } from '$lib/types';
	import { marked } from 'marked';
	import { onMount, onDestroy } from 'svelte';

	const { data }: { data: PageData } = $props();

	// YouTube players map - stores player instances
	let youtubePlayers = $state<Map<string, any>>(new Map());
	let youtubeApiReady = $state(false);
	let isVideosListCollapsed = $state(false);

	// Function to navigate to video
	function goToVideo(videoId: string) {
		window.open(`/watch?v=${videoId}`, '_blank');
	}

	// Load YouTube IFrame API
	function loadYouTubeAPI() {
		if (typeof window === 'undefined' || youtubeApiReady) return;
		
		// Check if API is already loaded
		if ((window as any).YT && (window as any).YT.Player) {
			youtubeApiReady = true;
			return;
		}

		// Check if script is already being loaded
		if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
			// Wait for API to be ready (max 10 seconds)
			let attempts = 0;
			const checkInterval = setInterval(() => {
				attempts++;
				if ((window as any).YT && (window as any).YT.Player) {
					youtubeApiReady = true;
					clearInterval(checkInterval);
				} else if (attempts > 100) {
					// Timeout after 10 seconds
					clearInterval(checkInterval);
				}
			}, 100);
			return;
		}

		// Create and load script
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';
		const firstScriptTag = document.getElementsByTagName('script')[0];
		firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

		// Set callback for when API is ready
		(window as any).onYouTubeIframeAPIReady = () => {
			youtubeApiReady = true;
		};
	}

	// Initialize YouTube player for an iframe
	function initYouTubePlayer(videoId: string, iframeId: string) {
		if (!youtubeApiReady) {
			// Retry after API is ready (max 10 seconds)
			let attempts = 0;
			const checkReady = setInterval(() => {
				attempts++;
				if (youtubeApiReady && (window as any).YT) {
					clearInterval(checkReady);
					initYouTubePlayer(videoId, iframeId);
				} else if (attempts > 100) {
					// Timeout after 10 seconds
					clearInterval(checkReady);
				}
			}, 100);
			return;
		}

		// Check if iframe exists
		const iframeElement = document.getElementById(iframeId);
		if (!iframeElement) {
			return;
		}

		// Use iframeId as key for player instance
		const playerKey = iframeId;
		
		// Don't initialize if player already exists for this iframe
		if (youtubePlayers.has(playerKey)) {
			return;
		}

		try {
			const player = new (window as any).YT.Player(iframeId, {
				events: {
					onReady: (event: any) => {
						// Store player instance only after it's ready
						const readyPlayer = event.target;
						youtubePlayers.set(playerKey, readyPlayer);
					},
					onStateChange: (event: any) => {
						// State 1 = playing
						if (event.data === 1) {
							// Ensure current player is in the map
							const currentPlayer = event.target;
							if (!youtubePlayers.has(playerKey)) {
								youtubePlayers.set(playerKey, currentPlayer);
							}
							
							// Pause all other players
							youtubePlayers.forEach((p, key) => {
								if (key !== playerKey && p) {
									try {
										// Check if player is still valid and has pauseVideo method
										if (p.pauseVideo && typeof p.pauseVideo === 'function') {
											p.pauseVideo();
										}
									} catch (e) {
										// Player might be destroyed, remove from map
										youtubePlayers.delete(key);
									}
								}
							});
						}
					}
				}
			});
		} catch (error) {
			console.error('Error initializing YouTube player:', error);
		}
	}

	// Format date
	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Function to parse markdown (synchronous)
	function parseMarkdown(text: string | undefined | null): string {
		if (!text || typeof text !== 'string') {
			return '';
		}
		return marked.parse(text, {
			breaks: true,
			gfm: true
		}) as string;
	}

	onMount(() => {
		loadYouTubeAPI();
	});

	onDestroy(() => {
		// Cleanup YouTube players
		youtubePlayers.forEach((player, key) => {
			try {
				if (player && player.destroy && typeof player.destroy === 'function') {
					player.destroy();
				}
			} catch (e) {
				// Ignore cleanup errors
			}
		});
		youtubePlayers.clear();
	});
</script>

<svelte:head>
	<title>{data.cluster?.name || 'Cluster'} - youtubegist</title>
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<div class="container mx-auto px-4 py-8">
		{#if !data.cluster}
			<div class="text-center py-16">
				<h1 class="text-2xl font-bold text-zinc-100 mb-4">聚类未找到</h1>
				<p class="text-zinc-400 mb-8">您要查找的聚类不存在或已被删除。</p>
				<button
					onclick={() => goto('/clusters')}
					class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					返回聚类列表
				</button>
			</div>
		{:else}
			<!-- Cluster Header -->
			<div class="mb-8">
				<div class="flex items-center gap-4 mb-4">
					<button
						onclick={() => goto('/clusters')}
						class="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
						</svg>
						返回聚类列表
					</button>
				</div>
				
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h1 class="text-3xl font-bold text-zinc-100 mb-2">{data.cluster.name}</h1>
						{#if data.cluster.description}
							<p class="text-zinc-400 mb-2">{data.cluster.description}</p>
						{/if}
						<p class="text-zinc-400">
							创建于 {formatDate(data.cluster.createdAt)} • {data.videos.length} 个视频
						</p>
					</div>
				</div>
			</div>

			<!-- Videos List -->
			<div class="mb-8">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-xl font-semibold text-zinc-100">视频 ({data.videos.length})</h2>
					<button
						onclick={() => isVideosListCollapsed = !isVideosListCollapsed}
						class="flex items-center gap-1 rounded-lg border border-zinc-600 bg-transparent px-2 py-1 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
						title={isVideosListCollapsed ? '展开视频列表' : '折叠视频列表'}
					>
						<svg class="h-4 w-4 transition-transform {isVideosListCollapsed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
						{isVideosListCollapsed ? '显示' : '隐藏'}
					</button>
				</div>
				
				{#if !isVideosListCollapsed}
					<div class="pr-2">
						{#if data.videos.length === 0}
							<div class="text-center py-16">
								<svg class="mx-auto h-12 w-12 text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
								<h3 class="text-lg font-medium text-zinc-300 mb-2">这个聚类中没有视频</h3>
							</div>
						{:else}
							<div class="space-y-3">
								{#each data.videos as video, index}
									{@const iframeId = `yt-player-${video.videoId}-${index}`}
									<div class="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition-colors hover:bg-zinc-800/50">
										<div class="space-y-3">
											<div class="flex items-start justify-between gap-3 mb-2">
												<div class="flex-1 min-w-0">
													<button
														type="button"
														onclick={() => goToVideo(video.videoId)}
														class="text-sm font-semibold text-zinc-100 mb-1 line-clamp-2 cursor-pointer hover:text-purple-400 transition-colors text-left w-full bg-transparent border-0 p-0"
														title="点击在YouTube打开"
													>
														{video.title || `Video ${video.videoId}`}
													</button>
													{#if video.author}
														<div class="flex items-center gap-2 text-xs text-zinc-400 mb-1">
															<span>{video.author}</span>
														</div>
													{/if}
												</div>
											</div>
											<div class="relative w-full" style="padding-bottom: 56.25%;">
												<iframe
													id={iframeId}
													src={`https://www.youtube.com/embed/${video.videoId}?enablejsapi=1`}
													class="absolute top-0 left-0 w-full h-full rounded-lg border-0"
													allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
													allowfullscreen
													title={video.title || `Video ${video.videoId}`}
													onload={() => {
														// Initialize player after iframe loads
														setTimeout(() => {
															initYouTubePlayer(video.videoId, iframeId);
														}, 500);
													}}
												></iframe>
											</div>
											{#if video.keyTakeaway}
												<div class="text-xs text-justify font-bold text-zinc-500 line-clamp-2">
													{@html parseMarkdown(video.keyTakeaway)}
												</div>
											{/if}
											{#if video.summary}
												<div class="text-xs text-zinc-400 line-clamp-3">
													{video.summary}
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-clamp: 2;
	}
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-clamp: 3;
	}
</style>

