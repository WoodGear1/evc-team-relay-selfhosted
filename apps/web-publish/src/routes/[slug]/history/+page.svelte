<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import DiffViewer from '$lib/components/DiffViewer.svelte';
	import VersionList from '$lib/components/VersionList.svelte';
	import { type HistoryDiffMode } from '$lib/history';
	import { slugifyPath } from '$lib/file-tree';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { History, ArrowLeft, Link, Copy, Check, Info } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const restored = $derived($page.url.searchParams.get('restored') === '1');
	const documentHref = $derived(
		data.share.kind === 'doc'
			? `/${data.share.web_slug}`
			: data.documentPath
				? `/${data.share.web_slug}/${slugifyPath(data.documentPath)}`
				: `/${data.share.web_slug}`
	);
	const selectedIdx = $derived(
		data.selectedVersionId
			? data.versions.findIndex((version) => version.id === data.selectedVersionId)
			: -1
	);
	const selectedVersion = $derived(data.selectedVersion || null);
	const baseVersion = $derived(data.baseVersion || null);
	const fileName = $derived(data.documentPath?.split('/').pop() || 'Document');
	const snapshotNumber = $derived(selectedIdx >= 0 ? data.versions.length - selectedIdx : null);
	const diffStats = $derived(data.diffStats);

	let diffMode = $state<HistoryDiffMode>('split');
	let showFileList = $state(false);
	let copyStatus = $state<'idle' | 'done'>('idle');
	let versionFilter = $state('');

	function formatDateTime(iso: string | null | undefined): string {
		if (!iso) return 'Unknown time';
		try {
			return new Date(iso).toLocaleString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	async function goBackToDocument(): Promise<void> {
		await goto(documentHref);
	}

	function handleRestoreSubmit(event: SubmitEvent): void {
		if (!browser) return;
		const ok = window.confirm('Restore this snapshot and make it the new current document version?');
		if (!ok) {
			event.preventDefault();
		}
	}

	async function copyHistoryLink(): Promise<void> {
		if (!browser) return;
		await navigator.clipboard.writeText(window.location.href);
		copyStatus = 'done';
		window.setTimeout(() => {
			copyStatus = 'idle';
		}, 1800);
	}

	onMount(() => {
		if (!browser) return;
		const media = window.matchMedia('(max-width: 1180px)');
		const syncMode = () => {
			diffMode = media.matches ? 'unified' : 'split';
		};
		syncMode();
		media.addEventListener?.('change', syncMode);
		return () => {
			media.removeEventListener?.('change', syncMode);
		};
	});
</script>

<div class="w-full mx-auto px-4 md:px-8 2xl:px-12 py-8 flex flex-col gap-6 text-foreground font-sans max-w-[2000px]">
	{#if restored}
		<div class="flex items-center gap-3 px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium" role="status">
			<Check size={18} />
			Version restored. The selected snapshot is now the latest document state.
		</div>
	{/if}

	{#if selectedVersion}
		<!-- Header -->
		<section class="flex flex-col md:flex-row md:items-start justify-between gap-6 p-6 rounded-xl border border-border/60 bg-card shadow-sm">
			<div class="flex flex-col gap-2 min-w-0">
				<div class="flex items-center gap-2 text-sm text-muted-foreground font-medium mb-1">
					<button type="button" class="flex items-center gap-1.5 hover:text-foreground transition-colors" onclick={() => void goBackToDocument()}>
						<ArrowLeft size={16} />
						<span>Open file</span>
					</button>
					<span class="opacity-50">/</span>
					<span class="truncate max-w-[250px] sm:max-w-[400px]">{data.documentPath}</span>
				</div>
				<h1 class="text-2xl md:text-3xl font-bold tracking-tight">{fileName}</h1>
				<div class="flex items-center gap-3 flex-wrap mt-1 text-sm text-muted-foreground">
					<code class="px-2 py-0.5 rounded-md bg-muted font-mono text-[0.8rem] border border-border/50 text-foreground">
						{selectedVersion.shortHash}
					</code>
					<div class="flex items-center gap-1.5">
						<span class="font-medium text-foreground">{selectedVersion.authorLabel}</span>
						<span>updated this file on {formatDateTime(selectedVersion.createdAt)}</span>
					</div>
				</div>
			</div>

			<div class="flex items-center gap-3 shrink-0">
				<button 
					type="button" 
					class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
					onclick={() => void copyHistoryLink()}
				>
					{#if copyStatus === 'done'}
						<Check size={16} class="text-green-500" />
						<span class="text-green-500">Copied!</span>
					{:else}
						<Link size={16} />
						Copy link
					{/if}
				</button>
				{#if data.canRestore}
					<form method="POST" action="?/restore" onsubmit={handleRestoreSubmit}>
						<input type="hidden" name="versionId" value={data.selectedVersionId} />
						<input type="hidden" name="documentPath" value={data.documentPath} />
						<button 
							class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" 
							type="submit"
						>
							<History size={16} />
							Restore
						</button>
					</form>
				{/if}
			</div>
		</section>

		<div class="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
			<!-- Sidebar -->
			<aside class="sticky top-[4.7rem] flex flex-col gap-4">
				<section class="rounded-xl border border-border/60 bg-card shadow-sm p-5 flex flex-col gap-4">
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col gap-1">
							<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Revisions</span>
							<h3 class="font-semibold">{data.versions.length} snapshots</h3>
						</div>
						{#if snapshotNumber}
							<span class="px-2.5 py-0.5 rounded-full bg-muted/60 border border-border text-xs font-medium text-muted-foreground">
								#{snapshotNumber}
							</span>
						{/if}
					</div>
					
					<div class="flex flex-col gap-2 mt-2">
						<span class="text-[0.75rem] font-semibold text-muted-foreground">Filter revisions</span>
						<input 
							type="search" 
							bind:value={versionFilter} 
							placeholder="Author, hash, source" 
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
					</div>
					
					<div class="mt-2 h-[50vh] lg:h-[60vh] overflow-y-auto pr-2 -mr-2">
						<VersionList
							versions={data.versions}
							currentSlug={data.share.web_slug}
							documentPath={data.documentPath}
							selectedVersionId={data.selectedVersionId}
							filterQuery={versionFilter}
						/>
					</div>
				</section>
			</aside>

			<!-- Main Content -->
			<section class="flex flex-col gap-6 min-w-0">
				<!-- Summary Cards -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div class="p-4 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm shadow-sm flex flex-col gap-1">
						<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Author</span>
						<strong class="text-sm font-semibold">{selectedVersion.authorLabel}</strong>
						<span class="text-xs text-muted-foreground truncate">{selectedVersion.authorEmail || 'No email available'}</span>
					</div>
					<div class="p-4 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm shadow-sm flex flex-col gap-1">
						<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Source</span>
						<strong class="text-sm font-semibold">{selectedVersion.sourceLabel}</strong>
						<span class="text-xs text-muted-foreground">{formatDateTime(selectedVersion.createdAt)}</span>
					</div>
					<div class="p-4 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm shadow-sm flex flex-col gap-1">
						<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Changes</span>
						<div class="flex items-center gap-2 mt-1 flex-wrap">
							<span class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 text-xs font-medium">+{diffStats.additions}</span>
							<span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-medium">-{diffStats.deletions}</span>
							<span class="px-2 py-0.5 rounded-full bg-muted border border-border/50 text-muted-foreground text-xs font-medium">{diffStats.hunks} hunks</span>
						</div>
					</div>
				</div>

				<!-- Diff Viewer -->
				<section class="rounded-xl border border-border/60 bg-card shadow-sm p-4 md:p-6 flex flex-col gap-4">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
						<div class="flex flex-col gap-1">
							<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Diff Viewer</span>
							<strong class="text-sm">
								{baseVersion ? `${baseVersion.shortHash} ➔ ${selectedVersion.shortHash}` : `Initial ➔ ${selectedVersion.shortHash}`}
							</strong>
						</div>
						
						<div class="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border/40">
							<button
								type="button"
								class="px-3 py-1.5 text-xs font-medium rounded-md transition-all {diffMode === 'split' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
								onclick={() => (diffMode = 'split')}
							>
								Split
							</button>
							<button
								type="button"
								class="px-3 py-1.5 text-xs font-medium rounded-md transition-all {diffMode === 'unified' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
								onclick={() => (diffMode = 'unified')}
							>
								Unified
							</button>
						</div>
					</div>

					<DiffViewer
						diffString={data.diffPreview}
						documentPath={data.documentPath}
						mode={diffMode}
						showFileList={showFileList}
						baseLabel={baseVersion ? `${baseVersion.authorLabel} · ${baseVersion.shortHash}` : 'Empty document'}
						headLabel={`${selectedVersion.authorLabel} · ${selectedVersion.shortHash}`}
					/>
				</section>
			</section>
		</div>
	{:else}
		<section class="flex flex-col items-center justify-center text-center p-12 lg:p-24 rounded-xl border border-border/60 bg-card shadow-sm gap-4">
			<div class="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground mb-2">
				<Info size={32} />
			</div>
			<h1 class="text-2xl font-bold">No snapshots yet</h1>
			<p class="text-muted-foreground max-w-md">
				This file has not received any saved revisions yet. Sync it from the plugin or create a new version, then reopen history.
			</p>
		</section>
	{/if}
</div>