<script lang="ts">
	import { Position, type NodeProps } from '@xyflow/svelte';
	import { Handle } from '@xyflow/svelte';
	import MarkdownViewer from '../MarkdownViewer.svelte';
	import type { CanvasTextNode } from '../../types/canvas';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';

	let { data, selected } = $props<{ data: CanvasTextNode, selected: boolean }>();

	// Extract content from text node
	let content = $derived(data.text || '');

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
	class="canvas-node text-node"
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
		<MarkdownViewer
			{content}
			slug=""
		/>
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
		padding: 8px 12px;
		flex: 1;
		min-height: 0;
		box-sizing: border-box;
		overflow-y: auto;
		cursor: text;
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

	/* Map color class to bg/border if color is 1-6 */
	.canvas-node[style*="--canvas-node-color"] {
		--canvas-node-border: var(--canvas-node-color);
		--canvas-node-bg: color-mix(in srgb, var(--canvas-node-color) 15%, transparent);
	}
	
	/* Disable pointer events on handles since we're read-only */
	:global(.svelte-flow__handle) {
		pointer-events: none;
	}
</style>
