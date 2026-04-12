<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { slugifyPath } from '$lib/file-tree';
	import { onMount } from 'svelte';
	import type { CurrentUser, SearchResultHit, WebResourceKind } from '$lib/api';

	interface Props {
		currentSlug?: string;
		currentPath?: string;
		documentPath?: string;
		share?: { kind: string; path: string; web_slug: string } | null;
		resourceKind?: WebResourceKind;
		currentUser?: CurrentUser | null;
		enableSearch?: boolean;
		canEdit?: boolean;
		showHistory?: boolean;
		gitRepoUrl?: string;
	}

	type SearchEventDetail = { query: string };

	let {
		currentSlug = '',
		currentPath = '',
		documentPath = '',
		share = null,
		resourceKind = 'share',
		currentUser = null,
		enableSearch = false,
		canEdit = false,
		showHistory = false,
		gitRepoUrl = ''
	}: Props = $props();

	let query = $state('');
	let results = $state<SearchResultHit[]>([]);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let open = $state(false);
	let selectedIndex = $state(0);
	let profileOpen = $state(false);
	let logoutPending = $state(false);
	let overlayTop = $state(0);
	let abortController: AbortController | null = null;
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;
	let rootEl: HTMLDivElement | null = null;
	let inputEl = $state<HTMLInputElement | null>(null);

	const loginHref = $derived(
		browser
			? `/login?return=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`
			: '/login'
	);
	const historyHref = $derived(
		showHistory && currentSlug && documentPath
			? `/${currentSlug}/history?${new URLSearchParams({ path: documentPath }).toString()}`
			: ''
	);
	const isHistoryPage = $derived($page.url.pathname.endsWith('/history'));
	const gitEditHref = $derived(
		gitRepoUrl && canEdit && share
			? `${gitRepoUrl.replace(/\/+$/, '')}/edit/main/${encodeGitPath(
					share.kind === 'folder' && documentPath ? `${share.path}/${documentPath}` : share.path
				)}`
			: ''
	);
	const userLabel = $derived(currentUser?.name || currentUser?.email || 'Account');
	const userInitials = $derived(
		(currentUser?.name || currentUser?.email || '?')
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() || '')
			.join('')
	);
	const isTagQuery = $derived(query.trim().startsWith('#'));
	const searchTitle = $derived(isTagQuery ? 'Tag results' : 'Search results');
	const searchCaption = $derived(
		isTagQuery
			? 'Documents containing this tag'
			: 'Search by title, path, and content'
	);

	function encodeGitPath(path: string) {
		return path
			.split('/')
			.filter(Boolean)
			.map((segment) => encodeURIComponent(segment))
			.join('/');
	}

	function syncOverlay() {
		if (!browser || !rootEl) {
			return;
		}
		overlayTop = Math.max(rootEl.getBoundingClientRect().bottom + 10, 0);
	}

	function closeSearch() {
		open = false;
		selectedIndex = 0;
		errorMessage = '';
	}

	function clearSearch() {
		query = '';
		results = [];
		errorMessage = '';
		selectedIndex = 0;
		open = false;
		abortController?.abort();
	}

	async function runSearch(nextQuery: string) {
		if (!browser || !currentSlug || !enableSearch) {
			return;
		}

		const trimmed = nextQuery.trim();
		if (!trimmed) {
			clearSearch();
			return;
		}

		abortController?.abort();
		abortController = new AbortController();
		isLoading = true;
		errorMessage = '';
		open = true;
		syncOverlay();

		try {
			const response = await fetch(
				`/api/search?slug=${encodeURIComponent(currentSlug)}&resourceKind=${resourceKind}&q=${encodeURIComponent(trimmed)}&limit=10`,
				{
					signal: abortController.signal
				}
			);
			const payload = await response.json().catch(() => ({ results: [] as SearchResultHit[] }));
			if (!response.ok) {
				throw new Error(payload.message || 'Search failed');
			}

			results = payload.results || [];
			selectedIndex = 0;
		} catch (err) {
			if ((err as Error).name === 'AbortError') {
				return;
			}
			errorMessage = err instanceof Error ? err.message : 'Search failed';
			results = [];
		} finally {
			isLoading = false;
		}
	}

	function scheduleSearch(nextQuery: string) {
		query = nextQuery;
		open = Boolean(nextQuery.trim());
		syncOverlay();
		if (searchDebounce) {
			clearTimeout(searchDebounce);
		}
		if (!nextQuery.trim()) {
			clearSearch();
			return;
		}
		searchDebounce = setTimeout(() => {
			void runSearch(nextQuery);
		}, 140);
	}

	function applyExternalQuery(nextQuery: string) {
		query = nextQuery;
		open = Boolean(nextQuery.trim());
		syncOverlay();
		void runSearch(nextQuery);
		inputEl?.focus();
	}

	async function selectResult(result: SearchResultHit) {
		clearSearch();
		profileOpen = false;
		if (isHistoryPage) {
			await goto(`/${currentSlug}/history?${new URLSearchParams({ path: result.path }).toString()}`);
			return;
		}
		await goto(`/${currentSlug}/${slugifyPath(result.path)}`);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeSearch();
			return;
		}

		if (!open || results.length === 0) {
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + results.length) % results.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			void selectResult(results[selectedIndex]);
		}
	}

	async function handleLogout() {
		logoutPending = true;
		try {
			await fetch('/api/auth', { method: 'DELETE' });
			profileOpen = false;
			window.location.reload();
		} finally {
			logoutPending = false;
		}
	}

	onMount(() => {
		if (!browser) {
			return;
		}

		syncOverlay();

		const handlePointerDown = (event: MouseEvent) => {
			if (rootEl && !rootEl.contains(event.target as Node)) {
				closeSearch();
				profileOpen = false;
			}
		};
		const handleExternalSearch = (event: Event) => {
			const detail = (event as CustomEvent<SearchEventDetail>).detail;
			if (detail?.query) {
				applyExternalQuery(detail.query);
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		window.addEventListener('resize', syncOverlay);
		window.addEventListener('scroll', syncOverlay, true);
		window.addEventListener('relay:search', handleExternalSearch as EventListener);

		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			window.removeEventListener('resize', syncOverlay);
			window.removeEventListener('scroll', syncOverlay, true);
			window.removeEventListener('relay:search', handleExternalSearch as EventListener);
			abortController?.abort();
			if (searchDebounce) {
				clearTimeout(searchDebounce);
			}
		};
	});
</script>

<div class="viewer-topbar" bind:this={rootEl}>
	{#if enableSearch}
		<div class="search-shell" class:is-open={open}>
			<div class="search-box">
				<label class="search-input-wrap" aria-label="Search files">
					<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8"></circle>
						<path d="m21 21-4.35-4.35"></path>
					</svg>
					<input
						bind:this={inputEl}
						type="search"
						value={query}
						placeholder="Search docs, jump to file, or type #tag"
						autocomplete="off"
						spellcheck="false"
						oninput={(event) => scheduleSearch((event.currentTarget as HTMLInputElement).value)}
						onfocus={() => {
							if (query.trim()) {
								open = true;
								syncOverlay();
							}
						}}
						onkeydown={handleKeydown}
					/>
					{#if isLoading}
						<span class="search-status" aria-hidden="true">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-spinner"><circle cx="12" cy="12" r="10" opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
						</span>
					{:else if query}
						<button type="button" class="search-clear" onclick={clearSearch} aria-label="Clear search" tabindex="-1">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
						</button>
					{/if}
				</label>

				{#if open}
					<div class="search-panel" aria-label="Search results">
						<div class="search-panel__header">
							<div class="search-panel__meta">
								<div class="search-panel__title">{searchTitle}</div>
								<div class="search-panel__caption">{searchCaption}</div>
							</div>
							<div class="search-panel__hint">
								<kbd>Esc</kbd>
								<span>close</span>
							</div>
						</div>

						{#if errorMessage}
							<div class="search-empty">
								<strong>Search failed</strong>
								<span>{errorMessage}</span>
							</div>
						{:else if results.length === 0}
							<div class="search-empty">
								<strong>{isLoading ? 'Searching…' : 'No matches yet'}</strong>
								<span>{isTagQuery ? 'Try another tag or remove the # prefix.' : 'Try a filename, path fragment, or a different keyword.'}</span>
							</div>
						{:else}
							<div class="search-results">
								{#each results as result, index}
									<button
										type="button"
										class="search-result"
										class:is-active={selectedIndex === index}
										onclick={() => void selectResult(result)}
									>
										<div class="search-result__main">
											<div class="search-result__title-row">
												<span class="search-result__name">{result.name}</span>
												{#if slugifyPath(result.path) === currentPath}
													<span class="search-result__badge">Current</span>
												{/if}
												{#if isTagQuery}
													<span class="search-result__badge search-result__badge--tag">{query.trim()}</span>
												{/if}
											</div>
											<div class="search-result__path">{result.path}</div>
											<div class="search-result__snippet">{result.snippet}</div>
										</div>
										<svg class="search-result__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M5 12h14"></path>
											<path d="m13 5 7 7-7 7"></path>
										</svg>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="topbar-actions">
		{#if historyHref}
			<a class="topbar-link" class:active={isHistoryPage} href={historyHref} title="Version history">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 8v4l3 3"></path>
					<circle cx="12" cy="12" r="9"></circle>
				</svg>
				<span>History</span>
			</a>
		{/if}
		{#if gitEditHref}
			<a class="topbar-link" href={gitEditHref} target="_blank" rel="noopener noreferrer" title="Edit on GitHub">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2C6.477 2 2 6.589 2 12.25c0 4.53 2.865 8.37 6.839 9.727.5.096.683-.223.683-.496 0-.245-.009-.894-.014-1.755-2.782.62-3.369-1.37-3.369-1.37-.455-1.188-1.11-1.504-1.11-1.504-.908-.637.069-.624.069-.624 1.004.072 1.533 1.056 1.533 1.056.892 1.565 2.341 1.113 2.91.851.091-.667.349-1.113.635-1.369-2.221-.26-4.556-1.14-4.556-5.073 0-1.121.39-2.038 1.029-2.756-.103-.26-.446-1.307.098-2.725 0 0 .84-.276 2.75 1.053A9.303 9.303 0 0 1 12 6.84a9.3 9.3 0 0 1 2.504.348c1.909-1.329 2.748-1.053 2.748-1.053.545 1.418.202 2.465.1 2.725.64.718 1.027 1.635 1.027 2.756 0 3.943-2.339 4.81-4.567 5.064.359.318.679.946.679 1.907 0 1.377-.012 2.487-.012 2.825 0 .275.18.596.688.495C19.138 20.616 22 16.778 22 12.25 22 6.589 17.523 2 12 2Z"></path>
				</svg>
				<span>Edit on GitHub</span>
			</a>
		{/if}
	</div>

	<div class="profile-shell">
		{#if currentUser}
			<button
				type="button"
				class="profile-button"
				onclick={() => {
					profileOpen = !profileOpen;
					closeSearch();
				}}
			>
				<span class="profile-avatar">{userInitials}</span>
				<span class="profile-copy">
					<span class="profile-name">{userLabel}</span>
					<span class="profile-email">{currentUser.email}</span>
				</span>
			</button>

			{#if profileOpen}
				<div class="profile-menu">
					<div class="profile-menu-user">
						<div class="profile-menu-name">{userLabel}</div>
						<div class="profile-menu-email">{currentUser.email}</div>
					</div>
					{#if currentUser.is_admin && $page.data.adminUrl}
						<a class="profile-menu-link" href={$page.data.adminUrl} target="_blank" rel="noopener" data-sveltekit-reload>Open admin panel</a>
					{/if}
					<button type="button" class="profile-menu-link danger" disabled={logoutPending} onclick={() => void handleLogout()}>
						{logoutPending ? 'Signing out...' : 'Sign out'}
					</button>
				</div>
			{/if}
		{:else}
			<a class="login-link" href={loginHref}>Sign in</a>
		{/if}
	</div>
</div>

{#if enableSearch && open}
	<button
		type="button"
		class="search-underlay"
		style={`top:${overlayTop}px;`}
		aria-label="Close search"
		onclick={closeSearch}
	></button>
{/if}

<style>
	.viewer-topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		position: sticky;
		top: 0;
		z-index: 40;
		padding: 0.55rem 0;
		background: hsl(var(--background) / 0.9);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border-bottom: 1px solid hsl(var(--border) / 0.22);
	}

	.search-shell {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.search-shell.is-open {
		z-index: 90;
	}

	.search-box {
		position: relative;
	}

	.search-input-wrap {
		position: relative;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 2.75rem;
		width: 100%;
		padding: 0 0.95rem;
		border-radius: 0.95rem;
		border: 1px solid hsl(var(--border) / 0.45);
		background:
			linear-gradient(180deg, hsl(var(--card) / 0.98), hsl(var(--card) / 0.92));
		box-shadow: 0 8px 24px hsl(220 30% 5% / 0.05);
		transition:
			border-color 0.18s ease,
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.search-input-wrap:focus-within {
		border-color: hsl(var(--primary) / 0.35);
		box-shadow:
			0 0 0 4px hsl(var(--primary) / 0.08),
			0 22px 48px hsl(220 30% 5% / 0.12);
		transform: translateY(-1px);
	}

	.search-icon,
	.search-status,
	.search-clear,
	.search-result__arrow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.search-input-wrap input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		background: transparent;
		outline: none;
		color: hsl(var(--foreground));
		font-size: 0.92rem;
	}

	.search-input-wrap input::-webkit-search-decoration,
	.search-input-wrap input::-webkit-search-cancel-button,
	.search-input-wrap input::-webkit-search-results-button,
	.search-input-wrap input::-webkit-search-results-decoration {
		display: none;
		-webkit-appearance: none;
	}

	.search-input-wrap input::placeholder {
		color: hsl(var(--muted-foreground));
	}

	.search-clear {
		width: 1.85rem;
		height: 1.85rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		cursor: pointer;
	}

	.search-clear:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.75);
	}

	.search-underlay {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		border: 0;
		background:
			linear-gradient(180deg, hsl(var(--background) / 0.08), hsl(var(--background) / 0.28));
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}

	.search-panel {
		position: absolute;
		top: calc(100% + 0.75rem);
		left: 0;
		right: 0;
		z-index: 2;
		border-radius: 1.1rem;
		border: 1px solid hsl(var(--border) / 0.45);
		background: hsl(var(--card) / 0.85);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		box-shadow:
			0 26px 80px hsl(220 35% 5% / 0.22),
			0 1px 0 hsl(var(--border) / 0.35);
		overflow: hidden;
	}

	.search-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.95rem 1rem 0.85rem;
		border-bottom: 1px solid hsl(var(--border) / 0.28);
		background: linear-gradient(180deg, hsl(var(--muted) / 0.45), transparent);
	}

	.search-panel__meta {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		min-width: 0;
	}

	.search-panel__title {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: hsl(var(--foreground));
	}

	.search-panel__caption {
		font-size: 0.79rem;
		color: hsl(var(--muted-foreground));
	}

	.search-panel__hint {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.search-panel__hint kbd {
		padding: 0.16rem 0.42rem;
		border-radius: 0.45rem;
		border: 1px solid hsl(var(--border) / 0.55);
		background: hsl(var(--background) / 0.8);
		font: 700 0.66rem/1 var(--font-mono, monospace);
	}

	.search-results {
		display: flex;
		flex-direction: column;
		max-height: min(68vh, 36rem);
		overflow: auto;
	}

	.search-empty {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		padding: 1rem;
		font-size: 0.84rem;
		color: hsl(var(--muted-foreground));
	}

	.search-empty strong {
		color: hsl(var(--foreground));
		font-size: 0.86rem;
	}

	.search-result {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.85rem;
		width: 100%;
		padding: 0.95rem 1rem;
		border: 0;
		border-bottom: 1px solid hsl(var(--border) / 0.22);
		background: transparent;
		color: hsl(var(--foreground));
		text-align: left;
		cursor: pointer;
		transition: background 0.14s ease, border-color 0.14s ease;
	}

	.search-result:last-child {
		border-bottom: 0;
	}

	.search-result:hover,
	.search-result.is-active {
		background: hsl(var(--primary) / 0.06);
	}

	.search-result__main {
		display: flex;
		flex-direction: column;
		gap: 0.34rem;
		min-width: 0;
	}

	.search-result__title-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.search-result__name {
		font-size: 0.92rem;
		font-weight: 700;
	}

	.search-result__path {
		font-size: 0.76rem;
		color: hsl(var(--muted-foreground));
		word-break: break-word;
	}

	.search-result__snippet {
		font-size: 0.79rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.8);
	}

	.search-result__badge {
		padding: 0.12rem 0.4rem;
		border-radius: 999px;
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
		font-size: 0.68rem;
		font-weight: 700;
	}

	.search-result__badge--tag {
		background: hsl(var(--accent) / 0.16);
		color: hsl(var(--accent-foreground));
	}

	.search-result:hover .search-result__arrow,
	.search-result.is-active .search-result__arrow {
		color: hsl(var(--primary));
	}

	.topbar-actions,
	.profile-shell {
		flex-shrink: 0;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.topbar-link,
	.profile-button,
	.login-link {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		height: 2.5rem;
		padding: 0 0.8rem;
		border-radius: 0.8rem;
		border: 1px solid hsl(var(--border) / 0.42);
		background: hsl(var(--card) / 0.92);
		color: hsl(var(--foreground));
		text-decoration: none;
		box-shadow: 0 10px 24px hsl(220 30% 5% / 0.03);
	}

	.topbar-link {
		font-size: 0.84rem;
		white-space: nowrap;
	}

	.topbar-link:hover,
	.profile-button:hover,
	.login-link:hover {
		background: hsl(var(--primary) / 0.06);
		border-color: hsl(var(--primary) / 0.2);
		text-decoration: none;
	}

	.topbar-link.active {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.26);
		color: hsl(var(--primary));
	}

	.profile-shell {
		position: relative;
	}

	.profile-button {
		cursor: pointer;
	}

	.profile-avatar {
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 999px;
		background: hsl(var(--primary) / 0.14);
		color: hsl(var(--primary));
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.profile-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.profile-name {
		font-size: 0.82rem;
		font-weight: 650;
	}

	.profile-email {
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground));
		max-width: 13rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile-menu {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		min-width: 15rem;
		padding: 0.5rem;
		border-radius: 0.95rem;
		border: 1px solid hsl(var(--border) / 0.4);
		background: hsl(var(--card) / 0.98);
		box-shadow: 0 24px 60px hsl(222 47% 11% / 0.16);
		z-index: 100;
	}

	.profile-menu-user {
		padding: 0.55rem 0.65rem 0.7rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		margin-bottom: 0.35rem;
	}

	.profile-menu-name {
		font-size: 0.85rem;
		font-weight: 700;
	}

	.profile-menu-email {
		font-size: 0.76rem;
		color: hsl(var(--muted-foreground));
		word-break: break-all;
	}

	.profile-menu-link {
		display: flex;
		width: 100%;
		padding: 0.65rem;
		border-radius: 0.7rem;
		border: 0;
		background: transparent;
		color: hsl(var(--foreground));
		text-decoration: none;
		font-size: 0.82rem;
		cursor: pointer;
		text-align: left;
	}

	.profile-menu-link:hover {
		background: hsl(var(--primary) / 0.06);
	}

	.profile-menu-link.danger {
		color: hsl(var(--destructive));
	}

	.search-spinner {
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 980px) {
		.viewer-topbar {
			flex-wrap: wrap;
		}

		.search-shell {
			order: 3;
			width: 100%;
		}

		.topbar-actions {
			margin-left: auto;
		}

		.profile-copy {
			display: none;
		}

		.search-result {
			grid-template-columns: 1fr;
		}

		.search-result__arrow {
			display: none;
		}
	}
</style>
