<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import type { SummaryData } from '$lib/types';
	import { marked } from 'marked';

	let { summaryData }: { summaryData: SummaryData } = $props();

	let pointsHtml = $derived(
		summaryData ? summaryData.keyPoints.map((point) => marked.parse(point)) : []
	);
</script>

<div class="space-y-6">
	<!--
	<div class="flex items-center gap-2">
		<div class="rounded-full bg-red-500/10 p-1">
			<SparklesIcon class="h-5 w-5 fill-yellow-500 text-yellow-500" />
		</div>
		<h2 class="text-sm font-semibold tracking-wider uppercase">Key Points</h2>
	</div>
	-->
	<div>
		<div
			class="rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-4 transition-all duration-200 hover:bg-zinc-900/70 hover:shadow-lg"
		>
			{#each pointsHtml as point, i (i)}
				<div class="group/point flex items-start gap-2 p-1">
					<div class="mt-1 rounded-full bg-red-500/10 p-1">
						<CheckCircle2Icon
							class="h-5 w-5 text-yellow-500 transition-transform duration-200 group-hover/point:scale-110"
						/>
					</div>
					<div
						class="translate-y-1 p-1 text-sm leading-relaxed text-zinc-300 [&>p>strong]:font-medium [&>p>strong]:text-zinc-100 font-serif"
					>
						{@html point}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
