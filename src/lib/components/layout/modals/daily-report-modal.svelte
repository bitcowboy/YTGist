<script lang="ts">
	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onGenerate: (date: string) => void;
		isGenerating?: boolean;
	}

	const { isOpen, onClose, onGenerate, isGenerating = false }: Props = $props();

	let selectedDate = $state('');

	$effect(() => {
		if (isOpen) {
			// Set default date to today
			const today = new Date();
			selectedDate = today.toISOString().slice(0, 10);
		}
	});

	function handleGenerate() {
		if (!selectedDate || isGenerating) return;
		onGenerate(selectedDate);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			onClose();
		}
	}

	$effect(() => {
		if (isOpen) {
			window.addEventListener('keydown', handleKeydown);
			return () => {
				window.removeEventListener('keydown', handleKeydown);
			};
		}
	});
</script>

{#if isOpen}
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && onClose()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<div class="mx-4 w-full max-w-md rounded-xl border border-zinc-700/50 bg-zinc-900 p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 id="modal-title" class="text-lg font-semibold text-zinc-100">Daily Report</h3>
				<button
					onclick={onClose}
					class="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
					title="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<div class="mb-6">
				<label for="date-select" class="mb-2 block text-sm font-medium text-zinc-300">
					Select Date
				</label>
				<input
					id="date-select"
					type="date"
					bind:value={selectedDate}
					max={new Date().toISOString().slice(0, 10)}
					class="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
				/>
			</div>
			
			<div class="flex gap-3">
				<button
					onclick={onClose}
					class="flex-1 rounded-lg border border-zinc-600 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50 hover:text-zinc-100"
				>
					Cancel
				</button>
				<button
					onclick={handleGenerate}
					disabled={!selectedDate || isGenerating}
					class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isGenerating ? 'Opening...' : 'Open Report'}
				</button>
			</div>
		</div>
	</div>
{/if}
