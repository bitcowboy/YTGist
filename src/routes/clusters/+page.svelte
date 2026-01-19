<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import VideoIcon from '@lucide/svelte/icons/video';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import type { Cluster, ClusterHierarchy, ClusterLevel, ClusterTree, ClusterTreeNode } from '$lib/types';
	import { getCachedHierarchy, getCachedTree, cacheHierarchy, clearHierarchyCache } from '$lib/client/cluster-hierarchy';

	const { data } = $props();

	let clusters = $state((data.clusters || []) as Cluster[]);
	let videoTitles = $state<Record<string, string>>(data.videoTitles || {});
	let isRegenerating = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);
	
	// Helper function to truncate video title
	function truncateTitle(title: string, maxLength: number = 40): string {
		if (title.length <= maxLength) return title;
		return title.substring(0, maxLength) + '...';
	}
	
	// Get video title by ID, with fallback to ID
	function getVideoTitle(videoId: string): string {
		return videoTitles[videoId] || videoId;
	}
	
	// View mode state
	type ViewMode = 'standard' | 'hierarchy' | 'tree';
	let viewMode = $state<ViewMode>('standard');
	
	// Hierarchy-related state
	let hierarchyData = $state<ClusterHierarchy | null>(null);
	let currentLambdaIndex = $state(0);
	let previousLambdaIndex = $state(0);
	let isPlaying = $state(false);
	let playInterval: number | null = null;
	let isLoadingHierarchy = $state(false);
	
	// Tree-related state
	let treeData = $state<ClusterTree | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());
	
	// Compute current level data
	let currentLevel = $derived<ClusterLevel | null>(
		hierarchyData && hierarchyData.levels[currentLambdaIndex] 
			? hierarchyData.levels[currentLambdaIndex] 
			: null
	);
	
	// Compute previous level data for comparison
	let previousLevel = $derived<ClusterLevel | null>(
		hierarchyData && hierarchyData.levels[previousLambdaIndex] 
			? hierarchyData.levels[previousLambdaIndex] 
			: null
	);
	
	// Compute cluster stability (how many levels each cluster persists)
	// Simplified version to avoid performance issues
	let clusterStability = $derived<Map<string, number>>((() => {
		const stability = new Map<string, number>();
		
		if (!hierarchyData || !currentLevel) {
			return stability;
		}
		
		try {
			currentLevel.clusters.forEach(cluster => {
				// For now, just set a placeholder value based on cluster size
				// A more accurate calculation would compare video overlap across levels
				const estimatedStability = Math.min(Math.floor(cluster.size / 5) + 1, hierarchyData.levels.length);
				stability.set(cluster.clusterId, estimatedStability);
			});
		} catch (error) {
			console.error('Error calculating cluster stability:', error);
		}
		
		return stability;
	})());

	async function regenerateClusters() {
		if (isRegenerating) return;

		isRegenerating = true;
		error = null;
		success = false;

		try {
			// Get a new nonce for the request
			const nonceResponse = await fetch('/api/generate-nonce');
			if (!nonceResponse.ok) {
				throw new Error('Failed to generate nonce');
			}
			const { nonce } = await nonceResponse.json();

			// Call the cluster-summaries API with clearExisting=true
			const response = await fetch('/api/cluster-summaries', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					nonce,
					clearExisting: true
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(errorData.error || 'Failed to regenerate clusters');
			}

			const result = await response.json();
			
			console.log('Clustering result received:', {
				hasHierarchyData: !!result.hierarchyData,
				hierarchyLevels: result.hierarchyData?.levels?.length,
				totalClusters: result.totalClusters
			});
			
			// Cache hierarchy data if available
			if (result.hierarchyData || result.treeData) {
				console.log('Caching hierarchy data with', result.hierarchyData?.levels?.length || 0, 'levels and tree data');
				cacheHierarchy(result.hierarchyData, result.treeData);
				hierarchyData = result.hierarchyData;
				treeData = result.treeData;
			} else {
				console.warn('No hierarchy or tree data in response');
			}
			
			success = true;

			// Reload the page to show updated clusters
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		} catch (err) {
			console.error('Error regenerating clusters:', err);
			error = err instanceof Error ? err.message : 'Failed to regenerate clusters';
		} finally {
			isRegenerating = false;
		}
	}
	
	async function loadHierarchyData() {
		isLoadingHierarchy = true;
		error = null;
		try {
			// Try to get from cache first
			const cached = getCachedHierarchy();
			if (cached) {
				hierarchyData = cached;
				console.log('Loaded hierarchy from cache:', cached.levels.length, 'levels');
				return;
			}
			
			// If not in cache, show error message
			console.log('No cached hierarchy data available');
			error = '层次数据未找到。请先重新生成聚类以获取层次结构数据。';
		} catch (err) {
			console.error('Error loading hierarchy:', err);
			error = '加载层次数据失败: ' + (err instanceof Error ? err.message : String(err));
		} finally {
			isLoadingHierarchy = false;
		}
	}
	
	function toggleTreeNode(nodeId: string) {
		if (expandedNodes.has(nodeId)) {
			expandedNodes.delete(nodeId);
		} else {
			expandedNodes.add(nodeId);
		}
		expandedNodes = new Set(expandedNodes); // Trigger reactivity
	}
	
	function setViewMode(mode: ViewMode) {
		if (mode === 'hierarchy' && !hierarchyData) {
			loadHierarchyData();
		}
		if (mode === 'tree' && !treeData) {
			loadHierarchyData();
		}
		if (viewMode === 'hierarchy') {
			stopPlayback();
		}
		viewMode = mode;
	}
	
	function handleSliderChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newIndex = parseInt(target.value);
		previousLambdaIndex = currentLambdaIndex;
		currentLambdaIndex = newIndex;
	}
	
	async function advanceLevel() {
		if (hierarchyData && currentLambdaIndex < hierarchyData.levels.length - 1) {
			previousLambdaIndex = currentLambdaIndex;
			currentLambdaIndex = currentLambdaIndex + 1;
			const level = hierarchyData.levels[currentLambdaIndex];
			console.log('Playback: advancing to level', currentLambdaIndex, '/', hierarchyData.levels.length, 
				'- clusters:', level?.clusters?.length || 0, 'noise:', level?.noiseCount || 0);
			await tick(); // Force UI update
		} else {
			// Reached the end, stop and reset
			console.log('Playback: reached end, resetting');
			stopPlayback();
			previousLambdaIndex = currentLambdaIndex;
			currentLambdaIndex = 0;
			await tick();
		}
	}
	
	function startPlayback() {
		if (isPlaying || !hierarchyData) {
			console.log('Cannot start playback:', { isPlaying, hasHierarchyData: !!hierarchyData });
			return;
		}
		
		console.log('Starting playback with', hierarchyData.levels.length, 'levels');
		isPlaying = true;
		
		playInterval = window.setInterval(() => {
			advanceLevel();
		}, 800); // Change level every 800ms
	}
	
	function stopPlayback() {
		isPlaying = false;
		if (playInterval !== null) {
			clearInterval(playInterval);
			playInterval = null;
		}
	}
	
	// Cleanup on component destroy
	$effect(() => {
		return () => {
			stopPlayback();
		};
	});
	
	onMount(() => {
		// Try to load hierarchy and tree data from cache on mount
		const cached = getCachedHierarchy();
		if (cached) {
			hierarchyData = cached;
		}
		const cachedTree = getCachedTree();
		if (cachedTree) {
			treeData = cachedTree;
			// Initialize with root expanded
			if (treeData.root) {
				expandedNodes.add(treeData.root.id);
			}
		}
	});
