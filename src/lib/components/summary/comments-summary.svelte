<script lang="ts">
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import type { SummaryData } from '$lib/types';
	import { marked } from 'marked';

	let { summaryData, streamingCommentsSummary = '' }: { 
		summaryData: SummaryData; 
		streamingCommentsSummary?: string; 
	} = $props();

	let commentsSummaryHtml = $derived(
		summaryData?.commentsSummary ? marked.parse(summaryData.commentsSummary) : ''
	);
	let streamingCommentsSummaryHtml = $derived(
		streamingCommentsSummary && streamingCommentsSummary.length > 0 ? marked.parse(streamingCommentsSummary) : ''
	);
</script>

{#if (summaryData?.commentsSummary && summaryData.commentsSummary.trim() !== '') || (streamingCommentsSummary && streamingCommentsSummary.trim() !== '')}
	<div class="space-y-4 p-4">
		<div class="flex items-center gap-2">
			<div class="rounded-full bg-blue-500/10 p-1">
				<MessageSquareIcon class="h-5 w-5 text-blue-400" />
			</div>
			<h2 class="text-sm font-semibold tracking-wider uppercase text-blue-400">
				观众评论总结
			</h2>
			{#if summaryData.commentsCount && summaryData.commentsCount > 0}
				<span class="text-xs text-zinc-500">
					({summaryData.commentsCount} 条评论)
				</span>
			{/if}
		</div>
		
		<div class="rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-6 transition-all duration-200 hover:bg-zinc-900/70">
			<div class="text-sm text-justify prose prose-lg prose-invert prose-zinc max-w-none leading-relaxed text-zinc-300">
				{@html streamingCommentsSummaryHtml || commentsSummaryHtml}
			</div>
		</div>
	</div>
{/if}
