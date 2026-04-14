<script lang="ts">
	import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
	import EditableMarkdownViewer from '$lib/components/EditableMarkdownViewer.svelte';
	import LiveMarkdownViewer from '$lib/components/LiveMarkdownViewer.svelte';
	import CanvasViewer from '$lib/components/canvas/CanvasViewer.svelte';
	import CommentsSection from '$lib/components/CommentsSection.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import { extractTitle, extractDescription, estimateReadingTime } from '$lib/markdown';
	import { applyThemePreset } from '$lib/customBlocks';
	import { isRealtimeSyncAvailable } from '$lib/yjs';
	import { buildFileTree, slugifyPath, type TreeNode } from '$lib/file-tree';
	import type { PageData } from './$types';
	import { page } from '$app/stores';

	let { data }: { data: PageData } = $props();

	let password = $state('');
	let passwordError = $state('');
	let isAuthenticating = $state(false);
	let showTOC = $state(false);
	let dialogOpen = true;

	// Derived reactive values
	const showPasswordModal = $derived(data.needsPassword);
	const title = $derived(
		data.share.page_title || data.share.title || (
			data.isFolder ? data.share.path : extractTitle(data.content || '', data.share.path)
		)
	);
	const description = $derived(
		data.share.description || (
			data.isFolder
			? `Shared folder: ${data.share.path}`
			: extractDescription(data.content || '', `View shared document: ${data.share.path}`)
		)
	);
	const readingTime = $derived(data.content ? estimateReadingTime(data.content) : 0);
	const shareUrl = $derived($page.url.href);
	const branding = $derived($page.data?.serverInfo?.branding);
	const formattedPath = $derived(data.share.path.split('/').pop()?.replace('.md', '') || title);
	const themeStyle = $derived(applyThemePreset(data.share.theme_preset || 'default'));
	const lastUpdated = $derived(
		new Date(data.share.updated_at || data.share.created_at).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);
	// Check if real-time sync is available for this share
	const hasRealtimeSync = $derived(isRealtimeSyncAvailable(data.share.web_doc_id));
	const showComments = $derived(Boolean(data.share.allow_comments && data.share.published_link_id));
	const isCanvas = $derived(data.share.path.toLowerCase().endsWith('.canvas'));

	const fileTree = $derived(data.isFolder ? buildFileTree(data.folderItems) : []);

	function toggleTOC() {
		showTOC = !showTOC;
	}

	function itemHref(node: TreeNode): string {
		return `/${data.share.web_slug}/${slugifyPath(node.path)}`;
	}

	async function handlePasswordSubmit() {
		if (!password) {
			passwordError = 'Password is required';
			return;
		}

		isAuthenticating = true;
		passwordError = '';

		try {
			// Submit password to our API route
			const response = await fetch('/api/auth', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					slug: data.share.web_slug,
					password,
					resourceKind: data.resourceKind
				})
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ message: 'Authentication failed' }));
				throw new Error(errorData.message || 'Authentication failed');
			}

			// Success! Reload page to fetch content with valid session
			window.location.reload();
		} catch (err) {
			passwordError = err instanceof Error ? err.message : 'Authentication failed';
		} finally {
			isAuthenticating = false;
		}
	}
</script>