</script>

<svelte:head>
	<title>Clusters - youtubegist</title>
	<meta name="title" content="Clusters - youtubegist" />
	<meta name="description" content="View video clusters discovered by HDBSCAN" />
</svelte:head>

<main class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-semibold text-zinc-100">Clusters</h1>
			<p class="mt-2 text-zinc-400">通过HDBSCAN聚类发现的相似视频分组</p>
		</div>
		<div class="flex items-center gap-2">
			<!-- View Mode Switcher -->
			<div class="flex rounded-lg border border-zinc-600 overflow-hidden">
				<button
					onclick={() => setViewMode('standard')}
					class="px-3 py-2 text-sm font-medium transition-colors"
					class:bg-purple-600={viewMode === 'standard'}
					class:text-white={viewMode === 'standard'}
					class:bg-transparent={viewMode !== 'standard'}
					class:text-zinc-300={viewMode !== 'standard'}
					class:hover:bg-zinc-700={viewMode !== 'standard'}
				>
					<FolderIcon class="h-4 w-4" />
				</button>
				<button
					onclick={() => setViewMode('hierarchy')}
					class="px-3 py-2 text-sm font-medium transition-colors border-l border-zinc-600"
					class:bg-purple-600={viewMode === 'hierarchy'}
					class:text-white={viewMode === 'hierarchy'}
					class:bg-transparent={viewMode !== 'hierarchy'}
					class:text-zinc-300={viewMode !== 'hierarchy'}
					class:hover:bg-zinc-700={viewMode !== 'hierarchy'}
					disabled={isLoadingHierarchy}
				>
					<LayersIcon class="h-4 w-4" />
				</button>
				<button
					onclick={() => setViewMode('tree')}
					class="px-3 py-2 text-sm font-medium transition-colors border-l border-zinc-600"
					class:bg-purple-600={viewMode === 'tree'}
					class:text-white={viewMode === 'tree'}
					class:bg-transparent={viewMode !== 'tree'}
					class:text-zinc-300={viewMode !== 'tree'}
					class:hover:bg-zinc-700={viewMode !== 'tree'}
					disabled={isLoadingHierarchy}
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
					</svg>
				</button>
			</div>
			
			<button
				onclick={regenerateClusters}
				disabled={isRegenerating}
				class="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<RefreshCwIcon class="h-4 w-4 {isRegenerating ? 'animate-spin' : ''}" />
				{isRegenerating ? '生成中...' : '重新生成聚类'}
			</button>
		</div>
	</div>
	
	<!-- Hierarchy Controls -->
	{#if viewMode === 'hierarchy' && hierarchyData && hierarchyData.levels.length > 0}
		<div class="mb-6 rounded-xl border border-purple-500/30 bg-purple-900/10 p-6">
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold text-zinc-100">聚类层次结构</h2>
					<p class="mt-1 text-sm text-zinc-400">
						使用滑块探索不同lambda值下的聚类划分
					</p>
				</div>
				<button
					onclick={isPlaying ? stopPlayback : startPlayback}
					class="flex items-center gap-2 rounded-lg border border-purple-500/50 bg-purple-600/20 px-3 py-2 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-600/30"
				>
					{#if isPlaying}
						<PauseIcon class="h-4 w-4" />
						暂停
					{:else}
						<PlayIcon class="h-4 w-4" />
						播放
					{/if}
				</button>
			</div>
			
			<!-- Slider -->
			<div class="mb-4">
				<input
					type="range"
					min="0"
					max={hierarchyData.levels.length - 1}
					value={currentLambdaIndex}
					oninput={handleSliderChange}
					class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
				/>
			</div>
			
			<!-- Current Level Info -->
			{#if currentLevel}
				<div class="grid grid-cols-3 gap-4 text-center">
					<div class="rounded-lg bg-zinc-800/50 p-3">
						<div class="text-2xl font-bold text-purple-400">{currentLevel.lambda.toFixed(4)}</div>
						<div class="text-xs text-zinc-400">Lambda 值</div>
					</div>
					<div class="rounded-lg bg-zinc-800/50 p-3">
						<div class="text-2xl font-bold text-blue-400">{currentLevel.clusterCount}</div>
						<div class="text-xs text-zinc-400">聚类数量</div>
					</div>
					<div class="rounded-lg bg-zinc-800/50 p-3">
						<div class="text-2xl font-bold text-amber-400">{currentLevel.noiseCount}</div>
						<div class="text-xs text-zinc-400">噪声点数</div>
					</div>
				</div>
			{/if}
		</div>
	{:else if viewMode === 'hierarchy' && isLoadingHierarchy}
		<div class="mb-6 rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-6 text-center">
			<RefreshCwIcon class="mx-auto h-8 w-8 animate-spin text-zinc-500 mb-2" />
			<p class="text-zinc-400">加载层次数据中...</p>
		</div>
	{:else if viewMode === 'hierarchy' && !hierarchyData}
		<div class="mb-6 rounded-xl border border-amber-500/30 bg-amber-900/10 p-6">
			<p class="text-amber-300 text-sm">
				层次数据未找到。请先点击"重新生成聚类"按钮以生成层次结构数据。
			</p>
		</div>
	{/if}

	{#if error}
		<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400">
			{error}
		</div>
	{/if}

	{#if success}
		<div class="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-400">
			聚类生成成功！页面即将刷新...
		</div>
	{/if}

	{#if viewMode === 'tree' && treeData}
		<!-- Tree Mode: Show hierarchical tree structure -->
		<div class="space-y-2">
			{#if treeData.root}
				{@render TreeNode(treeData.root, 0)}
			{/if}
		</div>
	{:else if viewMode === 'hierarchy' && currentLevel}
		<!-- Hierarchy Mode: Show clusters from current level -->
		{#if currentLevel.clusters.length === 0}
			<div class="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/40 p-12 text-center">
				<FolderIcon class="mx-auto h-12 w-12 text-zinc-500" />
				<h3 class="mt-4 text-lg font-medium text-zinc-300">此层级没有聚类</h3>
				<p class="mt-2 text-zinc-500">所有数据点都是噪声。</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each currentLevel.clusters as clusterAssignment, idx (`${currentLambdaIndex}-${idx}`)}
					{@const stability = clusterStability.get(clusterAssignment.clusterId) || 1}
					{@const stabilityPercent = hierarchyData ? (stability / hierarchyData.levels.length) * 100 : 0}
					{@const isStable = stabilityPercent > 30}
					{@const borderClass = isStable ? 'border-purple-500/50 hover:border-purple-400' : 'border-zinc-700/50 hover:border-zinc-600/50'}
					{@const barColor = stabilityPercent > 50 ? 'bg-green-500' : stabilityPercent > 20 ? 'bg-yellow-500' : 'bg-red-500'}
					<div 
						class="group relative rounded-xl border bg-zinc-900/40 p-6 transition-all hover:bg-zinc-800/40 {borderClass}"
					>
						<!-- Stability indicator -->
						<div class="absolute top-3 right-3 flex items-center gap-2">
							<div class="flex items-center gap-1 rounded-full bg-zinc-800/80 px-2 py-1">
								<LayersIcon class="h-3 w-3 text-zinc-400" />
								<span class="text-xs text-zinc-400">{stability}/{hierarchyData?.levels.length || 0}</span>
							</div>
							{#if isStable}
								<div class="rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">
									稳定
								</div>
							{/if}
						</div>
						
						<div class="flex items-center justify-between gap-4 pr-32">
							<h2 class="text-xl font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors">
								聚类 #{idx + 1}
							</h2>
							<div class="flex items-center gap-2 text-sm text-zinc-400 shrink-0">
								<span class="flex items-center gap-1">
									<VideoIcon class="h-4 w-4" />
									<span>{clusterAssignment.size} 个视频</span>
								</span>
							</div>
						</div>
						
						<!-- Stability bar -->
						<div class="mt-2 h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
							<div 
								class="h-full transition-all duration-500 {barColor}"
								style="width: {stabilityPercent}%"
							></div>
						</div>
						
						<p class="mt-2 text-sm text-zinc-400">
							包含 {clusterAssignment.size} 个相似视频 · 在 {stability} 个层级中出现
						</p>
						
						<!-- Show first few video titles as preview -->
						<div class="mt-3 flex flex-wrap gap-2">
							{#each clusterAssignment.videoIds.slice(0, 5) as videoId}
								{@const fullTitle = getVideoTitle(videoId)}
								{@const displayTitle = truncateTitle(fullTitle, 50)}
								<a
									href="https://www.youtube.com/watch?v={videoId}"
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center gap-1.5 rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-purple-400 transition-colors max-w-md"
									title="{fullTitle}"
								>
									<svg class="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 24 24">
										<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
									</svg>
									<span class="truncate">{displayTitle}</span>
								</a>
							{/each}
							{#if clusterAssignment.videoIds.length > 5}
								<span class="inline-block rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-500">
									+{clusterAssignment.videoIds.length - 5} 更多
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else if viewMode === 'standard'}
		<!-- Standard Mode: Show clusters from database -->
		{#if clusters.length === 0}
			<div class="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/40 p-12 text-center">
				<FolderIcon class="mx-auto h-12 w-12 text-zinc-500" />
				<h3 class="mt-4 text-lg font-medium text-zinc-300">还没有聚类</h3>
				<p class="mt-2 text-zinc-500">运行聚类分析后，相似的视频会被自动分组。</p>
			</div>
		{:else}
			<div class="space-y-6">
				{#each clusters as cluster}
					<div class="group relative rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-6 transition-all hover:border-zinc-600/50 hover:bg-zinc-800/40">
						<button
							onclick={() => goto(`/clusters/${cluster.$id}`)}
							class="w-full text-left"
						>
							<div class="flex items-center justify-between gap-4">
								<h2 class="text-xl font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors">
									{cluster.name}
								</h2>
								<div class="flex items-center gap-2 text-sm text-zinc-400 shrink-0">
									<span>创建于 {new Date(cluster.createdAt).toLocaleDateString()}</span>
									<span class="flex items-center gap-1">
										<VideoIcon class="h-4 w-4" />
										<span>{cluster.videoCount}</span>
									</span>
								</div>
							</div>
							
							{#if cluster.description}
								<p class="mt-2 text-sm text-zinc-400 line-clamp-2">
									{cluster.description}
								</p>
							{/if}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</main>

{#snippet TreeNode(node: ClusterTreeNode, level: number)}
	{@const isExpanded = expandedNodes.has(node.id)}
	{@const hasChildren = node.children && node.children.length > 0}
	{@const indent = level * 24}
	
	<div class="tree-node">
		<div 
			class="flex items-start gap-3 rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-4 transition-all hover:bg-zinc-800/40"
			style="margin-left: {indent}px"
		>
			<!-- Expand/Collapse Button -->
			<button
				onclick={() => toggleTreeNode(node.id)}
				class="shrink-0 mt-1 text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30"
				disabled={!hasChildren}
			>
				{#if hasChildren}
					{#if isExpanded}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					{/if}
				{:else}
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<circle cx="12" cy="12" r="2" />
					</svg>
				{/if}
			</button>
			
			<!-- Node Content -->
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-3 mb-2">
					<h3 class="font-semibold text-zinc-100">
						{#if level === 0}
							根节点
						{:else}
							聚类 (λ={node.lambda.toFixed(2)})
						{/if}
					</h3>
					<div class="flex items-center gap-2 text-sm text-zinc-400">
						<VideoIcon class="h-3 w-3" />
						<span>{node.videoCount} 个视频</span>
					</div>
				</div>
				
				<!-- Video Preview -->
				{#if node.videoIds.length > 0}
					<div class="flex flex-wrap gap-2 mt-2">
						{#each node.videoIds.slice(0, 3) as videoId}
							{@const fullTitle = getVideoTitle(videoId)}
							{@const displayTitle = truncateTitle(fullTitle, 30)}
							<a
								href="https://www.youtube.com/watch?v={videoId}"
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1.5 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-purple-400 transition-colors"
								title="{fullTitle}"
							>
								<svg class="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 24 24">
									<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
								</svg>
								<span class="truncate">{displayTitle}</span>
							</a>
						{/each}
						{#if node.videoIds.length > 3}
							<span class="inline-block rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-500">
								+{node.videoIds.length - 3} 更多
							</span>
						{/if}
					</div>
				{/if}
			</div>
		</div>
		
		<!-- Render Children -->
		{#if isExpanded && hasChildren}
			<div class="mt-2 space-y-2">
				{#each node.children as child (child.id)}
					{@render TreeNode(child, level + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-clamp: 2;
	}
	
	/* Custom slider styling */
	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #a855f7;
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.slider::-webkit-slider-thumb:hover {
		background: #9333ea;
	}
	
	.slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #a855f7;
		cursor: pointer;
		border: none;
		transition: background 0.2s;
	}
	
	.slider::-moz-range-thumb:hover {
		background: #9333ea;
	}
	
	/* Fade-in animation for cluster items */
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	.animate-fade-in {
		animation: fadeIn 0.3s ease-out forwards;
		opacity: 0;
	}
</style>

