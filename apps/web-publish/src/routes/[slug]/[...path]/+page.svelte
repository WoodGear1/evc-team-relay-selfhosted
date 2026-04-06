<script lang="ts">
	import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import { extractDescription } from '$lib/markdown';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const shareUrl = $derived($page.url.href);
	const backUrl = $derived(`/${data.parentSlug}`);
	const description = $derived(
		extractDescription(data.content || '', `View document: ${data.file.path}`)
	);
	const branding = $derived($page.data?.serverInfo?.branding);
	const pageTitle = $derived(data.file.name);
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
			<div class="flex-1 min-w-0 max-w-[800px]">
				<MarkdownViewer content={data.content} slug={data.share.web_slug} folderItems={data.folderItems} />
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
