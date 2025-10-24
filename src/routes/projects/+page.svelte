<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { deleteProject, removeVideoFromProject } from '$lib/client/projects';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import PlayIcon from '@lucide/svelte/icons/play';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import VideoIcon from '@lucide/svelte/icons/video';

	const { data } = $props();

	let projects = $state(data.projects || []);
	let isDeletingProject = $state<string | null>(null);
	let isRemovingVideo = $state<string | null>(null);

	// Function to delete a project
	async function handleDeleteProject(projectId: string, projectName: string) {
		if (isDeletingProject) return;
		
		if (!confirm(`Are you sure you want to delete the project "${projectName}"? This will also remove all videos from this project.`)) {
			return;
		}
		
		isDeletingProject = projectId;
		
		try {
			await deleteProject(projectId);
			projects = projects.filter((p: any) => p.$id !== projectId);
		} catch (error) {
			console.error('Failed to delete project:', error);
			alert('Failed to delete project');
		} finally {
			isDeletingProject = null;
		}
	}

	// Function to remove video from project
	async function handleRemoveVideo(projectId: string, videoId: string, videoTitle: string) {
		if (isRemovingVideo) return;
		
		if (!confirm(`Are you sure you want to remove "${videoTitle}" from this project?`)) {
			return;
		}
		
		isRemovingVideo = videoId;
		
		try {
			await removeVideoFromProject(projectId, videoId);
			// Update the projects array
			projects = projects.map((project: any) => {
				if (project.$id === projectId) {
					return {
						...project,
						videos: project.videos.filter((v: any) => v.videoId !== videoId),
						videoCount: project.videoCount - 1
					};
				}
				return project;
			});
		} catch (error) {
			console.error('Failed to remove video from project:', error);
			alert('Failed to remove video from project');
		} finally {
			isRemovingVideo = null;
		}
	}

	// Function to navigate to video
	function goToVideo(videoId: string) {
		goto(`/watch?v=${videoId}`);
	}
</script>

<svelte:head>
	<title>Projects - youtubegist</title>
	<meta name="title" content="Projects - youtubegist" />
	<meta name="description" content="Manage your video projects and collections" />
</svelte:head>

<main class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-semibold text-zinc-100">Projects</h1>
		<p class="mt-2 text-zinc-400">Organize your videos into projects</p>
	</div>

	{#if projects.length === 0}
		<div class="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/40 p-12 text-center">
			<FolderIcon class="mx-auto h-12 w-12 text-zinc-500" />
			<h3 class="mt-4 text-lg font-medium text-zinc-300">No projects yet</h3>
			<p class="mt-2 text-zinc-500">Create your first project by adding videos from the watch page.</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#each projects as project}
				<div class="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-6">
					<div class="mb-4 flex items-start justify-between">
						<div class="flex-1">
							<h2 class="text-xl font-semibold text-zinc-100">{project.name}</h2>
							<p class="mt-1 text-sm text-zinc-400">
								{project.videoCount} {project.videoCount === 1 ? 'video' : 'videos'}
							</p>
						</div>
						<button
							onclick={() => handleDeleteProject(project.$id, project.name)}
							disabled={isDeletingProject === project.$id}
							class="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
							title="Delete project"
						>
							<TrashIcon class="h-4 w-4" />
						</button>
					</div>

					{#if project.videos.length === 0}
						<div class="rounded-lg border border-dashed border-zinc-600/50 bg-zinc-800/30 p-8 text-center">
							<VideoIcon class="mx-auto h-8 w-8 text-zinc-500" />
							<p class="mt-2 text-sm text-zinc-500">No videos in this project</p>
						</div>
					{:else}
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each project.videos as video}
								<div class="group rounded-lg border border-zinc-600/50 bg-zinc-800/30 p-4 transition-colors hover:bg-zinc-800/50">
									<div class="mb-3">
										<h3 class="line-clamp-2 text-sm font-medium text-zinc-100 group-hover:text-zinc-50">
											{video.videoDetails?.title || 'Unknown Title'}
										</h3>
										{#if video.videoDetails?.author}
											<p class="mt-1 text-xs text-zinc-400">by {video.videoDetails.author}</p>
										{/if}
									</div>
									
									{#if video.videoDetails?.keyTakeaway}
										<p class="mb-3 line-clamp-2 text-xs text-zinc-500">
											{video.videoDetails.keyTakeaway}
										</p>
									{/if}
									
									<div class="flex items-center justify-between">
										<button
											onclick={() => goToVideo(video.videoId)}
											class="flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-600/30 hover:text-blue-300"
										>
											<PlayIcon class="h-3 w-3" />
											Watch
										</button>
										<button
											onclick={() => handleRemoveVideo(project.$id, video.videoId, video.videoDetails?.title || 'Unknown')}
											disabled={isRemovingVideo === video.videoId}
											class="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
											title="Remove from project"
										>
											<TrashIcon class="h-3 w-3" />
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>
