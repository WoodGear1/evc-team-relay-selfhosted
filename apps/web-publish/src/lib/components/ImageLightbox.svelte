<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	interface Props {
		src: string;
		alt?: string;
		onclose: () => void;
	}

	let { src, alt = '', onclose }: Props = $props();

	let scale = $state(1);
	let translateX = $state(0);
	let translateY = $state(0);
	let isDragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let lastTranslateX = 0;
	let lastTranslateY = 0;
	let backdropEl: HTMLDivElement | null = null;

	const MIN_SCALE = 0.5;
	const MAX_SCALE = 8;

	function resetView() {
		scale = 1;
		translateX = 0;
		translateY = 0;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));
		if (next !== scale) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const cx = e.clientX - rect.left - rect.width / 2;
			const cy = e.clientY - rect.top - rect.height / 2;
			translateX = cx - (cx - translateX) * (next / scale);
			translateY = cy - (cy - translateY) * (next / scale);
			scale = next;
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		lastTranslateX = translateX;
		lastTranslateY = translateY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		translateX = lastTranslateX + (e.clientX - dragStartX);
		translateY = lastTranslateY + (e.clientY - dragStartY);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;

		const dx = Math.abs(e.clientX - dragStartX);
		const dy = Math.abs(e.clientY - dragStartY);

		if (dx < 5 && dy < 5) {
			const canvas = e.currentTarget as HTMLElement;
			const img = canvas.querySelector('.lightbox-image') as HTMLElement | null;
			if (img) {
				const rect = img.getBoundingClientRect();
				if (e.clientX < rect.left || e.clientX > rect.right ||
					e.clientY < rect.top || e.clientY > rect.bottom) {
					onclose();
				}
			} else {
				onclose();
			}
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === backdropEl) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
		if (e.key === '+' || e.key === '=') {
			scale = Math.min(MAX_SCALE, scale * 1.25);
		}
		if (e.key === '-') {
			scale = Math.max(MIN_SCALE, scale * 0.8);
		}
		if (e.key === '0') resetView();
	}

	onMount(() => {
		if (!browser) return;
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', handleKeydown);
		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="lightbox-backdrop" bind:this={backdropEl} onclick={handleBackdropClick}>
	<div class="lightbox-toolbar">
		<span class="lightbox-zoom-label">{Math.round(scale * 100)}%</span>
		<button type="button" class="lightbox-btn" title="Zoom in (+)" onclick={() => { scale = Math.min(MAX_SCALE, scale * 1.3); }}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
		</button>
		<button type="button" class="lightbox-btn" title="Zoom out (-)" onclick={() => { scale = Math.max(MIN_SCALE, scale * 0.75); }}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
		</button>
		<button type="button" class="lightbox-btn" title="Reset (0)" onclick={resetView}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
		</button>
		<div class="lightbox-separator"></div>
		<button type="button" class="lightbox-btn lightbox-close" title="Close (Esc)" onclick={onclose}>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</button>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="lightbox-canvas"
		class:dragging={isDragging}
		onwheel={handleWheel}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
	>
		<img
			{src}
			{alt}
			class="lightbox-image"
			style="transform: translate({translateX}px, {translateY}px) scale({scale})"
			draggable="false"
		/>
	</div>

	{#if alt}
		<div class="lightbox-caption">{alt}</div>
	{/if}
</div>

<style>
	.lightbox-backdrop {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: var(--sidebar-current-width, 0px);
		z-index: 9999;
		background: rgba(0, 0, 0, 0.88);
		backdrop-filter: blur(8px);
		display: flex;
		flex-direction: column;
		animation: lb-fadein 0.2s ease-out;
		transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes lb-fadein {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.5rem 1rem;
		flex-shrink: 0;
	}

	.lightbox-zoom-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.75rem;
		min-width: 3rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		margin-right: 0.25rem;
	}

	.lightbox-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
	}

	.lightbox-btn:hover {
		background: rgba(255, 255, 255, 0.18);
		color: #fff;
	}

	.lightbox-close:hover {
		background: rgba(239, 68, 68, 0.5);
	}

	.lightbox-separator {
		width: 1px;
		height: 1.25rem;
		background: rgba(255, 255, 255, 0.15);
		margin: 0 0.35rem;
	}

	.lightbox-canvas {
		flex: 1;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.lightbox-canvas.dragging {
		cursor: grabbing;
	}

	.lightbox-image {
		max-width: 90vw;
		max-height: 85vh;
		object-fit: contain;
		transform-origin: center center;
		will-change: transform;
		pointer-events: none;
		border-radius: 4px;
		box-shadow: 0 8px 48px rgba(0, 0, 0, 0.5);
	}

	.lightbox-caption {
		text-align: center;
		padding: 0.5rem 1rem;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.8rem;
		flex-shrink: 0;
	}
</style>
