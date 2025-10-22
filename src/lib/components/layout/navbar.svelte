<script lang="ts">
	import Logo from '$lib/components/shared/logo.svelte';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
	import GithubIcon from '@lucide/svelte/icons/github';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import BanIcon from '@lucide/svelte/icons/ban';
import { page } from '$app/state';
import { onMount } from 'svelte';
import CalendarIcon from '@lucide/svelte/icons/calendar';
import { addToBlockList, removeFromBlockList, isChannelBlocked, getBlockedChannels } from '$lib/client/block-list';

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
    
    return () => {
        window.removeEventListener('yg:hasSubtitles', handler as EventListener);
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

	// Check if we're on today page to show daily summary regenerate button
	let showDailyRegenerateButton = $derived(() => {
		const url = page.url;
		return url.pathname === '/today';
	});

	// State for regenerate button
	let isRegenerating = $state(false);
	
	// State for daily summary regenerate button
	let isDailyRegenerating = $state(false);
	
	// State for download button
	let isDownloading = $state(false);

	// State for block button
	let isBlocking = $state(false);

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

	// Function to regenerate daily summary
	async function regenerateDailySummary() {
		if (isDailyRegenerating) return;

		isDailyRegenerating = true;
		
		try {
			// Get a new nonce for the request
			const nonceResponse = await fetch('/api/generate-nonce');
			if (!nonceResponse.ok) {
				throw new Error('Failed to generate nonce');
			}
			const { nonce } = await nonceResponse.json();

			// Call the regenerate API
			const response = await fetch(`/api/regenerate-daily-summary`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ nonce })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(errorData.error || 'Failed to regenerate daily summary');
			}

			// Reload the page to show the new summary
			window.location.reload();
		} catch (error) {
			console.error('Error regenerating daily summary:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			alert(`Failed to regenerate daily summary: ${errorMessage}`);
		} finally {
			isDailyRegenerating = false;
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

			{#if showDailyRegenerateButton()}
				<button
					onclick={regenerateDailySummary}
					disabled={isDailyRegenerating}
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					title="Regenerate daily summary"
				>
					<RefreshCwIcon
						class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500 {isDailyRegenerating ? 'animate-spin' : ''}"
					/>
					<span class="hidden sm:block">{isDailyRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
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
		</div>

		<div class="flex items-center gap-2">
			<a
				href="/today"
				target="_blank"
				rel="noopener noreferrer"
				title="View today's watched videos"
				class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-zinc-100"
			>
				<CalendarIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-zinc-100" />
				<span class="hidden sm:block">Today</span>
			</a>
			<a
				href="https://github.com/shajidhasan/youtubegist"
				target="_blank"
				title="GitHub link"
				rel="noopener noreferrer"
				class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-zinc-100"
			>
				<GithubIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-zinc-100" />
				<span class="hidden sm:block">GitHub</span>
			</a>
		</div>
	</nav>
</header>
