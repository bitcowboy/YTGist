<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import type { SummaryData } from '$lib/types';
	import { marked } from 'marked';

	let { summaryData }: { summaryData: SummaryData } = $props();

	let keyTakeawayHtml = $derived(marked.parse(summaryData.keyTakeaway));
</script>

<div class="space-y-6">
	<!--
	<div class="flex items-center gap-2">
		<div class="rounded-full bg-blue-500/10 p-1">
			<SparklesIcon class="h-5 w-5 fill-blue-400 text-blue-400" />
		</div>
		<h2 class="text-sm font-semibold tracking-wider uppercase">Key Takeaway</h2>
	</div>
	-->

	<div
		class="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 p-4 shadow-lg relative overflow-hidden"
	>
		<!-- 背景引号 -->
		<div class="absolute top-0 left-1 text-blue-200/10 text-[160px] font-serif leading-none select-none pointer-events-none">
			”
		</div>
		<blockquote class="text-base text-justify leading-relaxed font-light text-blue-50 relative z-10 pt-4 pl-5 pr-3">
			{@html keyTakeawayHtml}
		</blockquote>
	</div>
</div>
