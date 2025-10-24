<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { removeVideoFromProject, deleteProject } from '$lib/client/projects';
	import type { Project, ProjectVideo, SummaryData } from '$lib/types';

	const { data }: { data: PageData } = $props();

	let isDeletingProject = $state(false);
	let isRemovingVideo = $state<string | null>(null);

	// Function to delete project
	async function handleDeleteProject() {
		if (!data.project || isDeletingProject) return;
		
		if (!confirm(`Are you sure you want to delete "${data.project.name}"? This action cannot be undone.`)) {
			return;
		}

		isDeletingProject = true;
		
		try {
			await deleteProject(data.project.$id);
			// Redirect to projects page after successful deletion
			goto('/projects');
		} catch (error) {
			console.error('Failed to delete project:', error);
			alert('Failed to delete project');
		} finally {
			isDeletingProject = false;
		}
	}

	// Function to remove video from project
	async function handleRemoveVideo(projectId: string, videoId: string) {
		if (isRemovingVideo) return;
		
		isRemovingVideo = videoId;
		
		try {
			await removeVideoFromProject(projectId, videoId);
			// Refresh the page to update the video list
			window.location.reload();
		} catch (error) {
			console.error('Failed to remove video from project:', error);
			alert('Failed to remove video from project');
		} finally {
			isRemovingVideo = null;
		}
	}

	// Function to navigate to watch page
	function goToVideo(videoId: string) {
		goto(`/watch?v=${videoId}`);
	}

	// Format date
	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{data.project?.name || 'Project'} - YTGist</title>
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<div class="container mx-auto px-4 py-8">
		{#if !data.project}
			<div class="text-center py-16">
				<h1 class="text-2xl font-bold text-zinc-100 mb-4">Project Not Found</h1>
				<p class="text-zinc-400 mb-8">The project you're looking for doesn't exist or has been deleted.</p>
				<button
					onclick={() => goto('/projects')}
					class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					Back to Projects
				</button>
			</div>
		{:else}
			<!-- Project Header -->
			<div class="mb-8">
				<div class="flex items-center gap-4 mb-4">
					<button
						onclick={() => goto('/projects')}
						class="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
						</svg>
						Back to Projects
					</button>
				</div>
				
				<div class="flex items-start justify-between">
					<div>
						<h1 class="text-3xl font-bold text-zinc-100 mb-2">{data.project.name}</h1>
						<p class="text-zinc-400">
							Created on {formatDate(data.project.createdAt)} • {data.videos.length} video{data.videos.length !== 1 ? 's' : ''}
						</p>
					</div>
					
					<button
						onclick={handleDeleteProject}
						disabled={isDeletingProject}
						class="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						{isDeletingProject ? 'Deleting...' : 'Delete Project'}
					</button>
				</div>
			</div>

			<!-- Videos List -->
			{#if data.videos.length === 0}
				<div class="text-center py-16">
					<svg class="mx-auto h-12 w-12 text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
					</svg>
					<h3 class="text-lg font-medium text-zinc-300 mb-2">No videos in this project</h3>
					<p class="text-zinc-500 mb-6">Add videos to this project from the watch page.</p>
					<button
						onclick={() => goto('/')}
						class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
						</svg>
						Browse Videos
					</button>
				</div>
			{:else}
				<div class="grid gap-4">
					{#each data.videos as video, index}
						<div class="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:bg-zinc-800/50">
							<div class="flex items-start gap-4">
								<!-- Video Thumbnail -->
								<div class="flex-shrink-0">
									<button
										onclick={() => goToVideo(video.videoId)}
										class="group relative block overflow-hidden rounded-lg bg-zinc-800"
									>
										<img
											src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
											alt={video.summary?.title || 'Video thumbnail'}
											class="h-20 w-36 object-cover transition-transform group-hover:scale-105"
											loading="lazy"
										/>
										
										<!-- Play overlay -->
										<div class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
											<svg class="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
												<path d="M8 5v14l11-7z" />
											</svg>
										</div>
									</button>
								</div>

								<!-- Video Info -->
								<div class="flex-1 min-w-0">
									<button
										onclick={() => goToVideo(video.videoId)}
										class="block w-full text-left"
									>
										<h3 class="text-lg font-semibold text-zinc-100 mb-2 line-clamp-2 group-hover:text-purple-400 transition-colors">
											{video.summary?.title || `Video ${video.videoId}`}
										</h3>
									</button>
									
									{#if video.summary}
									<div class="flex items-center gap-4 text-sm text-zinc-400 mb-2">
										<span>{video.summary.author}</span>
										<span>•</span>
										<span>Added {formatDate(video.addedAt)}</span>
									</div>
										
										{#if video.summary.summary}
											<p class="text-sm text-zinc-500 line-clamp-2 mb-3">
												{video.summary.summary}
											</p>
										{/if}
									{:else}
										<p class="text-sm text-zinc-500 mb-3">
											Summary data not available
										</p>
									{/if}
								</div>

								<!-- Actions -->
								<div class="flex items-center gap-2">
									<button
										onclick={() => goToVideo(video.videoId)}
										class="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
										</svg>
										Watch
									</button>
									
									<button
										onclick={() => handleRemoveVideo(data.project.$id, video.videoId)}
										disabled={isRemovingVideo === video.videoId}
										class="flex items-center gap-2 rounded-lg border border-zinc-600 bg-transparent px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
										{isRemovingVideo === video.videoId ? 'Removing...' : 'Remove'}
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-clamp: 2;
	}
</style>
