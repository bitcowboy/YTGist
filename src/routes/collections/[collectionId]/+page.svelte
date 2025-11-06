<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { removeVideoFromCollection, deleteCollection, updateCollection } from '$lib/client/collections';
	import { generateCollectionSummary, getCachedCollectionSummary, openCollectionSummaryStream, type CollectionSummary } from '$lib/client/collection-summary';
	import type { Collection, CollectionVideo, SummaryData } from '$lib/types';
	import { marked } from 'marked';
	import { onMount, onDestroy } from 'svelte';

	const { data }: { data: PageData } = $props();

	let isDeletingCollection = $state(false);
	let isRemovingVideo = $state<string | null>(null);
	let isGeneratingSummary = $state(false);
	let collectionSummary = $state<CollectionSummary | null>(null);
	let summaryError = $state<string | null>(null);
	let cacheStatus = $state<{
		hasCache: boolean;
		isValid: boolean;
		isStale: boolean;
		generatedAt?: string;
	} | null>(null);
	let isVideosListCollapsed = $state(false);
	let isRenamingCollection = $state(false);
	let renameInputValue = $state('');
	let renameDescInputValue = $state('');
	let renameError = $state<string | null>(null);
	let collectionName = $state(data.collection?.name || '');
	let collectionDescription = $state(data.collection?.description || '');
	
	// YouTube players map - stores player instances
	let youtubePlayers = $state<Map<string, any>>(new Map());
	let youtubeApiReady = $state(false);
	
	// Streaming state
	let streamingText = $state<string>('');
	let partialSummary = $state<Partial<CollectionSummary>>({});
	let streamFinalized = $state<boolean>(false);
	let streamController: { close: () => void } | null = null;

	// Function to delete collection
	async function handleDeleteCollection() {
		if (!data.collection || isDeletingCollection) return;
		
		if (!confirm(`确定要删除"${collectionName}"吗？此操作无法撤销。`)) {
			return;
		}

		isDeletingCollection = true;
		
		try {
			await deleteCollection(data.collection.$id);
			goto('/collections');
		} catch (error) {
			console.error('Failed to delete collection:', error);
			alert('删除分类失败');
		} finally {
			isDeletingCollection = false;
		}
	}

	// Function to remove video from collection
	async function handleRemoveVideo(collectionId: string, videoId: string) {
		if (isRemovingVideo) return;
		
		isRemovingVideo = videoId;
		
		try {
			await removeVideoFromCollection(collectionId, videoId);
			window.location.reload();
		} catch (error) {
			console.error('Failed to remove video from collection:', error);
			alert('从分类中移除视频失败');
		} finally {
			isRemovingVideo = null;
		}
	}

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

	// Initialize cache status from server data
	if (data.summaryCacheStatus) {
		cacheStatus = data.summaryCacheStatus;
	}

	// Function to load cached summary
	async function loadCachedSummary() {
		if (!data.collection) return;
		
		try {
			const response = await getCachedCollectionSummary(data.collection.$id);
			if (response.success && response.summary) {
				collectionSummary = response.summary;
				cacheStatus = {
					hasCache: true,
					isValid: !response.isStale,
					isStale: response.isStale || false,
					generatedAt: response.generatedAt
				};
			}
		} catch (error) {
			console.error('Failed to load cached summary:', error);
		}
	}

	// Function to generate collection summary with streaming
	async function handleGenerateSummary(forceRegenerate = false) {
		if (!data.collection || isGeneratingSummary) return;
		
		isGeneratingSummary = true;
		summaryError = null;
		streamingText = '';
		partialSummary = {};
		streamFinalized = false;
		
		// Close existing stream if any
		if (streamController) {
			try {
				streamController.close();
			} catch {}
		}
		
		try {
			streamController = await openCollectionSummaryStream(data.collection.$id, forceRegenerate, {
				onDelta: (delta) => {
					if (streamFinalized) return;
					streamingText += delta;
				},
				onComplete: (full) => {
					if (streamFinalized) return;
					streamingText = full;
				},
				onPartial: (partial) => {
					if (streamFinalized) return;
					partialSummary = { ...partialSummary, ...partial };
				},
				onFinal: (response) => {
					streamFinalized = true;
					// Always reset generating state, regardless of response content
					isGeneratingSummary = false;
					
					// IMPORTANT: Save streamingText before clearing it, as body content is accumulated there
					// Handle both string and object cases (in case onComplete received wrong data)
					let savedStreamingText = '';
					if (typeof streamingText === 'string') {
						savedStreamingText = streamingText;
					} else if (typeof streamingText === 'object' && streamingText !== null) {
						// If it's an object, try to extract body field
						savedStreamingText = (streamingText as any).body || '';
					}
					
					// Prioritize streaming data over response data to ensure we use the latest generated content
					// IMPORTANT: body content should be accumulated in streamingText via summary-delta events
					const finalTitle = partialSummary?.title || response?.summary?.title || '';
					const finalBody = savedStreamingText || partialSummary?.body || response?.summary?.body || '';
					const finalKeyTakeaway = partialSummary?.keyTakeaway || response?.summary?.keyTakeaway || '';
					
					// Always update collectionSummary if we have response.summary OR if we have streaming data
					if (response?.summary) {
						// Use response.summary as base (has all required AppwriteDocument fields)
						// But override with streaming data to ensure we use the latest content
						collectionSummary = {
							...response.summary,
							// Always update with streaming data if available
							title: finalTitle || response.summary.title || '',
							body: finalBody || response.summary.body || '',
							keyTakeaway: finalKeyTakeaway || response.summary.keyTakeaway || ''
						};
						
						cacheStatus = {
							hasCache: true,
							isValid: !response.isStale,
							isStale: response.isStale || false,
							generatedAt: response.generatedAt || new Date().toISOString()
						};
					} else if (finalTitle || finalBody || finalKeyTakeaway) {
						// No response.summary, but we have streaming data - update existing
						if (collectionSummary) {
							if (finalTitle) collectionSummary.title = finalTitle;
							if (finalBody) collectionSummary.body = finalBody;
							if (finalKeyTakeaway) collectionSummary.keyTakeaway = finalKeyTakeaway;
						}
					}
					
					// Clear streaming states to avoid flicker
					streamingText = '';
					partialSummary = {};
				},
				onError: (error) => {
					console.error('Streaming error:', error);
					summaryError = error;
					isGeneratingSummary = false;
				}
			});
		} catch (error) {
			console.error('Failed to generate overview:', error);
			summaryError = error instanceof Error ? error.message : 'Failed to generate overview';
			isGeneratingSummary = false;
		}
	}

	// Load cached summary on page mount if available
	onMount(() => {
		if (data.summaryCacheStatus?.hasCache && data.summaryCacheStatus.isValid) {
			loadCachedSummary();
		}
		loadYouTubeAPI();
	});

	onDestroy(() => {
		if (streamController) {
			try {
				streamController.close();
			} catch {}
			streamController = null;
		}
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

	// Function to start renaming
	function handleStartRename() {
		if (!data.collection) return;
		isRenamingCollection = true;
		renameInputValue = collectionName;
		renameDescInputValue = collectionDescription;
		renameError = null;
	}

	// Function to cancel renaming
	function handleCancelRename() {
		isRenamingCollection = false;
		renameInputValue = '';
		renameDescInputValue = '';
		renameError = null;
	}

	// Function to save rename
	async function handleSaveRename() {
		if (!data.collection || !isRenamingCollection) return;
		
		const trimmedName = renameInputValue.trim();
		if (trimmedName.length === 0) {
			renameError = '分类名称不能为空';
			return;
		}
		
		if (trimmedName.length > 500) {
			renameError = '分类名称过长（最多500个字符）';
			return;
		}
		
		if (trimmedName === collectionName && renameDescInputValue.trim() === collectionDescription) {
			handleCancelRename();
			return;
		}
		
		renameError = null;
		const originalName = collectionName;
		const originalDesc = collectionDescription;
		
		// Optimistically update
		collectionName = trimmedName;
		collectionDescription = renameDescInputValue.trim();
		
		try {
			const updatedCollection = await updateCollection(data.collection.$id, trimmedName, renameDescInputValue.trim() || undefined);
			collectionName = updatedCollection.name;
			collectionDescription = updatedCollection.description || '';
			isRenamingCollection = false;
			renameInputValue = '';
			renameDescInputValue = '';
		} catch (error) {
			// Revert on error
			collectionName = originalName;
			collectionDescription = originalDesc;
			renameError = error instanceof Error ? error.message : '重命名分类失败';
		}
	}

	// Handle keyboard events for rename input
	function handleRenameKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSaveRename();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			handleCancelRename();
		}
	}

	// Sync collectionName when data.collection changes
	$effect(() => {
		if (data.collection) {
			collectionName = data.collection.name;
			collectionDescription = data.collection.description || '';
		}
	});
