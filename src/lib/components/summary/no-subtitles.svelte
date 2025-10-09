<script lang="ts">
	import SubtitlesIcon from '@lucide/svelte/icons/subtitles';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';

	let { videoTitle, videoId }: { videoTitle?: string | null; videoId?: string | null } = $props();

	const refreshPage = () => {
		window.location.reload();
	};

	const openVideoInYouTube = () => {
		if (videoId) {
			window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
		}
	};
</script>

<div
	class="container mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 px-4 py-24 text-center"
>
	<div class="rounded-full bg-amber-500/10 p-4">
		<SubtitlesIcon class="h-16 w-16 text-amber-500" />
	</div>
	<div class="space-y-4">
		<h1 class="text-2xl font-light tracking-tight text-zinc-100">
			No Subtitles Available
		</h1>
		<p class="max-w-md leading-relaxed text-zinc-300">
			{#if videoTitle}
				This video "<span class="font-medium text-zinc-100">{videoTitle}</span>" doesn't have subtitles or closed captions available.
			{:else}
				This video doesn't have subtitles or closed captions available.
			{/if}
		</p>
		<div class="max-w-lg space-y-3 text-sm text-zinc-400">
			<p class="font-medium">What you can do:</p>
			<ul class="space-y-2 text-left">
				<li class="flex items-start gap-2">
					<span class="text-amber-500 mt-0.5">•</span>
					<span>Watch the video directly on YouTube to see if captions are available there</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-amber-500 mt-0.5">•</span>
					<span>Try a different video that has subtitles or closed captions</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-amber-500 mt-0.5">•</span>
					<span>Contact the video creator to request subtitles</span>
				</li>
			</ul>
		</div>
	</div>
	<div class="flex flex-col gap-3 sm:flex-row">
		{#if videoId}
			<button
				onclick={openVideoInYouTube}
				class="group inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-blue-400"
			>
				<ExternalLinkIcon class="h-4 w-4" />
				<span>Watch on YouTube</span>
			</button>
		{/if}
		<button
			onclick={refreshPage}
			class="group inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-100 shadow-lg transition-all duration-200 hover:scale-105 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
		>
			<RefreshCcwIcon class="h-4 w-4 transition-transform duration-200 group-hover:rotate-180" />
			<span>Try Again</span>
		</button>
	</div>
</div>
