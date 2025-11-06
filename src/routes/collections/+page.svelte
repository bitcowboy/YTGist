<script lang="ts">
	import { goto } from '$app/navigation';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import VideoIcon from '@lucide/svelte/icons/video';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EditIcon from '@lucide/svelte/icons/edit';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { fetchCollections, createCollection, updateCollection, deleteCollection } from '$lib/client/collections';
	import type { Collection } from '$lib/types';

	const { data } = $props();

	let collections = $state((data.collections || []) as any[]);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let editingCollection: Collection | null = $state(null);
	let collectionName = $state('');
	let collectionDescription = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	function openCreateModal() {
		collectionName = '';
		collectionDescription = '';
		error = null;
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
		collectionName = '';
		collectionDescription = '';
		error = null;
	}

	function openEditModal(collection: Collection) {
		editingCollection = collection;
		collectionName = collection.name;
		collectionDescription = collection.description || '';
		error = null;
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		editingCollection = null;
		collectionName = '';
		collectionDescription = '';
		error = null;
	}

	async function handleCreate() {
		if (!collectionName.trim() || isSubmitting) return;
		
		isSubmitting = true;
		error = null;
		
		try {
			const newCollection = await createCollection(collectionName.trim(), collectionDescription.trim() || undefined);
			collections = [...collections, { ...newCollection, videoCount: 0 }];
			closeCreateModal();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create collection';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleUpdate() {
		if (!editingCollection || !collectionName.trim() || isSubmitting) return;
		
		isSubmitting = true;
		error = null;
		
		try {
			const updatedCollection = await updateCollection(
				editingCollection.$id,
				collectionName.trim(),
				collectionDescription.trim() || undefined
			);
			collections = collections.map(c => 
				c.$id === updatedCollection.$id 
					? { ...updatedCollection, videoCount: c.videoCount }
					: c
			);
			closeEditModal();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update collection';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(collection: Collection) {
		if (!confirm(`确定要删除分类"${collection.name}"吗？此操作无法撤销。`)) {
			return;
		}
		
		try {
			await deleteCollection(collection.$id);
			collections = collections.filter(c => c.$id !== collection.$id);
		} catch (err) {
			alert(err instanceof Error ? err.message : '删除分类失败');
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			if (showCreateModal) closeCreateModal();
			if (showEditModal) closeEditModal();
		}
	}
</script>

<svelte:head>
	<title>Collections - youtubegist</title>
	<meta name="title" content="Collections - youtubegist" />
	<meta name="description" content="Manage your video collections" />
</svelte:head>

<main class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-semibold text-zinc-100">Collections</h1>
			<p class="mt-2 text-zinc-400">智能分类管理您的视频</p>
		</div>
		<button
			onclick={openCreateModal}
			class="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
		>
			<PlusIcon class="h-4 w-4" />
			新建分类
		</button>
	</div>

	{#if collections.length === 0}
		<div class="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/40 p-12 text-center">
			<FolderIcon class="mx-auto h-12 w-12 text-zinc-500" />
			<h3 class="mt-4 text-lg font-medium text-zinc-300">还没有分类</h3>
			<p class="mt-2 text-zinc-500">创建您的第一个分类，AI会自动为视频分类。</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#each collections as collection}
				<div class="group relative rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-6 transition-all hover:border-zinc-600/50 hover:bg-zinc-800/40">
					<button
						onclick={() => window.open(`/collections/${collection.$id}`, '_blank')}
						class="w-full text-left"
					>
						<div class="flex items-center justify-between gap-4">
							<h2 class="text-xl font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors">
								{collection.name}
							</h2>
							<div class="flex items-center gap-2 text-sm text-zinc-400 shrink-0">
								<span>创建于 {new Date(collection.createdAt).toLocaleDateString()}</span>
								<span class="flex items-center gap-1">
									<VideoIcon class="h-4 w-4" />
									<span>{collection.videoCount}</span>
								</span>
							</div>
						</div>
						
						{#if collection.description}
							<p class="mt-2 text-sm text-zinc-400 line-clamp-2">
								{collection.description}
							</p>
						{/if}
					</button>
					
					<div class="absolute right-6 top-6 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
						<button
							onclick={(e) => {
								e.stopPropagation();
								openEditModal(collection);
							}}
							class="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
							title="编辑分类"
						>
							<EditIcon class="h-4 w-4" />
						</button>
						<button
							onclick={(e) => {
								e.stopPropagation();
								handleDelete(collection);
							}}
							class="rounded p-1.5 text-zinc-400 transition-colors hover:bg-red-900/30 hover:text-red-400"
							title="删除分类"
						>
							<TrashIcon class="h-4 w-4" />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

<!-- Create Modal -->
{#if showCreateModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-md">
			<div class="flex items-center justify-between p-6 border-b border-zinc-700">
				<h2 class="text-xl font-semibold text-zinc-100">新建分类</h2>
				<button
					onclick={closeCreateModal}
					disabled={isSubmitting}
					class="p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
				>
					<XIcon class="h-5 w-5" />
				</button>
			</div>
			
			<div class="p-6 space-y-4">
				<div>
					<label for="create-name" class="block text-sm font-medium text-zinc-200 mb-2">
						分类名称 *
					</label>
					<input
						id="create-name"
						type="text"
						bind:value={collectionName}
						disabled={isSubmitting}
						placeholder="例如：科技、教育、娱乐"
						class="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
					/>
				</div>
				
				<div>
					<label for="create-description" class="block text-sm font-medium text-zinc-200 mb-2">
						分类描述（可选）
					</label>
					<textarea
						id="create-description"
						bind:value={collectionDescription}
						disabled={isSubmitting}
						rows="3"
						placeholder="描述这个分类的用途或特点"
						class="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
					></textarea>
				</div>
				
				{#if error}
					<div class="text-sm text-red-400">{error}</div>
				{/if}
			</div>
			
			<div class="flex items-center justify-end gap-3 p-6 border-t border-zinc-700">
				<button
					onclick={closeCreateModal}
					disabled={isSubmitting}
					class="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
				>
					取消
				</button>
				<button
					onclick={handleCreate}
					disabled={isSubmitting || !collectionName.trim()}
					class="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? '创建中...' : '创建'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Modal -->
{#if showEditModal && editingCollection}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-md">
			<div class="flex items-center justify-between p-6 border-b border-zinc-700">
				<h2 class="text-xl font-semibold text-zinc-100">编辑分类</h2>
				<button
					onclick={closeEditModal}
					disabled={isSubmitting}
					class="p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
				>
					<XIcon class="h-5 w-5" />
				</button>
			</div>
			
			<div class="p-6 space-y-4">
				<div>
					<label for="edit-name" class="block text-sm font-medium text-zinc-200 mb-2">
						分类名称 *
					</label>
					<input
						id="edit-name"
						type="text"
						bind:value={collectionName}
						disabled={isSubmitting}
						class="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
					/>
				</div>
				
				<div>
					<label for="edit-description" class="block text-sm font-medium text-zinc-200 mb-2">
						分类描述（可选）
					</label>
					<textarea
						id="edit-description"
						bind:value={collectionDescription}
						disabled={isSubmitting}
						rows="3"
						class="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
					></textarea>
				</div>
				
				{#if error}
					<div class="text-sm text-red-400">{error}</div>
				{/if}
			</div>
			
			<div class="flex items-center justify-end gap-3 p-6 border-t border-zinc-700">
				<button
					onclick={closeEditModal}
					disabled={isSubmitting}
					class="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
				>
					取消
				</button>
				<button
					onclick={handleUpdate}
					disabled={isSubmitting || !collectionName.trim()}
					class="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? '保存中...' : '保存'}
				</button>
			</div>
		</div>
	</div>
{/if}

