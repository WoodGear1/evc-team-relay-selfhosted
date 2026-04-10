<script lang="ts">
	import MarkdownViewer from './MarkdownViewer.svelte';
	import { updateShareContent } from '$lib/api';

	interface Props {
		content: string;
		slug: string;
		canEdit: boolean;
		sessionToken?: string;
		authToken?: string;
		class?: string;
		folderItems?: Array<{ path: string; name: string; type: string; content?: string }>;
	}

	let {
		content = $bindable(),
		slug,
		canEdit = false,
		sessionToken,
		authToken,
		class: className = '',
		folderItems
	}: Props = $props();

	let isEditing = $state(false);
	let editContent = $state('');
	let isSaving = $state(false);
	let saveError = $state('');

	function startEditing() {
		editContent = content;
		isEditing = true;
		saveError = '';
	}

	function cancelEditing() {
		isEditing = false;
		editContent = '';
		saveError = '';
	}

	async function saveChanges() {
		if (!editContent.trim()) {
			saveError = 'Content cannot be empty';
			return;
		}

		isSaving = true;
		saveError = '';

		try {
			await updateShareContent(slug, editContent, sessionToken, authToken);
			content = editContent;
			isEditing = false;
			editContent = '';
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Failed to save changes';
			console.error('Failed to save content:', error);
		} finally {
			isSaving = false;
		}
	}
</script>

{#if isEditing}
	<!-- Edit mode -->
	<div class="editor-container">
		<div class="editor-header">
			<h3>Editing Document</h3>
			<div class="editor-actions">
				<button class="btn btn-secondary" onclick={cancelEditing} disabled={isSaving}>
					Cancel
				</button>
				<button class="btn btn-primary" onclick={saveChanges} disabled={isSaving}>
					{isSaving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>

		{#if saveError}
			<div class="error-banner">
				{saveError}
			</div>
		{/if}

		<textarea class="editor-textarea" bind:value={editContent} disabled={isSaving}></textarea>
	</div>
{:else}
	<div class="viewer-container">
		{#if canEdit}
			<button class="edit-button" onclick={startEditing} title="Edit document">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path
						d="M11.333 2.00004C11.5081 1.82494 11.716 1.68605 11.9447 1.59129C12.1735 1.49653 12.4187 1.44775 12.6663 1.44775C12.914 1.44775 13.1592 1.49653 13.3879 1.59129C13.6167 1.68605 13.8246 1.82494 13.9997 2.00004C14.1748 2.17513 14.3137 2.383 14.4084 2.61178C14.5032 2.84055 14.552 3.08575 14.552 3.33337C14.552 3.58099 14.5032 3.82619 14.4084 4.05497C14.3137 4.28374 14.1748 4.49161 13.9997 4.66671L5.33301 13.3334L2.66634 14L3.33301 11.3334L11.333 2.00004Z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>Edit</span>
			</button>
		{/if}
		<MarkdownViewer content={content} class={className} {slug} {folderItems} />
	</div>
{/if}

<style>
	/* Viewer styles */
	.viewer-container {
		position: relative;
	}

	.edit-button {
		position: absolute;
		top: -3rem;
		right: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background-color: #f5f5f5;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: #333;
		transition:
			background-color 0.2s,
			border-color 0.2s;
	}

	.edit-button:hover {
		background-color: #0066cc;
		color: white;
		border-color: #0066cc;
	}

	.edit-button svg {
		width: 16px;
		height: 16px;
	}

	/* Editor styles */
	.editor-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background-color: #f5f5f5;
		border-radius: 4px;
	}

	.editor-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #333;
	}

	.editor-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: 1px solid transparent;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.2s,
			border-color 0.2s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background-color: #0066cc;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #0052a3;
	}

	.btn-secondary {
		background-color: white;
		color: #333;
		border-color: #ddd;
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: #f5f5f5;
	}

	.error-banner {
		padding: 0.75rem 1rem;
		background-color: #ffebee;
		color: #c62828;
		border: 1px solid #ef9a9a;
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.editor-textarea {
		width: 100%;
		min-height: 500px;
		padding: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.9375rem;
		line-height: 1.6;
		resize: vertical;
	}

	.editor-textarea:focus {
		outline: none;
		border-color: #0066cc;
		box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
	}

	.editor-textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.edit-button {
			top: auto;
			bottom: -3rem;
			right: auto;
			left: 0;
		}

		.editor-header {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}

		.editor-actions {
			width: 100%;
		}

		.btn {
			flex: 1;
		}

		.editor-textarea {
			min-height: 400px;
			font-size: 0.875rem;
		}

	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.btn,
		.edit-button {
			transition: none;
		}
	}
</style>
