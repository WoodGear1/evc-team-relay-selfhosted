<script lang="ts">
	import { SvelteFlow, Background, Controls, type Node, type Edge, BackgroundVariant } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	
	import type { CanvasData, CanvasNode, CanvasEdge } from '../../types/canvas';
	import CanvasTextNode from './CanvasTextNode.svelte';
	import CanvasFileNode from './CanvasFileNode.svelte';
	import CanvasGroupNode from './CanvasGroupNode.svelte';
	import CanvasLinkNode from './CanvasLinkNode.svelte';
	import { onMount } from 'svelte';
	import type { FolderItem } from '$lib/api';
	
	let { canvasData, slug, folderItems = [] } = $props<{ canvasData: CanvasData, slug: string, folderItems?: FolderItem[] }>();

	// Map node types to our custom components
	const nodeTypes = {
		text: CanvasTextNode,
		file: CanvasFileNode,
		group: CanvasGroupNode,
		link: CanvasLinkNode
	};

	let resolvedNodes = $state<Node[]>([]);
	let isLoading = $state(true);
	let isFullscreen = $state(false);
	let colorMode = $state<'light' | 'dark' | 'system'>('system');

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
		if (isFullscreen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
	}

	// Function to resolve file node contents
	async function resolveFileNodes(data: CanvasData) {
		if (!data || !data.nodes) return [];
		
		const initialNodes: Node[] = data.nodes.map(node => {
			return {
				id: node.id,
				type: node.type,
				position: { x: node.x, y: node.y },
				style: `width: ${node.width}px; height: ${node.height}px;`,
				data: { ...node, _slug: slug, _folderItems: folderItems },
				// Groups should be in the background
				zIndex: node.type === 'group' ? -1 : 1
			};
		});

		// Resolve files that are markdown or images
		const resolvedPromises = initialNodes.map(async (sfNode) => {
			if (sfNode.type === 'file' && sfNode.data && 'file' in sfNode.data) {
				const fileData = sfNode.data as any;
				const filePath = fileData.file as string;
				const lowerPath = filePath.toLowerCase();
				
				// Resolve actual path by checking folder items to handle nested sharing
				let actualPath = filePath;
				if (folderItems && folderItems.length > 0) {
					// Find an item where its path ends with the filePath, or filePath ends with its path
					// e.g. "my_folder/subfolder/file.md" matches "subfolder/file.md"
					const matchedItem = folderItems.find((item: FolderItem) => 
						item.path && (filePath.endsWith(item.path) || item.path.endsWith(filePath))
					);
					if (matchedItem) {
						actualPath = matchedItem.path;
					}
				}
				
				// Pass the resolved path so the node can link to it
				sfNode.data._resolvedPath = actualPath;
				
				// Check if image
				if (lowerPath.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/i)) {
					// Use the proxy/API endpoint for images
					sfNode.data = {
						...fileData,
						_isImage: true,
						_resolvedUrl: `/api/assets?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(actualPath)}`,
						_resolvedPath: actualPath,
						_slug: slug,
						_folderItems: folderItems
					};
				} 
				// Check if markdown
				else if (lowerPath.endsWith('.md') || lowerPath.endsWith('.canvas')) {
					try {
						// Fetch the file content
						const response = await fetch(`/api/files?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(actualPath)}`);
						if (response.ok) {
							const result = await response.json();
							sfNode.data = {
								...fileData,
								_resolvedContent: result.content || result.has_content ? result.content : '',
								_resolvedPath: result.path || actualPath,
								_slug: result.share_slug || slug,
								_folderItems: folderItems
							};
						} else {
							const errorResult = await response.json().catch(() => ({ error: 'Unknown error' }));
							console.warn(`Failed to fetch canvas file node content: ${actualPath}`, errorResult);
							sfNode.data = {
								...fileData,
								_fetchError: true,
								_errorStatus: response.status,
								_errorMessage: errorResult.error || 'Failed to load file',
								_resolvedPath: actualPath
							};
						}
					} catch (e) {
						console.error(`Error fetching canvas file node content: ${actualPath}`, e);
						sfNode.data = {
							...fileData,
							_fetchError: true,
							_errorStatus: 500,
							_errorMessage: 'Network error',
							_resolvedPath: actualPath
						};
					}
				}
			}
			return sfNode;
		});

		return await Promise.all(resolvedPromises);
	}

	onMount(() => {
		isLoading = true;
		resolveFileNodes(canvasData).then(nodes => {
			resolvedNodes = nodes;
			isLoading = false;
		});

		const updateMode = () => {
			colorMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
		};
		updateMode();
		const observer = new MutationObserver(updateMode);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		return () => {
			observer.disconnect();
			document.body.style.overflow = '';
		};
	});

	// React to canvasData changes if it's updated dynamically
	$effect(() => {
		if (canvasData) {
			resolveFileNodes(canvasData).then(nodes => {
				resolvedNodes = nodes;
			});
		}
	});

	// Convert Obsidian Canvas data to SvelteFlow edges
	let edges = $derived.by(() => {
		if (!canvasData || !canvasData.edges) return [];
		
		return canvasData.edges.map((edge: CanvasEdge) => {
			const sfEdge: Edge = {
				id: edge.id,
				source: edge.fromNode,
				target: edge.toNode,
				// Obsidian uses side names, SvelteFlow uses handles named after sides
				sourceHandle: `${edge.fromSide}-source`, 
				targetHandle: edge.toSide,
				label: edge.label || undefined,
				type: 'default', // standard curved line
				style: edge.color ? `stroke: ${mapColor(edge.color)}` : '',
			};
			return sfEdge;
		});
	});

	// Helper to map Obsidian colors to CSS variables or hex
	function mapColor(color: string): string {
		if (color.startsWith('#')) return color;
		return `var(--canvas-color-${color})`;
	}
