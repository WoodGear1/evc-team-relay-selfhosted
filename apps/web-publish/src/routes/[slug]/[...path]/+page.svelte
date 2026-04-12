<script lang="ts">
	import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
	import CanvasViewer from '$lib/components/canvas/CanvasViewer.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import { extractDescription } from '$lib/markdown';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let password = $state('');
	let passwordError = $state('');
	let isAuthenticating = $state(false);

	const showPasswordModal = $derived(data.needsPassword);
	const shareUrl = $derived($page.url.href);
	const backUrl = $derived(`/${data.parentSlug}`);
	const description = $derived(
		extractDescription(data.content || '', `View document: ${data.file.path}`)
	);
	const branding = $derived($page.data?.serverInfo?.branding);
	const pageTitle = $derived(data.file.name);
	const isCanvas = $derived(data.file.path.toLowerCase().endsWith('.canvas') || data.file.type === 'canvas');

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
					password
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
	<title>{pageTitle} - {data.share.path} - {branding?.name || 'Docs'}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content="{pageTitle} - {data.share.path}" />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={shareUrl} />
	{#if branding?.logo_url}
		<meta property="og:image" content={branding.logo_url} />
	{/if}
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="{pageTitle} - {data.share.path}" />
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
{:else}
<div class="w-full">
	<article class="max-w-[900px] mx-auto">
		<nav class="mb-4 flex items-center gap-2 text-sm" aria-label="Breadcrumb">
			<a href="/{data.parentSlug}" class="text-muted-foreground hover:text-foreground transition-colors">
				{data.share.path}
			</a>
			<span class="text-muted-foreground/50">/</span>
			<span class="text-muted-foreground">{data.file.name}</span>
		</nav>

		<StatusBar
			visibility={data.share.visibility}
			updatedAt={data.share.updated_at || data.share.created_at}
			{shareUrl}
			showBackButton={true}
			{backUrl}
		/>

		<h1 class="text-3xl font-bold text-foreground mb-6 leading-tight tracking-tight">{data.file.name}</h1>

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
								<CanvasViewer {canvasData} slug={data.share.web_slug} />
							</div>
						{/if}
					{/await}
				{:else}
					<MarkdownViewer content={data.content || ''} slug={data.share.web_slug} folderItems={data.folderItems} />
				{/if}
			</div>
		</div>

		{#if data.previousPage || data.nextPage}
			<div class="mt-10 grid gap-4 sm:grid-cols-2">
				{#if data.previousPage}
					<a
						class="pager-link rounded-lg border border-border px-4 py-3 transition-colors"
						href="/{data.parentSlug}/{data.previousPage.slugPath}"
					>
						<div class="text-xs text-muted-foreground mb-1">Previous page</div>
						<div class="font-medium text-foreground">{data.previousPage.name}</div>
					</a>
				{:else}
					<div></div>
				{/if}

				{#if data.nextPage}
					<a
						class="pager-link rounded-lg border border-border px-4 py-3 text-right transition-colors"
						href="/{data.parentSlug}/{data.nextPage.slugPath}"
					>
						<div class="text-xs text-muted-foreground mb-1">Next page</div>
						<div class="font-medium text-foreground">{data.nextPage.name}</div>
					</a>
				{/if}
			</div>
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
		display: block;
		border-radius: 0.75rem;
		border: 1px solid hsl(var(--border) / 0.4);
		background: hsl(var(--card) / 0.6);
		padding: 1rem 1.25rem;
		transition: background-color 0.25s cubic-bezier(0.4,0,0.2,1),
		            border-color 0.25s cubic-bezier(0.4,0,0.2,1),
		            box-shadow 0.25s cubic-bezier(0.4,0,0.2,1),
		            transform 0.25s cubic-bezier(0.4,0,0.2,1);
	}

	.pager-link:hover,
	.pager-link:focus-visible {
		background: hsl(var(--primary) / 0.06);
		border-color: hsl(var(--primary) / 0.25);
		box-shadow: 0 6px 20px hsl(var(--primary) / 0.08);
		transform: translateY(-2px);
	}
</style>
