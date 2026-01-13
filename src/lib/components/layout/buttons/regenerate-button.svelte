<script lang="ts">
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	interface Props {
		isRegenerating: boolean;
		onClick: () => void;
		label?: string;
		loadingLabel?: string;
	}

	const { isRegenerating, onClick, label = 'Regenerate', loadingLabel = 'Regenerating...' }: Props = $props();
</script>

<button
	onclick={onClick}
	disabled={isRegenerating}
	class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
	title={label}
>
	<RefreshCwIcon
		class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500 {isRegenerating ? 'animate-spin' : ''}"
	/>
	<span class="hidden sm:block">{isRegenerating ? loadingLabel : label}</span>
</button>
