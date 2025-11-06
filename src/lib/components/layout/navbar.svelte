<script lang="ts">
	import Logo from '$lib/components/shared/logo.svelte';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import BanIcon from '@lucide/svelte/icons/ban';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
import { page } from '$app/state';
import { onMount } from 'svelte';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { addToBlockList, removeFromBlockList, isChannelBlocked, getBlockedChannels } from '$lib/client/block-list';
	import { goto } from '$app/navigation';
	import { fetchProjects, createProject, addVideoToProject, removeVideoFromProject } from '$lib/client/projects';
	import { classifyAndCollectVideo, fetchVideoCollections, removeVideoFromCollection } from '$lib/client/collections';
	import type { Collection } from '$lib/types';

let hasSubtitles = $state<boolean | null>(null);
let currentChannelId = $state<string | null>(null);
let currentChannelName = $state<string | null>(null);
let isChannelBlockedState = $state<boolean>(false);
let isChannelFollowedState = $state<boolean>(false);

// 从服务器检查频道关注状态
const checkChannelFollowStatus = async () => {
    if (!currentChannelId) return;
    
    try {
        const response = await fetch('/api/followed-channels');
        const data = await response.json();
        
        if (data.success) {
            const isFollowed = data.channels.some((channel: any) => channel.channelId === currentChannelId);
            isChannelFollowedState = isFollowed;
        }
    } catch (error) {
        console.error('Failed to check channel follow status:', error);
    }
};

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
        // Check if channel is followed from server
        checkChannelFollowStatus();
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


    const followListHandler = (e: Event) => {
        // 不再依赖本地事件，改为从服务器获取状态
        checkChannelFollowStatus();
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
                // Check if channel is followed from server
                checkChannelFollowStatus();
            }
        } catch {}
    };

    window.addEventListener('yg:hasSubtitles', handler as EventListener);
    window.addEventListener('yg:blockListUpdated', blockListHandler as EventListener);
    window.addEventListener('yg:followListUpdated', followListHandler as EventListener);
    window.addEventListener('yg:channelInfo', channelInfoHandler as EventListener);
    
    // Handle click outside collection dropdown
    document.addEventListener('click', handleCollectionDropdownClick);
    window.addEventListener('keydown', handleKeydown as EventListener);
    window.addEventListener('click', handleGlobalClick as EventListener);
    
    return () => {
        window.removeEventListener('yg:hasSubtitles', handler as EventListener);
        document.removeEventListener('click', handleCollectionDropdownClick);
        window.removeEventListener('yg:blockListUpdated', blockListHandler as EventListener);
        window.removeEventListener('yg:followListUpdated', followListHandler as EventListener);
        window.removeEventListener('yg:channelInfo', channelInfoHandler as EventListener);
        window.removeEventListener('keydown', handleKeydown as EventListener);
        window.removeEventListener('click', handleGlobalClick as EventListener);
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

	// Check if we're on daily report page to show regenerate button
	let showDailyReportRegenerateButton = $derived(() => {
		const url = page.url;
		return url.pathname === '/daily-report' && url.searchParams.has('date');
	});

	// State for regenerate button
	let isRegenerating = $state(false);
	
	// State for daily summary regenerate button
	let isDailyRegenerating = $state(false);
	
	// State for download button
	let isDownloading = $state(false);

	// State for block button
	let isBlocking = $state(false);

	// State for follow button
	let isFollowing = $state(false);

	// State for daily report modal
	let showDailyReportModal = $state(false);
	let selectedDate = $state('');
	let isGeneratingReport = $state(false);

	// State for project dropdown
	let showProjectDropdown = $state(false);
	let projects = $state<any[]>([]);
	let newProjectName = $state('');
	let isCreatingProject = $state(false);
	let isAddingToProject = $state(false);
	let currentVideoId = $state<string | null>(null);
	
	// State for collect button
	let isCollecting = $state(false);
	let collectSuccess = $state(false);
	let showCollectionDropdown = $state(false);
	let videoCollections = $state<Collection[]>([]);
	let isRemovingFromCollection = $state<string | null>(null);
	let showNewProjectModal = $state(false);

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

	// Function to regenerate daily report summary
	async function regenerateDailyReportSummary() {
		if (isDailyRegenerating) return;

		isDailyRegenerating = true;
		
		try {
			// Get the date from URL parameters
			const dateParam = page.url.searchParams.get('date');
			if (!dateParam) {
				throw new Error('Date parameter is required');
			}

			// Get a new nonce for the request
			const nonceResponse = await fetch('/api/generate-nonce');
			if (!nonceResponse.ok) {
				throw new Error('Failed to generate nonce');
			}
			const { nonce } = await nonceResponse.json();

			// Call the regenerate API with the specific date
			const response = await fetch(`/api/regenerate-daily-summary`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ nonce, date: dateParam })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(errorData.error || 'Failed to regenerate daily report summary');
			}

			// Reload the page to show the new summary
			window.location.reload();
		} catch (error) {
			console.error('Error regenerating daily report summary:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			alert(`Failed to regenerate daily report summary: ${errorMessage}`);
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

	// Function to follow/unfollow channel
	async function toggleFollow() {
		if (!currentChannelId || !currentChannelName || isFollowing) return;

		isFollowing = true;
		
		try {
			// 先获取nonce
			const nonceResp = await fetch('/api/generate-nonce');
			if (!nonceResp.ok) throw new Error('Failed to generate nonce');
			const { nonce } = await nonceResp.json();

			// 调用后端API
			const resp = await fetch('/api/follow-channel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nonce,
					action: isChannelFollowedState ? 'unfollow' : 'follow',
					channelId: currentChannelId,
					channelName: currentChannelName
				})
			});
			
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err?.error || `API error: ${resp.status}`);
			}

			// 后端成功后，重新从服务器获取状态
			await checkChannelFollowStatus();
			
			console.log(`Successfully ${isChannelFollowedState ? 'unfollowed' : 'followed'} channel: ${currentChannelName}`);
		} catch (e) {
			console.error('Follow/unfollow error:', e);
			alert(`Failed to ${isChannelFollowedState ? 'unfollow' : 'follow'} channel: ${e instanceof Error ? e.message : e}`);
		} finally {
			isFollowing = false;
		}
	}

	// Function to open daily report modal
	function openDailyReport() {
		// Set default date to today
		const today = new Date();
		selectedDate = today.toISOString().slice(0, 10);
		showDailyReportModal = true;
	}

	// Function to close daily report modal
	function closeDailyReport() {
		showDailyReportModal = false;
		selectedDate = '';
	}

	// Handle ESC key to close modal
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showDailyReportModal) {
			closeDailyReport();
		}
		if (event.key === 'Escape' && showProjectDropdown) {
			closeProjectDropdown();
		}
	}

	// Handle global click to close dropdown
	function handleGlobalClick(event: MouseEvent) {
		if (showProjectDropdown) {
			const target = event.target as HTMLElement;
			const dropdown = target.closest('.relative');
			if (!dropdown) {
				closeProjectDropdown();
			}
		}
	}

	// Function to generate daily report
	async function generateDailyReport() {
		if (!selectedDate || isGeneratingReport) return;

		isGeneratingReport = true;
		
		try {
			// Store the selected date before closing the modal
			const dateToUse = selectedDate;
			
			// Close the modal
			showDailyReportModal = false;
			
			// Open daily report in a new tab/window
			const dateParam = encodeURIComponent(dateToUse);
			const url = `/daily-report?date=${dateParam}`;
			const fullUrl = window.location.origin + url;
			
			window.open(fullUrl, '_blank', 'noopener,noreferrer');
			
		} catch (error) {
			console.error('Error opening daily report:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			alert(`Failed to open daily report: ${errorMessage}`);
		} finally {
			isGeneratingReport = false;
			selectedDate = ''; // Reset the selected date
		}
	}

	// Function to toggle project dropdown
	async function toggleProjectDropdown() {
		// If dropdown is already open, close it
		if (showProjectDropdown) {
			closeProjectDropdown();
			return;
		}
		
		// If dropdown is closed, open it
		const videoId = page.url.searchParams.get('v');
		if (!videoId) {
			alert('No video ID found');
			return;
		}
		
		currentVideoId = videoId;
		showProjectDropdown = true;
		
		try {
			projects = await fetchProjects(videoId);
		} catch (error) {
			console.error('Failed to fetch projects:', error);
			alert('Failed to load projects');
		}
	}

	// Function to close project dropdown
	function closeProjectDropdown() {
		showProjectDropdown = false;
		projects = [];
		currentVideoId = null;
	}

	// Function to show new project modal
	function openNewProjectModal() {
		showNewProjectModal = true;
		// Close the dropdown but preserve currentVideoId
		showProjectDropdown = false;
		projects = [];
	}

	// Function to close new project modal
	function closeNewProjectModal() {
		showNewProjectModal = false;
		newProjectName = '';
	}

	// Function to create new project
	async function createNewProject() {
		if (!newProjectName.trim() || isCreatingProject) return;
		
		console.log('Creating new project:', newProjectName.trim());
		console.log('Current video ID:', currentVideoId);
		
		isCreatingProject = true;
		
		try {
			const project = await createProject(newProjectName.trim());
			console.log('Project created successfully:', project);
			
			// Automatically add current video to the newly created project
			if (currentVideoId) {
				console.log('Attempting to add video to project...');
				try {
					await addVideoToProject(project.$id, currentVideoId);
					console.log('✅ Video automatically added to new project:', project.name);
				} catch (error) {
					console.error('❌ Failed to automatically add video to project:', error);
					// Don't show alert for automatic addition failure
				}
			} else {
				console.log('No current video ID, skipping auto-add');
			}
			
			// Refresh projects to get updated state
			console.log('Refreshing projects list...');
			projects = await fetchProjects(currentVideoId || undefined);
			console.log('Projects refreshed:', projects.length, 'projects found');
			
			// Close modal and reset form only after all operations are complete
			newProjectName = '';
			closeNewProjectModal();
		} catch (error) {
			console.error('Failed to create project:', error);
			alert('Failed to create project');
		} finally {
			isCreatingProject = false;
		}
	}

	// Function to add video to project
	async function addToProject(projectId: string) {
		if (!currentVideoId || isAddingToProject) return;
		
		isAddingToProject = true;
		
		try {
			await addVideoToProject(projectId, currentVideoId);
			// Refresh projects to update the UI
			projects = await fetchProjects(currentVideoId);
		} catch (error) {
			console.error('Failed to add video to project:', error);
			alert('Failed to add video to project');
		} finally {
			isAddingToProject = false;
		}
	}

	// Function to remove video from project
	async function removeFromProject(projectId: string) {
		if (!currentVideoId || isAddingToProject) return;
		
		isAddingToProject = true;
		
		try {
			await removeVideoFromProject(projectId, currentVideoId);
			// Refresh projects to update the UI
			projects = await fetchProjects(currentVideoId);
		} catch (error) {
			console.error('Failed to remove video from project:', error);
			alert('Failed to remove video from project');
		} finally {
			isAddingToProject = false;
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

			{#if showDailyReportRegenerateButton()}
				<button
					onclick={regenerateDailyReportSummary}
					disabled={isDailyRegenerating}
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					title="Regenerate daily report summary"
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

			{#if showBlockButton()}
				<button
					onclick={toggleFollow}
					disabled={isFollowing || !currentChannelId || !currentChannelName}
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 {isChannelFollowedState ? 'hover:bg-red-500/10 text-zinc-300 hover:text-red-300' : 'hover:bg-green-500/10 text-zinc-300 hover:text-green-300'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					title={
						!currentChannelId || !currentChannelName 
							? 'Loading channel information...' 
							: isChannelFollowedState 
								? `Unfollow channel "${currentChannelName}"` 
								: `Follow channel "${currentChannelName}"`
					}
				>
					{#if isChannelFollowedState}
						<UserMinusIcon class="h-4 w-4 transition-colors duration-200 {isFollowing ? 'animate-pulse' : ''}" />
						<span class="hidden sm:block">{isFollowing ? 'Unfollowing...' : 'Unfollow Channel'}</span>
					{:else}
						<UserPlusIcon class="h-4 w-4 transition-colors duration-200 {isFollowing ? 'animate-pulse' : ''}" />
						<span class="hidden sm:block">{isFollowing ? 'Following...' : 'Follow Channel'}</span>
					{/if}
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
				
				<!-- Add to Project Button -->
				<div class="relative">
					<button
						onclick={toggleProjectDropdown}
						class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-purple-500/10 text-zinc-300 hover:text-purple-300"
						title="Add video to project"
					>
						<svg class="h-4 w-4 transition-colors duration-200 group-hover:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
						</svg>
						<span class="hidden sm:block">Add to Project</span>
						<svg class="h-3 w-3 transition-transform duration-200 {showProjectDropdown ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					
					<!-- Project Dropdown -->
					{#if showProjectDropdown}
						<div class="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl">
							<div class="p-2">
								{#if projects.length === 0}
									<p class="px-3 py-2 text-sm text-zinc-500">No projects found</p>
								{:else}
									<div class="space-y-1">
										{#each projects as project}
											<button
												onclick={() => project.containsVideo ? removeFromProject(project.$id) : addToProject(project.$id)}
												disabled={isAddingToProject}
												class="w-full rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed {project.containsVideo 
													? 'bg-green-500/10 text-green-100 hover:bg-green-500/20' 
													: 'text-zinc-100 hover:bg-zinc-700'}"
											>
												<div class="flex items-center justify-between">
													<span>{project.name}</span>
													{#if project.containsVideo}
														<svg class="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
														</svg>
													{/if}
												</div>
											</button>
										{/each}
									</div>
								{/if}
								
								<!-- New Project Option -->
								<div class="mt-2 border-t border-zinc-700/50 pt-2">
									<button
										onclick={openNewProjectModal}
										class="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
									>
										+ New Project
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<button
				onclick={() => window.open('/projects', '_blank')}
				title="View projects"
				class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-zinc-100"
			>
				<svg class="h-4 w-4 transition-colors duration-200 group-hover:text-zinc-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
				</svg>
				<span class="hidden sm:block">Projects</span>
			</button>
			{#if !showBlockButton()}
				<button
					onclick={() => goto('/follow')}
					title="View followed channels"
					class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-zinc-100"
				>
					<UserPlusIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-zinc-100" />
					<span class="hidden sm:block">Follow</span>
				</button>
			{/if}
			<button
				onclick={openDailyReport}
				title="Generate daily report for any date"
				class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-zinc-100"
			>
				<CalendarIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-zinc-100" />
				<span class="hidden sm:block">Daily Report</span>
			</button>
		</div>
	</nav>
</header>

<!-- Daily Report Modal -->
{#if showDailyReportModal}
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && closeDailyReport()}
		onkeydown={(e) => e.key === 'Enter' && e.target === e.currentTarget && closeDailyReport()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<div class="mx-4 w-full max-w-md rounded-xl border border-zinc-700/50 bg-zinc-900 p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 id="modal-title" class="text-lg font-semibold text-zinc-100">Daily Report</h3>
				<button
					onclick={closeDailyReport}
					class="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
					title="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<div class="mb-6">
				<label for="date-select" class="mb-2 block text-sm font-medium text-zinc-300">
					Select Date
				</label>
				<input
					id="date-select"
					type="date"
					bind:value={selectedDate}
					max={new Date().toISOString().slice(0, 10)}
					class="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
				/>
			</div>
			
			<div class="flex gap-3">
				<button
					onclick={closeDailyReport}
					class="flex-1 rounded-lg border border-zinc-600 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50 hover:text-zinc-100"
				>
					Cancel
				</button>
				<button
					onclick={generateDailyReport}
					disabled={!selectedDate || isGeneratingReport}
					class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isGeneratingReport ? 'Opening...' : 'Open Report'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- New Project Modal -->
{#if showNewProjectModal}
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && closeNewProjectModal()}
		onkeydown={(e) => e.key === 'Enter' && e.target === e.currentTarget && closeNewProjectModal()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="new-project-modal-title"
		tabindex="-1"
	>
		<div class="mx-4 w-full max-w-md rounded-xl border border-zinc-700/50 bg-zinc-900 p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 id="new-project-modal-title" class="text-lg font-semibold text-zinc-100">Create New Project</h3>
				<button
					onclick={closeNewProjectModal}
					class="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
					title="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<div class="mb-6">
				<label for="new-project-name" class="mb-2 block text-sm font-medium text-zinc-300">
					Project Name
				</label>
				<input
					id="new-project-name"
					type="text"
					bind:value={newProjectName}
					placeholder="Enter project name..."
					class="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
					onkeydown={(e) => e.key === 'Enter' && createNewProject()}
				/>
			</div>
			
			<div class="flex gap-3">
				<button
					onclick={closeNewProjectModal}
					class="flex-1 rounded-lg border border-zinc-600 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50 hover:text-zinc-100"
				>
					Cancel
				</button>
				<button
					onclick={createNewProject}
					disabled={!newProjectName.trim() || isCreatingProject}
					class="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isCreatingProject ? 'Creating...' : 'Create Project'}
				</button>
			</div>
		</div>
	</div>
{/if}

