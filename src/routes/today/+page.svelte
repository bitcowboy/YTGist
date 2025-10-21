<script lang="ts">
	import { goto } from '$app/navigation';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import BrainIcon from '@lucide/svelte/icons/brain';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import type { PageData } from './$types.js';
	import { marked } from 'marked';

	interface TodaySummary {
		$id: string;
		videoId: string;
		title: string;
		keyTakeaway: string;
		$createdAt: string;
	}

	interface DailySummary {
		overview: string;
		themes: Array<{
			theme: string;
			videos: Array<{
				title: string;
				keyTakeaway: string;
				videoId: string;
			}>;
			summary: string;
		}>;
		keyInsights: string[];
	}

	let { data }: { data: PageData } = $props();
	let summaries: TodaySummary[] = data.todaySummaries;
	let dailySummary: DailySummary | null = data.dailySummary;

	// 使用 marked 库处理 Markdown，与 watch 页面保持一致
	let overviewHtml = $derived(dailySummary ? marked.parse(dailySummary.overview) : '');
	let themesHtml = $derived(dailySummary ? dailySummary.themes.map(theme => ({
		...theme,
		summaryHtml: marked.parse(theme.summary),
		videos: theme.videos.map(video => ({
			...video,
			keyTakeawayHtml: marked.parse(video.keyTakeaway)
		}))
	})) : []);
	let insightsHtml = $derived(dailySummary ? dailySummary.keyInsights.map(insight => marked.parse(insight)) : []);

	function handleOpen(videoId: string) {
		window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
	}

	function formatTime(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

</script>

<svelte:head>
	<title>Today - youtubegist</title>
	<meta name="description" content="Videos you viewed today on youtubegist." />
</svelte:head>

<main class="container mx-auto max-w-3xl px-4 py-8">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-semibold text-zinc-100">Today</h1>
			<p class="mt-1 text-sm text-zinc-400">Videos summarized today on youtubegist</p>
		</div>
	</div>

	{#if summaries.length === 0}
		<div class="mt-16 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/40 p-8 text-center">
			<p class="text-lg text-zinc-400">No videos summarized today. Try summarizing a YouTube video!</p>
		</div>
	{:else}
		<!-- AI Daily Summary Section -->
		{#if dailySummary}
			<div class="mt-8 rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
				<div class="mb-4 flex items-center gap-2">
					<BrainIcon class="h-5 w-5 text-blue-400" />
					<h2 class="text-xl font-semibold text-blue-100">AI Daily Summary</h2>
				</div>
				
				<!-- Overview -->
				<div class="mb-6">
					<h3 class="mb-2 text-lg font-medium text-zinc-100">Overview</h3>
					<div class="text-zinc-300 leading-relaxed prose prose-invert prose-zinc max-w-none">
						{@html overviewHtml}
					</div>
				</div>

				<!-- Themes -->
				{#if dailySummary.themes.length > 0}
					<div class="mb-6">
						<h3 class="mb-4 text-lg font-medium text-zinc-100">Themes & Topics</h3>
						<div class="space-y-4">
							{#each themesHtml as theme}
								<div class="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
									<h4 class="mb-2 text-base font-medium text-zinc-100">{theme.theme}</h4>
									<div class="mb-3 text-sm text-zinc-300 prose prose-invert prose-zinc max-w-none prose-sm">
										{@html theme.summaryHtml}
									</div>
									<div class="space-y-3">
										{#each theme.videos as video}
											<button 
												type="button"
												class="flex gap-3 p-2 rounded-lg hover:bg-zinc-700/20 transition-colors duration-200 cursor-pointer w-full text-left"
												onclick={() => handleOpen(video.videoId)}
												onkeydown={(e) => e.key === 'Enter' && handleOpen(video.videoId)}
											>
												<img
													src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
													alt={`Thumbnail for ${video.title}`}
													class="h-12 w-16 flex-shrink-0 rounded object-cover"
													loading="lazy"
												/>
												<div class="flex-1">
													<p class="text-zinc-200 font-medium hover:text-blue-300 transition-colors duration-200 text-sm line-clamp-2">{video.title}</p>
													<div class="text-zinc-400 text-xs mt-1 line-clamp-2 prose prose-invert prose-zinc max-w-none prose-xs">
														{@html video.keyTakeawayHtml}
													</div>
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Key Insights -->
				{#if dailySummary.keyInsights.length > 0}
					<div>
						<h3 class="mb-3 flex items-center gap-2 text-lg font-medium text-zinc-100">
							<LightbulbIcon class="h-4 w-4 text-yellow-400" />
							Key Insights
						</h3>
						<ul class="space-y-2">
							{#each insightsHtml as insight, i}
								<li class="flex items-start gap-2 text-sm">
									<span class="text-yellow-400">💡</span>
									<div class="text-zinc-300 prose prose-invert prose-zinc max-w-none prose-sm">
										{@html insight}
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}

	{/if}
</main>

