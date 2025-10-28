<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import SaveIcon from '@lucide/svelte/icons/save';

	const dispatch = createEventDispatcher();

	let { isOpen = $bindable(), projectId, initialPrompt }: { 
		isOpen: boolean; 
		projectId: string; 
		initialPrompt: string; 
	} = $props();

	let customPrompt = $state(initialPrompt);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Update local state when initialPrompt changes
	$effect(() => {
		customPrompt = initialPrompt;
	});

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			handleClose();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleClose() {
		if (!isLoading) {
			dispatch('close');
		}
	}

	async function handleSave() {
		if (!customPrompt.trim()) {
			error = 'Custom prompt cannot be empty';
			return;
		}

		if (customPrompt.length > 10000) {
			error = 'Custom prompt is too long (max 10000 characters)';
			return;
		}

		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/settings`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					customPrompt: customPrompt.trim()
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to save custom prompt');
			}

			dispatch('save', { customPrompt: customPrompt.trim() });
			dispatch('close');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save custom prompt';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div 
		class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		onclick={handleBackdropClick}
		onkeydown={(e) => e.key === 'Escape' && handleClose()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<!-- Modal -->
		<div class="bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-4xl max-h-[90vh] overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-zinc-700">
				<h2 id="modal-title" class="text-xl font-semibold text-zinc-100">
					Project Settings
				</h2>
				<button
					onclick={handleClose}
					disabled={isLoading}
					class="p-2 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					aria-label="Close modal"
				>
					<XIcon class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
				<div class="space-y-4">
					<div>
						<label for="custom-prompt" class="block text-sm font-medium text-zinc-200 mb-2">
							Custom AI Prompt
						</label>
						<p class="text-sm text-zinc-400 mb-4">
							Customize the AI prompt used for generating project summaries. This will affect how the AI analyzes and summarizes your video content.
						</p>
						<textarea
							id="custom-prompt"
							bind:value={customPrompt}
							rows="15"
							disabled={isLoading}
							class="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
							placeholder="Enter your custom AI prompt here..."
						></textarea>
						<div class="flex justify-between items-center mt-2">
							<span class="text-xs text-zinc-500">
								{customPrompt.length}/10000 characters
							</span>
							{#if error}
								<span class="text-xs text-red-400">{error}</span>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end gap-3 p-6 border-t border-zinc-700">
				<button
					onclick={handleClose}
					disabled={isLoading}
					class="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Cancel
				</button>
				<button
					onclick={handleSave}
					disabled={isLoading || !customPrompt.trim()}
					class="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isLoading}
						<svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						Saving...
					{:else}
						<SaveIcon class="h-4 w-4" />
						Save
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
