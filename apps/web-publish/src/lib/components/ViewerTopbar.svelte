<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { slugifyPath } from '$lib/file-tree';
	import { onMount } from 'svelte';
	import type { CurrentUser, SearchResultHit, WebResourceKind } from '$lib/api';

	interface Props {
		currentSlug?: string;
		currentPath?: string;
		resourceKind?: WebResourceKind;
		currentUser?: CurrentUser | null;
		enableSearch?: boolean;
	}

	let {
		currentSlug = '',
		currentPath = '',
		resourceKind = 'share',
		currentUser = null,
		enableSearch = false
	}: Props = $props();

	let query = $state('');
	let results = $state<SearchResultHit[]>([]);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let open = $state(false);
	let selectedIndex = $state(0);
	let profileOpen = $state(false);
	let logoutPending = $state(false);
	let abortController: AbortController | null = null;
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;
	let rootEl: HTMLDivElement | null = null;
	const loginHref = $derived(browser ? `/login?return=${encodeURIComponent(window.location.pathname)}` : '/login');

	const userLabel = $derived(currentUser?.name || currentUser?.email || 'Account');
	const userInitials = $derived(
		(currentUser?.name || currentUser?.email || '?')
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() || '')
			.join('')
	);

	async function runSearch(nextQuery: string) {
		if (!browser || !currentSlug || !enableSearch) {
			return;
		}

		const trimmed = nextQuery.trim();
		if (!trimmed) {
			results = [];
			errorMessage = '';
			open = false;
			selectedIndex = 0;
			return;
		}

		abortController?.abort();
		abortController = new AbortController();
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch(
				`/api/search?slug=${encodeURIComponent(currentSlug)}&resourceKind=${resourceKind}&q=${encodeURIComponent(trimmed)}&limit=8`,
				{
					signal: abortController.signal
				}
			);
			const payload = await response.json().catch(() => ({ results: [] as SearchResultHit[] }));
			if (!response.ok) {
				throw new Error(payload.message || 'Search failed');
			}
			results = payload.results || [];
			open = true;
			selectedIndex = 0;
		} catch (err) {
			if ((err as Error).name === 'AbortError') {
				return;
			}
			errorMessage = err instanceof Error ? err.message : 'Search failed';
			results = [];
			open = true;
		} finally {
			isLoading = false;
		}
	}

	function scheduleSearch(nextQuery: string) {
		query = nextQuery;
		if (searchDebounce) {
			clearTimeout(searchDebounce);
		}
		searchDebounce = setTimeout(() => {
			void runSearch(nextQuery);
		}, 180);
	}

	async function selectResult(result: SearchResultHit) {
		open = false;
		query = '';
		results = [];
		errorMessage = '';
		await goto(`/${currentSlug}/${slugifyPath(result.path)}`);
	}

	function handleKeydown(event: KeyboardEvent) {
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
		} else if (event.key === 'Escape') {
			open = false;
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

		const handlePointerDown = (event: MouseEvent) => {
			if (rootEl && !rootEl.contains(event.target as Node)) {
				open = false;
				profileOpen = false;
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			abortController?.abort();
			if (searchDebounce) {
				clearTimeout(searchDebounce);
			}
		};
	});
</script>