<svelte:head>
	<title>{title} - {branding?.name || 'Docs'}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={shareUrl} />
	{#if branding?.logo_url}
		<meta property="og:image" content={branding.logo_url} />
	{/if}
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if branding?.logo_url}
		<meta name="twitter:image" content={branding.logo_url} />
	{/if}
	{#if data.share.web_noindex}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

{#if showPasswordModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center px-4" style="background: hsl(var(--background) / 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);">
		<div class="w-full max-w-md rounded-2xl border p-6 shadow-2xl" style="border-color: hsl(var(--border) / 0.4); background: hsl(var(--card) / 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 24px 48px var(--shadow-lg);">
			<div class="space-y-2">
				<div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: hsl(var(--primary) / 0.1); margin-bottom: 1rem;">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
				</div>
				<h2 class="text-xl font-semibold text-foreground">Protected Document</h2>
				<p class="text-sm text-muted-foreground">
					This document is password protected. Please enter the password to continue.
				</p>
			</div>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handlePasswordSubmit();
				}}
				class="space-y-4 mt-5"
			>
				<div class="space-y-2">
					<label for="password" class="text-sm font-medium text-foreground">Password</label>
					<input
						id="password"
						type="password"
						value={password}
						oninput={(event) => {
							password = (event.currentTarget as HTMLInputElement).value;
						}}
						placeholder="Enter password"
						disabled={isAuthenticating}
						class="w-full rounded-lg border px-3 py-2.5 text-sm transition-colors"
						style="border-color: hsl(var(--border) / 0.5); background: hsl(var(--muted) / 0.5);"
					/>
				</div>

				{#if passwordError}
					<div class="rounded-lg border px-3 py-2 text-sm" style="border-color: hsl(var(--destructive) / 0.3); background: hsl(var(--destructive) / 0.08); color: hsl(var(--destructive));">
						{passwordError}
					</div>
				{/if}

				<button
					type="submit"
					disabled={isAuthenticating}
					class="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-60"
					style="background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);"
				>
					{isAuthenticating ? 'Authenticating...' : 'Unlock Document'}
				</button>
			</form>
		</div>
	</div>
{:else if data.isFolder}
	<!-- Folder view -->
	<div class="w-full published-page" style={themeStyle}>
		<article class="max-w-[1200px] mx-auto">
			<StatusBar
				visibility={data.share.visibility}
				updatedAt={data.share.updated_at || data.share.created_at}
				{shareUrl}
			/>

			<h1 class="text-3xl font-bold text-foreground mb-3 leading-tight tracking-tight">{data.share.path}</h1>
			<div style="height: 1px; background: linear-gradient(to right, hsl(var(--primary) / 0.3), hsl(var(--border) / 0.5), transparent); margin-bottom: 2rem;"></div>

			<div class="flex gap-8 items-start">
				<div class="flex-1 min-w-0 max-w-[800px]">
					{#if data.readmeContent}
						<MarkdownViewer content={data.readmeContent} slug={data.share.web_slug} folderItems={data.folderItems} />
					{:else if data.folderItems.length === 0}
						<div class="rounded-2xl border border-dashed p-8 text-center" style="border-color: hsl(var(--border) / 0.4); background: hsl(var(--card) / 0.5); backdrop-filter: blur(8px);">
							<div class="pb-2">
								<div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: hsl(var(--muted) / 0.5); margin-bottom: 1rem;">
									<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
										<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
									</svg>
								</div>
								<h2 class="text-lg font-semibold text-card-foreground">Empty Folder</h2>
								<p class="text-sm text-muted-foreground">This folder doesn't contain any items yet.</p>
							</div>
						</div>
					{:else}
						<div class="catalog">
							{#if fileTree.filter(n => n.type !== 'folder').length > 0}
								<div class="catalog-group">
									<div class="catalog-group-header">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
										</svg>
										<span>Root Documents</span>
										<span class="catalog-group-count">{fileTree.filter(n => n.type !== 'folder').length}</span>
									</div>
									<div class="catalog-grid">
										{#each fileTree.filter(n => n.type !== 'folder') as node (node.path)}
											<a class="catalog-card" href={itemHref(node)}>
												<svg class="catalog-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
													<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
												</svg>
												<span class="catalog-card-name">{node.name.replace(/\.md$/, '')}</span>
											</a>
										{/each}
									</div>
								</div>
							{/if}
							
							{#each fileTree.filter(n => n.type === 'folder') as node (node.path)}
								<div class="catalog-group">
										<div class="catalog-group-header">
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
											</svg>
											<span>{node.name}</span>
											<span class="catalog-group-count">{node.children.length}</span>
										</div>
										<div class="catalog-grid">
											{#each node.children as child (child.path)}
												{#if child.type === 'folder'}
													<a class="catalog-card catalog-card-folder" href={itemHref(child)}>
														<svg class="catalog-card-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
															<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
														</svg>
														<span class="catalog-card-name">{child.name}</span>
														{#if child.children.length > 0}
															<span class="catalog-card-badge">{child.children.length}</span>
														{/if}
													</a>
												{:else}
													<a class="catalog-card" href={itemHref(child)}>
														<svg class="catalog-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
															<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
														</svg>
														<span class="catalog-card-name">{child.name.replace(/\.md$/, '')}</span>
													</a>
												{/if}
											{/each}
										</div>
									</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			{#if showComments}
				<CommentsSection
					linkId={data.share.published_link_id!}
					targetId={data.share.target_id || data.share.path}
					authToken={data.authToken}
				/>
			{/if}
		</article>
	</div>
{:else}
	<!-- Document view -->
	<div class="w-full published-page" style={themeStyle}>
		<article class="max-w-[1200px] mx-auto">
			<StatusBar
				visibility={data.share.visibility}
				updatedAt={data.share.updated_at || data.share.created_at}
				{shareUrl}
			/>

			<h1 class="text-3xl font-bold text-foreground mb-3 leading-tight tracking-tight">{title}</h1>
			<div style="height: 1px; background: linear-gradient(to right, hsl(var(--primary) / 0.3), hsl(var(--border) / 0.5), transparent); margin-bottom: 2rem;"></div>

			<div class="flex gap-8 items-start">
				<div class="flex-1 min-w-0 {isCanvas ? 'max-w-none' : 'max-w-[800px]'}">
					{#if isCanvas}
					{#await (async () => {
						try {
							const parsed = JSON.parse(data.content || '{}');
							if (!parsed.nodes && !parsed.edges) {
								return { error: true, content: data.content || '' };
							}
							return parsed;
						} catch (e) {
							console.error('Failed to parse canvas data:', e);
							return { error: true, content: data.content || '' };
						}
					})()}
						<div class="flex items-center justify-center h-[500px] bg-muted/20 rounded-xl border">
							<span class="text-muted-foreground">Loading canvas...</span>
						</div>
					{:then canvasData}
						{#if canvasData.error}
							<MarkdownViewer content={canvasData.content} slug={data.share.web_slug} folderItems={data.folderItems} />
						{:else}
							<div class="h-[80vh] min-h-[600px] w-full">
								<CanvasViewer {canvasData} slug={data.share.web_slug} folderItems={data.folderItems} />
							</div>
						{/if}
					{/await}
					{:else if hasRealtimeSync}
						<LiveMarkdownViewer
							content={data.content || ''}
							docId={data.share.web_doc_id}
							slug={data.share.web_slug}
							sessionToken={data.sessionToken}
							resourceKind={data.resourceKind}
							folderItems={data.folderItems}
						/>
					{:else if data.canEdit}
						<EditableMarkdownViewer
							content={data.content || ''}
							slug={data.share.web_slug}
							canEdit={data.canEdit}
							sessionToken={data.sessionToken}
							authToken={data.authToken}
							folderItems={data.folderItems}
						/>
					{:else}
						<MarkdownViewer content={data.content || ''} slug={data.share.web_slug} folderItems={data.folderItems} />
					{/if}
				</div>
			</div>

			{#if data.previousPage || data.nextPage}
				<div class="mt-10 grid gap-4 sm:grid-cols-2">
					{#if data.previousPage}
						<a
							class="pager-link group rounded-xl px-5 py-4 no-underline transition-all"
							style="border: 1px solid hsl(var(--border) / 0.4); background: hsl(var(--card) / 0.5); backdrop-filter: blur(4px);"
							href="/{data.share.web_slug}/{data.previousPage.slugPath}"
						>
							<div class="flex items-center gap-2 text-xs text-muted-foreground mb-1">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="15 18 9 12 15 6" />
								</svg>
								Previous page
							</div>
							<div class="font-medium text-foreground">{data.previousPage.name}</div>
						</a>
					{:else}
						<div></div>
					{/if}

					{#if data.nextPage}
						<a
							class="pager-link group rounded-xl px-5 py-4 text-right no-underline transition-all"
							style="border: 1px solid hsl(var(--border) / 0.4); background: hsl(var(--card) / 0.5); backdrop-filter: blur(4px);"
							href="/{data.share.web_slug}/{data.nextPage.slugPath}"
						>
							<div class="flex items-center justify-end gap-2 text-xs text-muted-foreground mb-1">
								Next page
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="9 18 15 12 9 6" />
								</svg>
							</div>
							<div class="font-medium text-foreground">{data.nextPage.name}</div>
						</a>
					{/if}
				</div>
			{/if}

			{#if showComments}
				<CommentsSection
					linkId={data.share.published_link_id!}
					targetId={data.share.target_id || data.share.path}
					authToken={data.authToken}
				/>
			{/if}
		</article>
	</div>
{/if}

<style>
	.pager-link,
	.pager-link:hover,
	.pager-link:focus-visible,
	.pager-link * {
		text-decoration: none !important;
	}

	.pager-link {
		transition: background-color 0.25s cubic-bezier(0.4,0,0.2,1),
		            border-color 0.25s cubic-bezier(0.4,0,0.2,1),
		            box-shadow 0.25s cubic-bezier(0.4,0,0.2,1),
		            transform 0.25s cubic-bezier(0.4,0,0.2,1);
	}

	.pager-link:hover,
	.pager-link:focus-visible {
		border-color: hsl(var(--primary) / 0.25) !important;
		background: hsl(var(--primary) / 0.06) !important;
		box-shadow: 0 6px 20px hsl(var(--primary) / 0.08);
		transform: translateY(-2px);
	}

	/* ==================== File Catalog ==================== */
	.catalog {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.catalog-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.catalog-group-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid hsl(var(--border) / 0.2);
	}

	.catalog-group-count {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground) / 0.7);
		background: hsl(var(--muted) / 0.5);
		padding: 0.1em 0.5em;
		border-radius: 9999px;
		line-height: 1.5;
	}

	.catalog-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.catalog-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		border: 1px solid hsl(var(--border) / 0.25);
		background: hsl(var(--card) / 0.4);
		text-decoration: none !important;
		color: hsl(var(--foreground));
		transition: all 0.15s ease;
		min-width: 0;
	}

	.catalog-card:hover {
		border-color: hsl(var(--primary) / 0.25);
		background: hsl(var(--primary) / 0.06);
		transform: translateY(-1px);
		text-decoration: none !important;
	}

	.catalog-card-folder {
		border-style: dashed;
	}

	.catalog-card-root {
		grid-column: 1 / -1;
		max-width: 400px;
	}

	.catalog-card-icon {
		flex-shrink: 0;
		opacity: 0.45;
		transition: opacity 0.15s ease;
	}

	.catalog-card:hover .catalog-card-icon {
		opacity: 0.8;
		color: hsl(var(--primary));
	}

	.catalog-card-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.catalog-card-badge {
		margin-left: auto;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground) / 0.7);
		background: hsl(var(--muted) / 0.5);
		padding: 0.05em 0.45em;
		border-radius: 9999px;
		line-height: 1.5;
		flex-shrink: 0;
	}
</style>
