<script lang="ts">
	import parseDiff from 'parse-diff';
	import type { HistoryDiffMode } from '$lib/history';
	import { FileCode2, Columns, Rows } from 'lucide-svelte';

	interface Props {
		diffString: string;
		documentPath?: string;
		mode?: HistoryDiffMode;
		showFileList?: boolean;
		baseLabel?: string;
		headLabel?: string;
	}

	let {
		diffString,
		documentPath = '',
		mode = 'split',
		showFileList = false,
		baseLabel = 'Previous version',
		headLabel = 'Current version'
	}: Props = $props();

	const parsedFiles = $derived(parseDiff(diffString || ''));
</script>

<div class="diff-viewer overflow-hidden rounded-xl border border-border/50 bg-card text-foreground shadow-sm flex flex-col font-sans text-[0.8125rem]">
	<!-- Header -->
	<div class="diff-viewer-header flex flex-wrap items-center justify-between gap-4 border-b border-border/50 bg-muted/30 px-4 py-3">
		<div class="flex flex-col gap-2 min-w-0">
			<div class="flex items-center gap-2 flex-wrap">
				<span class="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">Changes</span>
				{#if documentPath}
					<div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/40 bg-background/50 font-mono text-[0.72rem]">
						<FileCode2 size={14} class="text-muted-foreground" />
						<span class="truncate max-w-[300px]">{documentPath}</span>
					</div>
				{/if}
			</div>
			<div class="flex gap-6 flex-wrap">
				<div class="flex flex-col gap-0.5">
					<span class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Base</span>
					<strong class="font-medium text-foreground">{baseLabel}</strong>
				</div>
				<div class="flex flex-col gap-0.5">
					<span class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Head</span>
					<strong class="font-medium text-foreground">{headLabel}</strong>
				</div>
			</div>
		</div>
		<div class="flex items-center gap-2 text-muted-foreground">
			{#if mode === 'split'}
				<Columns size={16} />
				<span>Split View</span>
			{:else}
				<Rows size={16} />
				<span>Unified View</span>
			{/if}
		</div>
	</div>

	<!-- Content -->
	{#if !diffString?.trim() || parsedFiles.length === 0}
		<div class="p-6 text-center text-muted-foreground">
			<p>No textual differences found. The metadata might have changed or the document is identical.</p>
		</div>
	{:else}
		<div class="diff-content overflow-x-auto">
			{#each parsedFiles as file}
				<div class="diff-file mb-6 last:mb-0">
					{#if showFileList && parsedFiles.length > 1}
						<div class="px-4 py-2 border-b border-border/30 bg-muted/10 font-mono text-xs font-semibold text-muted-foreground">
							{file.to || file.from || 'Unknown file'}
						</div>
					{/if}
					
					<table class="w-full border-collapse font-mono text-[0.8rem] leading-[1.4] text-left whitespace-pre">
						<colgroup>
							{#if mode === 'split'}
								<col class="w-[3rem]" />
								<col class="w-[calc(50%-3rem)]" />
								<col class="w-[3rem]" />
								<col class="w-[calc(50%-3rem)]" />
							{:else}
								<col class="w-[3rem]" />
								<col class="w-[3rem]" />
								<col class="w-[calc(100%-6rem)]" />
							{/if}
						</colgroup>
						<tbody>
							{#each file.chunks as chunk}
								<!-- Chunk Header -->
								<tr class="bg-muted/40 text-muted-foreground">
									{#if mode === 'split'}
										<td class="px-2 py-1 select-none text-right border-r border-border/40" colspan="2">...</td>
										<td class="px-2 py-1 select-none text-right border-r border-border/40" colspan="2">...</td>
									{:else}
										<td class="px-2 py-1 select-none text-right border-r border-border/40" colspan="2">...</td>
										<td class="px-2 py-1 border-l border-border/40"></td>
									{/if}
								</tr>
								
								{#if mode === 'split'}
									<!-- Split Mode Logic: We need to align added and deleted lines. -->
									<!-- A simple approach: render each line sequentially. For a robust split view, we should align them. -->
									<!-- For simplicity in this demo, we'll use parse-diff's lines but align them naively or just show side-by-side if they match. -->
									<!-- In a real high-end diff, we'd group changes into blocks. Here we do a basic split render. -->
									
									<!-- To do a true split, we need to build rows out of chunks. -->
									<!-- Let's map changes into a unified row structure -->
									{@const rows = alignSplitLines(chunk.changes)}
									{#each rows as row}
										<tr class="hover:bg-muted/20 group">
											<!-- LEFT SIDE (Base) -->
											{#if row.left}
												<td class="px-2 py-0.5 select-none text-right text-muted-foreground/60 border-r border-border/20 bg-background group-hover:bg-muted/30">
													{row.left.ln}
												</td>
												<td class="px-4 py-0.5 overflow-hidden text-ellipsis {row.left.type === 'del' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : ''}">
													{row.left.content}
												</td>
											{:else}
												<td class="px-2 py-0.5 border-r border-border/20 bg-muted/10"></td>
												<td class="px-4 py-0.5 bg-muted/5"></td>
											{/if}
											
											<!-- RIGHT SIDE (Head) -->
											{#if row.right}
												<td class="px-2 py-0.5 select-none text-right text-muted-foreground/60 border-l border-r border-border/20 bg-background group-hover:bg-muted/30">
													{row.right.ln}
												</td>
												<td class="px-4 py-0.5 overflow-hidden text-ellipsis {row.right.type === 'add' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : ''}">
													{row.right.content}
												</td>
											{:else}
												<td class="px-2 py-0.5 border-l border-r border-border/20 bg-muted/10"></td>
												<td class="px-4 py-0.5 bg-muted/5"></td>
											{/if}
										</tr>
									{/each}
									
								{:else}
									<!-- Unified Mode Logic -->
									{#each chunk.changes as change}
										<tr class="hover:bg-muted/30 
											{change.type === 'add' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : ''}
											{change.type === 'del' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : ''}
										">
											<!-- Base Line Number -->
											<td class="px-2 py-0.5 select-none text-right text-muted-foreground/60 border-r border-border/20 bg-background/50">
												{change.type === 'normal' ? change.ln1 : change.type === 'del' ? change.ln : ''}
											</td>
											<!-- Head Line Number -->
											<td class="px-2 py-0.5 select-none text-right text-muted-foreground/60 border-r border-border/40 bg-background/50">
												{change.type === 'normal' ? change.ln2 : change.type === 'add' ? change.ln : ''}
											</td>
											<!-- Content -->
											<td class="px-4 py-0.5 w-full">
												<div class="flex">
													<span class="w-4 select-none opacity-50 flex-shrink-0">
														{change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' '}
													</span>
													<span>{change.content.replace(/^[+-]/, '')}</span>
												</div>
											</td>
										</tr>
									{/each}
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</div>
	{/if}
</div>

<script module>
	// Helper to align additions and deletions side-by-side for split view
	function alignSplitLines(changes: any[]) {
		const rows: Array<{ left?: any; right?: any }> = [];
		let dels = [];
		let adds = [];
		
		for (const change of changes) {
			if (change.type === 'del') {
				dels.push({ ...change, content: change.content.replace(/^-/, '') });
			} else if (change.type === 'add') {
				adds.push({ ...change, content: change.content.replace(/^\+/, '') });
			} else {
				// Flush accumulated dels and adds
				const max = Math.max(dels.length, adds.length);
				for (let i = 0; i < max; i++) {
					rows.push({ left: dels[i], right: adds[i] });
				}
				dels = [];
				adds = [];
				
				// Normal line
				rows.push({
					left: { ...change, ln: change.ln1, content: change.content.replace(/^ /, '') },
					right: { ...change, ln: change.ln2, content: change.content.replace(/^ /, '') }
				});
			}
		}
		
		// Flush remaining
		const max = Math.max(dels.length, adds.length);
		for (let i = 0; i < max; i++) {
			rows.push({ left: dels[i], right: adds[i] });
		}
		
		return rows;
	}
</script>