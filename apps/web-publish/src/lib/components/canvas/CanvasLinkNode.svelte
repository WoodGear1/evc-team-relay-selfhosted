<script lang="ts">
	import { Position, type NodeProps } from '@xyflow/svelte';
	import { Handle } from '@xyflow/svelte';
	import type { CanvasLinkNode } from '../../types/canvas';

	let { data, selected } = $props<{ data: CanvasLinkNode, selected: boolean }>();

	let url = $derived(data.url || '');

	// Extract domain for display
	let domain = $derived.by(() => {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	});

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
	class="canvas-node link-node"
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

	<div class="content nodrag">
		<a href={url} target="_blank" rel="noopener noreferrer" class="link-card">
			<div class="link-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
			</div>
			<div class="link-details">
				<span class="link-domain">{domain}</span>
				<span class="link-url">{url}</span>
			</div>
			<div class="link-external-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
			</div>
		</a>
	</div>
</div>

<style>
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
		width: 100%;
		height: 100%;
		display: flex;
	}

	.link-card {
		display: flex;
		align-items: center;
		width: 100%;
		height: 100%;
		padding: 16px;
		gap: 16px;
		text-decoration: none;
		color: inherit;
		transition: background-color 0.2s;
	}

	.link-card:hover {
		background-color: var(--bg-hover, rgba(0, 0, 0, 0.05));
	}

	:global(.dark) .link-card:hover {
		background-color: var(--bg-hover, rgba(255, 255, 255, 0.05));
	}

	.link-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 8px;
		background-color: var(--bg-secondary, #f3f4f6);
		color: var(--text-muted, #6b7280);
		flex-shrink: 0;
	}

	:global(.dark) .link-icon {
		background-color: var(--bg-secondary, #374151);
		color: var(--text-muted, #9ca3af);
	}

	.link-details {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-width: 0;
		gap: 4px;
	}

	.link-domain {
		font-weight: 600;
		font-size: 16px;
		color: var(--text-normal, #111827);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.dark) .link-domain {
		color: var(--text-normal, #f3f4f6);
	}

	.link-url {
		font-size: 14px;
		color: var(--text-muted, #6b7280);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.dark) .link-url {
		color: var(--text-muted, #9ca3af);
	}

	.link-external-icon {
		color: var(--text-muted, #9ca3af);
		flex-shrink: 0;
		opacity: 0.5;
		transition: opacity 0.2s;
	}

	.link-card:hover .link-external-icon {
		opacity: 1;
		color: var(--color-accent, #3b82f6);
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
