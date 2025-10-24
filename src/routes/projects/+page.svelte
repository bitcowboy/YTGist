<script lang="ts">
	import { goto } from '$app/navigation';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import VideoIcon from '@lucide/svelte/icons/video';

	const { data } = $props();

	let projects = $state(data.projects || []);

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
				<button
					onclick={() => window.open(`/projects/${project.$id}`, '_blank')}
					class="group w-full rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-6 text-left transition-all hover:border-zinc-600/50 hover:bg-zinc-800/40"
				>
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<h2 class="text-xl font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors">
								{project.name}
							</h2>
							<p class="mt-1 text-sm text-zinc-400">
								Created {new Date(project.createdAt).toLocaleDateString()}
							</p>
						</div>
						<div class="flex items-center gap-2 text-sm text-zinc-400">
							<VideoIcon class="h-4 w-4" />
							<span>{project.videoCount} {project.videoCount === 1 ? 'video' : 'videos'}</span>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</main>
