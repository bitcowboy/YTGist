<script lang="ts">
	import Logo from '$lib/components/shared/logo.svelte';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import BanIcon from '@lucide/svelte/icons/ban';
import { page } from '$app/state';
import { onMount } from 'svelte';
	import { addToBlockList, removeFromBlockList, isChannelBlocked } from '$lib/client/block-list';
	import { classifyAndCollectVideo, fetchVideoCollections, removeVideoFromCollection } from '$lib/client/collections';
	import type { Collection } from '$lib/types';

let hasSubtitles = $state<boolean | null>(null);
let currentChannelId = $state<string | null>(null);
let currentChannelName = $state<string | null>(null);
let isChannelBlockedState = $state<boolean>(false);

onMount(() => {
    // Initial state from SSR if available
    const ssrHas = (page as any).data?.summaryData?.hasSubtitles;
    if (typeof ssrHas === 'boolean') hasSubtitles = ssrHas;

    // Get channel info from SSR data if available
    const ssrData = (page as any).data?.summaryData;
    if (ssrData?.author && ssrData?.channelId) {
        currentChannelName = ssrData.author;
        currentChannelId = ssrData.channelId;
        // Check if channel is blocked asynchronously
        isChannelBlocked(ssrData.channelId).then(blocked => {
            isChannelBlockedState = blocked;
        });
    }

    const handler = (e: Event) => {
        try {
            const detail = (e as CustomEvent).detail as { hasSubtitles: boolean };
            if (typeof detail?.hasSubtitles === 'boolean') {
                hasSubtitles = detail.hasSubtitles;
            }
        } catch {}
    };
    
    const blockListHandler = (e: Event) => {
        try {
            const detail = (e as CustomEvent).detail as { action: string; channel?: any; channelId?: string };
            if (detail.action === 'added' && detail.channel?.channelId === currentChannelId) {
                isChannelBlockedState = true;
            } else if (detail.action === 'removed' && detail.channelId === currentChannelId) {
                isChannelBlockedState = false;
            }
        } catch {}
    };

    const channelInfoHandler = (e: Event) => {
        try {
            const detail = (e as CustomEvent).detail as { channelId: string; channelName: string };
            if (detail.channelId && detail.channelName) {
                currentChannelId = detail.channelId;
                currentChannelName = detail.channelName;
                // Check if channel is blocked asynchronously
                isChannelBlocked(detail.channelId).then(blocked => {
                    isChannelBlockedState = blocked;
                });
            }
        } catch {}
    };

    window.addEventListener('yg:hasSubtitles', handler as EventListener);
    window.addEventListener('yg:blockListUpdated', blockListHandler as EventListener);
    window.addEventListener('yg:channelInfo', channelInfoHandler as EventListener);
    
    // Handle click outside collection dropdown
    document.addEventListener('click', handleCollectionDropdownClick);
    
    return () => {
        window.removeEventListener('yg:hasSubtitles', handler as EventListener);
        document.removeEventListener('click', handleCollectionDropdownClick);
        window.removeEventListener('yg:blockListUpdated', blockListHandler as EventListener);
        window.removeEventListener('yg:channelInfo', channelInfoHandler as EventListener);
    };
});

	// Helper function to determine if a route is active
	function isActiveRoute(route: string): boolean {
		return page.url.pathname === route;
	}

	// Check if we're on a video page with a video ID
	let showDownloadButton = $derived(() => {
		const url = page.url;
		return url.pathname === '/watch' && url.searchParams.has('v');
	});

	// Check if we're on a video page to show regenerate button
	let showRegenerateButton = $derived(() => {
		const url = page.url;
		return url.pathname === '/watch' && url.searchParams.has('v');
	});

	// Check if we're on a video page to show block button
	let showBlockButton = $derived(() => {
		const url = page.url;
		return url.pathname === '/watch' && url.searchParams.has('v');
	});

	// State for regenerate button
	let isRegenerating = $state(false);
	
	// State for download button
	let isDownloading = $state(false);

	// State for block button
	let isBlocking = $state(false);

	// State for collect button
	let isCollecting = $state(false);
	let collectSuccess = $state(false);
	let showCollectionDropdown = $state(false);
	let videoCollections = $state<Collection[]>([]);
	let isRemovingFromCollection = $state<string | null>(null);

	// Function to download formatted transcript
	async function downloadTranscript() {
		const videoId = page.url.searchParams.get('v');
		if (!videoId || isDownloading) return;

		isDownloading = true;
		
		try {
			const response = await fetch(`/api/download-transcript?v=${videoId}&format=formatted`);
			if (!response.ok) {
				throw new Error('Failed to download transcript');
			}
			
			// Get filename from Content-Disposition header
			const contentDisposition = response.headers.get('Content-Disposition');
			let filename = `formatted-transcript-${videoId}.md`; // fallback filename
			
			if (contentDisposition) {
				// Try to get UTF-8 filename first (filename*=UTF-8''...)
				const utf8FilenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
				if (utf8FilenameMatch) {
					try {
						filename = decodeURIComponent(utf8FilenameMatch[1]);
					} catch (e) {
						console.warn('Failed to decode UTF-8 filename, using fallback');
					}
				} else {
					// Fallback to regular filename
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
		} catch (error) {
			console.error('Error downloading transcript:', error);
			alert('Failed to download transcript. Please try again.');
		} finally {
			isDownloading = false;
		}
	}

	// Function to regenerate summary
	async function regenerateSummary() {
		const videoId = page.url.searchParams.get('v');
		if (!videoId || isRegenerating) return;

		isRegenerating = true;
		
		try {
			// Get a new nonce for the request
			const nonceResponse = await fetch('/api/generate-nonce');
			if (!nonceResponse.ok) {
				throw new Error('Failed to generate nonce');
			}
			const { nonce } = await nonceResponse.json();

			// Call the regenerate API
			const response = await fetch(`/api/regenerate-summary?v=${videoId}&nonce=${nonce}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(errorData.error || 'Failed to regenerate summary');
			}

			// Reload the page to show the new summary
			window.location.reload();
		} catch (error) {
			console.error('Error regenerating summary:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			alert(`Failed to regenerate summary: ${errorMessage}`);
		} finally {
			isRegenerating = false;
		}
	}

	// Function to block/unblock channel
	async function blockChannel() {
		if (!currentChannelId || !currentChannelName || isBlocking) return;

		isBlocking = true;
		
		try {
			if (isChannelBlockedState) {
				// Unblock channel
				await removeFromBlockList(currentChannelId);
				alert(`Channel "${currentChannelName}" has been unblocked. Videos from this channel will now be processed again.`);
			} else {
				// Block channel
				await addToBlockList(currentChannelId, currentChannelName);
				alert(`Channel "${currentChannelName}" has been blocked. Videos from this channel will no longer be processed.`);
			}
		} catch (error) {
			console.error('Error toggling channel block status:', error);
			alert(`Failed to ${isChannelBlockedState ? 'unblock' : 'block'} channel. Please try again.`);
		} finally {
			isBlocking = false;
		}
	}

	// Function to check if video is collected and load collections
	async function checkVideoCollections() {
		const videoId = page.url.searchParams.get('v');
		if (!videoId) return;
		
		try {
			const collections = await fetchVideoCollections(videoId);
			videoCollections = collections;
		} catch (error) {
			console.error('Failed to fetch video collections:', error);
			videoCollections = [];
		}
	}

	// Function to toggle collection dropdown
	async function toggleCollectionDropdown() {
		if (showCollectionDropdown) {
			showCollectionDropdown = false;
			return;
		}
		
		const videoId = page.url.searchParams.get('v');
		if (!videoId) return;
		
		// Load collections before showing dropdown
		await checkVideoCollections();
		showCollectionDropdown = true;
	}

	// Function to handle click outside dropdown
	function handleCollectionDropdownClick(event: MouseEvent) {
		if (showCollectionDropdown) {
			const target = event.target as HTMLElement;
			const dropdown = target.closest('.relative');
			if (!dropdown) {
				showCollectionDropdown = false;
			}
		}
	}

	// Function to collect video (AI classification)
	async function handleCollectVideo() {
		const videoId = page.url.searchParams.get('v');
		if (!videoId || isCollecting) return;
		
		// If video is already collected, show dropdown instead
		if (videoCollections.length > 0) {
			toggleCollectionDropdown();
			return;
		}
		
		isCollecting = true;
		collectSuccess = false;
		
		try {
			const collectionIds = await classifyAndCollectVideo(videoId);
			collectSuccess = true;
			// Refresh collections after collecting
			await checkVideoCollections();
			setTimeout(() => {
				collectSuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to collect video:', error);
			alert(error instanceof Error ? error.message : '收藏失败');
		} finally {
			isCollecting = false;
		}
	}

	// Function to remove video from collection
	async function handleRemoveFromCollection(collectionId: string) {
		const videoId = page.url.searchParams.get('v');
		if (!videoId || isRemovingFromCollection) return;
		
		isRemovingFromCollection = collectionId;
		
		try {
			await removeVideoFromCollection(collectionId, videoId);
			// Refresh collections
			await checkVideoCollections();
			// If no collections left, close dropdown
			if (videoCollections.length === 0) {
				showCollectionDropdown = false;
			}
		} catch (error) {
			console.error('Failed to remove video from collection:', error);
			alert('从分类中移除失败');
		} finally {
			isRemovingFromCollection = null;
		}
	}

	// Check collections when video page loads or video changes
	$effect(() => {
		const videoId = page.url.searchParams.get('v');
		if (videoId && showBlockButton()) {
			checkVideoCollections();
		}
	});
</script>

<header class="sticky top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-lg">
	<nav class="container mx-auto flex max-w-3xl items-center justify-between px-2 py-2">
		<!-- Logo Section -->
		<!--
		<a
			href="/"
			class="group flex items-center gap-2 transition-all duration-200 hover:scale-105"
			aria-label="Homepage"
		>
			<div class="transition-transform duration-200 group-hover:rotate-6">
				<Logo width="w-5" />
			</div>
			<span
				class="hidden font-mono text-sm font-medium text-zinc-100 transition-colors duration-200 group-hover:text-red-300 sm:block"
			>
				youtubegist
			</span>
		</a>
		-->
		
		<!-- Navigation Links -->
		<div class="flex items-center gap-2">
			{#if showRegenerateButton()}
				<button
					onclick={regenerateSummary}
					disabled={isRegenerating}
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					title="Regenerate summary"
				>
					<RefreshCwIcon
						class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500 {isRegenerating ? 'animate-spin' : ''}"
					/>
					<span class="hidden sm:block">{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
				</button>
			{/if}

			{#if showDownloadButton()}
				<button
					onclick={downloadTranscript}
                    disabled={isDownloading || hasSubtitles !== true}
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					title="Download formatted transcript with AI formatting"
				>
					<DownloadIcon
						class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500 {isDownloading ? 'animate-pulse' : ''}"
					/>
					<span class="hidden sm:block">{isDownloading ? 'Processing...' : 'Transcript'}</span>
				</button>
			{/if}

			{#if showBlockButton()}
				<button
					onclick={blockChannel}
					disabled={isBlocking || !currentChannelId || !currentChannelName}
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 {isChannelBlockedState ? 'hover:bg-green-500/10 text-zinc-300 hover:text-green-300' : 'hover:bg-red-500/10 text-zinc-300 hover:text-red-300'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					title={
						!currentChannelId || !currentChannelName 
							? 'Loading channel information...' 
							: isChannelBlockedState 
								? `Unblock channel "${currentChannelName}"` 
								: `Block channel "${currentChannelName}"`
					}
				>
					<BanIcon
						class="h-4 w-4 transition-colors duration-200 {isChannelBlockedState ? 'group-hover:text-green-500' : 'group-hover:text-red-500'} {isBlocking ? 'animate-pulse' : ''}"
					/>
					<span class="hidden sm:block">
						{!currentChannelId || !currentChannelName 
							? 'Loading...' 
							: isChannelBlockedState 
								? (isBlocking ? 'Unblocking...' : 'Unblock Channel')
								: (isBlocking ? 'Blocking...' : 'Block Channel')
						}
					</span>
				</button>
			{/if}

			{#if showBlockButton()}
				<!-- Collect Button -->
				<div class="relative" role="presentation" onclick={(e) => e.stopPropagation()}>
					<button
						onclick={handleCollectVideo}
						disabled={isCollecting}
						class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 {collectSuccess 
							? 'bg-green-500/10 text-green-300' 
							: videoCollections.length > 0
								? 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
								: 'hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300'} disabled:opacity-50 disabled:cursor-not-allowed"
						title={collectSuccess ? '收藏成功！' : videoCollections.length > 0 ? '已收藏，点击查看分类' : 'AI自动分类收藏视频'}
					>
						{#if isCollecting}
							<svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							<span class="hidden sm:block">分类中...</span>
						{:else if collectSuccess}
							<svg class="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							<span class="hidden sm:block">收藏成功</span>
						{:else if videoCollections.length > 0}
							<HeartIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-purple-500 fill-purple-500" />
							<span class="hidden sm:block">已收藏 ({videoCollections.length})</span>
							<svg class="h-3 w-3 transition-transform duration-200 {showCollectionDropdown ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						{:else}
							<HeartIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500" />
							<span class="hidden sm:block">收藏</span>
						{/if}
					</button>
					
					<!-- Collection Dropdown -->
					{#if showCollectionDropdown && videoCollections.length > 0}
						<div class="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl">
							<div class="p-2">
								<div class="px-3 py-2 text-xs font-medium text-zinc-400 uppercase">
									所属分类
								</div>
								<div class="space-y-1">
									{#each videoCollections as collection}
										<button
											onclick={() => handleRemoveFromCollection(collection.$id)}
											disabled={isRemovingFromCollection === collection.$id}
											class="w-full rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 hover:bg-red-500/20 hover:text-red-300"
											title="点击从分类中移除"
										>
											<div class="flex items-center justify-between">
												<span class="flex-1 min-w-0">{collection.name}</span>
												{#if isRemovingFromCollection === collection.$id}
													<svg class="h-4 w-4 animate-spin text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
													</svg>
												{:else}
													<svg class="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
													</svg>
												{/if}
											</div>
										</button>
									{/each}
								</div>
								<div class="mt-2 border-t border-zinc-700/50 pt-2">
									<button
										onclick={() => window.open('/collections', '_blank')}
										class="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
									>
										管理分类
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</nav>
</header>

