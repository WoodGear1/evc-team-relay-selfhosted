<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { renderMarkdown } from '$lib/markdown';
	import { getResolvedThemeFromDom, type ResolvedTheme } from '$lib/theme';
	import ImageLightbox from './ImageLightbox.svelte';

	interface Props {
		content: string;
		class?: string;
		slug?: string;
		folderItems?: Array<{ path: string; name: string; type: string; content?: string }>;
	}

	let { content, class: className = '', slug, folderItems }: Props = $props();

	let renderedHtml = $state('');
	let isRendering = $state(true);
	let contentEl: HTMLDivElement | undefined = $state();
	let currentTheme = $state<ResolvedTheme>(browser ? getResolvedThemeFromDom() : 'light');
	let themeObserver: MutationObserver | null = null;

	let lightboxSrc = $state<string | null>(null);
	let lightboxAlt = $state('');

	const mermaidThemeConfig: Record<
		ResolvedTheme,
		{
			theme: 'base' | 'dark';
			themeVariables: Record<string, string>;
		}
	> = {
		light: {
			theme: 'base',
			themeVariables: {
				background: '#ffffff',
				primaryColor: '#818cf8',
				primaryTextColor: '#1e1b4b',
				primaryBorderColor: '#6366f1',
				lineColor: '#6366f1',
				secondaryColor: '#c7d2fe',
				tertiaryColor: '#eef2ff',
				textColor: '#1e1b4b'
			}
		},
		dark: {
			theme: 'dark',
			themeVariables: {
				background: '#0f0d24',
				primaryColor: '#818cf8',
				primaryTextColor: '#f5f3ff',
				primaryBorderColor: '#a5b4fc',
				lineColor: '#a5b4fc',
				secondaryColor: '#312e81',
				tertiaryColor: '#1f1b45',
				textColor: '#f5f3ff'
			}
		}
	};

	/**
	 * Initialize mermaid diagrams in the rendered content.
	 * Mermaid is loaded dynamically (client-side only) to avoid SSR issues.
	 */
	async function initMermaid() {
		if (!browser || !contentEl) return;

		const mermaidElements = contentEl.querySelectorAll('.mermaid');
		if (mermaidElements.length === 0) return;

		try {
			const mermaid = (await import('mermaid')).default;
			const themeConfig = mermaidThemeConfig[currentTheme];
			mermaid.initialize({
				startOnLoad: false,
				theme: themeConfig.theme,
				securityLevel: 'strict',
				fontFamily: 'var(--font-sans)',
				themeVariables: themeConfig.themeVariables
			});

			// Render each mermaid element
			let index = 0;
			for (const el of mermaidElements) {
				const code = el.textContent || '';
				if (!code.trim()) continue;

				try {
					const id = `mermaid-${Date.now()}-${index++}`;
					const { svg } = await mermaid.render(id, code);
					el.innerHTML = svg;
					el.classList.add('mermaid-rendered');
				} catch (err) {
					console.warn('[MarkdownViewer] Mermaid render failed for element:', err);
					el.innerHTML = `<div class="mermaid-error"><span class="mermaid-error-icon">!</span> Diagram rendering failed</div><pre class="mermaid-source"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
					el.classList.add('mermaid-error-container');
				}
			}
		} catch (err) {
			console.warn('[MarkdownViewer] Failed to load mermaid library:', err);
		}
	}

	/**
	 * Attach delegated event handlers for copy buttons and wikilink click prevention.
	 * Uses event delegation on the container to avoid per-element listener leaks.
	 */
	function attachDelegatedHandlers() {
		if (!browser || !contentEl || contentEl.dataset.handlersAttached === 'true') return;

		contentEl.dataset.handlersAttached = 'true';

		contentEl.addEventListener('click', async (e) => {
			const target = e.target as HTMLElement;

			// Handle copy button clicks
			const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null;
			if (copyBtn) {
				const container = copyBtn.closest('.code-block-container');
				if (!container) return;

				const codeEl = container.querySelector('code');
				if (!codeEl) return;

				const codeText = codeEl.textContent || '';
				const copySvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
				const checkSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

				try {
					await navigator.clipboard.writeText(codeText);
					copyBtn.innerHTML = checkSvg;
					copyBtn.classList.add('copied');
					setTimeout(() => {
						copyBtn.innerHTML = copySvg;
						copyBtn.classList.remove('copied');
					}, 2000);
				} catch (err) {
					console.warn('[MarkdownViewer] Failed to copy code:', err);
				}
				return;
			}

			// Prevent navigation for disabled wikilinks
			const wikilink = target.closest('[data-wikilink-disabled]') as HTMLElement | null;
			if (wikilink) {
				e.preventDefault();
			}

			// Hashtag click → populate topbar search
			const tagChip = target.closest('.tag-chip') as HTMLElement | null;
			if (tagChip) {
				e.preventDefault();
				const tag = tagChip.getAttribute('data-tag');
				if (tag) {
					window.dispatchEvent(
						new CustomEvent('relay:search', {
							detail: { query: `#${tag}` }
						})
					);
				}
			}

			// Open image lightbox on click (any image in markdown content)
			const imgEl = target.tagName === 'IMG' ? target : target.closest('img');
			if (imgEl && imgEl instanceof HTMLImageElement && imgEl.src) {
				e.preventDefault();
				e.stopPropagation();
				lightboxSrc = imgEl.src;
				lightboxAlt = imgEl.alt || '';
				return;
			}
		});
	}

	function observeThemeChanges() {
		if (!browser || typeof MutationObserver === 'undefined') return;

		themeObserver?.disconnect();
		themeObserver = new MutationObserver(async () => {
			const nextTheme = getResolvedThemeFromDom();
			if (nextTheme === currentTheme) return;

			currentTheme = nextTheme;
			await tick();
			await initMermaid();
		});

		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
	}

	async function renderContent() {
		try {
			renderedHtml = await renderMarkdown(content, { slug, folderItems });
		} catch (error: any) {
			console.error('Failed to render markdown:', error);
			renderedHtml = `<p class="error">Failed to render document: ${escapeHtml(error.message || String(error))}</p>`;
		} finally {
			isRendering = false;
		}
		await tick();
		await initMermaid();
		attachDelegatedHandlers();
	}

	function escapeHtml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	onMount(() => {
		observeThemeChanges();
		return () => {
			themeObserver?.disconnect();
		};
	});

	// Re-render when content changes
	$effect(() => {
		if (content) {
			currentTheme = getResolvedThemeFromDom();
			isRendering = true;
			void renderContent();
		}
	});
