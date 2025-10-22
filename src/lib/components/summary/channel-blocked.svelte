<script lang="ts">
	const { videoTitle, videoId } = $props();
</script>

<div class="container mx-auto max-w-3xl px-4 py-8">
	<div class="text-center">
		<div class="mb-6">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
				<svg class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
				</svg>
			</div>
			<h1 class="mb-2 text-2xl font-bold text-zinc-100">Channel Blocked</h1>
			<p class="text-zinc-400">
				This channel has been blocked and videos from it will not be processed.
			</p>
		</div>

		{#if videoTitle}
			<div class="mb-6 rounded-lg bg-zinc-800/50 p-4">
				<h2 class="mb-2 text-lg font-semibold text-zinc-200">Video: {videoTitle}</h2>
				<p class="text-sm text-zinc-400">
					This video will not be processed due to the channel being blocked.
				</p>
			</div>
		{/if}

		<div class="space-y-4">
			<div class="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
				<div class="flex items-center gap-3 mb-3">
					<svg class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<h3 class="text-blue-300 font-medium">How to unblock this channel</h3>
				</div>
				<p class="text-sm text-blue-200">
					Click the <span class="font-mono bg-blue-600/20 px-2 py-1 rounded text-blue-100">Unblock Channel</span> button in the navigation bar above to unblock this channel and process videos from it again.
				</p>
			</div>

			<div class="text-sm text-zinc-500">
				<p>Once unblocked, you can refresh this page to process the video.</p>
			</div>
		</div>
	</div>
</div>
