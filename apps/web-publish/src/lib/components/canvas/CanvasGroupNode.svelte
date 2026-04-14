<script lang="ts">
	import { Position, type NodeProps } from '@xyflow/svelte';
	import { Handle } from '@xyflow/svelte';
	import type { CanvasGroupNode } from '../../types/canvas';

	let { data, selected } = $props<{ data: CanvasGroupNode, selected: boolean }>();
	
	let label = $derived(data.label || '');

	// Define style based on color and group settings
	let style = $derived.by(() => {
		let s = '';
		if (data.color) {
			if (data.color.startsWith('#')) {
				s += `--canvas-node-border: ${data.color}; `;
			} else {
				s += `--canvas-node-border: var(--canvas-color-${data.color}); `;
			}
		}
		return s;
	});
</script>

<div
	class="canvas-node group-node"
	class:selected
	class:has-label={!!label}
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

	{#if label}
		<div class="group-label">
			{label}
		</div>
	{/if}
</div>

<style>
	.canvas-node {
		width: 100%;
		height: 100%;
		background-color: transparent !important;
		border: 2px solid var(--canvas-node-border, hsl(var(--border)));
		border-radius: 12px;
		transition: border-color 0.2s, box-shadow 0.2s;
		position: relative;
	}

	:global(.dark) .canvas-node {
		background-color: transparent !important;
		border-color: var(--canvas-node-border, hsl(var(--border)));
	}

	.canvas-node.selected {
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 0 0 2px var(--color-accent-alpha, rgba(59, 130, 246, 0.3));
	}

	.group-label {
		position: absolute;
		top: -14px;
		left: 12px;
		background: hsl(var(--background));
		padding: 0 8px;
		font-weight: 600;
		font-size: 14px;
		color: var(--text-normal, #111827);
		border-radius: 4px;
		z-index: 10;
		/* Use the group's border color for the label text if it has a color */
		color: var(--canvas-node-border, var(--text-normal, #111827));
	}

	:global(.dark) .group-label {
		background: hsl(var(--background));
		color: var(--canvas-node-border, var(--text-normal, #f3f4f6));
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
</style>
