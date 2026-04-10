<script lang="ts">
	import { goto } from '$app/navigation';
	import type { HistoryVersionSummary } from '$lib/history';

	interface Props {
		versions: HistoryVersionSummary[];
		currentSlug: string;
		documentPath: string;
		selectedVersionId?: string | null;
		filterQuery?: string;
	}

	type VersionGroup = {
		key: string;
		label: string;
		items: HistoryVersionSummary[];
	};

	let {
		versions,
		currentSlug,
		documentPath,
		selectedVersionId = null,
		filterQuery = ''
	}: Props = $props();

	let pendingVersionId = $state<string | null>(null);

	function buildHref(versionId: string): string {
		const qs = new URLSearchParams({
			path: documentPath,
			version: versionId
		});
		return `/${currentSlug}/history?${qs.toString()}`;
	}

	async function selectVersion(versionId: string): Promise<void> {
		if (versionId === selectedVersionId) return;
		pendingVersionId = versionId;
		try {
			await goto(buildHref(versionId), {
				keepFocus: true,
				noScroll: true,
				invalidateAll: true
			});
		} finally {
			pendingVersionId = null;
		}
	}

	function formatTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString(undefined, {
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	function formatDayLabel(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	function matchesFilter(version: HistoryVersionSummary, query: string): boolean {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return true;
		return [
			version.authorLabel,
			version.authorEmail || '',
			version.shortHash,
			version.sourceLabel
		].some((value) => value.toLowerCase().includes(normalized));
	}

	const groupedVersions = $derived.by(() => {
		const groups: VersionGroup[] = [];
		for (const version of versions.filter((item) => matchesFilter(item, filterQuery))) {
			const key = version.createdAt.slice(0, 10);
			const existing = groups.find((group) => group.key === key);
			if (existing) {
				existing.items.push(version);
				continue;
			}
			groups.push({
				key,
				label: formatDayLabel(version.createdAt),
				items: [version]
			});
		}
		return groups;
	});
</script>

<div class="version-list">
	{#if versions.length === 0}
		<p class="version-list__empty">Для этого документа пока нет сохранённых снимков.</p>
	{:else if groupedVersions.length === 0}
		<p class="version-list__empty">По этому фильтру снимков не найдено.</p>
	{:else}
		<div class="version-list__groups" role="listbox" aria-label="История снимков документа">
			{#each groupedVersions as group (group.key)}
				<section class="version-group" aria-labelledby={`history-group-${group.key}`}>
					<h3 class="version-group__heading" id={`history-group-${group.key}`}>{group.label}</h3>
					<div class="version-group__items">
						{#each group.items as version, index (version.id)}
							<button
								type="button"
								role="option"
								class="version-row"
								class:is-active={version.id === selectedVersionId}
								class:is-pending={version.id === pendingVersionId}
								aria-selected={version.id === selectedVersionId}
								disabled={version.id === pendingVersionId}
								onclick={() => void selectVersion(version.id)}
							>
								<span class="version-row__rail" aria-hidden="true">
									<span class="version-row__line" class:is-first={index === 0}></span>
									<span class="version-row__dot"></span>
								</span>
								<span class="version-row__body">
									<span class="version-row__top">
										<span class="version-row__author">{version.authorLabel}</span>
										<span class="version-row__source">{version.sourceLabel}</span>
									</span>
									<span class="version-row__meta">
										<span class="version-row__time">{formatTime(version.createdAt)}</span>
										{#if version.authorEmail}
											<span class="version-row__email">{version.authorEmail}</span>
										{/if}
										<code class="version-row__hash">{version.shortHash}</code>
										{#if version.id === pendingVersionId}
											<span class="version-row__pending">Загрузка…</span>
										{/if}
									</span>
								</span>
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.version-list {
		color: var(--history-text);
	}

	.version-list__groups {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.version-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.version-group__heading {
		margin: 0;
		padding: 0 0 0.15rem 1rem;
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--history-muted);
	}

	.version-group__items {
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.version-group__items::before {
		content: '';
		position: absolute;
		left: 0.42rem;
		top: 0.1rem;
		bottom: 0.1rem;
		width: 1px;
		background: hsl(var(--history-border));
		opacity: 0.9;
	}

	.version-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.6rem;
		width: 100%;
		padding: 0.45rem 0 0.45rem 0.1rem;
		border: none;
		border-bottom: 1px solid hsl(var(--history-border) / 0.72);
		border-radius: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.14s ease,
			color 0.14s ease,
			opacity 0.14s ease;
	}

	.version-row:hover {
		background: hsl(var(--history-accent) / 0.04);
	}

	.version-group__items > :last-child {
		border-bottom: none;
	}

	.version-row.is-active {
		background:
			linear-gradient(90deg, hsl(var(--history-accent) / 0.14) 0, transparent 60%),
			transparent;
		color: var(--history-text);
	}

	.version-row.is-pending {
		opacity: 0.72;
	}

	.version-row__rail {
		position: relative;
		display: flex;
		align-items: stretch;
		justify-content: center;
		width: 0.9rem;
	}

	.version-row__line {
		position: absolute;
		top: -0.5rem;
		bottom: -0.5rem;
		width: 1px;
		background: transparent;
	}

	.version-row__line.is-first {
		top: 0.4rem;
	}

	.version-row__dot {
		position: relative;
		z-index: 1;
		margin-top: 0.5rem;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: hsl(var(--history-muted));
		border: 2px solid hsl(var(--background));
	}

	.version-row.is-active .version-row__dot {
		background: hsl(var(--history-accent));
		box-shadow: 0 0 0 3px hsl(var(--history-accent) / 0.16);
	}

	.version-row__body {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		min-width: 0;
	}

	.version-row__top,
	.version-row__meta {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		min-width: 0;
	}

	.version-row__author {
		font-size: 0.81rem;
		font-weight: 700;
		color: var(--history-text);
	}

	.version-row__source {
		color: var(--history-muted);
		font-size: 0.69rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.version-row__meta {
		font-size: 0.72rem;
		color: var(--history-muted);
	}

	.version-row__time {
		font-variant-numeric: tabular-nums;
	}

	.version-row__email {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.version-row__hash {
		padding: 0.08rem 0.3rem;
		border-radius: 999px;
		background: transparent;
		border: 1px solid hsl(var(--history-border));
		color: var(--history-muted);
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
	}

	.version-row__pending {
		color: hsl(var(--history-accent));
		font-size: 0.69rem;
		font-weight: 600;
	}

	.version-list__empty {
		margin: 0;
		padding: 0.85rem 0.9rem;
		border-radius: 0.8rem;
		border: 1px dashed hsl(var(--history-border));
		background: hsl(var(--history-panel-raised) / 0.55);
		color: var(--history-muted);
		font-size: 0.82rem;
		line-height: 1.45;
	}
</style>
