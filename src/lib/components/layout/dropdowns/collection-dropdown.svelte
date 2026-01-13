<script lang="ts">
	import HeartIcon from '@lucide/svelte/icons/heart';
	import { classifyAndCollectVideo, fetchVideoCollections, removeVideoFromCollection } from '$lib/client/collections';
	import type { Collection } from '$lib/types';

	interface Props {
		videoId: string;
		platform?: string;
		isOpen: boolean;
		onToggle: () => void;
		onClose: () => void;
		videoCollections?: Collection[];
	}

	const {
		videoId,
		platform,
		isOpen,
		onToggle,
		onClose,
		videoCollections: externalCollections = $state([])
	}: Props = $props();

	let localCollections = $state<Collection[]>(externalCollections || []);
	let isCollecting = $state(false);
	let collectSuccess = $state(false);
	let isRemovingFromCollection = $state<string | null>(null);

	// Sync external collections with local state
	$effect(() => {
		if (externalCollections && externalCollections.length > 0) {
			localCollections = externalCollections;
		}
	});

	// Load collections when dropdown opens
	$effect(() => {
		if (isOpen && videoId) {
			loadCollections();
		}
	});

	async function loadCollections() {
		try {
			const collections = await fetchVideoCollections(videoId, platform);
			localCollections = collections;
		} catch (error) {
			console.error('Failed to fetch video collections:', error);
			localCollections = [];
		}
	}

	async function handleCollectVideo() {
		if (isCollecting || localCollections.length > 0) return;
		
		isCollecting = true;
		collectSuccess = false;
		
		try {
			await classifyAndCollectVideo(videoId);
			collectSuccess = true;
			await loadCollections();
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

	async function handleRemoveFromCollection(collectionId: string) {
		if (isRemovingFromCollection) return;
		
		isRemovingFromCollection = collectionId;
		try {
			await removeVideoFromCollection(collectionId, videoId);
			await loadCollections();
			if (localCollections.length === 0) {
				onClose();
			}
		} catch (error) {
			console.error('Failed to remove video from collection:', error);
			alert('从分类中移除失败');
		} finally {
			isRemovingFromCollection = null;
		}
	}

	function handleButtonClick() {
		if (localCollections.length > 0) {
			onToggle();
		} else {
			handleCollectVideo();
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const dropdown = target.closest('.collection-dropdown-container');
		if (!dropdown && isOpen) {
			onClose();
		}
	}

	$effect(() => {
		if (isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});
</script>

<div class="collection-dropdown-container relative" role="presentation" onclick={(e) => e.stopPropagation()}>
	<button
		onclick={handleButtonClick}
		disabled={isCollecting}
		class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 {collectSuccess 
			? 'bg-green-500/10 text-green-300' 
			: localCollections.length > 0
				? 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
				: 'hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300'} disabled:opacity-50 disabled:cursor-not-allowed"
		title={collectSuccess ? '收藏成功！' : localCollections.length > 0 ? '已收藏，点击查看分类' : 'AI自动分类收藏视频'}
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
		{:else if localCollections.length > 0}
			<HeartIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-purple-500 fill-purple-500" />
			<span class="hidden sm:block">已收藏 ({localCollections.length})</span>
			<svg class="h-3 w-3 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		{:else}
			<HeartIcon class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500" />
			<span class="hidden sm:block">收藏</span>
		{/if}
	</button>
	
	<!-- Collection Dropdown -->
	{#if isOpen && localCollections.length > 0}
		<div class="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl">
			<div class="p-2">
				<div class="px-3 py-2 text-xs font-medium text-zinc-400 uppercase">
					所属分类
				</div>
				<div class="space-y-1">
					{#each localCollections as collection}
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