</script>

<svelte:head>
	<title>{collectionName || 'Collection'} - youtubegist</title>
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<div class="container mx-auto px-4 py-8">
		{#if !data.collection}
			<div class="text-center py-16">
				<h1 class="text-2xl font-bold text-zinc-100 mb-4">分类未找到</h1>
				<p class="text-zinc-400 mb-8">您要查找的分类不存在或已被删除。</p>
				<button
					onclick={() => goto('/collections')}
					class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					返回分类列表
				</button>
			</div>
		{:else}
			<!-- Collection Header -->
			<div class="mb-8">
				<div class="flex items-center gap-4 mb-4">
					<button
						onclick={() => goto('/collections')}
						class="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
						</svg>
						返回分类列表
					</button>
				</div>
				
				<div class="flex items-start justify-between">
					<div class="flex-1">
						{#if isRenamingCollection}
							<div class="mb-2">
								<input
									type="text"
									bind:value={renameInputValue}
									onkeydown={handleRenameKeydown}
									class="text-3xl font-bold bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full max-w-2xl mb-2"
									placeholder="分类名称"
								/>
								<textarea
									bind:value={renameDescInputValue}
									rows="2"
									class="w-full max-w-2xl bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
									placeholder="分类描述（可选）"
								></textarea>
								{#if renameError}
									<p class="mt-1 text-sm text-red-400">{renameError}</p>
								{/if}
								<div class="flex items-center gap-2 mt-2">
									<button
										onclick={handleSaveRename}
										class="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
										保存
									</button>
									<button
										onclick={handleCancelRename}
										class="flex items-center gap-1 rounded-lg border border-zinc-600 bg-zinc-800/50 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
										取消
									</button>
								</div>
							</div>
						{:else}
							<div class="flex items-center gap-3 mb-2">
								<h1 class="text-3xl font-bold text-zinc-100">{collectionName}</h1>
								<button
									onclick={handleStartRename}
									class="flex items-center gap-1 rounded-lg border border-zinc-600 bg-zinc-800/50 px-2 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
									title="重命名分类"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
								</button>
							</div>
						{/if}
						{#if collectionDescription}
							<p class="text-zinc-400 mb-2">{collectionDescription}</p>
						{/if}
						<p class="text-zinc-400">
							创建于 {formatDate(data.collection.createdAt)} • {data.videos.length} 个视频
						</p>
					</div>
					
					<div class="flex items-center gap-3">
						<button
							onclick={handleDeleteCollection}
							disabled={isDeletingCollection}
							class="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
							{isDeletingCollection ? '删除中...' : '删除分类'}
						</button>
					</div>
				</div>
			</div>

			<!-- Adaptive Split Layout -->
			<div class="flex flex-col lg:flex-row gap-6">
				{#if !isVideosListCollapsed}
					<!-- Left Panel: Videos List -->
					<div class="w-full lg:w-[30%]">
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
						
						<div class="pr-2">
							{#if data.videos.length === 0}
								<div class="text-center py-16">
									<svg class="mx-auto h-12 w-12 text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
									</svg>
									<h3 class="text-lg font-medium text-zinc-300 mb-2">这个分类中没有视频</h3>
									<p class="text-zinc-500 mb-6">从视频页面使用收藏功能添加视频到此分类。</p>
									<button
										onclick={() => goto('/')}
										class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
										</svg>
										浏览视频
									</button>
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
															{video.summary?.title || `Video ${video.videoId}`}
														</button>
														{#if video.summary}
															<div class="flex items-center gap-2 text-xs text-zinc-400 mb-1">
																<span>{video.summary.author}</span>
																<span>•</span>
																<span>添加于 {formatDate(video.addedAt)}</span>
															</div>
														{/if}
													</div>
													<div class="flex items-center gap-1">
														<button
															onclick={() => handleRemoveVideo(data.collection!.$id, video.videoId)}
															disabled={isRemovingVideo === video.videoId}
															class="flex items-center justify-center rounded border border-zinc-600 bg-transparent p-1.5 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-red-400 hover:border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
															title={isRemovingVideo === video.videoId ? '移除中...' : '从分类中移除'}
														>
															<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
															</svg>
														</button>
													</div>
												</div>
												<div class="relative w-full" style="padding-bottom: 56.25%;">
													<iframe
														id={iframeId}
														src={`https://www.youtube.com/embed/${video.videoId}?enablejsapi=1`}
														class="absolute top-0 left-0 w-full h-full rounded-lg border-0"
														allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
														allowfullscreen
														title={video.summary?.title || `Video ${video.videoId}`}
														onload={() => {
															// Initialize player after iframe loads
															setTimeout(() => {
																initYouTubePlayer(video.videoId, iframeId);
															}, 500);
														}}
													></iframe>
												</div>
												{#if video.summary?.keyTakeaway}
													<div class="text-xs text-justify font-bold text-zinc-500 line-clamp-2">
														{@html parseMarkdown(video.summary.keyTakeaway)}
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Right Panel: AI Summary (70% when expanded, 100% when collapsed) -->
				<div class="{isVideosListCollapsed ? 'w-full' : 'w-full lg:w-[70%]'}">
					{#if isVideosListCollapsed}
						<div class="flex items-center justify-between mb-4">
							<div class="flex items-center gap-3">
								<h2 class="text-xl font-semibold text-zinc-100">概览</h2>
								<button
									onclick={() => isVideosListCollapsed = !isVideosListCollapsed}
									class="flex items-center gap-1 rounded-lg border border-zinc-600 bg-transparent px-2 py-1 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
									title="显示视频列表"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
									</svg>
									显示视频 ({data.videos.length})
								</button>
								{#if cacheStatus?.hasCache}
									<div class="flex items-center gap-2">
										{#if cacheStatus.isStale}
											<span class="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-1 text-xs font-medium text-yellow-400">
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
												</svg>
												缓存过期
											</span>
										{:else if cacheStatus.isValid}
											<span class="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs font-medium text-green-400">
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
												已缓存
											</span>
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<button
									onclick={() => handleGenerateSummary(collectionSummary ? true : false)}
									disabled={isGeneratingSummary || data.videos.length === 0}
									class="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{#if isGeneratingSummary}
										<svg class="h-4 w-4 animate-spin [animation-direction:reverse]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
										</svg>
										生成中...
									{:else}
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
										</svg>
										{collectionSummary ? '重新生成' : '生成概览'}
									{/if}
								</button>
							</div>
						</div>
					{:else}
						<div class="flex items-center justify-between mb-4">
							<div class="flex items-center gap-3">
								<h2 class="text-xl font-semibold text-zinc-100">概览</h2>
								{#if cacheStatus?.hasCache}
									<div class="flex items-center gap-2">
										{#if cacheStatus.isStale}
											<span class="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-1 text-xs font-medium text-yellow-400">
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
												</svg>
												缓存过期
											</span>
										{:else if cacheStatus.isValid}
											<span class="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs font-medium text-green-400">
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
												已缓存
											</span>
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<button
									onclick={() => handleGenerateSummary(collectionSummary ? true : false)}
									disabled={isGeneratingSummary || data.videos.length === 0}
									class="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{#if isGeneratingSummary}
										<svg class="h-4 w-4 animate-spin [animation-direction:reverse]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
										</svg>
										生成中...
									{:else}
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
										</svg>
										{collectionSummary ? '重新生成' : '生成概览'}
									{/if}
								</button>
							</div>
						</div>
					{/if}
					
					<div class="bg-zinc-900/50 rounded-lg p-6">
						{#if isGeneratingSummary}
							{#if streamingText || partialSummary.title || partialSummary.keyTakeaway || partialSummary.body}
								<!-- Show streaming content -->
								<div class="space-y-6">
									<!-- Title -->
									{#if partialSummary.title || streamingText}
										<div class="text-center">
											<h1 class="text-2xl font-bold text-zinc-100 mb-2 font-serif">
												{partialSummary.title || '生成中...'}
											</h1>
										</div>
									{/if}
									
									<!-- Key Takeaway -->
									{#if partialSummary.keyTakeaway}
										<div class="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 p-6 shadow-lg relative overflow-hidden">
											<div class="absolute top-0 left-1 text-blue-200/10 text-[160px] font-serif leading-none select-none pointer-events-none">
												"
											</div>
											<div class="text-base text-justify leading-relaxed text-blue-50 relative z-10 pt-4 pl-5 pr-3 font-serif">
												{@html parseMarkdown(partialSummary.keyTakeaway)}
											</div>
										</div>
									{/if}
									
									<!-- Body (streaming text) -->
									{#if streamingText || partialSummary.body}
										<div class="rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-6 transition-all duration-200 hover:bg-zinc-900/70">
											<div class="text-base text-justify prose prose-lg prose-invert prose-zinc max-w-none leading-relaxed text-zinc-300 font-serif">
												{@html parseMarkdown(partialSummary.body || streamingText)}
											</div>
										</div>
									{/if}
								</div>
							{:else}
								<!-- Loading state -->
								<div class="flex items-center justify-center py-16">
									<div class="text-center">
										<svg class="mx-auto h-12 w-12 text-purple-400 animate-spin [animation-direction:reverse] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
										</svg>
										<h3 class="text-lg font-medium text-zinc-300 mb-2">正在生成概览</h3>
										<p class="text-zinc-500">分析所有视频字幕中...</p>
									</div>
								</div>
							{/if}
						{:else if summaryError}
							<div class="text-center py-16">
								<svg class="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<h3 class="text-lg font-medium text-zinc-300 mb-2">生成概览失败</h3>
								<p class="text-zinc-500 mb-4">{summaryError}</p>
								<button
									onclick={() => handleGenerateSummary(false)}
									class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
								>
									重试
								</button>
							</div>
						{:else if collectionSummary}
							<div class="space-y-6">
								<!-- Title -->
								<div class="text-center">
									<h1 class="text-2xl font-bold text-zinc-100 mb-2 font-serif">{collectionSummary.title}</h1>
								</div>
								
								<!-- Key Takeaway (like watch page) -->
								<div class="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 p-6 shadow-lg relative overflow-hidden">
									<!-- Background quote -->
									<div class="absolute top-0 left-1 text-blue-200/10 text-[160px] font-serif leading-none select-none pointer-events-none">
										"
									</div>
									<div class="text-base text-justify leading-relaxed font-light text-blue-50 relative z-10 pt-4 pl-5 pr-3 font-serif">
										{@html parseMarkdown(collectionSummary.keyTakeaway)}
									</div>
								</div>
								
								<!-- Body -->
								<div class="rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-6 transition-all duration-200 hover:bg-zinc-900/70">
									<div class="text-base text-justify prose prose-lg prose-invert prose-zinc max-w-none leading-relaxed text-zinc-300 font-serif">
										{@html parseMarkdown(collectionSummary.body)}
									</div>
								</div>
							</div>
						{:else}
							<div class="text-center py-16">
								<svg class="mx-auto h-12 w-12 text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
								</svg>
								<h3 class="text-lg font-medium text-zinc-300 mb-2">AI 概览</h3>
								<p class="text-zinc-500 mb-6">生成此分类中所有视频字幕的综合分析。</p>
								<button
									onclick={() => handleGenerateSummary(false)}
									disabled={data.videos.length === 0}
									class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
									</svg>
									生成概览
								</button>
							</div>
						{/if}
					</div>
				</div>
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
</style>