<div class="viewer-topbar" bind:this={rootEl}>
	{#if enableSearch}
		<div class="search-shell">
			<label class="search-input-wrap" aria-label="Search files">
				<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8"></circle>
					<path d="m21 21-4.35-4.35"></path>
				</svg>
				<input
					type="search"
					value={query}
					placeholder="Search this space"
					oninput={(event) => scheduleSearch((event.currentTarget as HTMLInputElement).value)}
					onfocus={() => {
						if (query.trim()) open = true;
					}}
					onkeydown={handleKeydown}
				/>
				{#if isLoading}
					<span class="search-status">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-spinner"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
					</span>
				{/if}
			</label>

			{#if open}
				<div class="search-backdrop"></div>
				<div class="search-panel">
					{#if errorMessage}
						<div class="search-empty">{errorMessage}</div>
					{:else if results.length === 0}
						<div class="search-empty">No matches yet. Try another phrase.</div>
					{:else}
						{#each results as result, index}
							<button
								type="button"
								class="search-result"
								class:active={selectedIndex === index}
								onclick={() => void selectResult(result)}
							>
								<div class="search-result-head">
									<span class="search-result-name">{result.name}</span>
									{#if slugifyPath(result.path) === currentPath}
										<span class="search-result-current">Current</span>
									{/if}
								</div>
								<div class="search-result-path">{result.path}</div>
								<div class="search-result-snippet">{result.snippet}</div>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<div class="profile-shell">
		{#if currentUser}
			<button
				type="button"
				class="profile-button"
				onclick={() => {
					profileOpen = !profileOpen;
					open = false;
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
					{#if currentUser.is_admin}
						<a class="profile-menu-link" href="/admin-ui">Open admin panel</a>
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

<style>
	.viewer-topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
		position: sticky;
		top: 0;
		z-index: 30;
		padding: 0.5rem 0;
		background: hsl(var(--background) / 0.85);
		backdrop-filter: blur(12px);
	}

	.search-shell {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.profile-shell {
		position: relative;
		flex-shrink: 0;
	}

	.search-input-wrap {
		position: relative;
		z-index: 41;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 2.5rem;
		width: 100%;
		padding: 0 0.75rem;
		border-radius: 0.75rem;
		border: 1px solid hsl(var(--border) / 0.45);
		background: hsl(var(--card));
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.search-input-wrap:focus-within {
		border-color: hsl(var(--primary) / 0.35);
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.06);
	}

	.search-icon {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
		width: 15px;
		height: 15px;
	}

	.search-input-wrap input {
		flex: 1;
		border: 0;
		background: transparent;
		outline: none;
		color: hsl(var(--foreground));
		min-width: 0;
		font-size: 0.875rem;
		height: 100%;
	}

	.search-input-wrap input::placeholder {
		color: hsl(var(--muted-foreground));
	}

	.search-status {
		display: inline-flex;
		align-items: center;
		color: hsl(var(--muted-foreground));
	}

	.search-status :global(.search-spinner) {
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.search-backdrop {
		position: fixed;
		inset: 0;
		z-index: 39;
		background: hsl(var(--background) / 0.35);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.search-panel {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 0;
		width: 100%;
		max-height: 420px;
		overflow-y: auto;
		border-radius: 0.75rem;
		border: 1px solid hsl(var(--border) / 0.4);
		background: hsl(var(--card) / 0.82);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		box-shadow: 0 8px 32px hsl(var(--background) / 0.35);
		padding: 0.35rem;
		z-index: 40;
	}

	.profile-menu {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		width: 240px;
		border-radius: 0.75rem;
		border: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--card) / 0.97);
		backdrop-filter: blur(18px);
		box-shadow: 0 12px 40px hsl(var(--background) / 0.3);
		padding: 0.35rem;
	}

	.search-empty {
		padding: 0.75rem 0.75rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.85rem;
	}

	.search-result {
		display: block;
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: none;
		border-radius: 0.375rem;
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.12s ease;
	}

	.search-result:hover,
	.search-result.active {
		background: hsl(var(--muted) / 0.6);
	}

	.search-result-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.search-result-name {
		font-weight: 600;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
	}

	.search-result-current {
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
	}

	.search-result-path {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.1rem;
	}

	.search-result-snippet {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.15rem;
		line-height: 1.35;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.profile-button,
	.login-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		height: 2.5rem;
		padding: 0 0.75rem;
		border-radius: 0.75rem;
		border: 1px solid hsl(var(--border) / 0.45);
		background: hsl(var(--card) / 0.82);
		backdrop-filter: blur(16px);
		color: hsl(var(--foreground));
		text-decoration: none;
		white-space: nowrap;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background-color 0.2s ease, border-color 0.2s ease;
	}

	.profile-button:hover,
	.login-link:hover {
		background: hsl(var(--primary) / 0.07);
		border-color: hsl(var(--primary) / 0.2);
		text-decoration: none;
	}

	.profile-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)));
		color: hsl(var(--primary-foreground));
		font-size: 0.68rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.profile-copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		line-height: 1.2;
	}

	.profile-name,
	.profile-email,
	.profile-menu-name,
	.profile-menu-email {
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile-name,
	.profile-menu-name {
		font-size: 0.8rem;
		font-weight: 600;
	}

	.profile-email,
	.profile-menu-email {
		font-size: 0.68rem;
		color: hsl(var(--muted-foreground));
	}

	.profile-menu-user {
		padding: 0.6rem 0.7rem;
		border-bottom: 1px solid hsl(var(--border) / 0.35);
		margin-bottom: 0.25rem;
	}

	.profile-menu-link {
		display: flex;
		width: 100%;
		align-items: center;
		padding: 0.6rem 0.7rem;
		border-radius: 0.5rem;
		color: hsl(var(--foreground));
		text-decoration: none;
		border: none;
		background: transparent;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.profile-menu-link:hover {
		background: hsl(var(--primary) / 0.07);
		text-decoration: none;
	}

	.profile-menu-link.danger {
		color: hsl(var(--destructive));
	}

	@media (max-width: 768px) {
		.viewer-topbar {
			padding-left: 3rem;
		}
	}

	@media (max-width: 480px) {
		.viewer-topbar {
			padding-left: 3rem;
		}

		.profile-button .profile-copy {
			display: none;
		}
	}
</style>
