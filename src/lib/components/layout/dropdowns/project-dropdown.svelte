<script lang="ts">
	import { fetchProjects, createProject, addVideoToProject, removeVideoFromProject } from '$lib/client/projects';

	interface Props {
		videoId: string;
		isOpen: boolean;
		onClose: () => void;
	}

	const { videoId, isOpen, onClose }: Props = $props();

	let projects = $state<any[]>([]);
	let isAddingToProject = $state(false);
	let isCreatingProject = $state(false);
	let showNewProjectModal = $state(false);
	let newProjectName = $state('');

	// Load projects when dropdown opens
	$effect(() => {
		if (isOpen && videoId) {
			loadProjects();
		}
	});

	async function loadProjects() {
		try {
			projects = await fetchProjects(videoId);
		} catch (error) {
			console.error('Failed to fetch projects:', error);
			alert('Failed to load projects');
		}
	}

	async function handleAddToProject(projectId: string) {
		if (isAddingToProject) return;
		
		isAddingToProject = true;
		try {
			await addVideoToProject(projectId, videoId);
			await loadProjects();
		} catch (error) {
			console.error('Failed to add video to project:', error);
			alert('Failed to add video to project');
		} finally {
			isAddingToProject = false;
		}
	}

	async function handleRemoveFromProject(projectId: string) {
		if (isAddingToProject) return;
		
		isAddingToProject = true;
		try {
			await removeVideoFromProject(projectId, videoId);
			await loadProjects();
		} catch (error) {
			console.error('Failed to remove video from project:', error);
			alert('Failed to remove video from project');
		} finally {
			isAddingToProject = false;
		}
	}

	async function handleCreateProject() {
		if (!newProjectName.trim() || isCreatingProject) return;
		
		isCreatingProject = true;
		try {
			const project = await createProject(newProjectName.trim());
			// Automatically add current video to the newly created project
			if (videoId) {
				try {
					await addVideoToProject(project.$id, videoId);
				} catch (error) {
					console.error('Failed to automatically add video to project:', error);
				}
			}
			await loadProjects();
			newProjectName = '';
			showNewProjectModal = false;
		} catch (error) {
			console.error('Failed to create project:', error);
			alert('Failed to create project');
		} finally {
			isCreatingProject = false;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const dropdown = target.closest('.project-dropdown-container');
		if (!dropdown && isOpen) {
			onClose();
		}
	}

	$effect(() => {
		if (isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});
</script>

{#if isOpen}
	<div class="project-dropdown-container absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl">
		<div class="p-2">
			{#if projects.length === 0}
				<p class="px-3 py-2 text-sm text-zinc-500">No projects found</p>
			{:else}
				<div class="space-y-1">
					{#each projects as project}
						<button
							onclick={() => project.containsVideo ? handleRemoveFromProject(project.$id) : handleAddToProject(project.$id)}
							disabled={isAddingToProject}
							class="w-full rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed {project.containsVideo 
								? 'bg-green-500/10 text-green-100 hover:bg-green-500/20' 
								: 'text-zinc-100 hover:bg-zinc-700'}"
						>
							<div class="flex items-center justify-between">
								<span>{project.name}</span>
								{#if project.containsVideo}
									<svg class="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
			
			<!-- New Project Option -->
			<div class="mt-2 border-t border-zinc-700/50 pt-2">
				<button
					onclick={() => showNewProjectModal = true}
					class="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
				>
					+ New Project
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- New Project Modal -->
{#if showNewProjectModal}
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && (showNewProjectModal = false)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="new-project-modal-title"
		tabindex="-1"
	>
		<div class="mx-4 w-full max-w-md rounded-xl border border-zinc-700/50 bg-zinc-900 p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 id="new-project-modal-title" class="text-lg font-semibold text-zinc-100">Create New Project</h3>
				<button
					onclick={() => showNewProjectModal = false}
					class="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
					title="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<div class="mb-6">
				<label for="new-project-name" class="mb-2 block text-sm font-medium text-zinc-300">
					Project Name
				</label>
				<input
					id="new-project-name"
					type="text"
					bind:value={newProjectName}
					placeholder="Enter project name..."
					class="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
					onkeydown={(e) => e.key === 'Enter' && handleCreateProject()}
				/>
			</div>
			
			<div class="flex gap-3">
				<button
					onclick={() => showNewProjectModal = false}
					class="flex-1 rounded-lg border border-zinc-600 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50 hover:text-zinc-100"
				>
					Cancel
				</button>
				<button
					onclick={handleCreateProject}
					disabled={!newProjectName.trim() || isCreatingProject}
					class="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isCreatingProject ? 'Creating...' : 'Create Project'}
				</button>
			</div>
		</div>
	</div>
{/if}
