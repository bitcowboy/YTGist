<script lang="ts">
	import BanIcon from '@lucide/svelte/icons/ban';

	interface Props {
		isBlocked: boolean;
		isBlocking: boolean;
		disabled?: boolean;
		channelName?: string | null;
		onClick: () => void;
	}

	const { 
		isBlocked, 
		isBlocking, 
		disabled = false, 
		channelName, 
		onClick 
	}: Props = $props();
</script>

<button
	onclick={onClick}
	disabled={isBlocking || disabled || !channelName}
	class="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 {isBlocked ? 'hover:bg-green-500/10 text-zinc-300 hover:text-green-300' : 'hover:bg-red-500/10 text-zinc-300 hover:text-red-300'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
	title={
		!channelName 
			? 'Loading channel information...' 
			: isBlocked 
				? `Unblock channel "${channelName}"` 
				: `Block channel "${channelName}"`
	}
>
	<BanIcon
		class="h-4 w-4 transition-colors duration-200 {isBlocked ? 'group-hover:text-green-500' : 'group-hover:text-red-500'} {isBlocking ? 'animate-pulse' : ''}"
	/>
	<span class="hidden sm:block">
		{!channelName 
			? 'Loading...' 
			: isBlocked 
				? (isBlocking ? 'Unblocking...' : 'Unblock Channel')
				: (isBlocking ? 'Blocking...' : 'Block Channel')
		}
	</span>
</button>