</script>

<svelte:head>
	<!-- KaTeX CSS for math rendering -->
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css"
		crossorigin="anonymous"
	/>
</svelte:head>

{#if isRendering}
	<div class="markdown-loading">
		<div class="skeleton-container">
			<div class="skeleton skeleton-title"></div>
			<div class="skeleton skeleton-line"></div>
			<div class="skeleton skeleton-line"></div>
			<div class="skeleton skeleton-line short"></div>
			<div class="skeleton skeleton-line"></div>
			<div class="skeleton skeleton-line"></div>
		</div>
	</div>
{:else}
	<div class="markdown-content {className}" bind:this={contentEl}>
		{@html renderedHtml}
	</div>
{/if}

{#if lightboxSrc}
	<ImageLightbox src={lightboxSrc} alt={lightboxAlt} onclose={() => { lightboxSrc = null; }} />
{/if}

<style>
	/* ================================
	   Loading skeleton
	   ================================ */
	.markdown-loading {
		padding: 2rem 0;
	}

	.skeleton-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.skeleton {
		background: linear-gradient(90deg, var(--muted) 25%, var(--secondary) 50%, var(--muted) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: 4px;
		height: 1rem;
	}

	.skeleton-title {
		height: 2rem;
		width: 60%;
		margin-bottom: 0.5rem;
	}

	.skeleton-line {
		width: 100%;
	}

	.skeleton-line.short {
		width: 70%;
	}

	@keyframes shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}

	/* ================================
	   Base markdown content
	   ================================ */
	.markdown-content {
		line-height: 1.75;
		color: hsl(var(--foreground));
		animation: fadeIn 0.3s ease-out;
		user-select: text;
		-webkit-user-select: text;
		font-size: 1rem;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* ================================
	   Standard HTML elements
	   ================================ */
	.markdown-content > :global(:first-child) {
		margin-top: 0 !important;
	}

	.markdown-content > :global(:last-child) {
		margin-bottom: 0 !important;
	}

	.markdown-content :global(h1) {
		font-size: 2.25rem;
		margin-top: 2rem;
		margin-bottom: 1rem;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
	}

	.markdown-content :global(h2) {
		font-size: 1.5rem;
		margin-top: 2rem;
		margin-bottom: 1rem;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.01em;
		color: hsl(var(--foreground));
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		padding-bottom: 0.3em;
	}

	.markdown-content :global(h3) {
		font-size: 1.25rem;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.01em;
		color: hsl(var(--foreground));
	}

	.markdown-content :global(h4),
	.markdown-content :global(h5),
	.markdown-content :global(h6) {
		font-size: 1rem;
		margin-top: 1.25rem;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.markdown-content :global(p) {
		margin-top: 1.25rem;
		margin-bottom: 1.25rem;
		line-height: 1.75;
	}

	.markdown-content :global(a) {
		color: hsl(var(--primary));
		text-decoration: none;
		font-weight: 500;
	}

	.markdown-content :global(a:hover) {
		color: hsl(var(--primary-hover));
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.markdown-content :global(code) {
		background-color: hsl(var(--muted));
		padding: 0.2em 0.4em;
		border-radius: 8px;
		font-family: var(--font-mono);
		font-size: 0.875em;
		color: hsl(var(--foreground));
	}

	.markdown-content :global(pre) {
		background-color: hsl(var(--muted) / 0.3);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		overflow-x: auto;
		margin-bottom: 1rem;
		border: 1px solid hsl(var(--border) / 0.3);
		position: relative;
	}

	.markdown-content :global(pre code) {
		background-color: transparent;
		padding: 0;
		color: inherit;
		font-size: 0.875rem;
		line-height: 1.7;
	}

	.markdown-content :global(blockquote) {
		position: relative;
		border-left: 4px solid hsl(var(--primary) / 0.5);
		border-radius: 0 8px 8px 0;
		padding: 0.5rem 1.2rem;
		margin: 1.5rem 0;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		background: hsl(var(--muted) / 0.35);
	}

	.markdown-content :global(blockquote p:first-child) {
		margin-top: 0;
	}

	.markdown-content :global(blockquote p:last-child) {
		margin-bottom: 0;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin-bottom: 1.25rem;
		padding-left: 1.5rem;
		color: hsl(var(--foreground));
	}

	.markdown-content :global(ul) {
		list-style-type: disc;
	}

	.markdown-content :global(ol) {
		list-style-type: decimal;
	}

	.markdown-content :global(ul ul),
	.markdown-content :global(ol ul),
	.markdown-content :global(ul ol),
	.markdown-content :global(ol ol) {
		margin-top: 0.5rem;
		margin-bottom: 0;
	}

	.markdown-content :global(ul ul) {
		list-style-type: circle;
	}

	.markdown-content :global(ul ul ul) {
		list-style-type: square;
	}

	.markdown-content :global(li) {
		margin-bottom: 0.5rem;
		line-height: 1.7;
	}

	.markdown-content :global(li > p) {
		margin-top: 0.25rem;
		margin-bottom: 0.25rem;
	}

	.markdown-content :global(table) {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		margin-bottom: 1.25rem;
		font-size: 0.875rem;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid hsl(var(--border) / 0.35);
	}

	.markdown-content :global(th),
	.markdown-content :global(td) {
		padding: 0.55rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid hsl(var(--border) / 0.25);
		border-right: 1px solid hsl(var(--border) / 0.15);
	}

	.markdown-content :global(th:last-child),
	.markdown-content :global(td:last-child) {
		border-right: none;
	}

	.markdown-content :global(tbody tr:last-child td) {
		border-bottom: none;
	}

	.markdown-content :global(th) {
		background-color: hsl(var(--muted) / 0.5);
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: hsl(var(--muted-foreground));
	}

	.markdown-content :global(tbody tr:nth-child(even)) {
		background-color: hsl(var(--muted) / 0.12);
	}

	.markdown-content :global(tbody tr) {
		transition: background-color 0.15s ease;
	}

	.markdown-content :global(tbody tr:hover) {
		background-color: hsl(var(--primary) / 0.04);
	}

	.markdown-content :global(img) {
		max-width: 100%;
		height: auto;
		cursor: zoom-in;
	}

	.markdown-content :global(hr) {
		border: none;
		border-top: 1px solid hsl(var(--border));
		margin: 2rem 0;
	}

	.markdown-content :global(center) {
		display: block;
		text-align: center;
		margin: 0.5rem 0;
	}

	.markdown-content :global(u) {
		text-decoration: underline;
	}

	.markdown-content :global(kbd) {
		display: inline-block;
		padding: 0.15em 0.4em;
		font-size: 0.85em;
		font-family: var(--font-mono);
		background-color: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 3px;
		box-shadow: inset 0 -1px 0 hsl(var(--border));
	}

	.markdown-content :global(.error) {
		color: hsl(var(--destructive));
		padding: 1rem;
		background-color: hsl(var(--destructive) / 0.1);
		border-radius: 5px;
	}

	/* ================================
	   Highlights (==text==)
	   ================================ */
	.markdown-content :global(mark) {
		background-color: hsl(var(--warning) / 0.35);
		color: inherit;
		padding: 0.1em 0.2em;
		border-radius: 6px;
	}

	:global(.dark) .markdown-content :global(mark) {
		background-color: hsl(var(--warning) / 0.2);
		border-radius: 6px;
	}

	/* ================================
	   Wikilink Chips
	   ================================ */
	.markdown-content :global(.wikilink-chip) {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0.16em 0.6em 0.16em 0.44em;
		margin: 0.04em 0.16em 0.1em 0;
		font-size: 0.875em;
		font-weight: 500;
		line-height: 1.5;
		border-radius: 999px;
		text-decoration: none;
		transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
		vertical-align: middle;
		max-width: 100%;
		white-space: nowrap;
	}

	.markdown-content :global(.wikilink-chip > span:last-child) {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.markdown-content :global(.wikilink-chip-icon) {
		flex-shrink: 0;
		opacity: 0.55;
		transition: opacity 0.2s ease;
	}

	.markdown-content :global(.wikilink-resolved) {
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.08);
		border: 1px solid hsl(var(--primary) / 0.15);
		cursor: pointer;
	}

	.markdown-content :global(.wikilink-resolved:hover) {
		background: hsl(var(--primary) / 0.14);
		border-color: hsl(var(--primary) / 0.3);
		box-shadow: 0 2px 8px hsl(var(--primary) / 0.1);
		text-decoration: none;
	}

	.markdown-content :global(.wikilink-resolved:hover) :global(.wikilink-chip-icon) {
		opacity: 1;
	}

	.markdown-content :global(.wikilink-unresolved) {
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.45);
		border: 1px dashed hsl(var(--border) / 0.6);
		cursor: default;
	}

	/* ================================
	   Document Link Chips  [text](file.md)
	   ================================ */
	.markdown-content :global(.doc-link-chip) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0.16em 0.62em 0.16em 0.44em;
		margin: 0.04em 0.16em 0.1em 0;
		font-size: 0.875em;
		font-weight: 500;
		line-height: 1.5;
		border-radius: 999px;
		color: hsl(var(--primary));
		background: linear-gradient(180deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.06));
		border: 1px solid hsl(var(--primary) / 0.16);
		text-decoration: none;
		cursor: pointer;
		transition: all 0.15s ease;
		vertical-align: middle;
		max-width: 100%;
		white-space: nowrap;
		box-shadow: 0 1px 0 hsl(var(--background) / 0.4) inset;
	}

	.markdown-content :global(.doc-link-chip > span:last-child) {
		display: block;
		min-width: 0;
		max-width: min(32ch, calc(100vw - 8rem));
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.markdown-content :global(.doc-link-chip:hover) {
		background: hsl(var(--primary) / 0.13);
		border-color: hsl(var(--primary) / 0.25);
		text-decoration: none;
	}

	.markdown-content :global(.doc-link-unresolved) {
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.4);
		border: 1px dashed hsl(var(--border) / 0.5);
		cursor: default;
	}

	.markdown-content :global(.chip-icon) {
		flex-shrink: 0;
		opacity: 0.5;
	}

	.markdown-content :global(.doc-link-chip:hover .chip-icon) {
		opacity: 0.8;
	}

	/* ================================
	   External Link Chips  [text](https://...)
	   ================================ */
	.markdown-content :global(.ext-link-chip) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0.16em 0.55em 0.16em 0.42em;
		margin: 0.04em 0.16em 0.1em 0;
		font-size: 0.875em;
		font-weight: 500;
		line-height: 1.5;
		border-radius: 999px;
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.45);
		border: 1px solid hsl(var(--border) / 0.3);
		text-decoration: none;
		transition: all 0.15s ease;
		vertical-align: middle;
		max-width: 100%;
		white-space: nowrap;
	}

	.markdown-content :global(.ext-link-chip > span) {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.markdown-content :global(.ext-link-chip:hover) {
		background: hsl(var(--primary) / 0.07);
		border-color: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
		text-decoration: none;
	}

	.markdown-content :global(.ext-link-favicon) {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		border-radius: 2px;
	}

	.markdown-content :global(.ext-link-arrow) {
		flex-shrink: 0;
		opacity: 0.35;
		margin-left: 1px;
	}

	.markdown-content :global(.ext-link-chip:hover .ext-link-arrow) {
		opacity: 0.7;
	}

	/* ================================
	   Obsidian embeds (placeholder)
	   ================================ */
	.markdown-content :global(.obsidian-embed) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		margin: 0.5rem 0 1rem;
		background-color: hsl(var(--muted));
		border: 1px dashed hsl(var(--border));
		border-radius: 6px;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.markdown-content :global(.obsidian-embed-icon) {
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.markdown-content :global(.obsidian-embed strong) {
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	/* ================================
	   Callouts — Obsidian-faithful single-block design
	   ================================ */
	.markdown-content :global(.callout) {
		--callout-accent: 59, 130, 246;
		margin: 1rem 0;
		padding: 0;
		border: 1px solid rgba(var(--callout-accent), 0.18);
		border-left: 3px solid rgb(var(--callout-accent));
		border-radius: 8px;
		background: rgba(var(--callout-accent), 0.04);
		color: hsl(var(--foreground));
		font-style: normal;
		overflow: hidden;
	}

	.markdown-content :global(.callout-header) {
		padding: 0.55rem 0.85rem;
		background: rgba(var(--callout-accent), 0.06);
	}

	.markdown-content :global(.callout-title) {
		display: flex;
		align-items: center;
		gap: 7px;
		color: rgb(var(--callout-accent));
	}

	.markdown-content :global(.callout-icon) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		color: inherit;
	}

	.markdown-content :global(.callout-icon svg) {
		width: 18px;
		height: 18px;
	}

	.markdown-content :global(.callout-title-text) {
		font-weight: 600;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.markdown-content :global(.callout-fold-icon) {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
	}

	.markdown-content :global(.callout-fold-icon)::after {
		content: '\25B6';
		font-size: 0.6rem;
		display: inline-block;
		transition: transform 0.2s ease;
		opacity: 0.6;
	}

	.markdown-content :global(details.callout[open]) :global(.callout-fold-icon)::after {
		transform: rotate(90deg);
	}

	.markdown-content :global(details.callout > summary) {
		cursor: pointer;
		list-style: none;
	}

	.markdown-content :global(details.callout > summary::-webkit-details-marker) {
		display: none;
	}

	.markdown-content :global(details.callout > summary::marker) {
		display: none;
		content: '';
	}

	.markdown-content :global(.callout-content) {
		padding: 0.5rem 0.85rem 0.6rem;
		font-size: 0.9rem;
		line-height: 1.6;
		color: hsl(var(--foreground));
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.markdown-content :global(.callout-content > p) {
		margin: 0;
	}

	.markdown-content :global(.callout-content > :first-child) {
		margin-top: 0;
	}

	.markdown-content :global(.callout-content > :last-child) {
		margin-bottom: 0;
	}

	.markdown-content :global(.callout) :global(.katex-display) {
		background: transparent;
		border: none;
		padding: 0.4rem 0;
	}

	.markdown-content :global(.callout) :global(pre) {
		border: none;
		box-shadow: none;
		margin: 0.5rem 0;
	}

	.markdown-content :global(.callout) :global(ul),
	.markdown-content :global(.callout) :global(ol) {
		margin: 0.25rem 0;
	}

	/* ---- Callout color palettes ---- */
	/* Each variant just sets --callout-accent (R, G, B) */

	.markdown-content :global(.callout-blue)     { --callout-accent: 59, 130, 246; }
	.markdown-content :global(.callout-teal)     { --callout-accent: 20, 184, 166; }
	.markdown-content :global(.callout-cyan)     { --callout-accent: 6, 182, 212; }
	.markdown-content :global(.callout-green)    { --callout-accent: 34, 197, 94; }
	.markdown-content :global(.callout-yellow)   { --callout-accent: 202, 138, 4; }
	.markdown-content :global(.callout-orange)   { --callout-accent: 249, 115, 22; }
	.markdown-content :global(.callout-red)      { --callout-accent: 239, 68, 68; }
	.markdown-content :global(.callout-red-dark) { --callout-accent: 185, 28, 28; }
	.markdown-content :global(.callout-purple)   { --callout-accent: 139, 92, 246; }
	.markdown-content :global(.callout-gray)     { --callout-accent: 142, 142, 160; }

	:global(.dark) .markdown-content :global(.callout-blue)     { --callout-accent: 96, 165, 250; }
	:global(.dark) .markdown-content :global(.callout-teal)     { --callout-accent: 45, 212, 191; }
	:global(.dark) .markdown-content :global(.callout-cyan)     { --callout-accent: 34, 211, 238; }
	:global(.dark) .markdown-content :global(.callout-green)    { --callout-accent: 74, 222, 128; }
	:global(.dark) .markdown-content :global(.callout-yellow)   { --callout-accent: 250, 204, 21; }
	:global(.dark) .markdown-content :global(.callout-orange)   { --callout-accent: 251, 146, 60; }
	:global(.dark) .markdown-content :global(.callout-red)      { --callout-accent: 248, 113, 113; }
	:global(.dark) .markdown-content :global(.callout-red-dark) { --callout-accent: 252, 165, 165; }
	:global(.dark) .markdown-content :global(.callout-purple)   { --callout-accent: 167, 139, 250; }
	:global(.dark) .markdown-content :global(.callout-gray)     { --callout-accent: 156, 163, 175; }

	/* ================================
	   KaTeX / Math
	   ================================ */
	.markdown-content :global(.katex-display) {
		display: block;
		margin: 1rem 0;
		text-align: center;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.45);
		border-radius: 6px;
		border: 1px solid hsl(var(--border) / 0.3);
	}

	.markdown-content :global(.katex-display) > :global(.katex) {
		font-size: 1.05em;
	}

	.markdown-content :global(.katex) {
		font-size: 0.95em;
	}

	.markdown-content :global(.katex-error) {
		color: hsl(var(--destructive));
		font-family: var(--font-mono);
		font-size: 0.85em;
		background-color: rgba(239, 68, 68, 0.08);
		padding: 0.2em 0.4em;
		border-radius: 3px;
	}

	.markdown-content :global(.katex-error.katex-display) {
		display: block;
		text-align: center;
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.05);
		border: 1px solid rgba(239, 68, 68, 0.15);
		border-radius: 6px;
	}

	/* ================================
	   Mermaid diagrams
	   ================================ */
	.markdown-content :global(.mermaid) {
		display: flex;
		justify-content: center;
		margin: 1.5rem 0;
		padding: 1rem;
		background-color: hsl(var(--muted));
		border-radius: 8px;
		overflow-x: auto;
	}

	.markdown-content :global(.mermaid-rendered) {
		background-color: transparent;
	}

	.markdown-content :global(.mermaid-rendered svg) {
		max-width: 100%;
		height: auto;
	}

	.markdown-content :global(.mermaid-error) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: hsl(var(--destructive));
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.markdown-content :global(.mermaid-error-icon) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background-color: hsl(var(--destructive));
		color: white;
		border-radius: 50%;
		font-weight: bold;
		font-size: 0.75rem;
	}

	.markdown-content :global(.mermaid-error-container) {
		flex-direction: column;
		align-items: flex-start;
	}

	.markdown-content :global(.mermaid-source) {
		font-size: 0.8125rem;
		width: 100%;
	}

	/* ================================
	   Footnotes
	   ================================ */
	.markdown-content :global(section.footnotes) {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border));
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.markdown-content :global(section.footnotes h2) {
		font-size: 0.875rem;
		font-weight: 600;
		margin-top: 0;
		margin-bottom: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.markdown-content :global(section.footnotes .sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	.markdown-content :global(section.footnotes ol) {
		padding-left: 1.5rem;
		margin-bottom: 0;
	}

	.markdown-content :global(section.footnotes li) {
		margin-bottom: 0.25rem;
	}

	.markdown-content :global(a[data-backref]) {
		font-size: 0.75rem;
		text-decoration: none;
		margin-left: 0.25rem;
	}

	.markdown-content :global(sup a) {
		color: hsl(var(--primary));
		text-decoration: none;
		font-weight: 500;
	}

	.markdown-content :global(sup a:hover) {
		text-decoration: underline;
	}

	/* ================================
	   Responsive
	   ================================ */
	@media (max-width: 768px) {
		.markdown-content :global(table) {
			display: block;
			overflow-x: auto;
		}

		.markdown-content :global(pre) {
			padding: 0.75rem;
		}

		.markdown-content :global(pre code) {
			font-size: 0.8125rem;
		}

		.markdown-content :global(.callout) {
			margin: 0.75rem 0;
		}

		.markdown-content :global(.mermaid) {
			padding: 0.5rem;
		}

		.markdown-content :global(.katex-display) {
			padding: 0.5rem 0.75rem;
		}

		.markdown-content :global(.katex-display) > :global(.katex) {
			font-size: 0.95em;
		}

		.markdown-content :global(.line-num) {
			width: 2em;
			margin-right: 0.5em;
			padding-right: 0.5em;
		}
	}

	/* ================================
	   Reduce motion for accessibility
	   ================================ */
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
		}

		.markdown-content {
			animation: none;
		}
	}

	/* ================================
	   Tag Chips
	   ================================ */
	.markdown-content :global(.tag-chip) {
		display: inline-flex;
		align-items: center;
		padding: 0.12em 0.62em;
		margin: 0.04em 0.16em 0.1em 0;
		font-size: 0.8125em;
		font-weight: 600;
		line-height: 1.5;
		border-radius: 999px;
		background: linear-gradient(135deg, hsl(var(--accent) / 0.12), hsl(var(--accent) / 0.06));
		color: hsl(var(--accent-foreground));
		border: 1px solid hsl(var(--accent) / 0.2);
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		white-space: nowrap;
		vertical-align: middle;
	}

	.markdown-content :global(.tag-chip:hover) {
		background: linear-gradient(135deg, hsl(var(--accent) / 0.22), hsl(var(--accent) / 0.12));
		border-color: hsl(var(--accent) / 0.4);
		box-shadow: 0 2px 8px hsl(var(--accent) / 0.12);
		transform: translateY(-1px);
		text-decoration: none;
	}

	.markdown-content :global(.tag-chip-hash) {
		opacity: 0.5;
		margin-right: 1px;
	}

	:global(.dark) .markdown-content :global(.tag-chip) {
		background: linear-gradient(135deg, hsl(var(--accent) / 0.18), hsl(var(--accent) / 0.08));
		border-color: hsl(var(--accent) / 0.3);
	}

	/* ================================
	   Phase B: Task Lists with Custom Checkboxes
	   ================================ */
	.markdown-content :global(.task-list-item) {
		list-style: none;
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.markdown-content :global(.task-list-item input[type="checkbox"]) {
		margin-top: 0.25rem;
		cursor: default;
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		position: relative;
	}

	/* Hide default checkbox and use custom styling */
	.markdown-content :global(.task-list-item input[type="checkbox"]) {
		appearance: none;
		-webkit-appearance: none;
		border: 2px solid hsl(var(--border));
		border-radius: 3px;
		background-color: hsl(var(--background));
		transition: all 0.15s;
	}

	.markdown-content :global(.task-list-item input[type="checkbox"]::before) {
		content: '';
		display: block;
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.75rem;
		line-height: 1;
	}

	/* Unchecked [ ] */
	.markdown-content :global(.task-list-item input[data-task=" "]) {
		border-color: hsl(var(--border));
	}

	/* Checked [x] */
	.markdown-content :global(.task-list-item input[data-task="x"])::before {
		content: '✓';
		color: hsl(var(--primary));
		font-weight: bold;
	}

	.markdown-content :global(.task-list-item input[data-task="x"]) {
		border-color: hsl(var(--primary));
		background-color: hsl(var(--primary) / 0.1);
	}

	/* In progress [/] */
	.markdown-content :global(.task-list-item input[data-task="/"]) {
		border-color: #eab308;
		background: linear-gradient(90deg, rgba(234, 179, 8, 0.2) 50%, transparent 50%);
	}

	.markdown-content :global(.task-list-item input[data-task="/"]::before) {
		content: '~';
		color: #eab308;
		font-weight: bold;
	}

	/* Cancelled [-] */
	.markdown-content :global(.task-list-item input[data-task="-"])::before {
		content: '−';
		color: #6b7280;
		font-weight: bold;
	}

	.markdown-content :global(.task-list-item input[data-task="-"]) {
		border-color: #6b7280;
		opacity: 0.6;
	}

	/* Deferred/forwarded [>] */
	.markdown-content :global(.task-list-item input[data-task=">"])::before {
		content: '▶';
		color: #06b6d4;
		font-size: 0.625rem;
	}

	.markdown-content :global(.task-list-item input[data-task=">"]) {
		border-color: #06b6d4;
	}

	/* Scheduling [<] */
	.markdown-content :global(.task-list-item input[data-task="<"])::before {
		content: '◀';
		color: #8b5cf6;
		font-size: 0.625rem;
	}

	.markdown-content :global(.task-list-item input[data-task="<"]) {
		border-color: #8b5cf6;
	}

	/* Question [?] */
	.markdown-content :global(.task-list-item input[data-task="?"])::before {
		content: '?';
		color: #f59e0b;
		font-weight: bold;
	}

	.markdown-content :global(.task-list-item input[data-task="?"]) {
		border-color: #f59e0b;
	}

	/* Important [!] */
	.markdown-content :global(.task-list-item input[data-task="!"])::before {
		content: '!';
		color: #ef4444;
		font-weight: bold;
	}

	.markdown-content :global(.task-list-item input[data-task="!"]) {
		border-color: #ef4444;
		background-color: rgba(239, 68, 68, 0.1);
	}

	/* Star [*] */
	.markdown-content :global(.task-list-item input[data-task="*"])::before {
		content: '★';
		color: #facc15;
	}

	.markdown-content :global(.task-list-item input[data-task="*"]) {
		border-color: #facc15;
	}

	/* Location [l] */
	.markdown-content :global(.task-list-item input[data-task="l"])::before {
		content: '📍';
		font-size: 0.625rem;
	}

	.markdown-content :global(.task-list-item input[data-task="l"]) {
		border-color: #10b981;
	}

	/* Info [i] */
	.markdown-content :global(.task-list-item input[data-task="i"])::before {
		content: 'ⓘ';
		color: #3b82f6;
		font-size: 0.75rem;
	}

	.markdown-content :global(.task-list-item input[data-task="i"]) {
		border-color: #3b82f6;
	}

	/* Savings/money [S] */
	.markdown-content :global(.task-list-item input[data-task="S"])::before {
		content: '$';
		color: #22c55e;
		font-weight: bold;
	}

	.markdown-content :global(.task-list-item input[data-task="S"]) {
		border-color: #22c55e;
	}

	/* Bookmark [b] */
	.markdown-content :global(.task-list-item input[data-task="b"])::before {
		content: '🔖';
		font-size: 0.625rem;
	}

	.markdown-content :global(.task-list-item input[data-task="b"]) {
		border-color: #ec4899;
	}

	/* Quote ["] */
	.markdown-content :global(.task-list-item input[data-task='"'])::before {
		content: '"';
		color: #6b7280;
		font-weight: bold;
	}

	.markdown-content :global(.task-list-item input[data-task='"']) {
		border-color: #6b7280;
	}

	/* ================================
	   Phase C: Embedded Images
	   ================================ */
	.markdown-content :global(.obsidian-embed-image) {
		max-width: 100%;
		height: auto;
		border-radius: 6px;
		margin: 0.5rem 0 1rem;
		box-shadow: 0 2px 8px var(--shadow);
		cursor: zoom-in;
		transition: box-shadow 0.2s ease, transform 0.2s ease;
	}

	.markdown-content :global(.obsidian-embed-image:hover) {
		box-shadow: 0 4px 20px var(--shadow);
		transform: scale(1.005);
	}

	/* ================================
	   Phase C: Enhanced Note Embed Placeholders
	   ================================ */
	.markdown-content :global(.obsidian-embed-note-found) {
		background-color: hsl(var(--accent) / 0.08);
		border-color: hsl(var(--accent) / 0.3);
		border-style: solid;
	}

	.markdown-content :global(.obsidian-embed-note-name) {
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.markdown-content :global(.obsidian-embed-note-hint) {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		margin-left: 0.5rem;
	}

	/* ================================
	   Code Blocks — Clean Panel with Line Numbers
	   ================================ */
	.markdown-content :global(.code-block-container) {
		position: relative;
		margin: 1.5rem 0;
		border-radius: 8px;
		background-color: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.5);
		overflow: hidden;
	}

	.markdown-content :global(.code-block-header) {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(var(--muted) / 0.4);
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.markdown-content :global(.code-lang) {
		font-size: 0.75rem;
		font-family: var(--font-mono, monospace);
		color: hsl(var(--muted-foreground));
		text-transform: lowercase;
	}

	.markdown-content :global(.code-line-count) {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground) / 0.6);
		margin-left: auto;
		transition: opacity 0.15s ease;
	}

	.markdown-content :global(.code-block-container:hover) :global(.code-line-count) {
		opacity: 0;
		pointer-events: none;
	}

	.markdown-content :global(.code-copy-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem;
		color: hsl(var(--muted-foreground));
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		opacity: 0;
		transition: all 0.15s ease;
	}

	.markdown-content :global(.code-block-container:hover) :global(.code-copy-btn) {
		opacity: 1;
	}

	.markdown-content :global(.code-copy-btn:hover) {
		color: hsl(var(--foreground));
		background-color: hsl(var(--background));
		border-color: hsl(var(--border));
		box-shadow: 0 2px 4px rgba(0,0,0,0.05);
	}

	.markdown-content :global(.code-copy-btn.copied) {
		opacity: 1;
		color: rgb(34, 197, 94);
		border-color: rgba(34, 197, 94, 0.3);
		background-color: rgba(34, 197, 94, 0.05);
	}

	.markdown-content :global(.code-block-container pre) {
		margin: 0;
		border-radius: 0;
		box-shadow: none;
		border: none;
		background: transparent;
		padding: 1rem 0;
		overflow-x: auto;
	}

	.markdown-content :global(.code-block-container code) {
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		flex-direction: column;
		font-size: 0.85rem;
		line-height: 1.2;
		padding: 0;
		gap: 0;
	}

	.markdown-content :global(.code-block-container pre code) {
		/* Overridden by the selector above for flex-direction */
		font-size: 0.85rem;
		line-height: 1.2;
		padding: 0;
	}

	.markdown-content :global(.code-line) {
		display: grid;
		grid-template-columns: 3.5em minmax(0, 1fr);
		align-items: flex-start;
		min-width: 100%;
		padding: 0;
	}

	.markdown-content :global(.line-num) {
		display: flex;
		justify-content: flex-end;
		margin-right: 0.75rem;
		text-align: right;
		color: hsl(var(--muted-foreground) / 0.4);
		user-select: none;
		-webkit-user-select: none;
		font-size: 0.85em;
		border-right: 1px solid hsl(var(--border) / 0.3);
		padding-right: 0.75rem;
		padding-left: 0.5rem;
		background: transparent;
	}

	.markdown-content :global(.line-num::before) {
		content: attr(data-line);
	}

	.markdown-content :global(.code-line:hover .line-num) {
		color: hsl(var(--muted-foreground) / 0.8);
		border-right-color: hsl(var(--border) / 0.6);
	}

	.markdown-content :global(.code-line:hover) {
		background: hsl(var(--muted) / 0.2);
	}
</style>
