<script lang="ts">
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import type { FullSummaryData } from '$lib/types';
	import { marked } from 'marked';

	let { summaryData, streamingCommentsKeyPoints = [] }: { 
		summaryData: FullSummaryData; 
		streamingCommentsKeyPoints?: string[]; 
	} = $props();

	// Helper function to parse markdown for each point
	function parsePointMarkdown(point: string): string {
		const result = marked.parse(point);
		return typeof result === 'string' ? result : point;
	}
</script>

{#if (summaryData?.commentsKeyPoints && summaryData.commentsKeyPoints.length > 0) || (streamingCommentsKeyPoints && streamingCommentsKeyPoints.length > 0)}
	<div class="space-y-4 p-4">
		<div class="flex items-center gap-2">
			<div class="rounded-full bg-blue-500/10 p-1">
				<MessageSquareIcon class="h-5 w-5 text-blue-400" />
			</div>
			<h2 class="text-sm font-semibold tracking-wider uppercase text-blue-400">
				观众关注要点
			</h2>
		</div>
		
		<div class="rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-6 transition-all duration-200 hover:bg-zinc-900/70">
			<ul class="space-y-3">
				{#each (streamingCommentsKeyPoints.length > 0 ? streamingCommentsKeyPoints : summaryData.commentsKeyPoints) as point, index}
					<li class="flex items-start gap-3">
						<div class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-400">
							{index + 1}
						</div>
						<div class="text-sm text-zinc-300 leading-relaxed prose prose-sm prose-invert prose-zinc max-w-none font-serif">
							{@html parsePointMarkdown(point)}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