</script>

<div class="canvas-container" class:fullscreen={isFullscreen}>
	<button class="fullscreen-btn" onclick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
		{#if isFullscreen}
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
		{/if}
	</button>

	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<span>Loading canvas data...</span>
		</div>
	{:else if resolvedNodes.length > 0}
		<SvelteFlow
			nodes={resolvedNodes}
			{edges}
			{nodeTypes}
			{colorMode}
			fitView
			minZoom={0.1}
			maxZoom={4}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={false}
			zoomOnScroll={true}
			panOnDrag={true}
			panOnScroll={false}
		>
			<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
			<Controls showLock={false} />
		</SvelteFlow>
	{:else}
		<div class="empty-state">
			No nodes found in this canvas.
		</div>
	{/if}
</div>

<style>
	.canvas-container {
		width: 100%;
		height: 100vh;
		min-height: 500px;
		background-color: hsl(var(--background));
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid hsl(var(--border));
		position: relative;
		--xy-background-color: transparent !important;
		--xy-node-background-color: transparent !important;
		--xy-node-group-background-color: transparent !important;
		--xy-node-background-color-default: transparent !important;
	}

	.canvas-container :global(.svelte-flow) {
		background-color: transparent !important;
	}

	.canvas-container :global(.svelte-flow__background) {
		background-color: transparent !important;
	}

	.canvas-container :global(.svelte-flow__node),
	.canvas-container :global(.svelte-flow__node-group),
	.canvas-container :global(.svelte-flow__node-default) {
		background-color: transparent !important;
		border: none !important;
		box-shadow: none !important;
	}

	.canvas-container.fullscreen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100vw;
		height: 100vh;
		z-index: 9999;
		border-radius: 0;
		border: none;
	}

	.fullscreen-btn {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 100;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--card) / 0.8);
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--foreground));
		cursor: pointer;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transition: all 0.2s;
	}

	.fullscreen-btn:hover {
		background: hsl(var(--card));
		transform: scale(1.05);
	}

	:global(.dark) .canvas-container {
		background-color: hsl(var(--background));
		border-color: hsl(var(--border));
	}

	.empty-state, .loading-state {
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--text-muted, #6b7280);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-color, #e5e7eb);
		border-top-color: var(--color-accent, #3b82f6);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Force SvelteFlow controls to match our theme */
	:global(.svelte-flow__controls) {
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
		border: 1px solid var(--border-color, #e5e7eb) !important;
		border-radius: 8px !important;
		overflow: hidden !important;
	}

	:global(.dark .svelte-flow__controls) {
		border-color: var(--border-color, #374151) !important;
		background: var(--bg-secondary, #1f2937) !important;
	}

	:global(.dark .svelte-flow__controls-button) {
		background: var(--bg-secondary, #1f2937) !important;
		border-bottom-color: var(--border-color, #374151) !important;
		color: var(--text-normal, #f3f4f6) !important;
	}

	:global(.dark .svelte-flow__controls-button:hover) {
		background: var(--bg-hover, #374151) !important;
	}

	:global(.dark .svelte-flow__controls-button svg) {
		fill: currentColor !important;
	}
	
	/* Edge styles */
	:global(.svelte-flow__edge-path) {
		stroke-width: 3px;
	}
	
	:global(.svelte-flow__edge-textbg) {
		fill: var(--bg-primary, #ffffff);
	}
	
	:global(.dark .svelte-flow__edge-textbg) {
		fill: var(--bg-primary, #1f2937);
	}
	
	:global(.svelte-flow__edge-text) {
		fill: var(--text-normal, #111827);
		font-weight: 600;
	}
	
	:global(.dark .svelte-flow__edge-text) {
		fill: var(--text-normal, #f3f4f6);
	}
</style>
