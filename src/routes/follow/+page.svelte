<script lang="ts">
    import { onMount } from 'svelte';
    import { marked } from 'marked';
    import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
    import UserPlusIcon from '@lucide/svelte/icons/user-plus';
    import UserMinusIcon from '@lucide/svelte/icons/user-minus';
    import CalendarIcon from '@lucide/svelte/icons/calendar';
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

    interface FollowedChannel {
        $id: string;
        channelId: string;
        channelName: string;
        channelUrl?: string;
        thumbnailUrl?: string;
        followedAt: string;
        isActive: boolean;
    }

    interface ChannelSummary {
        channelId: string;
        channelName: string;
        videos: Array<{
            $id: string;
            videoId: string;
            title: string;
            summary: string;
            keyTakeaway: string;
            keyPoints: string[];
            $createdAt: string;
            publishedAt?: string;
        }>;
    }

    let followedChannels: FollowedChannel[] = [];
    let channelSummaries: ChannelSummary[] = [];
    let isLoading = true;
    let isRefreshing = false;
    let selectedDays = 7;

    onMount(async () => {
        await loadData();
    });

    async function loadData() {
        try {
            isLoading = true;
            await Promise.all([
                loadFollowedChannels(),
                loadChannelSummaries()
            ]);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            isLoading = false;
        }
    }

    async function loadFollowedChannels() {
        const response = await fetch('/api/followed-channels');
        const data = await response.json();
        if (data.success) {
            followedChannels = data.channels;
        }
    }

    async function loadChannelSummaries() {
        const response = await fetch(`/api/followed-summary?days=${selectedDays}`);
        const data = await response.json();
        if (data.success) {
            channelSummaries = data.summaries;
        }
    }

    async function toggleFollow(channelId: string, channelName: string, isCurrentlyFollowed: boolean) {
        // 如果是取消关注，显示确认对话框
        if (isCurrentlyFollowed) {
            const confirmed = confirm(`确定要取消关注频道 "${channelName}" 吗？\n\n取消关注后，该频道的新视频将不再自动生成总结。`);
            if (!confirmed) {
                return;
            }
        }

        try {
            const nonceResponse = await fetch('/api/generate-nonce');
            const { nonce } = await nonceResponse.json();

            const response = await fetch('/api/follow-channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nonce,
                    action: isCurrentlyFollowed ? 'unfollow' : 'follow',
                    channelId,
                    channelName
                })
            });

            const result = await response.json();
            if (result.success) {
                await loadData();
            }
        } catch (error) {
            console.error('Failed to toggle follow:', error);
        }
    }

    async function refreshData() {
        isRefreshing = true;
        try {
            await loadData();
        } finally {
            isRefreshing = false;
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatTime(dateString: string) {
        return new Date(dateString).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    function handleVideoClick(videoId: string) {
        window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    }
</script>

<svelte:head>
    <title>Followed Channels - youtubegist</title>
    <meta name="description" content="Follow your favorite YouTube channels and get AI summaries of their latest videos." />
</svelte:head>

<main class="container mx-auto max-w-4xl px-4 py-8">
    <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h1 class="text-3xl font-semibold text-zinc-100 mb-2">Followed Channels</h1>
                <p class="text-zinc-400">Get AI summaries from your favorite YouTube channels</p>
            </div>
            <button
                onclick={refreshData}
                disabled={isRefreshing}
                class="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-all duration-200 hover:scale-105 hover:bg-blue-500/10 hover:text-blue-300 disabled:opacity-50"
            >
                <RefreshCwIcon class="h-4 w-4 {isRefreshing ? 'animate-spin' : ''}" />
                Refresh
            </button>
        </div>

        <!-- Time Range Selector -->
        <div class="flex items-center gap-4 mb-6">
            <CalendarIcon class="h-4 w-4 text-zinc-400" />
            <span class="text-sm text-zinc-300">Show videos from last:</span>
            <select 
                bind:value={selectedDays}
                onchange={loadChannelSummaries}
                class="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
            </select>
        </div>
    </div>

    {#if isLoading}
        <div class="flex items-center justify-center py-16">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
    {:else if channelSummaries.length === 0}
        <div class="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/40 p-8 text-center">
            <p class="text-lg text-zinc-400 mb-4">No followed channels or videos found.</p>
            <p class="text-sm text-zinc-500">Start following channels by visiting their videos and using the follow button.</p>
        </div>
    {:else}
        <!-- Channel Summaries -->
        <div class="space-y-8">
            {#each channelSummaries as channel}
                <div class="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <img
                                src={`https://img.youtube.com/vi/${channel.videos[0]?.videoId}/mqdefault.jpg`}
                                alt={channel.channelName}
                                class="h-12 w-12 rounded-full object-cover"
                            />
                            <div>
                                <h2 class="text-xl font-semibold text-zinc-100">{channel.channelName}</h2>
                                <p class="text-sm text-zinc-400">{channel.videos.length} video{channel.videos.length !== 1 ? 's' : ''} in the last {selectedDays} day{selectedDays !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <button
                            onclick={() => toggleFollow(channel.channelId, channel.channelName, true)}
                            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-300 transition-all duration-200 hover:scale-105 hover:bg-red-500/10"
                        >
                            <UserMinusIcon class="h-4 w-4" />
                            Unfollow
                        </button>
                    </div>

                    <!-- Videos -->
                    <div class="space-y-4">
                        {#each channel.videos as video}
                            <div class="rounded-lg border border-zinc-700/30 bg-zinc-800/30 p-4 hover:bg-zinc-800/50 transition-colors">
                                <div class="flex gap-4">
                                    <img
                                        src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                                        alt={video.title}
                                        class="h-20 w-28 flex-shrink-0 rounded object-cover"
                                        loading="lazy"
                                    />
                                    <div class="flex-1 min-w-0">
                                        <button
                                            onclick={() => handleVideoClick(video.videoId)}
                                            class="text-zinc-200 font-medium hover:text-blue-300 transition-colors text-left w-full mb-2 line-clamp-2"
                                        >
                                            {video.title}
                                        </button>
                                        <div class="text-sm text-zinc-400 mb-2">
                                            {formatDate(video.publishedAt || video.$createdAt)} at {formatTime(video.publishedAt || video.$createdAt)}
                                        </div>
                                        <div class="text-sm text-zinc-300 mb-2 line-clamp-2">
                                            {@html marked.parse(video.keyTakeaway)}
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                onclick={() => handleVideoClick(video.videoId)}
                                                class="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                <ExternalLinkIcon class="h-3 w-3" />
                                                Watch on YouTube
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</main>
