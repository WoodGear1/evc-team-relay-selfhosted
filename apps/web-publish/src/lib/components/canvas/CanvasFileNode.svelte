<script lang="ts">
	import { Position, type NodeProps } from '@xyflow/svelte';
	import { Handle } from '@xyflow/svelte';
	import MarkdownViewer from '../MarkdownViewer.svelte';
	import type { CanvasFileNode } from '../../types/canvas';
	import { slugifyPath } from '$lib/file-tree';

	let { data, selected } = $props<{ data: CanvasFileNode & { _resolvedContent?: string, _resolvedUrl?: string, _isImage?: boolean, _resolvedPath?: string, _slug?: string, _folderItems?: any[] }, selected: boolean }>();
	let isImage = $derived(data._isImage || false);
	let fileUrl = $derived(data._resolvedUrl || '');
	let markdownContent = $derived(data._resolvedContent || '');
	let fileName = $derived(data.file.split('/').pop() || data.file);
	let resolvedPath = $derived(data._resolvedPath || data.file);
	let slug = $derived(data._slug || '');
	let folderItems = $derived(data._folderItems || []);
	
	let fileLink = $derived(`/${slug}/${slugifyPath(resolvedPath)}`);

	// Define style based on color
	let style = $derived.by(() => {
		let s = '';
		if (data.color) {
			if (data.color.startsWith('#')) {
				s += `--canvas-node-bg: ${data.color}22; --canvas-node-border: ${data.color}; `;
			} else {
				s += `--canvas-node-color: var(--canvas-color-${data.color}); `;
			}
		}
		return s;
	});
</script>

<div
	class="canvas-node file-node"
	class:selected
	{style}
>
	<!-- Standard handles for all sides -->
	<Handle type="target" position={Position.Top} id="top" style="opacity: 0;" />
	<Handle type="source" position={Position.Top} id="top-source" style="opacity: 0;" />

	<Handle type="target" position={Position.Right} id="right" style="opacity: 0;" />
	<Handle type="source" position={Position.Right} id="right-source" style="opacity: 0;" />

	<Handle type="target" position={Position.Bottom} id="bottom" style="opacity: 0;" />
	<Handle type="source" position={Position.Bottom} id="bottom-source" style="opacity: 0;" />

	<Handle type="target" position={Position.Left} id="left" style="opacity: 0;" />
	<Handle type="source" position={Position.Left} id="left-source" style="opacity: 0;" />

	<div class="node-header nodrag">
		<a href={fileLink} class="node-title-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
			<span class="file-name">{fileName}</span>
		</a>
	</div>

	{#if isImage && fileUrl}
		<div class="image-container nodrag">
			<img src={fileUrl} alt={fileName} loading="lazy" />
		</div>
	{:else if data._fetchError}
		<div class="file-placeholder error p-4 flex flex-col items-center justify-center text-center h-full w-full">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			{#if data._errorStatus === 403}
				<span class="font-medium text-sm mb-1" style="color: hsl(var(--destructive))">Access Denied</span>
				<span class="text-xs opacity-80" style="color: hsl(var(--muted-foreground))">{data._errorMessage || "You don't have permission to view this file."}</span>
			{:else}
				<span class="font-medium text-sm mb-1" style="color: hsl(var(--destructive))">File Not Found</span>
				<span class="text-xs opacity-80" style="color: hsl(var(--muted-foreground))">This file is not published or not found in this folder.</span>
			{/if}
		</div>
	{:else if typeof data._resolvedContent === 'string'}
		<!-- If _resolvedContent is a string (even empty), it means fetching succeeded -->
		<div class="content nodrag">
			{#if markdownContent}
				<MarkdownViewer
					content={markdownContent}
					{slug}
					{folderItems}
				/>
			{:else}
				<div class="empty-content-msg">
					<span class="text-muted-foreground text-sm italic">Empty file</span>
				</div>
			{/if}
		</div>
	{:else}
		<div class="file-placeholder">
			<span class="loading-text">Loading...</span>
		</div>
	{/if}
</div>

<style>
	.node-header {
		padding: 8px 16px;
		background: hsl(var(--muted) / 0.3);
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		display: flex;
		align-items: center;
	}

	.node-title-link {
		display: flex;
		align-items: center;
		gap: 6px;
		text-decoration: none;
		color: hsl(var(--foreground));
		font-weight: 500;
		font-size: 0.9rem;
		transition: color 0.2s;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-title-link:hover {
		color: hsl(var(--primary));
		text-decoration: underline;
	}

	.file-icon {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-content-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 16px;
		text-align: center;
	}

	.canvas-node {
		width: 100%;
		height: 100%;
		background-color: var(--canvas-node-bg, hsl(var(--card)));
		border: 2px solid var(--canvas-node-border, hsl(var(--border)));
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
		transition: border-color 0.2s, box-shadow 0.2s;
		display: flex;
		flex-direction: column;
	}

	:global(.dark) .canvas-node {
		background-color: var(--canvas-node-bg, hsl(var(--card)));
		border-color: var(--canvas-node-border, hsl(var(--border)));
	}

	.canvas-node.selected {
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 0 0 2px var(--color-accent-alpha, rgba(59, 130, 246, 0.3));
	}

	.content {
		padding: 8px 12px;
		flex: 1;
		min-height: 0;
		box-sizing: border-box;
		overflow-y: auto;
		cursor: text;
	}

	.image-container {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: transparent;
	}

	.image-container img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.file-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--text-muted, #6b7280);
		gap: 8px;
		padding: 16px;
		text-align: center;
		word-break: break-all;
	}

	.loading-text {
		font-size: 0.8em;
		opacity: 0.7;
	}

	/* CSS Variables for Obsidian colors (1-6) */
	.canvas-node {
		--canvas-color-1: #d32f2f; /* Red */
		--canvas-color-2: #f57c00; /* Orange */
		--canvas-color-3: #fbc02d; /* Yellow */
		--canvas-color-4: #388e3c; /* Green */
		--canvas-color-5: #0288d1; /* Cyan */
		--canvas-color-6: #7b1fa2; /* Purple */
	}

	.canvas-node[style*="--canvas-node-color"] {
		--canvas-node-border: var(--canvas-node-color);
		--canvas-node-bg: color-mix(in srgb, var(--canvas-node-color) 15%, transparent);
	}
</style>
