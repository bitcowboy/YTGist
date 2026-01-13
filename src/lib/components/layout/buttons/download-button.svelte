<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';

	interface Props {
		isDownloading: boolean;
		disabled?: boolean;
		onClick: () => void;
		label?: string;
		loadingLabel?: string;
	}

	const { 
		isDownloading, 
		disabled = false, 
		onClick, 
		label = 'Transcript', 
		loadingLabel = 'Processing...' 
	}: Props = $props();
</script>

<button
	onclick={onClick}
	disabled={isDownloading || disabled}
	class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 text-zinc-300 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
	title="Download formatted transcript with AI formatting"
>
	<DownloadIcon
		class="h-4 w-4 transition-colors duration-200 group-hover:text-blue-500 {isDownloading ? 'animate-pulse' : ''}"
	/>
	<span class="hidden sm:block">{isDownloading ? loadingLabel : label}</span>
</button>
