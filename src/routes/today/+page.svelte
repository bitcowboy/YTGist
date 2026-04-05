<script lang="ts">
	import { timeAgo } from '$lib/utils.js';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import type { SummaryData } from '$lib/types.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	let summaries: SummaryData[] = data.todaySummaries;
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
		<div class="mt-8 space-y-6">
			{#each summaries as summary (summary.$id)}
				<div
					class="group rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 transition-all duration-200 hover:border-zinc-600/50 hover:bg-zinc-800/50"
				>
					<div class="flex items-start gap-4">
						<div class="flex-shrink-0">
							<img
								src="https://img.youtube.com/vi/{summary.videoId}/mqdefault.jpg"
								alt="Video thumbnail"
								class="h-16 w-24 rounded-md object-cover transition-transform duration-200 group-hover:scale-105"
								loading="lazy"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<h3
								class="mb-2 line-clamp-2 text-lg font-medium text-zinc-100 transition-colors duration-200 group-hover:text-red-300"
							>
								<a href="/watch?v={summary.videoId}" class="hover:underline">
									{summary.title}
								</a>
							</h3>
							<div class="flex flex-col text-sm text-zinc-500 sm:flex-row sm:items-center sm:gap-4">
								<div class="flex items-center gap-1">
									<ClockIcon class="h-4 w-4" />
									<span>{timeAgo(summary.$createdAt)}</span>
								</div>
								<div class="flex items-center gap-1">
									<EyeIcon class="h-4 w-4" />
									<span>{summary.hits ?? 1} hits</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
