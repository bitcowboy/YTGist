import { onMount } from 'svelte';
import { page } from '$app/state';
import { isChannelBlocked } from '$lib/client/block-list';

export function useChannelState() {
	let currentChannelId = $state<string | null>(null);
	let currentChannelName = $state<string | null>(null);
	let isChannelBlockedState = $state<boolean>(false);
	let isChannelFollowedState = $state<boolean>(false);

	// Check channel follow status from server
	const checkChannelFollowStatus = async () => {
		if (!currentChannelId) return;

		try {
			const response = await fetch('/api/followed-channels');
			const data = await response.json();

			if (data.success) {
				const isFollowed = data.channels.some(
					(channel: any) => channel.channelId === currentChannelId
				);
				isChannelFollowedState = isFollowed;
			}
		} catch (error) {
			console.error('Failed to check channel follow status:', error);
		}
	};

	// Initialize from SSR data
	onMount(() => {
		const ssrData = (page as any).data?.summaryData;
		if (ssrData?.author && ssrData?.channelId) {
			currentChannelName = ssrData.author;
			currentChannelId = ssrData.channelId;
			// Check if channel is blocked asynchronously
			isChannelBlocked(ssrData.channelId).then((blocked) => {
				isChannelBlockedState = blocked;
			});
			// Check if channel is followed from server
			checkChannelFollowStatus();
		}

		// Listen for channel info updates
		const channelInfoHandler = (e: Event) => {
			try {
				const detail = (e as CustomEvent).detail as { channelId: string; channelName: string };
				if (detail.channelId && detail.channelName) {
					currentChannelId = detail.channelId;
					currentChannelName = detail.channelName;
					// Check if channel is blocked asynchronously
					isChannelBlocked(detail.channelId).then((blocked) => {
						isChannelBlockedState = blocked;
					});
					// Check if channel is followed from server
					checkChannelFollowStatus();
				}
			} catch {}
		};

		const blockListHandler = (e: Event) => {
			try {
				const detail = (e as CustomEvent).detail as {
					action: string;
					channel?: any;
					channelId?: string;
				};
				if (detail.action === 'added' && detail.channel?.channelId === currentChannelId) {
					isChannelBlockedState = true;
				} else if (detail.action === 'removed' && detail.channelId === currentChannelId) {
					isChannelBlockedState = false;
				}
			} catch {}
		};

		const followListHandler = (e: Event) => {
			checkChannelFollowStatus();
		};

		window.addEventListener('yg:channelInfo', channelInfoHandler as EventListener);
		window.addEventListener('yg:blockListUpdated', blockListHandler as EventListener);
		window.addEventListener('yg:followListUpdated', followListHandler as EventListener);

		return () => {
			window.removeEventListener('yg:channelInfo', channelInfoHandler as EventListener);
			window.removeEventListener('yg:blockListUpdated', blockListHandler as EventListener);
			window.removeEventListener('yg:followListUpdated', followListHandler as EventListener);
		};
	});

	return {
		currentChannelId,
		currentChannelName,
		isChannelBlockedState,
		isChannelFollowedState,
		checkChannelFollowStatus
	};
}
